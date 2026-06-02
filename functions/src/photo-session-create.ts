/**
 * NUNULIA — photoSessionCreate (Callable Cloud Function)
 *
 * Le vendeur démarre une session Photo Studio. La CF :
 *   1. Vérifie auth + role seller (via custom claim JWT, instantané)
 *   2. Vérifie le throttling par plan (PlanFeatures.dailyStudioSessions)
 *      en comptant les sessions du jour calendaire UTC+2 (Bujumbura/Kigali)
 *   3. Génère un sessionId 6 chars unique (retry x3 si collision improbable)
 *   4. Crée le doc photoSessions/{sessionId} + sub-collection events/created
 *   5. Construit le lien wa.me avec message pré-rempli — le vendeur n'a
 *      qu'à joindre ses photos
 *
 * Source de vérité du numéro WhatsApp destination :
 *   appSettings/studio.whatsappNumber (Firestore — admin peut le changer
 *   sans redéploiement) > STUDIO_DEFAULT_WHATSAPP (config.ts fallback).
 *
 * Renvoie au frontend : {sessionId, expiresAt, whatsappLink, whatsappMessage}.
 * Le frontend redirige immédiatement vers whatsappLink (window.open).
 *
 * Sécurité : toutes les transitions de status sont verrouillées server-side.
 * Le vendeur ne peut PAS forger un sessionId, ni un timestamp, ni outrepasser
 * son quota — les rules client bloquent toute écriture directe à photoSessions/.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS, STUDIO_DEFAULT_WHATSAPP } from "./config.js";
import { featuresForLabel } from "./plan-features.js";
import { generateSessionId } from "./session-id.js";

const COLLECTION = "photoSessions";
const SESSION_TTL_MS = 48 * 60 * 60 * 1000; // 48h — aligné avec STUDIO_SESSION_TTL_MS front
const GENERATE_RETRY_LIMIT = 3;

// Statuts actifs pour le throttling — on compte les sessions du jour qui ne
// sont PAS encore expirées/publiées (les expired/published comptent quand
// même pour ne pas permettre à un vendeur de "réessayer" en boucle après
// expiration et saturer la file admin).
const ALL_STATUSES_COUNT = ["waiting_photos", "processing", "ready", "published", "expired"];

interface PhotoSessionCreateInput {
  // Aucun input vendor — tout est calculé server-side depuis l'identité auth.
  // (champs réservés pour évolutions futures, ignorés pour l'instant)
  _?: never;
}

interface PhotoSessionCreateOutput {
  sessionId: string;
  expiresAt: number;
  whatsappLink: string;
  whatsappMessage: string;
}

/**
 * Retourne la clé date locale Burundi (UTC+2) au format YYYY-MM-DD.
 * Aligné avec generate-product-description.ts (même offset).
 */
function getLocalDateKey(now = Date.now()): string {
  const offsetMs = 2 * 60 * 60 * 1000;
  return new Date(now + offsetMs).toISOString().slice(0, 10);
}

/**
 * Retourne le numéro WhatsApp destination du Studio.
 * Priorité : Firestore appSettings/studio.whatsappNumber > config.ts fallback.
 */
async function resolveStudioWhatsapp(
  db: FirebaseFirestore.Firestore,
): Promise<string> {
  try {
    const snap = await db.collection("appSettings").doc("studio").get();
    if (snap.exists) {
      const data = snap.data() as { whatsappNumber?: string } | undefined;
      const value = data?.whatsappNumber?.trim();
      if (value && /^\+?\d{7,15}$/.test(value.replace(/\s/g, ""))) {
        return value;
      }
    }
  } catch (err) {
    logger.warn("[photoSessionCreate] appSettings/studio read failed, using fallback", { err });
  }
  return STUDIO_DEFAULT_WHATSAPP;
}

/** Normalise un numéro E.164 (+25768…) au format wa.me (chiffres seuls). */
function toWaMeNumber(e164OrLocal: string): string {
  return e164OrLocal.replace(/[^0-9]/g, "");
}

/** Construit le message WhatsApp pré-rempli (encodage URL-safe). */
function buildWhatsappMessage(shopName: string, sessionId: string, countryName: string): string {
  return [
    "📸 NUNULIA Photo Studio",
    `Vendeur : ${shopName}`,
    `Session : #${sessionId}`,
    `Pays : ${countryName}`,
    "Joignez vos photos ici puis envoyez.",
  ].join("\n");
}

