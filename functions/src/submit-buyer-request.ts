/**
 * NUNULIA — submitBuyerRequest (Callable Cloud Function)
 *
 * Crée une demande acheteur "Je Cherche" côté serveur via Admin SDK.
 *
 * POURQUOI une Cloud Function plutôt qu'une écriture directe Firestore ?
 * - Les règles Firestore s'appuient sur `createdAt is int/number`.
 *   Sur iOS Safari (ITP strict), le SDK Firebase JS peut encoder
 *   Date.now() en double_value au lieu de integer_value → permission refusée.
 * - L'Admin SDK ignore totalement les security rules → 0 problème de type.
 * - Le timestamp est généré server-side → 0 problème de décalage d'horloge.
 * - Fonctionne sur iOS, Android, tout navigateur, connexion lente.
 *
 * REFONTE 2026-06-04 — Gate intelligent + confirmation WhatsApp :
 *   - Score ≥ 70  → publication directe ('active', visible=true) [comportement historique]
 *   - Score 40-69 → 'pending_confirmation' (jaune admin)
 *   - Score < 40  → 'pending_confirmation' (rouge admin)
 *   - blacklisté  → 'pending_confirmation' + score=0 (honeypot silencieux)
 * La modération Claude Haiku 4.5 est DÉPLACÉE vers confirm-buyer-request.ts :
 * on évite de payer ~$0.0005/abuseur qui n'ira jamais au bout du WhatsApp.
 * Les demandes "active" directes sont des numéros déjà connus + confirmés
 * passés → risque de spam quasi nul à ce stade.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, ANTHROPIC_API_KEY } from "./config.js";
import { computeTrustScore, generateConfirmationCode } from "./compute-trust-score.js";
import type { DeviceFingerprint } from "../../types.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
// TTL d'une demande en pending_confirmation. Option C = activation MANUELLE
// par l'admin après vérif WhatsApp → l'admin n'est pas un bot 24/7, il faut
// lui laisser le temps de traiter (ex : demande arrivée la nuit). 48h est un
// compromis : assez long pour le process manuel, assez court pour que le
// dashboard /admin?tab=security ne se remplisse pas de demandes mortes.
const PENDING_CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
const MAX_REQUESTS_PER_DEVICE_DAY = 3;
const COLLECTION = "buyerRequests";
const FINGERPRINTS_COLLECTION = "deviceFingerprints";
const BLOCKLIST_COLLECTION = "blocklist";
const ONE_HOUR_MS = 60 * 60 * 1000;
const TRUST_THRESHOLD_AUTO_ACTIVE = 70;

interface SubmitBuyerRequestData {
  title: string;
  description?: string | null;
  countryId: string;
  province: string;
  city: string;
  category?: string | null;
  budget?: number | null;
  budgetCurrency?: string | null;
  imageUrl?: string | null;
  whatsapp: string;
  buyerId?: string | null;
  buyerName: string;
  // ── Nouveaux champs sécurité (refonte 2026-06-04) ────────────────────
  deviceId?: string | null;
  deviceUserAgent?: string | null;
}

/** Validate WhatsApp format: +XXXXXXXXXXX or XXXXXXXXXXX (7-15 digits) */
function isValidWhatsapp(phone: string): boolean {
  return /^\+?\d{7,15}$/.test(phone.replace(/\s/g, ""));
}

/** Validate a non-empty string within max length */
function isValidString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

