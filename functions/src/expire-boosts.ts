/**
 * NUNULIA — Boost Expiration Cron (Scheduled Cloud Function)
 *
 * Runs daily at 05:00 UTC.
 * Finds all products where isBoosted == true and boostExpiresAt has passed,
 * then resets isBoosted: false and notifies the seller.
 *
 * Design notes:
 * - Queries on a single field (isBoosted) — no composite index required.
 * - client-side date filter on boostExpiresAt to avoid a second range index.
 * - Processes in batches of 450 (safe margin under Firestore 500-op limit).
 * - Sends one notification per expired product.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";

const BATCH_LIMIT = 450;

export const expireBoosts = onSchedule(
  {
    region:       "europe-west1",
    schedule:     "0 5 * * *", // 05:00 UTC daily (07:00 Bujumbura)
    timeZone:     "UTC",
    retryCount:   1,
    maxInstances: 1,
  },
  async () => {
    const db  = await getDb();
    const now = Date.now();

    // Fetch all currently-boosted approved products
    const snap = await db
      .collection("products")
      .where("isBoosted", "==", true)
      .where("status", "==", "approved")
      .get();

    if (snap.empty) {
      console.log("[expireBoosts] No boosted products found.");
      return;
    }

    // Filter server-side: keep only those whose boost has truly expired
    const expired = snap.docs.filter(d => {
      const exp = d.data().boostExpiresAt;
      if (!exp) return true;
      // boostExpiresAt stored as ms number or Firestore Timestamp
      const expMs = typeof exp === "number" ? exp : exp.toMillis?.() ?? 0;
      return expMs < now;
    });

    if (expired.length === 0) {
      console.log("[expireBoosts] No expired boosts to process.");
      return;
    }

    console.log(`[expireBoosts] Processing ${expired.length} expired boost(s).`);

    // Process in batches
    for (let i = 0; i < expired.length; i += BATCH_LIMIT) {
      const chunk = expired.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      chunk.forEach(docSnap => {
        batch.update(docSnap.ref, {
          isBoosted:     false,
          boostExpiresAt: null,
        });
      });

      await batch.commit();
      console.log(`[expireBoosts] Batch ${Math.floor(i / BATCH_LIMIT) + 1}: reset ${chunk.length} product(s).`);
    }

    // Notify sellers (one notification per expired product)
    const notifBatch = db.batch();
    for (const docSnap of expired) {
      const data     = docSnap.data();
      const sellerId = data.sellerId as string | undefined;
      const title    = data.title    as string | undefined;
      if (!sellerId) continue;

      const notifRef = db.collection("notifications").doc();
      notifBatch.set(notifRef, {
        userId:    sellerId,
        type:      "boost_expired",
        title:     "⏰ Boost expiré",
        body:      `La mise en avant de "${title ?? 'votre produit'}" a pris fin. Rebooste pour rester en vedette !`,
        read:      false,
        createdAt: now,
        data:      {},
      });
    }
    await notifBatch.commit();

    console.log(`[expireBoosts] Done. ${expired.length} boost(s) expired.`);
  }
);
