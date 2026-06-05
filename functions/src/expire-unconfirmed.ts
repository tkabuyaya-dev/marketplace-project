/**
 * NUNULIA — expireUnconfirmedBuyerRequests (cron 5 min)
 *
 * Purge les demandes en statut 'pending_confirmation' dont le délai (48h,
 * cf. PENDING_CONFIRM_TTL_MS dans submit-buyer-request) est dépassé sans
 * activation admin. Différent du cron quotidien expireBuyerRequests qui
 * s'occupe des demandes actives expirées à J+7.
 *
 * Le filtre repose sur confirmationExpiresAt (écrit à la création), donc
 * allonger le TTL côté submit suffit — ce cron n'a pas besoin de changer.
 *
 * Coût : ~288 runs/jour × ~1 query indexée + batch ≈ $0.03/mois. Acceptable.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";

const COLLECTION = "buyerRequests";

export const expireUnconfirmedBuyerRequests = onSchedule(
  { schedule: "every 5 minutes", timeZone: "UTC", region: "europe-west1" },
  async () => {
    const db = await getDb();
    const now = Date.now();

    const snap = await db.collection(COLLECTION)
      .where("status", "==", "pending_confirmation")
      .where("confirmationExpiresAt", "<", now)
      .limit(500)
      .get();

    if (snap.empty) {
      logger.info("[expireUnconfirmed] no pending requests to expire");
      return;
    }

    const batch = db.batch();
    snap.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: "expired",
        visible: false,
        expiredReason: "unconfirmed",
        updatedAt: now,
      });
    });
    await batch.commit();

    logger.info(`[expireUnconfirmed] expired ${snap.size} unconfirmed requests`);
  }
);
