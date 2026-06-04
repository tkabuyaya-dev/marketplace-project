/**
 * NUNULIA — confirmBuyerRequest (Callable Cloud Function)
 *
 * Confirmation pré-publication d'une demande client. Appelée depuis la page
 * /confirmer/:code (front PWA) après que le buyer ait cliqué sur le lien
 * WhatsApp pré-rempli ou tapé le code dans WhatsApp.
 *
 * Flux :
 *   1. Lookup demande par confirmationCode
 *   2. Si expirée (TTL 30 min dépassé) → 410 Gone
 *   3. Si déjà confirmée → idempotent (retour ok)
 *   4. Modération Claude Haiku 4.5 maintenant (déplacée depuis submitBuyerRequest
 *      pour ne pas payer l'IA sur les abuseurs qui n'iront jamais jusqu'ici)
 *   5. Si reject → status='suspended', visible reste false
 *   6. Sinon : status='active', visible=true, confirmedAt, +20 score si même device
 *   7. MAJ deviceFingerprint (confirmedRequests++)
 *
 * IDEMPOTENT : 2ᵉ clic sur le même code renvoie {ok: true, alreadyConfirmed: true}.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS, ANTHROPIC_API_KEY } from "./config.js";
import { moderateBuyerRequest } from "./moderate-buyer-request.js";

const COLLECTION = "buyerRequests";
const FINGERPRINTS_COLLECTION = "deviceFingerprints";

interface ConfirmInput {
  code: string;
  /** deviceId au moment du clic (peut être différent du device de soumission). */
  deviceId?: string | null;
}

function isValidCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{8}$/.test(code);
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{12,16}$/.test(value);
}

