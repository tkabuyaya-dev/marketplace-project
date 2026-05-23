/**
 * NUNULIA — Backfill `sellerShopName` on existing products (one-shot).
 *
 * Contexte
 * --------
 * Avant ce fix, `addProduct` ne dénormalisait pas `sellerDetails.shopName`
 * dans le document produit. Conséquence : les cartes produits affichaient
 * le nom personnel du vendeur (seller.name) au lieu du nom de la boutique,
 * même quand le vendeur avait bien rempli son shopName.
 *
 * Ce backfill parcourt tous les produits, lit le user document du vendeur,
 * et inscrit `sellerShopName` sur le produit (null si pas de shopName).
 *
 * Sécurité
 * --------
 * - Endpoint HTTP protégé par Bearer token (NUNULIA_SECRET_TOKEN).
 * - Idempotent : skip les produits qui ont déjà `sellerShopName` défini
 *   (y compris explicitement null après un premier passage).
 * - Uniquement POST, max 540s, maxInstances=1.
 * - Cache les lookups user pour éviter de retaper les mêmes vendeurs.
 *
 * Usage
 * -----
 *   curl -X POST -H "Authorization: Bearer $NUNULIA_SECRET_TOKEN" \
 *        https://europe-west1-<project>.cloudfunctions.net/backfillSellerShopName
 *
 * À exécuter une seule fois après le déploiement du fix dénormalisation.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const PAGE_SIZE = 400;

export const backfillSellerShopName = onRequest(
  {
    region:         "europe-west1",
    secrets:        [NUNULIA_SECRET_TOKEN],
    maxInstances:   1,
    timeoutSeconds: 540,
    memory:         "512MiB",
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      logger.warn("[backfillSellerShopName] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "POST required" });
      return;
    }

    const startedAt = Date.now();
    const db = await getDb();

    let totalScanned = 0;
    let updatedWithShopName = 0;
    let updatedAsNull = 0;
    let skipped = 0;
    let errors = 0;
    const errorSample: Array<{ id: string; message: string }> = [];

    // Cache: sellerId → shopName (or null). Avoids re-reading the same user.
    const shopNameCache = new Map<string, string | null>();

    const getShopName = async (sellerId: string): Promise<string | null> => {
      if (shopNameCache.has(sellerId)) return shopNameCache.get(sellerId)!;
      const userSnap = await db.collection("users").doc(sellerId).get();
      const shopName = userSnap.exists
        ? (userSnap.data()?.sellerDetails?.shopName || null)
        : null;
      shopNameCache.set(sellerId, shopName);
      return shopName;
    };

    try {
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q: FirebaseFirestore.Query = db.collection("products")
          .orderBy("__name__")
          .limit(PAGE_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc);

        const snap = await q.get();
        if (snap.empty) break;

        const batch = db.batch();
        let writesInBatch = 0;

        for (const doc of snap.docs) {
          totalScanned++;
          const data = doc.data();

          // Idempotent: skip if already backfilled (string or explicit null).
          if (Object.prototype.hasOwnProperty.call(data, "sellerShopName")) {
            skipped++;
            continue;
          }

          const sellerId: string | undefined = data.sellerId;
          if (!sellerId) {
            // No seller — set to null to mark as processed.
            batch.update(doc.ref, { sellerShopName: null });
            updatedAsNull++;
            writesInBatch++;
            continue;
          }

          try {
            const shopName = await getShopName(sellerId);
            batch.update(doc.ref, { sellerShopName: shopName });
            if (shopName) updatedWithShopName++;
            else updatedAsNull++;
            writesInBatch++;
          } catch (err: any) {
            errors++;
            errorSample.push({ id: doc.id, message: err?.message || "unknown" });
          }
        }

        if (writesInBatch > 0) {
          await batch.commit();
          logger.info(
            `[backfillSellerShopName] batch commit writes=${writesInBatch} scanned=${totalScanned}`
          );
        }

        lastDoc = snap.docs[snap.docs.length - 1] ?? null;
        if (snap.size < PAGE_SIZE) break;
      }

      const elapsedMs = Date.now() - startedAt;
      logger.info(
        `[backfillSellerShopName] DONE scanned=${totalScanned} withShopName=${updatedWithShopName} null=${updatedAsNull} skipped=${skipped} errors=${errors} elapsed=${elapsedMs}ms`
      );

      res.json({
        success:              errors === 0,
        totalScanned,
        updatedWithShopName,
        updatedAsNull,
        skipped,
        errors,
        errorSample:          errorSample.slice(0, 20),
        elapsedMs,
        uniqueSellersTouched: shopNameCache.size,
      });
    } catch (err: any) {
      logger.error("[backfillSellerShopName] Fatal:", err?.message, err?.stack);
      res.status(500).json({
        success:     false,
        message:     err?.message || "internal error",
        totalScanned,
        updatedWithShopName,
        updatedAsNull,
        errors,
      });
    }
  }
);
