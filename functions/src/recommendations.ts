/**
 * NUNULIA — Precomputed Recommendations via Cloud Functions
 *
 * All heavy dependencies (ioredis) are loaded via dynamic import
 * to avoid deployment timeout during cold start analysis.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { REDIS_URL, CACHE_TTL, ALLOWED_ORIGINS } from "./config.js";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60",
};

/**
 * Trending products — scored by views, likes, and recency.
 */
export const getTrending = onRequest(
  {
    secrets: [REDIS_URL],
    maxInstances: 5,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const maxResults = Math.min(Math.abs(parseInt(req.query.limit as string) || 12), 30);

    try {
      const { getRedis, cacheGet } = await import("./redis.js");
      const redis = await getRedis(REDIS_URL.value());
      const products = await cacheGet(
        redis,
        `trending:${maxResults}`,
        CACHE_TTL.TRENDING,
        async () => {
          const db = await getDb();
          const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

          const snap = await db
            .collection("products")
            .where("status", "==", "approved")
            .where("createdAt", ">=", twoWeeksAgo)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

          const now = Date.now();
          const scored = snap.docs.map((d) => {
            const data = d.data();
            const createdAt = data.createdAt?.toMillis?.() || now;
            const hoursOld = (now - createdAt) / (1000 * 60 * 60);
            const recencyBonus = Math.max(0, 100 - hoursOld);
            const score =
              (data.views || 0) * 1 +
              (data.likesCount || 0) * 3 +
              recencyBonus;

            return {
              id: d.id,
              title: data.title,
              slug: data.slug,
              price: data.price,
              originalPrice: data.originalPrice || null,
              discountPrice: data.discountPrice || null,
              images: (data.images || []).slice(0, 2),
              category: data.category,
              subCategory: data.subCategory || "",
              rating: data.rating || 0,
              reviews: data.reviews || 0,
              views: data.views || 0,
              likesCount: data.likesCount || 0,
              marketplace: data.marketplace || null,
              sellerId: data.sellerId,
              sellerName: data.sellerName || "",
              sellerAvatar: data.sellerAvatar || "",
              sellerIsVerified: data.sellerIsVerified || false,
              stockQuantity: data.stockQuantity ?? null,
              promotionEnd: data.promotionEnd?.toMillis?.() || null,
              createdAt,
              score,
            };
          });

          scored.sort((a, b) => b.score - a.score);
          return scored.slice(0, maxResults);
        }
      );

      res.set(CACHE_HEADERS).json({ products, fromCache: true });
    } catch (err: any) {
      logger.error("[getTrending]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * Popular products — sorted by views (all-time).
 */
export const getPopular = onRequest(
  {
    secrets: [REDIS_URL],
    maxInstances: 5,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const maxResults = Math.min(Math.abs(parseInt(req.query.limit as string) || 12), 30);
    const category = (req.query.category as string || "").replace(/[^a-zA-ZÀ-ÿ0-9\s&-]/g, "").substring(0, 100);

    try {
      const { getRedis, cacheGet } = await import("./redis.js");
      const redis = await getRedis(REDIS_URL.value());
      const cacheKey = category
        ? `popular:${category}:${maxResults}`
        : `popular:all:${maxResults}`;

      const products = await cacheGet(
        redis,
        cacheKey,
        CACHE_TTL.POPULAR,
        async () => {
          const db = await getDb();
          let q = db
            .collection("products")
            .where("status", "==", "approved");

          if (category) {
            q = q.where("category", "==", category);
          }

          const snap = await q
            .orderBy("views", "desc")
            .limit(maxResults)
            .get();

          return snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title,
              slug: data.slug,
              price: data.price,
              originalPrice: data.originalPrice || null,
              discountPrice: data.discountPrice || null,
              images: (data.images || []).slice(0, 2),
              category: data.category,
              rating: data.rating || 0,
              reviews: data.reviews || 0,
              views: data.views || 0,
              likesCount: data.likesCount || 0,
              marketplace: data.marketplace || null,
              sellerId: data.sellerId,
              sellerName: data.sellerName || "",
              sellerAvatar: data.sellerAvatar || "",
              sellerIsVerified: data.sellerIsVerified || false,
              stockQuantity: data.stockQuantity ?? null,
              createdAt: data.createdAt?.toMillis?.() || Date.now(),
            };
          });
        }
      );

      res.set(CACHE_HEADERS).json({ products });
    } catch (err: any) {
      logger.error("[getPopular]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * Personalized recommendations based on user activity.
 */
export const getRecommendations = onRequest(
  {
    secrets: [REDIS_URL],
    maxInstances: 5,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const userId = (req.query.userId as string || "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 128);
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    const maxResults = Math.min(Math.abs(parseInt(req.query.limit as string) || 12), 30);
    const excludeIds = ((req.query.exclude as string) || "")
      .split(",")
      .filter(Boolean)
      .map(id => id.replace(/[^a-zA-Z0-9]/g, "").substring(0, 128))
      .slice(0, 50);

    try {
      const { getRedis, cacheGet } = await import("./redis.js");
      const redis = await getRedis(REDIS_URL.value());
      const products = await cacheGet(
        redis,
        `recommendations:user:${userId}:${maxResults}`,
        CACHE_TTL.RECOMMENDATIONS,
        async () => {
          const db = await getDb();

          const activitySnap = await db
            .collection("userActivity")
            .where("userId", "==", userId)
            .where("action", "==", "view")
            .orderBy("createdAt", "desc")
            .limit(30)
            .get();

          if (activitySnap.empty) return [];

          const categoryWeights: Record<string, number> = {};
          activitySnap.docs.forEach((d) => {
            const cat = d.data().category;
            categoryWeights[cat] = (categoryWeights[cat] || 0) + 1;
          });

          const topCategories = Object.entries(categoryWeights)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat]) => cat);

          const excludeSet = new Set(excludeIds);
          const results: any[] = [];

          for (const cat of topCategories) {
            if (results.length >= maxResults) break;

            const snap = await db
              .collection("products")
              .where("status", "==", "approved")
              .where("category", "==", cat)
              .orderBy("views", "desc")
              .limit(8)
              .get();

            snap.docs.forEach((d) => {
              if (
                results.length < maxResults &&
                !excludeSet.has(d.id) &&
                !results.some((r) => r.id === d.id)
              ) {
                const data = d.data();
                results.push({
                  id: d.id,
                  title: data.title,
                  slug: data.slug,
                  price: data.price,
                  images: (data.images || []).slice(0, 2),
                  category: data.category,
                  rating: data.rating || 0,
                  views: data.views || 0,
                  likesCount: data.likesCount || 0,
                  sellerId: data.sellerId,
                  sellerName: data.sellerName || "",
                  sellerAvatar: data.sellerAvatar || "",
                  sellerIsVerified: data.sellerIsVerified || false,
                  createdAt: data.createdAt?.toMillis?.() || Date.now(),
                });
              }
            });
          }

          return results;
        }
      );

      res.set(CACHE_HEADERS).json({ products });
    } catch (err: any) {
      logger.error("[getRecommendations]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * "Customers also viewed" — collaborative filtering.
 */
export const getAlsoViewed = onRequest(
  {
    secrets: [REDIS_URL],
    maxInstances: 5,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const productId = (req.query.productId as string || "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 128);
    if (!productId) {
      res.status(400).json({ error: "productId required" });
      return;
    }

    const maxResults = Math.min(Math.abs(parseInt(req.query.limit as string) || 8), 20);

    try {
      const { getRedis, cacheGet } = await import("./redis.js");
      const redis = await getRedis(REDIS_URL.value());
      const products = await cacheGet(
        redis,
        `also-viewed:${productId}:${maxResults}`,
        CACHE_TTL.RECOMMENDATIONS,
        async () => {
          const db = await getDb();

          const viewersSnap = await db
            .collection("userActivity")
            .where("productId", "==", productId)
            .where("action", "==", "view")
            .orderBy("createdAt", "desc")
            .limit(15)
            .get();

          const viewerIds = [
            ...new Set(viewersSnap.docs.map((d) => d.data().userId)),
          ];
          if (viewerIds.length === 0) return [];

          const batchIds = viewerIds.slice(0, 30);
          const otherSnap = await db
            .collection("userActivity")
            .where("userId", "in", batchIds)
            .where("action", "==", "view")
            .orderBy("createdAt", "desc")
            .limit(60)
            .get();

          const counts: Record<string, number> = {};
          otherSnap.docs.forEach((d) => {
            const pid = d.data().productId;
            if (pid !== productId) {
              counts[pid] = (counts[pid] || 0) + 1;
            }
          });

          const topIds = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxResults)
            .map(([id]) => id);

          if (topIds.length === 0) return [];

          const results: any[] = [];
          for (let i = 0; i < topIds.length; i += 30) {
            const batch = topIds.slice(i, i + 30);
            const snap = await db
              .collection("products")
              .where("status", "==", "approved")
              .where("__name__", "in", batch)
              .get();

            snap.docs.forEach((d) => {
              const data = d.data();
              results.push({
                id: d.id,
                title: data.title,
                slug: data.slug,
                price: data.price,
                images: (data.images || []).slice(0, 2),
                category: data.category,
                rating: data.rating || 0,
                views: data.views || 0,
                likesCount: data.likesCount || 0,
                sellerId: data.sellerId,
                sellerName: data.sellerName || "",
                sellerIsVerified: data.sellerIsVerified || false,
                createdAt: data.createdAt?.toMillis?.() || Date.now(),
              });
            });
          }

          const resultMap = new Map(results.map((r) => [r.id, r]));
          return topIds
            .map((id) => resultMap.get(id))
            .filter(Boolean);
        }
      );

      res.set(CACHE_HEADERS).json({ products });
    } catch (err: any) {
      logger.error("[getAlsoViewed]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