export const confirmBuyerRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
  },
  async (request) => {
    const data = request.data as ConfirmInput;

    if (!isValidCode(data.code)) {
      throw new HttpsError("invalid-argument", "Code de confirmation invalide.");
    }

    const confirmDeviceId = isValidDeviceId(data.deviceId) ? data.deviceId : null;
    const confirmIp = (request.rawRequest as { ip?: string } | undefined)?.ip ?? null;

    const db = await getDb();
    const now = Date.now();

    // ── Lookup par confirmationCode (index simple sur le champ) ──────
    const snap = await db.collection(COLLECTION)
      .where("confirmationCode", "==", data.code)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError("not-found", "Code introuvable ou déjà utilisé.");
    }

    const docSnap = snap.docs[0];
    const reqData = docSnap.data();
    const status = reqData.status as string;

    // ── Idempotence : déjà confirmée ─────────────────────────────────
    if (status === "active") {
      return {
        ok: true,
        alreadyConfirmed: true,
        requestId: docSnap.id,
        title: typeof reqData.title === "string" ? reqData.title : "",
        city: typeof reqData.city === "string" ? reqData.city : "",
      };
    }

    // ── Suspendue ou supprimée — refus silencieux ────────────────────
    if (status === "suspended" || status === "deleted") {
      // Pas d'info sur la raison (honeypot)
      throw new HttpsError("failed-precondition", "Demande non confirmable.");
    }

    // ── Expirée (TTL 30 min ou cron 5 min) ───────────────────────────
    const confirmationExpiresAt = typeof reqData.confirmationExpiresAt === "number"
      ? reqData.confirmationExpiresAt : 0;
    if (status === "expired" || confirmationExpiresAt > 0 && confirmationExpiresAt < now) {
      throw new HttpsError(
        "deadline-exceeded",
        "Le délai de confirmation est dépassé. Soumettez une nouvelle demande."
      );
    }

    if (status !== "pending_confirmation") {
      // Status inattendu — fail safe, on log et refuse.
      logger.warn("[confirmBuyerRequest] unexpected status", {
        requestId: docSnap.id,
        status,
      });
      throw new HttpsError("failed-precondition", "Statut incompatible.");
    }

    // ── Modération Claude Haiku 4.5 (déplacée depuis submitBuyerRequest) ──
    // Le buyer a confirmé son numéro → on dépense les $0.0005 maintenant
    // au lieu de gaspiller sur les abuseurs qui ne confirment jamais.
    const moderation = await moderateBuyerRequest({
      title: typeof reqData.title === "string" ? reqData.title : "",
      description: typeof reqData.description === "string" ? reqData.description : null,
      category: typeof reqData.category === "string" ? reqData.category : null,
    });

    if (moderation.verdict === "reject") {
      logger.warn("[confirmBuyerRequest] BLOCKED by AI moderation:", {
        requestId: docSnap.id,
        reason: moderation.reason,
      });
      await docSnap.ref.update({
        status: "suspended",
        suspendedReason: "moderation_reject",
        moderationReason: moderation.reason,
        updatedAt: now,
        visible: false,
      });
      throw new HttpsError(
        "invalid-argument",
        "Demande refusée. Vérifiez le contenu et réessayez."
      );
    }

    // ── Confirmation OK : update Firestore ──────────────────────────
    const originDeviceId = typeof reqData.deviceId === "string" ? reqData.deviceId : null;
    const originScore = typeof reqData.scoreConfiance === "number" ? reqData.scoreConfiance : 50;
    const originSignals = Array.isArray(reqData.scoreSignals) ? reqData.scoreSignals as string[] : [];

    // +20 si le device qui clique = device qui a soumis (signal de confiance fort)
    const sameDeviceBonus = (confirmDeviceId && originDeviceId && confirmDeviceId === originDeviceId)
      ? 20 : 0;
    const finalScore = Math.max(0, Math.min(100, originScore + sameDeviceBonus));
    const finalSignals = sameDeviceBonus
      ? [...originSignals, `confirm_same_device:+${sameDeviceBonus}`]
      : originSignals;

    const updatePayload: Record<string, unknown> = {
      status: "active",
      visible: true,
      confirmedAt: now,
      deviceConfirmIp: confirmIp,
      deviceConfirmDeviceId: confirmDeviceId,
      scoreConfiance: finalScore,
      scoreSignals: finalSignals,
      updatedAt: now,
      // Borderline reste tagué si présent — admin tranchera
      ...(moderation.verdict === "borderline" && {
        moderationFlag: true,
        moderationReason: moderation.reason,
      }),
    };
    // Une fois confirmée, le code n'a plus d'utilité — on le retire pour ne
    // pas réutiliser accidentellement (idempotence repose sur status='active').
    // On ne fait pas FieldValue.delete() pour rester explicite + admin peut
    // toujours retracer via les logs. Note: garder le code permet aussi de
    // re-router /signaler/:code (l'utilisateur peut signaler après confirmation
    // s'il découvre qu'on lui a usurpé son numéro).
    // → On le garde.

    await docSnap.ref.update(updatePayload);

    // ── MAJ deviceFingerprint origine (confirmed++) ──────────────────
    if (originDeviceId) {
      try {
        const fpRef = db.collection(FINGERPRINTS_COLLECTION).doc(originDeviceId);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(fpRef);
          if (snap.exists) {
            const cur = snap.data() as { confirmedRequests?: number };
            tx.update(fpRef, {
              confirmedRequests: (cur.confirmedRequests || 0) + 1,
              lastSeenAt: now,
            });
          }
        });
      } catch (err: unknown) {
        const e = err as { message?: string };
        logger.warn("[confirmBuyerRequest] fingerprint update failed (non-blocking):", e?.message);
      }
    }

    logger.info("[confirmBuyerRequest] Confirmed:", {
      requestId: docSnap.id,
      finalScore,
      sameDeviceBonus,
      moderation: moderation.verdict,
    });

    return {
      ok: true,
      alreadyConfirmed: false,
      requestId: docSnap.id,
      title: typeof reqData.title === "string" ? reqData.title : "",
      city: typeof reqData.city === "string" ? reqData.city : "",
    };
  }
);
