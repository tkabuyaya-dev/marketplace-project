/**
 * NUNULIA — photoSessionAttach (Callable, admin uniquement)
 *
 * Étape clé du flow Studio. L'admin a traité les photos brutes dans
 * PhotoRoom Max et les a uploadées sur Cloudinary depuis le dashboard
 * admin. Cette CF :
 *   1. Persiste les URLs Cloudinary dans la session (status → `ready`)
 *   2. Appelle Claude Haiku Vision pour pré-remplir title/category/condition
 *      depuis les photos (fail-open : OK si l'IA est down)
 *   3. Crée la notification `photo_session_ready` → la CF onNotificationCreate
 *      déclenche automatiquement le push FCM au vendeur
 *   4. Retourne au dashboard admin le lien magique + un message WhatsApp prêt
 *      à copier (l'admin colle dans WhatsApp Business)
 *
 * Sécurité : admin only via JWT custom claim. Validation stricte des URLs
 * Cloudinary (https://res.cloudinary.com/...) — bloque toute injection.
 *
 * Pourquoi ce flow et pas un upload direct depuis l'admin vers Firestore :
 *   - Centraliser la transition de status (impossible à forger côté client)
 *   - Garantir l'atomicité (URLs + status + event + notif en cohérence)
 *   - Permettre l'appel Vision côté serveur (pas d'expo API key front)
 *   - Idempotence — si l'admin clique 2x, la 2e fois la session reste OK
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS, ANTHROPIC_API_KEY, STUDIO_PUBLIC_BASE_URL } from "./config.js";
import { isValidSessionId } from "./session-id.js";
import { analyzeProductPhotos } from "./photo-session-vision.js";

const COLLECTION = "photoSessions";
const MAX_PHOTOS = 5;
const MAX_INTERNAL_NOTE = 500;

interface AttachInput {
  sessionId?: string;
  processedUrls?: string[];        // 1 à MAX_PHOTOS URLs Cloudinary HTTPS
  rawPhotoCount?: number;          // stat optionnelle (combien le vendeur a envoyé)
  internalNote?: string;           // note privée admin (jamais lue par le seller)
}

interface AttachOutput {
  ok: true;
  status: "ready";
  magicLink: string;
  whatsappMessageTemplate: string;
  visionApplied: boolean;
}

/** Valide qu'une string est une URL Cloudinary sécurisée. */
function isValidCloudinaryUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  if (url.length > 600) return false;
  // Doit pointer sur res.cloudinary.com (CDN officiel) ou cloudinary.com via HTTPS
  return /^https:\/\/(res\.)?cloudinary\.com\/[\w\-/.,_%~?=&:+@$#!]+$/.test(url);
}

