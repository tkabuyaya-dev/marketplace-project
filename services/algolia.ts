/**
 * NUNULIA — Algolia Search Service (Frontend)
 *
 * Uses the search-only API key (safe for client-side).
 * Falls back to Firestore prefix search when Algolia is unavailable.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  QUOTA GUARDS — DO NOT WEAKEN WITHOUT CHECKING DASHBOARD    ║
 * ║  Free plan: 10,000 req/month ≈ 80 daily searchers at 20     ║
 * ║  req/user. Raising limits below will exhaust quota fast.     ║
 * ║                                                              ║
 * ║  • algoliaSearchProductsFull: min 2 chars (line ~213)       ║
 * ║  • algoliaAutocompleteProducts: min 2 chars, cache hit first ║
 * ║  • analytics/clickAnalytics: OFF in autocomplete             ║
 * ║  Alert threshold: set Algolia dashboard alert at 7,000/month ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { Product, User, SearchFilters } from "../types";
import { readCache, writeCache } from "./sessionCache";
import { getAutocompleteFromIDB, saveAutocompleteToIDB } from "./searchIdb";

const env = import.meta.env;

const ALGOLIA_APP_ID = env.VITE_ALGOLIA_APP_ID || "";
const ALGOLIA_SEARCH_KEY = env.VITE_ALGOLIA_SEARCH_KEY || "";
const PRODUCTS_INDEX = "products";
const SELLERS_INDEX = "sellers";

const isConfigured = !!(ALGOLIA_APP_ID && ALGOLIA_SEARCH_KEY);

// Algolia REST API URL (no SDK needed — smaller bundle)
const ALGOLIA_BASE = `https://${ALGOLIA_APP_ID}-dsn.algolia.net`;

interface AlgoliaSearchParams {
  query: string;
  hitsPerPage?: number;
  filters?: string;
  facetFilters?: string[][];
  numericFilters?: string[];
  optionalFilters?: string[];
  page?: number;
  attributesToRetrieve?: string[];
  attributesToHighlight?: string[];
  highlightPreTag?: string;
  highlightPostTag?: string;
  analytics?: boolean;
  clickAnalytics?: boolean;
  userToken?: string;
}

interface AlgoliaHit {
  objectID: string;
  _highlightResult?: Record<string, { value: string; matchLevel: string }>;
  [key: string]: any;
}

export interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  processingTimeMS: number;
  queryID?: string;
}

/**
 * Raw Algolia search via REST API (no SDK dependency).
 * Keeps the frontend bundle lean.
 */
