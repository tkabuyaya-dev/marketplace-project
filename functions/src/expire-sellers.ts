/**
 * NUNULIA — Expire Sellers (HTTP Cloud Function)
 *
 * POST /expireSellers
 * Authorization: Bearer NUNULIA_SECRET_TOKEN
 *
 * Finds sellers with subscriptionExpiry < now AND status == "active".
 * - Sets the seller document: status → "inactive"
 * - Sets their active products: status → "inactive", deleteAt → now + 14 days
 *
 * Returns: { success: boolean, message: string, count: number }
 *
 * Designed to be called by an external cron scheduler (e.g. Cloud Scheduler
 * calling the HTTPS URL) once per day.
 */

import { onRequest } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 450;

export const expireSellers = onRequest(
  {
    maxInstances: 1,
    secrets: [NUNULIA_SECRET_TOKEN],
    region: "europe-west1",
  },
  async (req, res) => {
    // ── Auth check ──
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      console.warn("[expireSellers] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized", count: 0 });
      return;
    }

    try {
    const db = await getDb();
    const now = Timestamp.now();
    const deleteAt = Timestamp.fromMillis(Date.now() + FOURTEEN_DAYS_MS);

    // ── Query expired active sellers ──
    const sellersSnap = await db
      .collection("users")
      .where("status", "==", "active")
      .where("subscriptionExpiry", "<", now)
      .get();

    if (sellersSnap.empty) {
      console.log("[expireSellers] No expired sellers found.");
      res.json({ success: true, message: "No expired sellers found.", count: 0 });
      return;
    }

    console.log(`[expireSellers] Found ${sellersSnap.size} expired seller(s).`);
    let sellerCount = 0;

    for (const sellerDoc of sellersSnap.docs) {
      const sellerId = sellerDoc.id;

      // Mark seller inactive
      await sellerDoc.ref.update({ status: "inactive" });
      console.log(`[expireSellers] Seller ${sellerId} → status: "inactive"`);

      // Mark all their active products inactive + schedule deletion
      const productsSnap = await db
        .collection("products")
        .where("sellerId", "==", sellerId)
        .where("status", "==", "active")
        .get();

      if (!productsSnap.empty) {
        let batch = db.batch();
        let batchOps = 0;

        for (const productDoc of productsSnap.docs) {
          batch.update(productDoc.ref, { status: "inactive", deleteAt });
          batchOps++;

          if (batchOps >= BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            batchOps = 0;
          }
        }

        if (batchOps > 0) await batch.commit();

        console.log(
          `[expireSellers] Seller ${sellerId}: ${productsSnap.size} product(s) → inactive + deleteAt set`
        );
      } else {
        console.log(`[expireSellers] Seller ${sellerId}: no active products.`);
      }

      sellerCount++;
    }

    res.json({
      success: true,
      message: `${sellerCount} seller(s) expired successfully.`,
      count: sellerCount,
    });
    } catch (err: any) {
      console.error("[expireSellers] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error", count: 0 });
    }
  }
);
