/**
 * NUNULIA — Seller Suspension Background Function
 *
 * Trigger: Firestore onDocumentWritten on users/{userId}
 *
 * When `isSuspended` changes on a seller's user document, this function
 * propagates the flag to all their products as `sellerSuspended`.
 *
 * Why a background function?
 * - Sellers can have thousands of products. Running this client-side risks
 *   browser timeout, memory overflow, and excessive Firestore billing per client.
 * - The Firestore trigger runs server-side, batches in groups of 450 writes,
 *   and handles any catalog size within the 540-second function timeout.
 *
 * Safety guards:
 * - Only fires when `isSuspended` actually changed (before !== after).
 * - Only for documents that have `role === "seller"`.
 * - Skips if no products are found (no-op).
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getDb } from "./admin.js";

const BATCH_LIMIT = 450; // Keep well below Firestore's 500-op batch limit

export const onSellerStatusChange = onDocumentWritten(
  {
    document:     "users/{userId}",
    region:       "europe-west1",
    maxInstances: 10,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    // Guard: document deleted, not a seller, or isSuspended unchanged
    if (!after) return;
    if (after.role !== "seller") return;
    if (before?.isSuspended === after.isSuspended) return;

    const userId     = event.params.userId;
    const isSuspended = after.isSuspended === true;

    console.log(
      `[onSellerStatusChange] seller=${userId} isSuspended=${isSuspended} — propagating to products`
    );

    const db = await getDb();

    // Stream products in batches to avoid loading everything into memory
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let totalUpdated = 0;

    while (true) {
      let q: FirebaseFirestore.Query = db
        .collection("products")
        .where("sellerId", "==", userId)
        .limit(BATCH_LIMIT);

      if (lastDoc) q = q.startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, { sellerSuspended: isSuspended }));
      await batch.commit();

      totalUpdated += snap.size;
      lastDoc = snap.docs[snap.docs.length - 1];

      console.log(
        `[onSellerStatusChange] seller=${userId}: updated batch of ${snap.size} products (total: ${totalUpdated})`
      );

      if (snap.size < BATCH_LIMIT) break;
    }

    console.log(
      `[onSellerStatusChange] Done. seller=${userId} → ${totalUpdated} product(s) updated.`
    );
  }
);
