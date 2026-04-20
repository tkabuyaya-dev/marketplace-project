/**
 * NUNULIA — Buyer Requests Expiration & Purge Cron
 *
 * Runs daily at 03:00 UTC.
 * - Marks active buyer_requests as 'expired' when expiresAt < now
 * - Permanently deletes requests that have been expired for more than 7 days
 *
 * Cost: ~$0.001/day (2 queries + N writes/deletes)
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const expireBuyerRequests = onSchedule(
  { schedule: "0 3 * * *", timeZone: "UTC", region: "europe-west1" },
  async () => {
    const db = await getDb();
    const now = Date.now();

    // ── Step 1: Mark active requests as expired ──
    const expireSnap = await db
      .collection("buyerRequests")
      .where("status", "==", "active")
      .where("expiresAt", "<", now)
      .limit(500)
      .get();

    if (!expireSnap.empty) {
      const expireBatch = db.batch();
      expireSnap.docs.forEach(doc => {
        expireBatch.update(doc.ref, { status: "expired" });
      });
      await expireBatch.commit();
      console.log(`[expireBuyerRequests] Marked ${expireSnap.size} requests as expired.`);
    } else {
      console.log("[expireBuyerRequests] No active requests to expire.");
    }

    // ── Step 2: Permanently delete requests expired for more than 7 days ──
    const purgeThreshold = now - SEVEN_DAYS_MS;
    const purgeSnap = await db
      .collection("buyerRequests")
      .where("status", "==", "expired")
      .where("expiresAt", "<", purgeThreshold)
      .limit(500)
      .get();

    if (!purgeSnap.empty) {
      const purgeBatch = db.batch();
      purgeSnap.docs.forEach(doc => {
        purgeBatch.delete(doc.ref);
      });
      await purgeBatch.commit();
      console.log(`[expireBuyerRequests] Permanently deleted ${purgeSnap.size} expired requests.`);
    } else {
      console.log("[expireBuyerRequests] No expired requests to purge.");
    }
  }
);
