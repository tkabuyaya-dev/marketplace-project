/**
 * AURABUJA — Algolia Search Service (Frontend)
 *
 * Uses the search-only API key (safe for client-side).
 * Falls back to Firestore prefix search when Algolia is unavailable.
 */

import { Product, User, SearchFilters } from "../types";

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
  if (params.attributesToHighlight) body.attributesToHighlight = params.attributesToHighlight;
  if (params.highlightPreTag) body.highlightPreTag = params.highlightPreTag;
  if (params.highlightPostTag) body.highlightPostTag = params.highlightPostTag;
  if (params.analytics) body.analytics = params.analytics;
  if (params.clickAnalytics) body.clickAnalytics = params.clickAnalytics;
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
      role: "seller",
      joinDate: 0,
    },
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

  const numericFilters: string[] = [];
  if (filters?.minPrice !== undefined) numericFilters.push(`price >= ${filters.minPrice}`);
  if (filters?.maxPrice !== undefined) numericFilters.push(`price <= ${filters.maxPrice}`);
  if (filters?.minRating !== undefined && filters.minRating > 0) numericFilters.push(`rating >= ${filters.minRating}`);
  if (filters?.inStock) numericFilters.push("stockQuantity > 0");

  const facetFilters: string[][] = [];
  if (filters?.category) facetFilters.push([`category:${filters.category}`]);
  if (filters?.sellerId) facetFilters.push([`sellerId:${filters.sellerId}`]);
  if (filters?.countryId) facetFilters.push([`countryId:${filters.countryId}`]);
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

/**
 * Check if Algolia is configured and available.
 */
export function isAlgoliaConfigured(): boolean {
  return isConfigured;
}