export const photoSessionAttach = onCall<AttachInput, Promise<AttachOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
    maxInstances: 10,
    // 60s pour couvrir l'appel Vision (1.5-3s) + transaction Firestore + notif.
    // Si l'admin uploade 5 photos lourdes, Vision peut prendre jusqu'à 5s.
    timeoutSeconds: 60,
  },
  async (request) => {
    // ── 1. Auth + admin check ───────────────────────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    if (request.auth?.token?.role !== "admin") {
      throw new HttpsError("permission-denied", "Réservé aux admins.");
    }

    // ── 2. Validation input ─────────────────────────────────────────────
    const sessionId = (request.data?.sessionId || "").trim().toUpperCase();
    if (!isValidSessionId(sessionId)) {
      throw new HttpsError("invalid-argument", "sessionId invalide.");
    }

    const rawUrls = request.data?.processedUrls;
    if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
      throw new HttpsError("invalid-argument", "Au moins une photo traitée est requise.");
    }
    if (rawUrls.length > MAX_PHOTOS) {
      throw new HttpsError("invalid-argument", `Maximum ${MAX_PHOTOS} photos par session.`);
    }
    const processedUrls = rawUrls.filter(isValidCloudinaryUrl);
    if (processedUrls.length !== rawUrls.length) {
      throw new HttpsError("invalid-argument", "Une ou plusieurs URLs sont invalides (doit être https://res.cloudinary.com/...).");
    }

    const rawPhotoCount = typeof request.data?.rawPhotoCount === "number"
      && request.data.rawPhotoCount >= 0
      && request.data.rawPhotoCount <= 50
        ? Math.floor(request.data.rawPhotoCount)
        : null;
    const internalNote = typeof request.data?.internalNote === "string"
      ? request.data.internalNote.trim().slice(0, MAX_INTERNAL_NOTE)
      : null;

    const db = await getDb();
    const ref = db.collection(COLLECTION).doc(sessionId);

    // ── 3. Lecture pré-transaction (état actuel + vendor pour notification) ─
    const sessionSnap = await ref.get();
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session introuvable.");
    }
    const session = sessionSnap.data()!;
    const currentStatus = session.status as string;
    const vendorId = session.vendorId as string;
    const vendorName = (session.vendorName as string) || "Vendeur Nunulia";

    // Garde-fous d'état :
    if (currentStatus === "published") {
      throw new HttpsError("failed-precondition", "Produit déjà publié — session terminée.");
    }
    if (currentStatus === "expired") {
      throw new HttpsError("failed-precondition", "Session expirée — créer une nouvelle session.");
    }

    // Idempotence : si déjà ready, on accepte un ré-upload (l'admin peut
    // vouloir corriger une photo qu'il a ratée). On remplace processedUrls
    // mais sans réinventer le wheel : pas de re-notification.
    const isReUpload = currentStatus === "ready";

    // ── 4. Appel Vision AVANT la transaction (hors-transaction, lecture pure)
    // Pourquoi avant : pour persister visionSuggestions dans le même write
    // que processedUrls (cohérence pour le vendeur qui ouvrira la page).
    // Pourquoi pas dans la transaction : runTransaction interdit les appels
    // réseau (timeouts, retry). Vision = API externe ~1-3s.
    let vision = null;
    try {
      vision = await analyzeProductPhotos(processedUrls);
    } catch (err) {
      // analyzeProductPhotos est déjà fail-open mais on protège quand même.
      logger.warn("[photoSessionAttach] vision wrapper exception", { err });
      vision = null;
    }

    // ── 5. Transaction atomique : status + URLs + suggestions + events ──
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw new HttpsError("not-found", "Session introuvable.");
      const freshStatus = fresh.data()?.status as string;

      // Re-check d'état dans la transaction (anti-race contre expirePhotoSessions)
      if (freshStatus === "expired") {
        throw new HttpsError("failed-precondition", "Session expirée (race).");
      }
      if (freshStatus === "published") {
        throw new HttpsError("failed-precondition", "Produit déjà publié (race).");
      }

      const updatePayload: Record<string, unknown> = {
        processedUrls,
        status: "ready",
        attachedAt: now,
      };
      if (rawPhotoCount !== null) updatePayload.rawPhotoCount = rawPhotoCount;
      if (internalNote !== null) updatePayload.internalNote = internalNote;
      if (vision) updatePayload.visionSuggestions = vision;

      tx.update(ref, updatePayload);

      // Event d'historique
      const attachEv = ref.collection("events").doc();
      tx.set(attachEv, {
        action: "attached",
        by: { userId: uid, role: "admin" },
        payload: {
          processedCount: processedUrls.length,
          rawPhotoCount,
          isReUpload,
        },
        timestamp: now,
      });
      if (vision) {
        const visionEv = ref.collection("events").doc();
        tx.set(visionEv, {
          action: "vision_filled",
          by: { userId: "system", role: "system" },
          payload: {
            hasTitle: !!vision.title,
            hasCategory: !!vision.category,
            condition: vision.condition || null,
            charsCount: vision.characteristics?.length || 0,
          },
          timestamp: now,
        });
      }
    });

    // ── 6. Notification "photos prêtes" (hors transaction — best-effort) ─
    // Pas de re-notification sur ré-upload (évite double push).
    const magicLink = `${STUDIO_PUBLIC_BASE_URL}/studio/${sessionId}`;
    if (!isReUpload) {
      try {
        await db.collection("notifications").add({
          userId: vendorId,
          type: "photo_session_ready",
          title: "✨ Vos photos Studio sont prêtes !",
          body: `Touchez pour publier votre produit sur Nunulia.`,
          read: false,
          createdAt: now,
          data: { link: `/studio/${sessionId}` },
        });
      } catch (notifErr) {
        // Ne pas casser la flow si la notif échoue — l'admin peut copier
        // le lien WhatsApp lui-même.
        logger.warn("[photoSessionAttach] notification failed (continuing)", { notifErr });
      }
    }

    // ── 7. Template WhatsApp à copier par l'admin ───────────────────────
    const whatsappMessageTemplate = [
      `✨ ${vendorName}, vos photos sont prêtes !`,
      `Touchez ici pour publier :`,
      magicLink,
    ].join("\n");

    logger.info("[photoSessionAttach] Attached", {
      sessionId,
      adminUid: uid,
      processedCount: processedUrls.length,
      hasVision: !!vision,
      isReUpload,
    });

    return {
      ok: true,
      status: "ready",
      magicLink,
      whatsappMessageTemplate,
      visionApplied: !!vision,
    };
  },
);