async function algoliaSearch(
  indexName: string,
  params: AlgoliaSearchParams
): Promise<AlgoliaResponse> {
  const body: Record<string, any> = {
    query: params.query,
    hitsPerPage: params.hitsPerPage || 20,
    page: params.page || 0,
  };

  if (params.filters) body.filters = params.filters;
  if (params.facetFilters) body.facetFilters = params.facetFilters;
  if (params.numericFilters) body.numericFilters = params.numericFilters;
  if (params.optionalFilters) body.optionalFilters = params.optionalFilters;
  if (params.attributesToRetrieve) body.attributesToRetrieve = params.attributesToRetrieve;
  if (params.attributesToHighlight) body.attributesToHighlight = params.attributesToHighlight;
  if (params.highlightPreTag) body.highlightPreTag = params.highlightPreTag;
  if (params.highlightPostTag) body.highlightPostTag = params.highlightPostTag;
  if (params.analytics !== undefined) body.analytics = params.analytics;
  if (params.clickAnalytics !== undefined) body.clickAnalytics = params.clickAnalytics;
  if (params.userToken) body.userToken = params.userToken;

  const response = await fetch(
    `${ALGOLIA_BASE}/1/indexes/${indexName}/query`,
    {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(`Algolia search failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Convert an Algolia product hit to our Product type.
 */
function hitToProduct(hit: AlgoliaHit): Product {
  return {
    id: hit.objectID,
    slug: hit.slug,
    title: hit.title,
    price: hit.price,
    originalPrice: hit.originalPrice || undefined,
    description: hit.description || "",
    images: hit.images || [],
    category: hit.category,
    subCategory: hit.subCategory,
    tags: hit.tags || [],
    rating: hit.rating || 0,
    reviews: hit.reviews || 0,
    seller: {
      id: hit.sellerId,
      name: hit.sellerName || "Vendeur",
      email: "",
      avatar: "",
      isVerified: hit.sellerIsVerified || false,
      verificationTier: hit.sellerVerificationTier || (hit.sellerIsVerified ? "identity" : "none"),
      role: "seller",
      joinDate: 0,
      sellerDetails: (hit.sellerCommune || hit.sellerProvince)
        ? { commune: hit.sellerCommune || "", province: hit.sellerProvince || "" }
        : undefined,
    } as any,
    isPromoted: hit.isSponsored || false,
    isSponsored: hit.isSponsored || false,
    status: "approved",
    views: hit.views || 0,
    likesCount: hit.likesCount || 0,
    reports: 0,
    createdAt: hit.createdAt || Date.now(),
    stockQuantity: hit.stockQuantity ?? undefined,
    discountPrice: hit.discountPrice ?? undefined,
    countryId: hit.countryId || undefined,
    currency: hit.currency || undefined,
  } as Product;
}

function hitToSeller(hit: AlgoliaHit): User {
  return {
    id: hit.objectID,
    slug: hit.slug,
    name: hit.name || hit.shopName || "Vendeur",
    email: "",
    avatar: hit.avatar || "",
    isVerified: hit.isVerified || false,
    verificationTier: hit.verificationTier || (hit.isVerified ? "identity" : "none"),
    trustScore: typeof hit.trustScore === "number" ? hit.trustScore : undefined,
    role: "seller",
    joinDate: 0,
    productCount: hit.productCount || 0,
    bio: hit.bio,
    sellerDetails: {
      categories: hit.categories || [],
    } as any,
  } as User;
}

/** Extended search filters for the search page */
export interface ExtendedSearchFilters extends SearchFilters {
  isNew?: boolean;
  /** Seller's province — for location-based filtering */
  sellerProvince?: string;
  /** Seller's commune/city — for location-based filtering */
  sellerCommune?: string;
  /** User's country — used for soft boost (optionalFilters), not hard filter */
  userCountry?: string;
  /** Unique user token for personalization & analytics */
  userToken?: string;
}

/**
 * Search products using Algolia.
 * Returns null if Algolia is not configured (caller should fallback).
 */
export async function algoliaSearchProducts(
  queryText: string,
  filters?: SearchFilters,
  maxResults: number = 20
): Promise<Product[] | null> {
  if (!isConfigured) return null;
  if (queryText.trim().length < 1) return [];

  try {
    const result = await algoliaSearchProductsFull(queryText, filters, 0, maxResults);
    return result.products;
  } catch (err) {
    console.warn("[Algolia] Search failed, will fallback:", err);
    return null;
  }
}

/**
 * Full Algolia search with pagination, highlight, and analytics.
 * Used by the search page for complete control.
 */
export async function algoliaSearchProductsFull(
  queryText: string,
  filters?: ExtendedSearchFilters,
  page: number = 0,
  hitsPerPage: number = 20,
): Promise<{
  products: Product[];
  totalHits: number;
  totalPages: number;
  page: number;
  queryID?: string;
  highlightResults: Map<string, Record<string, string>>;
}> {
  if (!isConfigured) {
    return { products: [], totalHits: 0, totalPages: 0, page: 0, highlightResults: new Map() };
  }
  // Never fire an Algolia request for single-char queries (min 2 chars — allows "TV", "PC", etc.)
  if (queryText.trim().length < 2) {
    return { products: [], totalHits: 0, totalPages: 0, page: 0, highlightResults: new Map() };
  }

  const numericFilters: string[] = [];
  if (filters?.minPrice !== undefined) numericFilters.push(`price >= ${filters.minPrice}`);
  if (filters?.maxPrice !== undefined) numericFilters.push(`price <= ${filters.maxPrice}`);
  if (filters?.minRating !== undefined && filters.minRating > 0) numericFilters.push(`rating >= ${filters.minRating}`);
  if (filters?.inStock) numericFilters.push("stockQuantity > 0");

  const facetFilters: string[][] = [];
  if (filters?.category) facetFilters.push([`category:${filters.category}`]);
  if (filters?.sellerId) facetFilters.push([`sellerId:${filters.sellerId}`]);
  if (filters?.countryId) facetFilters.push([`countryId:${filters.countryId}`]);
  if (filters?.sellerProvince) facetFilters.push([`sellerProvince:${filters.sellerProvince}`]);
  if (filters?.sellerCommune) facetFilters.push([`sellerCommune:${filters.sellerCommune}`]);
  if (filters?.isNew) facetFilters.push([`isNew:true`]);

  // Country-aware personalization: boost user's country products without hiding others
  const optionalFilters: string[] = [];
  const boostCountry = filters?.userCountry || filters?.countryId;
  if (boostCountry && !filters?.countryId) {
    // Only use optionalFilters when NOT hard-filtering by country
    // This makes user's country products rank higher while still showing all results
    optionalFilters.push(`countryId:${boostCountry}<score=3>`);
  }

  const result = await algoliaSearch(PRODUCTS_INDEX, {
    query: queryText,
    hitsPerPage,
    page,
    filters: "status:approved",
    numericFilters: numericFilters.length > 0 ? numericFilters : undefined,
    facetFilters: facetFilters.length > 0 ? facetFilters : undefined,
    optionalFilters: optionalFilters.length > 0 ? optionalFilters : undefined,
    attributesToHighlight: ["title", "description", "category"],
    highlightPreTag: "<mark>",
    highlightPostTag: "</mark>",
    analytics: true,
    clickAnalytics: true,
    userToken: filters?.userToken,
  });

  let products = result.hits.map(hitToProduct);

  // Client-side sorting (Algolia returns by relevance by default)
  if (filters?.sort === "price_asc") products.sort((a, b) => a.price - b.price);
  else if (filters?.sort === "price_desc") products.sort((a, b) => b.price - a.price);
  else if (filters?.sort === "newest") products.sort((a, b) => b.createdAt - a.createdAt);

  // Extract highlight results
  const highlightResults = new Map<string, Record<string, string>>();
  for (const hit of result.hits) {
    if (hit._highlightResult) {
      const highlights: Record<string, string> = {};
      for (const [key, val] of Object.entries(hit._highlightResult)) {
        if (val && typeof val === 'object' && 'value' in val) {
          highlights[key] = (val as any).value;
        }
      }
      highlightResults.set(hit.objectID, highlights);
    }
  }

  return {
    products,
    totalHits: result.nbHits,
    totalPages: result.nbPages,
    page: result.page,
    queryID: result.queryID,
    highlightResults,
  };
}

/**
 * Search sellers using Algolia.
 * Returns null if not configured (caller should fallback).
 */
export async function algoliaSearchSellers(
  queryText: string,
  maxResults: number = 10
): Promise<User[] | null> {
  if (!isConfigured) return null;
  if (queryText.trim().length < 1) return [];

  try {
    const result = await algoliaSearch(SELLERS_INDEX, {
      query: queryText,
      hitsPerPage: maxResults,
      filters: "role:seller",
    });

    return result.hits.map(hitToSeller);
  } catch (err) {
    console.warn("[Algolia] Seller search failed:", err);
    return null;
  }
}

// Three-tier autocomplete cache:
//   L1 = in-memory Map  (0ms,    dies on full page reload)
//   L2 = sessionStorage (1-5ms,  survives reload, dies on tab close)
//   L3 = IndexedDB      (5-15ms, survives tab close, TTL 6h — ./searchIdb.ts)
// All three are populated on every successful Algolia call.
const autocompleteCache = new Map<string, Product[]>();
const SS_PREFIX_AC = "nun_ac_";

/**
 * Lightweight autocomplete search — only the fields needed for the dropdown.
 * analytics and clickAnalytics disabled to reduce Algolia quota usage.
 * Used by SearchOverlay dropdown only (not the full search page).
 */
export async function algoliaAutocompleteProducts(
  queryText: string,
  countryId?: string,
): Promise<Product[]> {
  if (!isConfigured) return [];
  if (queryText.trim().length < 2) return [];

  const cacheKey = `${queryText.trim().toLowerCase()}|${countryId || ''}`;

  // L1 hit (in-memory)
  const l1 = autocompleteCache.get(cacheKey);
  if (l1) return l1;

  // L2 hit (sessionStorage) — rehydrate L1 so subsequent calls stay 0-ms
  const l2 = readCache<Product[]>(SS_PREFIX_AC, cacheKey);
  if (l2) {
    autocompleteCache.set(cacheKey, l2);
    return l2;
  }

  // L3 hit (IndexedDB) — promote to L1+L2 so subsequent calls skip the async hop
  const l3 = await getAutocompleteFromIDB(cacheKey);
  if (l3) {
    autocompleteCache.set(cacheKey, l3);
    writeCache(SS_PREFIX_AC, cacheKey, l3);
    return l3;
  }

  try {
    const optionalFilters: string[] = [];
    if (countryId) optionalFilters.push(`countryId:${countryId}<score=3>`);

    const result = await algoliaSearch(PRODUCTS_INDEX, {
      query: queryText,
      hitsPerPage: 5,
      page: 0,
      filters: "status:approved",
      optionalFilters: optionalFilters.length > 0 ? optionalFilters : undefined,
      attributesToRetrieve: ['objectID', 'title', 'price', 'images', 'sellerName', 'currency', 'countryId', 'slug', 'isSponsored'],
      attributesToHighlight: [],
      analytics: false,
      clickAnalytics: false,
    });

    const products = result.hits.map(hitToProduct);
    autocompleteCache.set(cacheKey, products);
    writeCache(SS_PREFIX_AC, cacheKey, products);
    void saveAutocompleteToIDB(cacheKey, products); // fire-and-forget
    return products;
  } catch {
    return [];
  }
}

/**
 * Check if Algolia is configured and available.
 */
export function isAlgoliaConfigured(): boolean {
  return isConfigured;
}