/** Valide un deviceId 16 chars alphanum (cf. utils/deviceFingerprint.ts). */
function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{12,16}$/.test(value);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠️  NE PAS MODIFIER ces options — Configuration critique iOS               ║
// ║                                                                              ║
// ║  • region "europe-west1" : doit correspondre à getFirebaseFunctions()        ║
// ║    dans firebase-config.ts. Changer l'un sans l'autre → ECONNREFUSED.        ║
// ║  • NE PAS ajouter enforceAppCheck: true → bloque iOS Safari (ITP empêche     ║
// ║    reCAPTCHA d'obtenir un token, ce qui produit la même erreur "permissions"  ║
// ║  • cors: ALLOWED_ORIGINS → ne pas supprimer ni élargir à "*"                 ║
// ║                                                                              ║
// ║  Fix validé en production le 2026-04-14. Ne pas toucher.                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
export const submitBuyerRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 20,
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
    // 60s pour couvrir : rate-limit query + lectures historique device/numéro
    // + score + (rare) modération de fallback + write. La modération principale
    // est déplacée vers confirm-buyer-request.ts.
    timeoutSeconds: 60,
  },
  async (request) => {
    const data = request.data as SubmitBuyerRequestData;

    // ── Validation des champs obligatoires ──────────────────────────
    if (!isValidString(data.title, 200)) {
      throw new HttpsError("invalid-argument", "Le titre est requis (max 200 caractères).");
    }
    if (!isValidString(data.buyerName, 100)) {
      throw new HttpsError("invalid-argument", "Le nom de l'acheteur est requis.");
    }
    if (!isValidString(data.countryId, 10)) {
      throw new HttpsError("invalid-argument", "Le pays est requis.");
    }
    if (!isValidString(data.province, 100)) {
      throw new HttpsError("invalid-argument", "La province est requise.");
    }
    if (!isValidString(data.city, 100)) {
      throw new HttpsError("invalid-argument", "La ville est requise.");
    }
    // Catégorie obligatoire depuis le smart picker (slug réel OU "_help" pour "Je ne sais pas trop").
    // Si _help, la CF onBuyerRequestMatch appellera Claude Haiku pour deviner.
    if (!isValidString(data.category, 80)) {
      throw new HttpsError("invalid-argument", "La catégorie est requise.");
    }

    const whatsapp = (data.whatsapp || "").replace(/\s/g, "");
    if (!isValidWhatsapp(whatsapp)) {
      throw new HttpsError("invalid-argument", "Numéro WhatsApp invalide.");
    }

    // ── Sécurité : lecture deviceId + IP + UA (fail-soft) ────────────
    const deviceId = isValidDeviceId(data.deviceId) ? data.deviceId : null;
    const deviceUserAgent = (typeof data.deviceUserAgent === "string"
      ? data.deviceUserAgent.slice(0, 200)
      : null);
    // IP : disponible via request.rawRequest sur 2nd-gen onCall. Peut être null
    // si proxy mal configuré — score se contentera des autres signaux.
    const deviceIp = (request.rawRequest as { ip?: string } | undefined)?.ip ?? null;

    const db = await getDb();
    const now = Date.now();

    // ── Rate limiting : max 3 demandes par WhatsApp / 24h ────────────
    // Query "single-field equality" uniquement → utilise l'index auto Firestore.
    // FAIL-CLOSED : si la query échoue, on REFUSE.
    const since = now - 24 * 60 * 60 * 1000;
    let whatsappHistory: Array<{
      status: string;
      confirmedAt?: number | null;
      createdAt: number;
      deviceId?: string;
      countryId?: string;
      city?: string;
    }> = [];
    try {
      const rateSnap = await db.collection(COLLECTION)
        .where("whatsapp", "==", whatsapp)
        .get();

      // Compte les actives + fulfilled des 24 dernières heures pour la limite
      // dure (3/numéro/24h). On les passe aussi au calcul du score.
      whatsappHistory = rateSnap.docs.map(d => {
        const x = d.data() as Record<string, unknown>;
        return {
          status: typeof x.status === "string" ? x.status : "",
          confirmedAt: typeof x.confirmedAt === "number" ? x.confirmedAt : null,
          createdAt: typeof x.createdAt === "number" ? x.createdAt : 0,
          deviceId: typeof x.deviceId === "string" ? x.deviceId : undefined,
          countryId: typeof x.countryId === "string" ? x.countryId : undefined,
          city: typeof x.city === "string" ? x.city : undefined,
        };
      });

      const activeCount = whatsappHistory.filter(h => {
        return (h.status === "active" || h.status === "fulfilled" ||
                h.status === "pending_confirmation") && h.createdAt >= since;
      }).length;

      if (activeCount >= MAX_REQUESTS_PER_DAY) {
        throw new HttpsError(
          "resource-exhausted",
          `Maximum ${MAX_REQUESTS_PER_DAY} demandes par 24h atteint pour ce numéro.`
        );
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "resource-exhausted") throw err;
      logger.error("[submitBuyerRequest] Rate-limit check failed — REFUSING request:", e?.message);
      throw new HttpsError(
        "unavailable",
        "Service temporairement indisponible. Réessayez dans quelques instants."
      );
    }

    // ── Rate limit deviceId : max 3 demandes / device / 24h ──────────
    // Second axe en plus du numéro (l'abuseur peut changer de numéro).
    let deviceHistory: DeviceFingerprint | null = null;
    let ipBurstCount = 0;
    if (deviceId) {
      try {
        const fpRef = db.collection(FINGERPRINTS_COLLECTION).doc(deviceId);
        const fpSnap = await fpRef.get();
        if (fpSnap.exists) {
          deviceHistory = fpSnap.data() as DeviceFingerprint;
        }

        // Demandes du device dans 24h via une query inversée — on filtre
        // whatsappHistory ne suffit pas (autres numéros). On scan max 30
        // depuis l'index buyerId est insuffisant ; on lit via la collection
        // contre l'index device. Coût plafond : 1 query indexée < 50 docs.
        const deviceSnap = await db.collection(COLLECTION)
          .where("deviceId", "==", deviceId)
          .where("createdAt", ">=", since)
          .limit(30)
          .get();
        const deviceCount24h = deviceSnap.size;
        if (deviceCount24h >= MAX_REQUESTS_PER_DEVICE_DAY) {
          // On NE renvoie PAS d'erreur explicite (honeypot doux). On force le
          // status à pending_confirmation et l'admin sera alerté. L'abuseur
          // croit que c'est passé mais la demande ne sera jamais visible.
          // Le retour est identique à un succès normal.
          logger.warn("[submitBuyerRequest] device rate-limit hit (silent honeypot)", {
            deviceId,
            count24h: deviceCount24h,
          });
          // On marque deviceHistory comme abusif via abuseFlagged pour que
          // computeTrustScore sache.
          if (!deviceHistory) {
            deviceHistory = {
              deviceId,
              firstSeenAt: now,
              lastSeenAt: now,
              totalRequests: deviceCount24h,
              confirmedRequests: 0,
              abuseFlagged: 1,
              whatsappNumbers: [whatsapp],
              status: "watched",
            };
          } else {
            deviceHistory.abuseFlagged = Math.max(1, deviceHistory.abuseFlagged);
          }
        }
      } catch (err: unknown) {
        const e = err as { message?: string };
        logger.warn("[submitBuyerRequest] device history read failed (continue with null):", e?.message);
      }

      // IP burst : compte les demandes de cette IP dans la dernière heure
      if (deviceIp) {
        try {
          const ipSnap = await db.collection(COLLECTION)
            .where("deviceIp", "==", deviceIp)
            .where("createdAt", ">=", now - ONE_HOUR_MS)
            .limit(20)
            .get();
          ipBurstCount = ipSnap.size;
        } catch (err: unknown) {
          const e = err as { message?: string };
          logger.warn("[submitBuyerRequest] ip burst read failed:", e?.message);
        }
      }
    }

    // ── Check blocklist deviceId ─────────────────────────────────────
    let isBlocked = false;
    if (deviceId) {
      try {
        const blockSnap = await db.collection(BLOCKLIST_COLLECTION).doc(deviceId).get();
        if (blockSnap.exists) {
          const b = blockSnap.data() as { expiresAt?: number | null };
          // Permanent (expiresAt=null) OU temporaire non expirée
          if (b.expiresAt === null || b.expiresAt === undefined || (typeof b.expiresAt === "number" && b.expiresAt > now)) {
            isBlocked = true;
            logger.warn("[submitBuyerRequest] device is blacklisted (silent honeypot)", { deviceId });
          }
        }
      } catch (err: unknown) {
        const e = err as { message?: string };
        logger.warn("[submitBuyerRequest] blocklist read failed:", e?.message);
      }
    }

    // ── Calcul du score de confiance ─────────────────────────────────
    const trust = computeTrustScore({
      whatsapp,
      deviceId,
      ip: deviceIp,
      now,
      whatsappHistory,
      deviceHistory,
      ipBurstCount,
      isBlocked,
      declaredCountry: data.countryId,
      declaredCity: data.city,
    });

    // ── Décision : active directe OU pending_confirmation ────────────
    // Gate : score >= 70 ET pas blacklisté → active direct (UX préservée).
    // Sinon : pending_confirmation (TTL 48h, l'admin active après vérif WhatsApp).
    const shouldGoActiveDirect = !isBlocked && trust.score >= TRUST_THRESHOLD_AUTO_ACTIVE;

    const confirmationCode = shouldGoActiveDirect ? null : generateConfirmationCode();

    // ── Création du document ─────────────────────────────────────────
    const docData: Record<string, unknown> = {
      title:             data.title.trim(),
      description:       data.description?.trim() || null,
      countryId:         data.countryId,
      province:          data.province,
      city:              data.city,
      category:          data.category || null,
      budget:            typeof data.budget === "number" ? data.budget : null,
      budgetCurrency:    data.budgetCurrency || null,
      imageUrl:          data.imageUrl || null,
      whatsapp,
      buyerId:           data.buyerId || null,
      buyerName:         data.buyerName.trim(),
      status:            shouldGoActiveDirect ? "active" : "pending_confirmation",
      visible:           shouldGoActiveDirect,    // ⚠️ false sur pending = invisible feed vendeur
      createdAt:         now,
      expiresAt:         now + SEVEN_DAYS_MS,
      viewCount:         0,
      contactCount:      0,
      uniqueSellerCount: 0,
      isFull:            false,
      updatedAt:         now,
      createdAtTs:       FieldValue.serverTimestamp(),
      // Sécurité
      deviceId:          deviceId,
      deviceIp:          deviceIp,
      deviceUserAgent:   deviceUserAgent,
      scoreConfiance:    trust.score,
      scoreSignals:      trust.signals,
      // Confirmation (seulement si pending)
      ...(shouldGoActiveDirect ? {
        confirmedAt: now,         // active direct = considérée confirmée tout de suite
      } : {
        confirmationCode,
        confirmationExpiresAt: now + PENDING_CONFIRM_TTL_MS,
        confirmedAt: null,
      }),
    };

    const ref = await db.collection(COLLECTION).add(docData);

    // ── Update du fingerprint dénormalisé (best-effort) ──────────────
    if (deviceId) {
      try {
        const fpRef = db.collection(FINGERPRINTS_COLLECTION).doc(deviceId);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(fpRef);
          if (!snap.exists) {
            tx.set(fpRef, {
              deviceId,
              firstSeenAt: now,
              lastSeenAt: now,
              totalRequests: 1,
              confirmedRequests: 0,
              abuseFlagged: 0,
              lastIp: deviceIp ?? undefined,
              lastUserAgent: deviceUserAgent ?? undefined,
              whatsappNumbers: [whatsapp],
              status: isBlocked ? "blocked" : "normal",
            } satisfies DeviceFingerprint);
          } else {
            const cur = snap.data() as DeviceFingerprint;
            const numbers = cur.whatsappNumbers || [];
            const nextNumbers = numbers.includes(whatsapp)
              ? numbers
              : [...numbers.slice(-19), whatsapp]; // FIFO max 20
            tx.update(fpRef, {
              lastSeenAt: now,
              totalRequests: (cur.totalRequests || 0) + 1,
              lastIp: deviceIp ?? undefined,
              lastUserAgent: deviceUserAgent ?? undefined,
              whatsappNumbers: nextNumbers,
              status: cur.status === "blocked" ? "blocked"
                : (trust.level === "red" ? "watched" : cur.status || "normal"),
            });
          }
        });
      } catch (err: unknown) {
        const e = err as { message?: string };
        logger.warn("[submitBuyerRequest] fingerprint update failed (non-blocking):", e?.message);
      }
    }

    logger.info("[submitBuyerRequest] Created:", {
      id: ref.id,
      whatsapp: whatsapp.slice(0, 6) + "***",
      status: docData.status,
      score: trust.score,
      level: trust.level,
      signals: trust.signals.slice(0, 6),
      hasDevice: !!deviceId,
    });

    // ── Réponse au client ────────────────────────────────────────────
    // SÉCURITÉ (Option C, 2026-06-04) : on ne renvoie JAMAIS le code au
    // buyer. Le code est secret côté serveur — visible uniquement par
    // l'admin dans `/admin?tab=security`. Le buyer voit juste un message
    // générique "envoie JE CONFIRME à Nunulia WhatsApp", l'admin valide
    // ensuite manuellement après vérification du numéro émetteur.
    //
    // Pourquoi ce design : si le code était visible côté buyer, un
    // usurpateur pourrait l'extraire de la réponse réseau et appeler
    // /confirmer/:code lui-même sans jamais envoyer le WhatsApp depuis
    // le numéro déclaré → faille critique d'usurpation.
    if (shouldGoActiveDirect) {
      return {
        id: ref.id,
        requiresConfirmation: false,
        status: "active" as const,
      };
    }
    return {
      id: ref.id,
      requiresConfirmation: true,
      status: "pending_confirmation" as const,
      expiresInMinutes: 30,
    };
  }
);
