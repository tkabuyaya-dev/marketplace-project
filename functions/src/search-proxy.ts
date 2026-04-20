/**
 * NUNULIA — Search Proxy with Redis Caching
 *
 * Sits between the frontend and Algolia to cache search results.
 * Identical queries within the TTL window are served from Redis.
 *
 * Architecture layer: User → Local suggestions → Browser cache → [THIS] → Algolia
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import {
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_KEY,
  REDIS_URL,
  ALGOLIA_PRODUCTS_INDEX,
  ALGOLIA_SELLERS_INDEX,
  CACHE_TTL,
  ALLOWED_ORIGINS,
} from "./config.js";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=30",
};

/**
 * Cached product search — proxies to Algolia with Redis caching.
 *
 * Query params:
 *   q        — search query (required, min 2 chars)
 *   limit    — max results (default 20, max 30)
 *   category — category filter
 *   minPrice — min price filter
 *   maxPrice — max price filter
 *   sort     — relevance|price_asc|price_desc|newest
 */
export const cachedSearch = onRequest(
  {
    region: "europe-west1",
    secrets: [ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, REDIS_URL],
    maxInstances: 20,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const query = ((req.query.q as string) || "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Query must be at least 2 characters" });
      return;
    }

    // Fire-and-forget monthly search counter
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    getDb()
      .then(db => db.collection("_stats").doc(`searches_${month}`)
        .set({ count: FieldValue.increment(1) }, { merge: true }))
      .catch(() => {}); // never block the search response

    // Sanitize params
    const limit = Math.min(Math.abs(parseInt(req.query.limit as string) || 20), 30);
    const category = ((req.query.category as string) || "")
      .replace(/[^a-zA-ZÀ-ÿ0-9\s&-]/g, "")
      .substring(0, 100);
    const minPrice = parseFloat(req.query.minPrice as string) || undefined;
    const maxPrice = parseFloat(req.query.maxPrice as string) || undefined;
    const sort = (req.query.sort as string) || "relevance";

    // Build cache key from normalized params
    const cacheKey = buildCacheKey(query, { limit, category, minPrice, maxPrice, sort });

    try {
      const { getRedis, cacheGet } = await import("./redis.js");
      const redis = await getRedis(REDIS_URL.value());

      const result = await cacheGet(
        redis,
        cacheKey,
        CACHE_TTL.SEARCH_RESULTS,
        async () => {
          return await searchAlgolia(query, { limit, category, minPrice, maxPrice, sort });
        }
      );

      res.set(CACHE_HEADERS).json({
        products: result.products,
        sellers: result.sellers,
        meta: {
          query,
          totalProducts: result.products.length,
          totalSellers: result.sellers.length,
          cached: true,
        },
      });
    } catch (err: any) {
      logger.error("[cachedSearch] Redis/cache error, falling back to direct Algolia:", err.message);

      // Fallback: direct Algolia without cache
      try {
        const result = await searchAlgolia(query, { limit, category, minPrice, maxPrice, sort });
        res.set(CACHE_HEADERS).json({
          products: result.products,
          sellers: result.sellers,
          meta: { query, totalProducts: result.products.length, totalSellers: result.sellers.length, cached: false },
        });
      } catch (algoliaErr: any) {
        logger.error("[cachedSearch] Algolia also failed:", algoliaErr.message);
        res.status(500).json({ error: "Search unavailable" });
      }
    }
  }
);

interface SearchParams {
  limit: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: string;
}

interface SearchResult {
  products: any[];
  sellers: any[];
}

function buildCacheKey(query: string, params: SearchParams): string {
  const parts = [`search:${query.toLowerCase()}`];
  if (params.category) parts.push(`cat:${params.category}`);
  if (params.minPrice !== undefined) parts.push(`min:${params.minPrice}`);
  if (params.maxPrice !== undefined) parts.push(`max:${params.maxPrice}`);
  if (params.sort !== "relevance") parts.push(`sort:${params.sort}`);
  parts.push(`lim:${params.limit}`);
  return parts.join("|");
}

async function searchAlgolia(query: string, params: SearchParams): Promise<SearchResult> {
  const appId = ALGOLIA_APP_ID.value();
  const apiKey = ALGOLIA_ADMIN_KEY.value();
  const baseUrl = `https://${appId}-dsn.algolia.net`;

  // Build Algolia request body
  const numericFilters: string[] = [];
  if (params.minPrice !== undefined) numericFilters.push(`price >= ${params.minPrice}`);
  if (params.maxPrice !== undefined) numericFilters.push(`price <= ${params.maxPrice}`);

  const facetFilters: string[][] = [];
  if (params.category) facetFilters.push([`category:${params.category}`]);

  const productBody: Record<string, any> = {
    query,
    hitsPerPage: params.limit,
    filters: "status:approved",
  };
  if (numericFilters.length > 0) productBody.numericFilters = numericFilters;
  if (facetFilters.length > 0) productBody.facetFilters = facetFilters;

  const sellerBody = {
    query,
    hitsPerPage: 5,
    filters: "role:seller",
  };

  const headers = {
    "X-Algolia-Application-Id": appId,
    "X-Algolia-API-Key": apiKey,
    "Content-Type": "application/json",
  };

  // Parallel search: products + sellers
  const [productRes, sellerRes] = await Promise.all([
    fetch(`${baseUrl}/1/indexes/${ALGOLIA_PRODUCTS_INDEX}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(productBody),
    }),
    fetch(`${baseUrl}/1/indexes/${ALGOLIA_SELLERS_INDEX}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(sellerBody),
    }),
  ]);

  const [productData, sellerData] = await Promise.all([
    productRes.ok ? productRes.json() : { hits: [] },
    sellerRes.ok ? sellerRes.json() : { hits: [] },
  ]);

  let products = (productData.hits || []).map((hit: any) => ({
    id: hit.objectID,
    title: hit.title,
    slug: hit.slug,
    price: hit.price,
    originalPrice: hit.originalPrice || null,
    discountPrice: hit.discountPrice || null,
    images: (hit.images || []).slice(0, 2),
    category: hit.category,
    subCategory: hit.subCategory || "",
    tags: hit.tags || [],
    rating: hit.rating || 0,
    reviews: hit.reviews || 0,
    views: hit.views || 0,
    likesCount: hit.likesCount || 0,
    marketplace: hit.marketplace || null,
    sellerId: hit.sellerId,
    sellerName: hit.sellerName || "",
    sellerIsVerified: hit.sellerIsVerified || false,
    stockQuantity: hit.stockQuantity ?? null,
    createdAt: hit.createdAt || Date.now(),
  }));

  // Server-side sorting
  if (params.sort === "price_asc") {
    products.sort((a: any, b: any) => a.price - b.price);
  } else if (params.sort === "price_desc") {
    products.sort((a: any, b: any) => b.price - a.price);
  } else if (params.sort === "newest") {
    products.sort((a: any, b: any) => b.createdAt - a.createdAt);
  }

  const sellers = (sellerData.hits || []).map((hit: any) => ({
    id: hit.objectID,
    name: hit.name || hit.shopName || "",
    slug: hit.slug,
    avatar: hit.avatar || "",
    isVerified: hit.isVerified || false,
    verificationTier: hit.verificationTier || (hit.isVerified ? "identity" : "none"),
    trustScore: typeof hit.trustScore === "number" ? hit.trustScore : 0,
    productCount: hit.productCount || 0,
    marketplace: hit.marketplace || null,
  }));

  return { products, sellers };
}
