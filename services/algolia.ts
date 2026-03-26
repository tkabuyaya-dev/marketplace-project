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
  page?: number;
}

interface AlgoliaHit {
  objectID: string;
  [key: string]: any;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  processingTimeMS: number;
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
    isPromoted: false,
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
    const numericFilters: string[] = [];
    if (filters?.minPrice !== undefined) {
      numericFilters.push(`price >= ${filters.minPrice}`);
    }
    if (filters?.maxPrice !== undefined) {
      numericFilters.push(`price <= ${filters.maxPrice}`);
    }
    if (filters?.minRating !== undefined && filters.minRating > 0) {
      numericFilters.push(`rating >= ${filters.minRating}`);
    }

    const facetFilters: string[][] = [];
    if (filters?.category) {
      facetFilters.push([`category:${filters.category}`]);
    }
    if (filters?.sellerId) {
      facetFilters.push([`sellerId:${filters.sellerId}`]);
    }
    if (filters?.countryId) {
      facetFilters.push([`countryId:${filters.countryId}`]);
    }

    // Build base filter string
    let baseFilters = "status:approved";
    if (filters?.inStock) {
      numericFilters.push("stockQuantity > 0");
    }

    const result = await algoliaSearch(PRODUCTS_INDEX, {
      query: queryText,
      hitsPerPage: maxResults,
      filters: baseFilters,
      numericFilters: numericFilters.length > 0 ? numericFilters : undefined,
      facetFilters: facetFilters.length > 0 ? facetFilters : undefined,
    });

    let products = result.hits.map(hitToProduct);

    // Client-side sorting (Algolia returns by relevance by default)
    if (filters?.sort === "price_asc") {
      products.sort((a, b) => a.price - b.price);
    } else if (filters?.sort === "price_desc") {
      products.sort((a, b) => b.price - a.price);
    } else if (filters?.sort === "newest") {
      products.sort((a, b) => b.createdAt - a.createdAt);
    }

    return products;
  } catch (err) {
    console.warn("[Algolia] Search failed, will fallback:", err);
    return null; // Signal fallback to Firestore
  }
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
