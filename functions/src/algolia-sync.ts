/**
 * NUNULIA — Algolia Sync Triggers
 *
 * Automatically syncs Firestore products and sellers to Algolia indexes.
 * Uses dynamic imports to avoid deployment timeout.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_KEY,
  ALGOLIA_PRODUCTS_INDEX,
  ALGOLIA_SELLERS_INDEX,
  REDIS_URL,
} from "./config.js";

// Country ID → display name mapping (avoid extra Firestore read)
const COUNTRY_NAMES: Record<string, string> = {
  bi: "Burundi", cd: "RDC", rw: "Rwanda",
  ug: "Ouganda", tz: "Tanzanie", ke: "Kenya",
};
const COUNTRY_CODES: Record<string, string> = {
  bi: "BI", cd: "CD", rw: "RW", ug: "UG", tz: "TZ", ke: "KE",
};

function productToAlgoliaRecord(id: string, data: any, sellerDetails?: any) {
  const createdAt = data.createdAt?._seconds
    ? data.createdAt._seconds * 1000
    : data.createdAt?.toMillis?.() || Date.now();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const countryId = data.countryId || "";

  return {
    objectID: id,
    title: data.title || "",
    titleLower: data.titleLower || "",
    description: (data.description || "").substring(0, 500),
    price: data.price || 0,
    originalPrice: data.originalPrice || null,
    discountPrice: data.discountPrice || null,
    currency: data.currency || "",
    category: data.category || "",
    subCategory: data.subCategory || "",
    tags: data.tags || [],
    marketplace: data.marketplace || null,
    sellerId: data.sellerId || "",
    sellerName: data.sellerName || "",
    sellerIsVerified: data.sellerIsVerified || false,
    images: (data.images || []).slice(0, 3),
    rating: data.rating || 0,
    reviews: data.reviews || 0,
    views: data.views || 0,
    likesCount: data.likesCount || 0,
    stockQuantity: data.stockQuantity ?? null,
    slug: data.slug || "",
    status: data.status || "pending",
    createdAt,
    // ── Country & novelty fields for faceted search ──
    countryId,
    country: COUNTRY_NAMES[countryId] || "",
    countryCode: COUNTRY_CODES[countryId] || "",
    isNew: createdAt > thirtyDaysAgo,
    isSponsored: data.isSponsored || false,
    sales: data.sales || 0,
    // ── Location fields from seller (province/commune for filtering) ──
    sellerProvince: sellerDetails?.province || data.sellerProvince || "",
    sellerCommune: sellerDetails?.commune || data.sellerCommune || "",
    _geoloc: data.sellerGps
      ? { lat: data.sellerGps.lat, lng: data.sellerGps.lng }
      : undefined,
  };
}

function sellerToAlgoliaRecord(id: string, data: any) {
  return {
    objectID: id,
    name: data.name || "",
    nameLower: data.nameLower || "",
    avatar: data.avatar || "",
    slug: data.slug || "",
    isVerified: data.isVerified || false,
    role: data.role || "buyer",
    shopName: data.sellerDetails?.shopName || data.name || "",
    marketplace: data.sellerDetails?.marketplace || null,
    categories: data.sellerDetails?.categories || [],
    productCount: data.productCount || 0,
    bio: data.bio || "",
  };
}

export const onProductWrite = onDocumentWritten(
  {
    document: "products/{productId}",
    region: "europe-west1",
    secrets: [ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, REDIS_URL],
  },
  async (event) => {
    const { algoliasearch } = await import("algoliasearch");
    const { getRedis, cacheInvalidate } = await import("./redis.js");

    const productId = event.params.productId;
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();

    try {
      const client = algoliasearch(
        ALGOLIA_APP_ID.value(),
        ALGOLIA_ADMIN_KEY.value()
      );

      if (!afterData || afterData.status !== "approved") {
        try {
          await client.deleteObject({
            indexName: ALGOLIA_PRODUCTS_INDEX,
            objectID: productId,
          });
          logger.info(`[Algolia] Removed product ${productId}`);
        } catch (err: any) {
          if (err.status !== 404) throw err;
        }
      } else {
        // Lookup seller to get province/commune for location filtering
        let sellerDetails: any = undefined;
        if (afterData.sellerId) {
          try {
            const { getDb, ensureInitialized } = await import("./admin.js");
            await ensureInitialized();
            const db = await getDb();
            const sellerDoc = await db.collection("users").doc(afterData.sellerId).get();
            sellerDetails = sellerDoc.exists ? sellerDoc.data()?.sellerDetails : undefined;
          } catch (err: any) {
            logger.warn(`[Algolia] Could not fetch seller ${afterData.sellerId}:`, err.message);
          }
        }
        const record = productToAlgoliaRecord(productId, afterData, sellerDetails);
        await client.saveObject({
          indexName: ALGOLIA_PRODUCTS_INDEX,
          body: record,
        });
        logger.info(`[Algolia] Synced product ${productId}: "${afterData.title}"`);
      }

      // Invalidate Redis caches
      try {
        const redis = await getRedis(REDIS_URL.value());
        await cacheInvalidate(redis, "trending:*");
        await cacheInvalidate(redis, "popular:*");
        const category = afterData?.category || beforeData?.category;
        if (category) {
          await cacheInvalidate(redis, `recommendations:category:${category}:*`);
        }
      } catch (err: any) {
        logger.warn("[Redis] Cache invalidation skipped:", err.message);
      }
    } catch (err: any) {
      logger.error(`[Algolia] Failed to sync product ${productId}:`, err.message);
      throw err;
    }
  }
);

export const onSellerWrite = onDocumentWritten(
  {
    document: "users/{userId}",
    region: "europe-west1",
    secrets: [ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY],
  },
  async (event) => {
    const { algoliasearch } = await import("algoliasearch");

    const userId = event.params.userId;
    const afterData = event.data?.after?.data();

    try {
      const client = algoliasearch(
        ALGOLIA_APP_ID.value(),
        ALGOLIA_ADMIN_KEY.value()
      );

      if (!afterData || afterData.role !== "seller") {
        try {
          await client.deleteObject({
            indexName: ALGOLIA_SELLERS_INDEX,
            objectID: userId,
          });
          logger.info(`[Algolia] Removed seller ${userId}`);
        } catch (err: any) {
          if (err.status !== 404) throw err;
        }
      } else {
        const record = sellerToAlgoliaRecord(userId, afterData);
        await client.saveObject({
          indexName: ALGOLIA_SELLERS_INDEX,
          body: record,
        });
        logger.info(`[Algolia] Synced seller ${userId}: "${afterData.name}"`);
      }
    } catch (err: any) {
      logger.error(`[Algolia] Failed to sync seller ${userId}:`, err.message);
      throw err;
    }
  }
);
