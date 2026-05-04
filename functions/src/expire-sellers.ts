/**
 * NUNULIA — Expire Sellers (HTTP Cloud Function)
 *
 * POST /expireSellers
 * Authorization: Bearer NUNULIA_SECRET_TOKEN
 *
 * Implements a 3-phase graceful downgrade on subscription expiry:
 *
 *   Phase 1 — J0 (first detection): seller status → "inactive"
 *     Products stay active (still visible). Sets gracePhaseSince + downgradePhase=1.
 *
 *   Phase 2 — J3 (gracePhaseSince + 3d): deactivate all products except top 5
 *     (top 5 by viewCount, kept active; others → inactive without deleteAt).
 *     Sets downgradePhase=2.
 *
 *   Phase 3 — J14 (gracePhaseSince + 14d): schedule all remaining active products
 *     for deletion (status=inactive, deleteAt=now+0d, picked up by deleteProducts cron).
 *     Sets downgradePhase=3.
 *
 * Returns: { success: boolean, message: string, counts: { phase1, phase2, phase3 } }
 *
 * Designed to be called by an external cron scheduler once per day.
 *
 * NOTE: uses sellerDetails.subscriptionExpiresAt (number ms) — single source of
 * truth shared with the frontend, checkSubscriptions cron, and admin console.
 */

import { onRequest } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const THREE_DAYS_MS   = 3  * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 450;

// Top N products kept visible during phase 2 grace period
const GRACE_PHASE2_KEEP = 5;

export const expireSellers = onRequest(
  {
    maxInstances: 1,
    secrets: [NUNULIA_SECRET_TOKEN],
    region: "europe-west1",
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      console.warn("[expireSellers] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      const db  = await getDb();
      const now = Date.now();
      const deleteAt = Timestamp.fromMillis(now);

      let phase1Count = 0;
      let phase2Count = 0;
      let phase3Count = 0;

      // ──────────────────────────────────────────────────────────────────────
      // STEP 1 — New expirations → Phase 1
      // Find active sellers whose subscription has expired.
      // Products are left active (still visible in search during J0-J3).
      // ──────────────────────────────────────────────────────────────────────
      const newExpiredSnap = await db
        .collection("users")
        .where("sellerDetails.subscriptionExpiresAt", "<", now)
        .get();

      for (const sellerDoc of newExpiredSnap.docs) {
        const data = sellerDoc.data();
        if (!data.status || data.status !== "active") continue;

        await sellerDoc.ref.update({
          status: "inactive",
          "sellerDetails.gracePhaseSince": now,
          "sellerDetails.downgradePhase": 1,
        });
        console.log(`[expireSellers] Phase 1 — Seller ${sellerDoc.id} → inactive (gracePhaseSince set)`);
        phase1Count++;
      }

      // ──────────────────────────────────────────────────────────────────────
      // STEP 2 — Phase 1 → 2 (after J3)
      // Keep only top-5 products active (by viewCount desc); deactivate the rest.
      // ──────────────────────────────────────────────────────────────────────
      const phase1Snap = await db
        .collection("users")
        .where("sellerDetails.downgradePhase", "==", 1)
        .get();

      for (const sellerDoc of phase1Snap.docs) {
        const data = sellerDoc.data();
        const gracePhaseSince: number | undefined = data.sellerDetails?.gracePhaseSince;
        if (!gracePhaseSince || now - gracePhaseSince < THREE_DAYS_MS) continue;

        const sellerId = sellerDoc.id;

        const productsSnap = await db
          .collection("products")
          .where("sellerId", "==", sellerId)
          .where("status", "==", "active")
          .get();

        if (!productsSnap.empty) {
          // Sort by viewCount descending in code (avoids composite index requirement)
          const sorted = [...productsSnap.docs].sort((a, b) => {
            const va = (a.data().viewCount as number) ?? 0;
            const vb = (b.data().viewCount as number) ?? 0;
            return vb - va;
          });

          const toDeactivate = sorted.slice(GRACE_PHASE2_KEEP);

          if (toDeactivate.length > 0) {
            let batch = db.batch();
            let ops = 0;

            for (const productDoc of toDeactivate) {
              batch.update(productDoc.ref, { status: "inactive" });
              ops++;
              if (ops >= BATCH_LIMIT) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
              }
            }
            if (ops > 0) await batch.commit();

            console.log(
              `[expireSellers] Phase 2 — Seller ${sellerId}: kept ${Math.min(sorted.length, GRACE_PHASE2_KEEP)} / deactivated ${toDeactivate.length} product(s)`
            );
          }
        }

        await sellerDoc.ref.update({ "sellerDetails.downgradePhase": 2 });
        phase2Count++;
      }

      // ──────────────────────────────────────────────────────────────────────
      // STEP 3 — Phase 2 → 3 (after J14)
      // Schedule all remaining active products for deletion (deleteAt = now).
      // deleteProducts cron will pick them up.
      // ──────────────────────────────────────────────────────────────────────
      const phase2Snap = await db
        .collection("users")
        .where("sellerDetails.downgradePhase", "==", 2)
        .get();

      for (const sellerDoc of phase2Snap.docs) {
        const data = sellerDoc.data();
        const gracePhaseSince: number | undefined = data.sellerDetails?.gracePhaseSince;
        if (!gracePhaseSince || now - gracePhaseSince < FOURTEEN_DAYS_MS) continue;

        const sellerId = sellerDoc.id;

        const productsSnap = await db
          .collection("products")
          .where("sellerId", "==", sellerId)
          .where("status", "==", "active")
          .get();

        if (!productsSnap.empty) {
          let batch = db.batch();
          let ops = 0;

          for (const productDoc of productsSnap.docs) {
            batch.update(productDoc.ref, { status: "inactive", deleteAt });
            ops++;
            if (ops >= BATCH_LIMIT) {
              await batch.commit();
              batch = db.batch();
              ops = 0;
            }
          }
          if (ops > 0) await batch.commit();

          console.log(
            `[expireSellers] Phase 3 — Seller ${sellerId}: ${productsSnap.size} product(s) → inactive + deleteAt set`
          );
        }

        await sellerDoc.ref.update({ "sellerDetails.downgradePhase": 3 });
        phase3Count++;
      }

      res.json({
        success: true,
        message: `Phase 1: ${phase1Count} | Phase 2: ${phase2Count} | Phase 3: ${phase3Count}`,
        counts: { phase1: phase1Count, phase2: phase2Count, phase3: phase3Count },
      });
    } catch (err: any) {
      console.error("[expireSellers] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
    }
  }
);
