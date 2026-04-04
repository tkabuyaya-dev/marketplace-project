/**
 * NUNULIA — Buyer Requests Expiration Cron
 *
 * Runs daily at 03:00 UTC.
 * - Marks buyer_requests as 'expired' when expiresAt < now
 *
 * Cost: ~$0.001/day (1 query + N writes)
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";

export const expireBuyerRequests = onSchedule(
  { schedule: "0 3 * * *", timeZone: "UTC", region: "europe-west1" },
  async () => {
    const db = await getDb();
    const now = Date.now();

    const snap = await db
      .collection("buyerRequests")
      .where("status", "==", "active")
      .where("expiresAt", "<", now)
      .limit(500)
      .get();

    if (snap.empty) {
      console.log("[expireBuyerRequests] No expired requests found.");
      return;
    }

    const batch = db.batch();
    snap.docs.forEach(doc => {
      batch.update(doc.ref, { status: "expired" });
    });

    await batch.commit();
    console.log(`[expireBuyerRequests] Expired ${snap.size} buyer requests.`);
  }
);
