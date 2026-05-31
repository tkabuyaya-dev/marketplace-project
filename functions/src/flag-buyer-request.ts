/**
 * NUNULIA — flagBuyerRequest (Callable Cloud Function)
 *
 * Permet à un seller authentifié de signaler une demande buyer suspecte.
 *
 * Règles métier :
 *   - Seller authentifié + non suspendu
 *   - 1 seul flag par (seller, demande) → idempotence via transaction
 *   - Si 3 flags indépendants → status='suspended' + notif admin
 *
 * Pourquoi via Cloud Function plutôt qu'une écriture client directe ?
 *   - Le comptage des flags doit être atomique (transaction) pour
 *     éviter une race condition au passage de 2→3 flags simultanés.
 *   - L'update de status='suspended' nécessite des droits admin (rules).
 *   - On peut auditer dans les Cloud Logs qui a flagué quoi.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS } from "./config.js";

const VALID_REASONS = new Set(["spam", "illegal", "scam", "fake_number", "other"]);
const SUSPEND_THRESHOLD = 3;
const FLAGS_COLLECTION = "buyerRequestFlags";
const REQUESTS_COLLECTION = "buyerRequests";
const NOTIFICATIONS_COLLECTION = "notifications";

interface FlagRequestData {
  requestId: string;
  reason: string;
  comment?: string;
}

export const flagBuyerRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 20,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    // ── Auth check ───────────────────────────────────────────────
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connexion requise pour signaler une demande.");
    }
    const sellerId = request.auth.uid;

    // Bloque les comptes suspendus (claim JWT 'suspended')
    if (request.auth.token.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu — signalement impossible.");
    }

    // ── Input validation ─────────────────────────────────────────
    const data = request.data as FlagRequestData;
    const requestId = (data.requestId || "").trim();
    const reason = (data.reason || "").trim();
    const comment = (data.comment || "").trim().slice(0, 300) || null;

    if (!requestId || requestId.length > 100) {
      throw new HttpsError("invalid-argument", "requestId invalide.");
    }
    if (!VALID_REASONS.has(reason)) {
      throw new HttpsError("invalid-argument", "Raison invalide.");
    }

    const db = await getDb();

    // ── Vérif que la demande existe et est active ────────────────
    const reqRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      throw new HttpsError("not-found", "Demande introuvable.");
    }
    const reqData = reqSnap.data() || {};
    if (reqData.status === "suspended" || reqData.status === "deleted") {
      // Déjà traitée — on évite le bruit. Réponse OK silencieuse.
      return { ok: true, alreadyHandled: true, flagCount: null };
    }

    // ── Transaction : anti-double-flag + suspend si seuil atteint ─
    const result = await db.runTransaction(async (tx) => {
      // Check existing flag (sellerId + requestId)
      const existingQuery = await tx.get(
        db.collection(FLAGS_COLLECTION)
          .where("requestId", "==", requestId)
          .where("sellerId", "==", sellerId)
          .limit(1)
      );
      if (!existingQuery.empty) {
        return { duplicate: true as const, flagCount: null };
      }

      // Compte les flags actuels pour cette demande
      const allFlagsSnap = await tx.get(
        db.collection(FLAGS_COLLECTION).where("requestId", "==", requestId)
      );
      const currentCount = allFlagsSnap.size;
      const newCount = currentCount + 1;

      // Crée le nouveau flag
      const newFlagRef = db.collection(FLAGS_COLLECTION).doc();
      tx.set(newFlagRef, {
        requestId,
        sellerId,
        reason,
        comment,
        createdAt: Date.now(),
      });

      // Si on atteint le seuil → suspend la demande
      const shouldSuspend = newCount >= SUSPEND_THRESHOLD;
      if (shouldSuspend) {
        tx.update(reqRef, {
          status: "suspended",
          suspendedAt: Date.now(),
          suspendedReason: "community_flagged",
        });
      }

      return { duplicate: false as const, flagCount: newCount, suspended: shouldSuspend };
    });

    if (result.duplicate) {
      // Volontairement OK — on ne révèle pas au seller qu'il a déjà signalé,
      // ça évite le harcèlement d'un seul seller qui tente plusieurs fois.
      return { ok: true, alreadyHandled: true, flagCount: null };
    }

    logger.info("[flag-buyer-request] flag enregistré", {
      requestId,
      sellerId,
      reason,
      flagCount: result.flagCount,
      suspended: result.suspended,
    });

    // ── Si suspendue → notif admin (best-effort, pas dans la transaction) ─
    if (result.suspended) {
      try {
        const adminsSnap = await db.collection("users").where("role", "==", "admin").limit(10).get();
        const batch = db.batch();
        adminsSnap.forEach((adminDoc) => {
          const notifRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
          batch.set(notifRef, {
            userId: adminDoc.id,
            type: "buyer_request_suspended",
            title: "🚨 Demande suspendue auto (3 signalements)",
            body: `"${(reqData.title || "Demande").slice(0, 80)}" suspendue après 3 signalements community.`,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            data: { link: "/admin?tab=requests", buyerRequestId: requestId },
          });
        });
        await batch.commit();
      } catch (err) {
        logger.warn("[flag-buyer-request] notif admin échec (non bloquant):", err);
      }
    }

    return {
      ok: true,
      flagCount: result.flagCount,
      suspended: result.suspended,
    };
  }
);