/** Compte les sessions créées aujourd'hui (UTC+2) par un vendeur — pour throttling. */
async function countTodaysSessions(
  db: FirebaseFirestore.Firestore,
  vendorId: string,
): Promise<number> {
  // Borne basse : minuit UTC+2 → converti en timestamp ms UTC
  const todayKey = getLocalDateKey();
  const [y, m, d] = todayKey.split("-").map((n) => parseInt(n, 10));
  // Date.UTC(y, m-1, d, h, mi, s) — minuit UTC+2 = 22:00 UTC veille
  const startOfDayUtc = Date.UTC(y, m - 1, d, -2, 0, 0);

  const snap = await db
    .collection(COLLECTION)
    .where("vendorId", "==", vendorId)
    .where("createdAt", ">=", startOfDayUtc)
    .get();

  // On compte TOUTES les sessions du jour (peu importe le status final) pour
  // empêcher un vendeur de spammer la file après expiration. La query est
  // bornée par createdAt donc volume max = dailyStudioSessions du plan le
  // plus haut = 5.
  return snap.docs.filter((doc) => {
    const status = doc.data()?.status;
    return typeof status === "string" && ALL_STATUSES_COUNT.includes(status);
  }).length;
}

export const photoSessionCreate = onCall<PhotoSessionCreateInput, Promise<PhotoSessionCreateOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 10,
    timeoutSeconds: 30,
    // NOTE : pas de enforceAppCheck (alignement avec submitBuyerRequest —
    // évite les faux refus iOS Safari ITP). App Check côté front est branché
    // via initAppCheck() dans firebase-config.ts.
  },
  async (request) => {
    // ── 1. Auth ──────────────────────────────────────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const role = (request.auth?.token?.role as string | undefined) ?? "";
    if (role !== "seller" && role !== "admin") {
      throw new HttpsError("permission-denied", "Réservé aux vendeurs.");
    }
    // Anti-suspension (alignement avec isNotSuspended côté rules)
    if (request.auth?.token?.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu.");
    }

    const db = await getDb();

    // ── 1.bis Kill switch (Phase 8 — défense en profondeur) ──────────────
    // Lit appSettings/studio.enabled. Si === false → bloqué côté serveur,
    // même si un attaquant bypass le front via Postman/curl. Fail-open : si
    // le doc n'existe pas ou la lecture échoue (le throw ne s'active QUE sur
    // exists + enabled strict === false), le flux continue normalement.
    try {
      const studioSettingsSnap = await db.collection("appSettings").doc("studio").get();
      if (studioSettingsSnap.exists && studioSettingsSnap.data()?.enabled === false) {
        logger.info("[photoSessionCreate] kill switch active", { uid });
        throw new HttpsError(
          "permission-denied",
          "Le service Photo Studio est temporairement indisponible.",
        );
      }
    } catch (err) {
      // Si le throw est un HttpsError (kill switch déclenché), on le re-propage.
      // Sinon (erreur de lecture Firestore), on fail-open et on continue le flux.
      if (err instanceof HttpsError) throw err;
      logger.warn("[photoSessionCreate] appSettings/studio read failed — fail-open", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2. Lecture du profil vendeur (shopName, plan, country) ──────────
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("permission-denied", "Profil vendeur introuvable.");
    }
    const userData = userSnap.data() as {
      name?: string;
      sellerDetails?: {
        shopName?: string;
        phone?: string;
        countryId?: string;
        tierLabel?: string;
        subscriptionExpiresAt?: number;
      };
      whatsapp?: string;
    };
    const sellerDetails = userData.sellerDetails ?? {};
    const shopName = sellerDetails.shopName?.trim()
      || userData.name?.trim()
      || "Vendeur Nunulia";
    const countryId = (sellerDetails.countryId || "bi").trim();
    const vendorPhone = sellerDetails.phone?.trim()
      || userData.whatsapp?.trim()
      || "";
    const tierLabel = sellerDetails.tierLabel ?? null;

    // ── 3. Détermination du plan effectif (gère expiration) ─────────────
    const expiresAt = sellerDetails.subscriptionExpiresAt ?? 0;
    const isPlanExpired = expiresAt > 0 && Date.now() > expiresAt;
    // Si le plan payant a expiré, on retombe sur les features Free.
    const features = isPlanExpired
      ? featuresForLabel(null)
      : featuresForLabel(tierLabel);
    const planId = isPlanExpired
      ? "free"
      : (tierLabel ? (
          tierLabel.toLowerCase().includes("grossiste") ? "grossiste"
          : tierLabel.toLowerCase().includes("pro") || tierLabel.toLowerCase().includes("élite") || tierLabel.toLowerCase().includes("elite") ? "pro"
          : tierLabel.toLowerCase().includes("vendeur") || tierLabel.toLowerCase().includes("starter") ? "vendeur"
          : "free"
        ) : "free");

    const dailyLimit = features.dailyStudioSessions;
    if (dailyLimit <= 0) {
      throw new HttpsError("permission-denied", "Photo Studio non disponible pour ce plan.");
    }

    // ── 4. Throttling : sessions du jour calendaire UTC+2 ───────────────
    const todayCount = await countTodaysSessions(db, uid);
    if (todayCount >= dailyLimit) {
      throw new HttpsError(
        "resource-exhausted",
        `Quota atteint (${todayCount}/${dailyLimit} sessions aujourd'hui). Revenez demain ou passez à un plan supérieur.`,
        { todayCount, dailyLimit, plan: planId },
      );
    }

    // ── 5. Génération sessionId unique (retry pour collision improbable) ─
    const now = Date.now();
    const sessionExpiresAt = now + SESSION_TTL_MS;
    const countryName = countryNameFromId(countryId);

    let createdSessionId: string | null = null;
    let createdWaMessage = "";

    for (let attempt = 0; attempt < GENERATE_RETRY_LIMIT; attempt++) {
      const candidate = generateSessionId();
      const ref = db.collection(COLLECTION).doc(candidate);
      const waMessage = buildWhatsappMessage(shopName, candidate, countryName);

      // Transaction : crée seulement si le doc n'existe pas (collision).
      // En cas de collision (extrêmement improbable, ~1e-9), retry.
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) {
            throw new Error("COLLISION");
          }
          tx.set(ref, {
            vendorId: uid,
            vendorName: shopName,
            vendorPhone,
            countryId,
            plan: planId,
            status: "waiting_photos",
            createdAt: now,
            expiresAt: sessionExpiresAt,
            processedUrls: [],
          });
          // Event d'historique
          const evRef = ref.collection("events").doc();
          tx.set(evRef, {
            action: "created",
            by: { userId: uid, role: "seller" },
            payload: { plan: planId, dailyLimit, todayCount: todayCount + 1 },
            timestamp: now,
          });
        });
        createdSessionId = candidate;
        createdWaMessage = waMessage;
        break;
      } catch (err) {
        if (err instanceof Error && err.message === "COLLISION") {
          logger.warn("[photoSessionCreate] sessionId collision, retrying", { attempt, candidate });
          continue;
        }
        throw err;
      }
    }

    if (!createdSessionId) {
      logger.error("[photoSessionCreate] Failed to generate unique sessionId after retries", { uid });
      throw new HttpsError("internal", "Impossible de créer la session, réessayez.");
    }

    // ── 6. Construction du lien wa.me ───────────────────────────────────
    const waNumber = toWaMeNumber(await resolveStudioWhatsapp(db));
    const whatsappLink =
      `https://wa.me/${waNumber}?text=${encodeURIComponent(createdWaMessage)}`;

    logger.info("[photoSessionCreate] Created", {
      sessionId: createdSessionId,
      uid,
      plan: planId,
      todayCount: todayCount + 1,
      dailyLimit,
    });

    return {
      sessionId: createdSessionId,
      expiresAt: sessionExpiresAt,
      whatsappLink,
      whatsappMessage: createdWaMessage,
    };
  },
);

/** Nom lisible du pays — alignement minimal avec INITIAL_COUNTRIES du front. */
function countryNameFromId(id: string): string {
  switch (id) {
    case "bi": return "Burundi";
    case "cd": return "RDC";
    case "rw": return "Rwanda";
    case "tz": return "Tanzanie";
    case "ke": return "Kenya";
    case "ug": return "Ouganda";
    default:   return id.toUpperCase();
  }
}
