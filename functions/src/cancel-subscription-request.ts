/**
 * NUNULIA — cancelSubscriptionRequest (Callable Cloud Function)
 *
 * Permet au vendeur d'annuler sa propre demande d'abonnement avant approbation.
 *
 * Règles métier :
 *   - Seller authentifié + non suspendu
 *   - Ownership requis (la demande doit appartenir au caller)
 *   - Statut autorisé pour annulation : `pending` ou `pending_validation`
 *     (avant que l'admin n'ait approuvé ou rejeté)
 *   - Idempotent : annulation d'une demande déjà `cancelled` = no-op
 *
 * Pourquoi via Cloud Function plutôt qu'une écriture client ?
 *   - L'historique (sous-collection `history`) est read=seller/admin mais
 *     write=false côté client (rules). Seul l'Admin SDK peut y écrire.
 *   - Atomicité requise : update du status + ajout d'un event history dans
 *     la même transaction.
 *
 * Returns: { ok: boolean, alreadyCancelled?: boolean }
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";

const REQUESTS_COLLECTION = "subscriptionRequests";
const HISTORY_SUBCOLLECTION = "history";
const NOTIFICATIONS_COLLECTION = "notifications";

interface CancelData {
  requestId: string;
}

export const cancelSubscriptionRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    // ── Auth check ───────────────────────────────────────────────
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connexion requise pour annuler une demande.");
    }
    const sellerId = request.auth.uid;

    if (request.auth.token.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu — action impossible.");
    }

    // ── Input validation ─────────────────────────────────────────
    const data = request.data as CancelData;
    const requestId = (data?.requestId || "").trim();
    if (!requestId || requestId.length > 100) {
      throw new HttpsError("invalid-argument", "requestId invalide.");
    }

    const db = await getDb();
    const reqRef = db.collection(REQUESTS_COLLECTION).doc(requestId);

    // ── Transaction : cancel atomique + ajout event history ──────
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) {
        return { ok: false as const, code: "not-found" as const, msg: "Demande introuvable" };
      }
      const reqData = snap.data() as any;

      // Ownership check
      if (reqData.userId !== sellerId) {
        return { ok: false as const, code: "permission-denied" as const, msg: "Demande non autorisée" };
      }

      // Idempotence — déjà annulée
      if (reqData.status === "cancelled") {
        return { ok: true as const, alreadyCancelled: true, data: reqData };
      }

      // Statuts non annulables (déjà approuvé ou rejeté par l'admin)
      if (reqData.status !== "pending" && reqData.status !== "pending_validation") {
        return {
          ok: false as const,
          code: "failed-precondition" as const,
          msg: `Demande non annulable (status=${reqData.status})`,
        };
      }

      const cancelledAt = Date.now();

      tx.update(reqRef, {
        status: "cancelled",
        cancelledAt,
        cancelledBy: sellerId,
        updatedAt: cancelledAt,
      });

      // Event history (sous-collection)
      const histRef = reqRef.collection(HISTORY_SUBCOLLECTION).doc();
      tx.set(histRef, {
        action: "cancelled",
        by: { userId: sellerId, role: "seller" },
        payload: {
          planId: reqData.planId ?? null,
          planLabel: reqData.planLabel ?? null,
        },
        timestamp: cancelledAt,
      });

      return { ok: true as const, alreadyCancelled: false, data: reqData };
    });

    if (!result.ok) {
      throw new HttpsError(result.code, result.msg);
    }

    if (result.alreadyCancelled) {
      return { ok: true, alreadyCancelled: true };
    }

    logger.info("[cancel-subscription-request] cancelled", { requestId, sellerId });

    // ── Notification (best-effort, hors transaction) ─────────────
    try {
      await db.collection(NOTIFICATIONS_COLLECTION).add({
        userId: sellerId,
        type: "subscription_change",
        title: "Demande d'abonnement annulée",
        body: `Votre demande pour le plan "${result.data.planLabel ?? "—"}" a bien été annulée. Vous pouvez en créer une nouvelle à tout moment.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      logger.warn("[cancel-subscription-request] notif échec:", err?.message);
    }

    return { ok: true, alreadyCancelled: false };
  }
);
