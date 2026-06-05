/**
 * NUNULIA — confirmBuyerRequest (Callable Cloud Function — admin only)
 *
 * Activation manuelle par l'admin d'une demande en pending_confirmation.
 * Refonte Option C 2026-06-04 : le code de confirmation n'est plus exposé
 * au buyer (sinon faille d'usurpation triviale). C'est l'admin qui, après
 * vérification du numéro émetteur du WhatsApp reçu, active la demande
 * depuis le dashboard `/admin?tab=security`.
 *
 * Input accepté :
 *   - { requestId: string } → cas standard, l'admin clic "Activer" sur une
 *     ligne du dashboard
 *   - { code: string }      → cas secondaire (lien direct depuis WhatsApp
 *     Business si l'admin veut activer via URL)
 *
 * Flux :
 *   1. Vérif auth.token.role === 'admin' (sinon permission-denied)
 *   2. Lookup demande par requestId OU confirmationCode
 *   3. Si expirée → 410 Gone
 *   4. Si déjà confirmée → idempotent
 *   5. Modération Claude Haiku 4.5 (déplacée depuis submitBuyerRequest
 *      pour économiser sur les abuseurs qui n'iront jamais jusqu'ici)
 *   6. Si reject → status='suspended', visible reste false
 *   7. Sinon : status='active', visible=true, confirmedAt
 *   8. MAJ deviceFingerprint (confirmedRequests++)
 *
 * IDEMPOTENT : 2ᵉ appel sur la même demande renvoie alreadyConfirmed:true.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS, ANTHROPIC_API_KEY } from "./config.js";
import { moderateBuyerRequest } from "./moderate-buyer-request.js";

const COLLECTION = "buyerRequests";
const FINGERPRINTS_COLLECTION = "deviceFingerprints";

interface ConfirmInput {
  /** Identifiant Firestore de la demande (chemin standard depuis le dashboard admin). */
  requestId?: string;
  /** Code de confirmation 8-char (chemin secondaire, lien direct WhatsApp Business). */
  code?: string;
}

function isValidCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{8}$/.test(code);
}

function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
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
    // ── Gate admin (Option C, 2026-06-04) ────────────────────────────
    // La CF est strictement réservée aux admins authentifiés. Aucun
    // buyer n'a accès au code, et même si un attaquant le devinait,
    // l'auth claim 'role:admin' verrouille l'accès.
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    if (request.auth.token.role !== "admin") {
      logger.warn("[confirmBuyerRequest] non-admin call refused", {
        uid: request.auth.uid,
        role: request.auth.token.role,
      });
      throw new HttpsError("permission-denied", "Réservé aux administrateurs.");
    }
    const adminUid = request.auth.uid;

    const data = request.data as ConfirmInput;

    // L'admin peut appeler avec requestId (dashboard) OU code (URL directe).
    const hasRequestId = isValidRequestId(data.requestId);
    const hasCode = isValidCode(data.code);
    if (!hasRequestId && !hasCode) {
      throw new HttpsError("invalid-argument", "requestId ou code requis.");
    }

    const db = await getDb();
    const now = Date.now();

    // ── Lookup direct par requestId, ou via le code ─────────────────
    let docSnap: FirebaseFirestore.DocumentSnapshot;
    if (hasRequestId) {
      docSnap = await db.collection(COLLECTION).doc(data.requestId as string).get();
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Demande introuvable.");
      }
    } else {
      const snap = await db.collection(COLLECTION)
        .where("confirmationCode", "==", data.code)
        .limit(1)
        .get();
      if (snap.empty) {
        throw new HttpsError("not-found", "Code introuvable ou déjà utilisé.");
      }
      docSnap = snap.docs[0];
    }

    const reqData = docSnap.data() || {};
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

    // ── Modération Claude Haiku 4.5 — ADVISORY uniquement ────────────
    // L'admin a déjà vérifié manuellement le numéro WhatsApp émetteur et
    // cliqué "Activer" : c'est LUI l'autorité humaine de décision (cf. le
    // principe du prompt de modération « l'admin tranche, jamais toi »).
    // La modération ne BLOQUE donc JAMAIS l'activation — elle pose seulement
    // un flag visible dans le dashboard pour audit. Sinon un faux positif
    // (ex : "test activation" classé « Spam évident ») renvoie un 400 et
    // suspend silencieusement une demande pourtant légitime, alors que
    // l'admin avait explicitement tranché.
    // On garde l'appel ici (et non dans submitBuyerRequest) pour ne pas
    // payer les $0.0005 sur les abuseurs qui ne confirment jamais.
    const moderation = await moderateBuyerRequest({
      title: typeof reqData.title === "string" ? reqData.title : "",
      description: typeof reqData.description === "string" ? reqData.description : null,
      category: typeof reqData.category === "string" ? reqData.category : null,
    });

    // reject OU borderline ⇒ flag advisory (n'empêche pas la publication).
    const moderationFlagged = moderation.verdict === "reject" || moderation.verdict === "borderline";
    if (moderation.verdict === "reject") {
      logger.warn("[confirmBuyerRequest] AI moderation 'reject' OVERRIDDEN by admin activation:", {
        requestId: docSnap.id,
        adminUid,
        reason: moderation.reason,
      });
    }

    // ── Confirmation OK : update Firestore ──────────────────────────
    const originDeviceId = typeof reqData.deviceId === "string" ? reqData.deviceId : null;
    const originScore = typeof reqData.scoreConfiance === "number" ? reqData.scoreConfiance : 50;
    const originSignals = Array.isArray(reqData.scoreSignals) ? reqData.scoreSignals as string[] : [];

    // Bonus +10 quand l'activation est faite manuellement par un admin
    // (signal de confiance humain, distinct du bonus historique +20 same-device
    // qui n'est plus pertinent en Option C).
    const adminBonus = 10;
    const finalScore = Math.max(0, Math.min(100, originScore + adminBonus));
    const finalSignals = [...originSignals, `admin_confirmed:+${adminBonus}`];

    const updatePayload: Record<string, unknown> = {
      status: "active",
      visible: true,
      confirmedAt: now,
      confirmedByAdmin: adminUid,
      scoreConfiance: finalScore,
      scoreSignals: finalSignals,
      updatedAt: now,
      // Flag advisory (borderline OU reject) — visible par l'admin, sans
      // empêcher la publication puisque l'admin a déjà tranché.
      ...(moderationFlagged && {
        moderationFlag: true,
        moderationReason: moderation.reason,
      }),
    };

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

    logger.info("[confirmBuyerRequest] Confirmed by admin:", {
      requestId: docSnap.id,
      adminUid,
      finalScore,
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
