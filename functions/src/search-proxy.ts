/**
 * NUNULIA — Search Proxy with Redis Caching
 *
 * Sits between ALL frontend search calls and Algolia.
 * A cache HIT costs 0 Algolia operations. A MISS costs 2 (products + sellers),
 * then the result is shared across every user for 20 minutes.
 *
 * Architecture:
 *   Browser L1/L2/L3 cache → [THIS → Redis → Algolia] → response
 *
 * Query params (q is required, all others optional):
 *   q           — search query (min 2 chars)
 *   limit       — results per page  (default 20, max 30)
 *   page        — 0-based page index (default 0)
 *   category    — hard facet filter on category
 *   countryId   — hard facet filter on countryId (bi, cd, rw, ug, tz, ke)
 *   province    — hard facet filter on sellerProvince
 *   isNew       — "true" → filter products created in last 30 days
 *   minPrice    — numeric lower bound on price
 *   maxPrice    — numeric upper bound on price
 *   sort        — relevance | price_asc | price_desc | newest
 *   userCountry — soft boost (optionalFilters) when no hard countryId filter
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

// 60-second browser/CDN cache on top of the 20-minute Redis TTL.
const CACHE_HEADERS = { "Cache-Control": "public, max-age=60" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchParams {
  limit: number;
  page: number;
  category: string;
  countryId: string;
  province: string;
  userCountry: string;
  isNew: boolean;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sort: string;
}

interface AlgoliaHit {
  objectID: string;
  title?: string;
  slug?: string;
  price?: number;
  originalPrice?: number | null;
  discountPrice?: number | null;
  currency?: string;
  images?: string[];
  category?: string;
  subCategory?: string;
  tags?: string[];
  rating?: number;
  reviews?: number;
  views?: number;
  likesCount?: number;
  marketplace?: string | null;
  sellerId?: string;
  sellerName?: string;
  sellerIsVerified?: boolean;
  stockQuantity?: number | null;
  createdAt?: number;
  countryId?: string | null;
  isSponsored?: boolean;
  _highlightResult?: Record<string, { value: string; matchLevel: string }>;
}

interface SearchResult {
  products: ReturnType<typeof mapProduct>[];
  sellers: ReturnType<typeof mapSeller>[];
  totalHits: number;
  totalPages: number;
  page: number;
  queryID: string | undefined;
  // highlights: { [productId]: { field: "<mark>match</mark>" } }
  highlights: Record<string, Record<string, string>>;
}

// ─── Cache Key ────────────────────────────────────────────────────────────────
// Every distinct combination of (query + filters + page + limit) gets its own
// Redis entry. userCountry is included only when there is no hard countryId
// filter, because the two are mutually exclusive in the Algolia query.

function buildCacheKey(query: string, p: SearchParams): string {
  const parts = [`search:${query.toLowerCase()}`];
  if (p.category)   parts.push(`cat:${p.category}`);
  if (p.countryId)  parts.push(`co:${p.countryId}`);
  else if (p.userCountry) parts.push(`uco:${p.userCountry}`);
  if (p.province)   parts.push(`prov:${p.province}`);
  if (p.isNew)      parts.push("new:1");
  if (p.minPrice !== undefined) parts.push(`min:${p.minPrice}`);
  if (p.maxPrice !== undefined) parts.push(`max:${p.maxPrice}`);
  if (p.sort !== "relevance")   parts.push(`sort:${p.sort}`);
  if (p.page > 0)   parts.push(`pg:${p.page}`);
  parts.push(`lim:${p.limit}`);
  return parts.join("|");
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

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

    // Fire-and-forget: increment monthly search counter in Firestore
    const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    getDb()
      .then(db =>
        db.collection("_stats")
          .doc(`searches_${month}`)
          .set({ count: FieldValue.increment(1) }, { merge: true })
      )
      .catch(() => {});

    // ── Parse and sanitize all params ──────────────────────────────────────
    const limit = Math.min(Math.abs(parseInt(req.query.limit as string) || 20), 30);
    const page  = Math.max(0, parseInt(req.query.page as string) || 0);

    // Whitelist-sanitize string params to prevent cache-key poisoning
    const category    = ((req.query.category    as string) || "").replace(/[^a-zA-ZÀ-ÿ0-9\s&/-]/g, "").substring(0, 100);
    const countryId   = ((req.query.countryId   as string) || "").replace(/[^a-z]/g, "").substring(0, 10);
    const province    = ((req.query.province    as string) || "").replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, "").substring(0, 100);
    const userCountry = ((req.query.userCountry as string) || "").replace(/[^a-z]/g, "").substring(0, 10);
    const isNew       = req.query.isNew === "true";
    const minPrice    = isNaN(parseFloat(req.query.minPrice as string)) ? undefined : parseFloat(req.query.minPrice as string);
    const maxPrice    = isNaN(parseFloat(req.query.maxPrice as string)) ? undefined : parseFloat(req.query.maxPrice as string);
    const sort        = ["relevance", "price_asc", "price_desc", "newest"].includes(req.query.sort as string)
      ? (req.query.sort as string)
      : "relevance";

    const params: SearchParams = {
      limit, page, category, countryId, province, userCountry,
      isNew, minPrice, maxPrice, sort,
    };

    const cacheKey = buildCacheKey(query, params);

    // ── Try Redis → fallback to direct Algolia ──────────────────────────────
    try {
      const { getRedis, cacheGet } = await import("./redis.js");
      const redis = await getRedis(REDIS_URL.value());

      const result = await cacheGet<SearchResult>(
        redis,
        cacheKey,
        CACHE_TTL.SEARCH_RESULTS,
        () => searchAlgolia(query, params),
      );

      res.set(CACHE_HEADERS).json({
        products: result.products,
        sellers:  result.sellers,
        meta: {
          query,
          totalHits:  result.totalHits,
          totalPages: result.totalPages,
          page:       result.page,
          queryID:    result.queryID,
          highlights: result.highlights,
          cached: true,
        },
      });
    } catch (err: any) {
      logger.error("[cachedSearch] Redis error, calling Algolia directly:", err.message);

      try {
        const result = await searchAlgolia(query, params);
        res.set(CACHE_HEADERS).json({
          products: result.products,
          sellers:  result.sellers,
          meta: {
            query,
            totalHits:  result.totalHits,
            totalPages: result.totalPages,
            page:       result.page,
            queryID:    result.queryID,
            highlights: result.highlights,
            cached: false,
          },
        });
      } catch (algoliaErr: any) {
        logger.error("[cachedSearch] Algolia also failed:", algoliaErr.message);
        res.status(500).json({ error: "Search unavailable" });
      }
    }
  }
);

// ─── Algolia call ─────────────────────────────────────────────────────────────

async function searchAlgolia(query: string, params: SearchParams): Promise<SearchResult> {
  const appId   = ALGOLIA_APP_ID.value();
  const apiKey  = ALGOLIA_ADMIN_KEY.value();
  const baseUrl = `https://${appId}-dsn.algolia.net`;

  // ── Build product query ──────────────────────────────────────────────────
  const numericFilters: string[] = [];
  if (params.minPrice !== undefined) numericFilters.push(`price >= ${params.minPrice}`);
  if (params.maxPrice !== undefined) numericFilters.push(`price <= ${params.maxPrice}`);

  // facetFilters = AND of arrays; each inner array = OR
  // [[a], [b], [c]] → a AND b AND c
  const facetFilters: string[][] = [["status:approved"]];
  if (params.category)  facetFilters.push([`category:${params.category}`]);
  if (params.countryId) facetFilters.push([`countryId:${params.countryId}`]);
  if (params.province)  facetFilters.push([`sellerProvince:${params.province}`]);
  if (params.isNew)     facetFilters.push([`isNew:true`]);

  // Soft country boost: rank user's country higher without hiding others.
  // Only applied when there is NO hard countryId filter (they are mutually exclusive).
  const optionalFilters: string[] = [];
  if (params.userCountry && !params.countryId) {
    optionalFilters.push(`countryId:${params.userCountry}<score=3>`);
  }

  const productBody: Record<string, unknown> = {
    query,
    hitsPerPage: params.limit,
    page: params.page,
    facetFilters,
    // Highlights let the frontend display matched text in bold
    attributesToHighlight: ["title", "description", "category"],
    highlightPreTag: "<mark>",
    highlightPostTag: "</mark>",
    // clickAnalytics: true returns a queryID used for Algolia Insights
    analytics: true,
    clickAnalytics: true,
  };
  if (numericFilters.length > 0)  productBody.numericFilters  = numericFilters;
  if (optionalFilters.length > 0) productBody.optionalFilters = optionalFilters;

  // ── Build seller query ───────────────────────────────────────────────────
  const sellerBody = {
    query,
    hitsPerPage: 5,
    facetFilters: [["role:seller"]],
  };

  const headers = {
    "X-Algolia-Application-Id": appId,
    "X-Algolia-API-Key": apiKey,
    "Content-Type": "application/json",
  };

  // Run both searches in parallel — single Algolia round-trip cost
  const [productRes, sellerRes] = await Promise.all([
    fetch(`${baseUrl}/1/indexes/${ALGOLIA_PRODUCTS_INDEX}/query`, {
      method: "POST", headers, body: JSON.stringify(productBody),
    }),
    fetch(`${baseUrl}/1/indexes/${ALGOLIA_SELLERS_INDEX}/query`, {
      method: "POST", headers, body: JSON.stringify(sellerBody),
    }),
  ]);

  const [productData, sellerData] = await Promise.all([
    productRes.ok
      ? productRes.json() as Promise<{ hits: AlgoliaHit[]; nbHits: number; nbPages: number; page: number; queryID?: string }>
      : Promise.resolve({ hits: [], nbHits: 0, nbPages: 0, page: params.page, queryID: undefined }),
    sellerRes.ok
      ? sellerRes.json() as Promise<{ hits: AlgoliaHit[] }>
      : Promise.resolve({ hits: [] }),
  ]);

  // ── Map hits → clean product objects ────────────────────────────────────
  let products = (productData.hits || []).map(mapProduct);

  // Server-side sort when user selects non-default ordering
  // (Algolia's default ranking already handles relevance)
  if (params.sort === "price_asc")  products.sort((a, b) => a.price - b.price);
  else if (params.sort === "price_desc") products.sort((a, b) => b.price - a.price);
  else if (params.sort === "newest")     products.sort((a, b) => b.createdAt - a.createdAt);

  // ── Extract highlights into a flat dict { productId → { field → html } }
  // Stored separately so the product objects remain clean and serializable.
  const highlights: Record<string, Record<string, string>> = {};
  for (const hit of productData.hits || []) {
    if (!hit._highlightResult) continue;
    const entry: Record<string, string> = {};
    for (const [field, val] of Object.entries(hit._highlightResult)) {
      if (val?.value && val.matchLevel !== "none") {
        entry[field] = val.value;
      }
    }
    if (Object.keys(entry).length > 0) {
      highlights[hit.objectID] = entry;
    }
  }

  const sellers = (sellerData.hits || []).map(mapSeller);

  return {
    products,
    sellers,
    totalHits:  productData.nbHits  ?? 0,
    totalPages: productData.nbPages ?? 0,
    page:       productData.page    ?? params.page,
    queryID:    productData.queryID,
    highlights,
  };
}

// ─── Hit mappers ──────────────────────────────────────────────────────────────

function mapProduct(hit: AlgoliaHit) {
  return {
    id:               hit.objectID,
    title:            hit.title            ?? "",
    slug:             hit.slug             ?? "",
    price:            hit.price            ?? 0,
    originalPrice:    hit.originalPrice    ?? null,
    discountPrice:    hit.discountPrice    ?? null,
    currency:         hit.currency         ?? "",
    images:           (hit.images          ?? []).slice(0, 3),
    category:         hit.category         ?? "",
    subCategory:      hit.subCategory      ?? "",
    tags:             hit.tags             ?? [],
    rating:           hit.rating           ?? 0,
    reviews:          hit.reviews          ?? 0,
    views:            hit.views            ?? 0,
    likesCount:       hit.likesCount       ?? 0,
    marketplace:      hit.marketplace      ?? null,
    sellerId:         hit.sellerId         ?? "",
    sellerName:       hit.sellerName       ?? "",
    sellerIsVerified: hit.sellerIsVerified ?? false,
    stockQuantity:    hit.stockQuantity    ?? null,
    createdAt:        hit.createdAt        ?? Date.now(),
    countryId:        hit.countryId        ?? null,
    isSponsored:      hit.isSponsored      ?? false,
  };
}

function mapSeller(hit: AlgoliaHit & {
  name?: string; shopName?: string; avatar?: string;
  isVerified?: boolean; verificationTier?: string;
  trustScore?: number; productCount?: number;
}) {
  return {
    id:                hit.objectID,
    name:              hit.name || hit.shopName || "",
    slug:              hit.slug              ?? "",
    avatar:            hit.avatar            ?? "",
    isVerified:        hit.isVerified        ?? false,
    verificationTier:  hit.verificationTier  ?? (hit.isVerified ? "identity" : "none"),
    trustScore:        typeof hit.trustScore === "number" ? hit.trustScore : 0,
    productCount:      hit.productCount      ?? 0,
    marketplace:       hit.marketplace       ?? null,
  };
}
