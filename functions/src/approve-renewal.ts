/**
 * NUNULIA — Approve Seller Renewal (HTTP Cloud Function)
 *
 * POST /approveRenewal
 * Authorization: Bearer <Firebase ID Token> (admin role required)
 * Body (JSON): { vendorId: string }
 *
 * - Sets seller: status → "active", subscriptionExpiry → now + 30 days
 * - Sets all their inactive products: status → "active", removes deleteAt
 *
 * Returns: { success: boolean, message: string, count: number }
 *
 * Called by the admin dashboard when an admin approves a manual payment.
 * Auth: Firebase ID token (verified server-side, admin role checked in Firestore)
 */

import { onRequest } from "firebase-functions/v2/https";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getDb, getAuth } from "./admin.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 450;

export const approveRenewal = onRequest(
  {
    maxInstances: 5,
    region: "europe-west1",
  },
  async (req, res) => {
    // ── Auth check: verify Firebase ID token + admin role ──
    const authHeader = req.headers["authorization"] ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      res.status(401).json({ success: false, message: "Missing authorization token", count: 0 });
      return;
    }
    try {
      const adminAuth = await getAuth();
      const decoded = await adminAuth.verifyIdToken(idToken);
      const db = await getDb();
      const callerSnap = await db.collection("users").doc(decoded.uid).get();
      if (!callerSnap.exists || callerSnap.data()?.role !== "admin") {
        console.warn("[approveRenewal] Caller is not admin:", decoded.uid);
        res.status(403).json({ success: false, message: "Forbidden: admin role required", count: 0 });
        return;
      }
    } catch (authErr: any) {
      console.warn("[approveRenewal] Token verification failed:", authErr?.message);
      res.status(401).json({ success: false, message: "Invalid or expired token", count: 0 });
      return;
    }

    // ── Method check ──
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method Not Allowed", count: 0 });
      return;
    }

    // ── Parse body ──
    const vendorId: string | undefined = req.body?.vendorId;
    if (!vendorId || typeof vendorId !== "string") {
      res.status(400).json({
        success: false,
        message: "Missing or invalid vendorId in request body.",
        count: 0,
      });
      return;
    }

    try {
    const db = await getDb();  // already initialized above, returns cached instance

    // ── Verify seller exists ──
    const sellerRef = db.collection("users").doc(vendorId);
    const sellerSnap = await sellerRef.get();

    if (!sellerSnap.exists) {
      res.status(404).json({
        success: false,
        message: `Seller ${vendorId} not found.`,
        count: 0,
      });
      return;
    }

    const subscriptionExpiry = Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS);

    // ── Reactivate seller ──
    await sellerRef.update({
      status: "active",
      subscriptionExpiry,
    });
    console.log(
      `[approveRenewal] Seller ${vendorId} → active, subscriptionExpiry: ${subscriptionExpiry.toDate().toISOString()}`
    );

    // ── Reactivate their inactive products (remove deleteAt) ──
    const productsSnap = await db
      .collection("products")
      .where("sellerId", "==", vendorId)
      .where("status", "==", "inactive")
      .get();

    let productCount = 0;

    if (!productsSnap.empty) {
      let batch = db.batch();
      let batchOps = 0;

      for (const productDoc of productsSnap.docs) {
        batch.update(productDoc.ref, {
          status: "active",
          deleteAt: FieldValue.delete(),
        });
        batchOps++;
        productCount++;

        if (batchOps >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          batchOps = 0;
        }
      }

      if (batchOps > 0) await batch.commit();

      console.log(
        `[approveRenewal] ${productCount} product(s) of seller ${vendorId} → active, deleteAt removed`
      );
    } else {
      console.log(`[approveRenewal] Seller ${vendorId}: no inactive products to reactivate.`);
    }

    res.json({
      success: true,
      message: `Seller ${vendorId} renewed. ${productCount} product(s) reactivated.`,
      count: productCount,
    });
    } catch (err: any) {
      console.error("[approveRenewal] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error", count: 0 });
    }
  }
);
