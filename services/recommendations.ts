/**
 * AURABUJA — Recommendation Engine (Upgraded)
 *
 * Strategy:
 * 1. Try Cloud Functions API (Redis-cached, fast) for trending/popular/recommendations
 * 2. Fallback to direct Firestore queries if Cloud Functions unavailable
 * 3. Anonymous users always use localStorage for tracking
 *
 * Supports both logged-in users (Firestore userActivity) and
 * anonymous users (localStorage).
 */

import { Product } from '../types';
import {
  trackUserActivity,
  getUserRecentActivity,
  getAlsoViewedProductIds,
  getProductsByIds,
  getProductsByCategory,
  getTrendingProducts as firestoreTrending,
  getPopularProducts as firestorePopular,
} from './firebase';

// ---------------------------------------------------------------------------
// CLOUD FUNCTIONS API — Redis-cached endpoints
// ---------------------------------------------------------------------------

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL || '';

interface CachedProduct {
  id: string;
  title: string;
  slug?: string;
  price: number;
  originalPrice?: number;
  discountPrice?: number;
  images: string[];
  category: string;
  subCategory?: string;
  rating: number;
  reviews?: number;
  views: number;
  likesCount: number;
  marketplace?: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  sellerIsVerified: boolean;
  stockQuantity?: number;
  promotionEnd?: number;
  createdAt: number;
}

/** Convert a cached product (from Cloud Functions) to a full Product type */
function cachedToProduct(p: CachedProduct): Product {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    originalPrice: p.originalPrice,
    description: '',
    images: p.images || [],
    category: p.category,
    subCategory: p.subCategory,
    rating: p.rating || 0,
    reviews: p.reviews || 0,
    seller: {
      id: p.sellerId,
      name: p.sellerName || 'Vendeur',
      email: '',
      avatar: p.sellerAvatar || '',
      isVerified: p.sellerIsVerified || false,
      role: 'seller',
      joinDate: 0,
    },
    marketplace: p.marketplace as any,
    status: 'approved',
    views: p.views || 0,
    likesCount: p.likesCount || 0,
    reports: 0,
    createdAt: p.createdAt || Date.now(),
    stockQuantity: p.stockQuantity,
    discountPrice: p.discountPrice,
    promotionEnd: p.promotionEnd,
  } as Product;
}

/** Fetch from Cloud Functions API with timeout and fallback */
async function fetchCachedApi<T>(
  endpoint: string,
  params: Record<string, string> = {},
  timeoutMs: number = 4000
): Promise<T | null> {
  if (!FUNCTIONS_BASE) return null;

  const url = new URL(`${FUNCTIONS_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ---------------------------------------------------------------------------
// LOCAL STORAGE — Anonymous user tracking
// ---------------------------------------------------------------------------

const RECENTLY_VIEWED_KEY = 'aurabuja_recently_viewed';
const MAX_LOCAL_HISTORY = 30;

interface LocalViewEntry {
  productId: string;
  category: string;
  timestamp: number;
}

function getLocalHistory(): LocalViewEntry[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(entries: LocalViewEntry[]): void {
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(entries.slice(0, MAX_LOCAL_HISTORY)));
  } catch { /* quota exceeded — silently fail */ }
}

// ---------------------------------------------------------------------------
// TRACK — Enregistre une vue produit (local + Firestore si connecte)
// ---------------------------------------------------------------------------

export const trackProductView = async (
  product: Product,
  userId?: string | null
): Promise<void> => {
  // Always save to localStorage (anonymous + logged-in)
  const history = getLocalHistory();
  const filtered = history.filter(e => e.productId !== product.id);
  filtered.unshift({
    productId: product.id,
    category: product.category,
    timestamp: Date.now(),
  });
  saveLocalHistory(filtered);

  // Also persist to Firestore for logged-in users
  if (userId) {
    trackUserActivity(userId, product.id, product.category, 'view');
  }
};

// ---------------------------------------------------------------------------
// RECENTLY VIEWED — Produits vus recemment
// ---------------------------------------------------------------------------

export const getRecentlyViewedIds = async (
  userId?: string | null,
  maxResults: number = 12
): Promise<string[]> => {
  if (userId) {
    const activity = await getUserRecentActivity(userId, 'view', maxResults);
    if (activity.length > 0) {
      const seen = new Set<string>();
      return activity
        .filter(a => {
          if (seen.has(a.productId)) return false;
          seen.add(a.productId);
          return true;
        })
        .map(a => a.productId);
    }
  }

  // Fallback / anonymous: use localStorage
  const history = getLocalHistory();
  const seen = new Set<string>();
  return history
    .filter(e => {
      if (seen.has(e.productId)) return false;
      seen.add(e.productId);
      return true;
    })
    .slice(0, maxResults)
    .map(e => e.productId);
};

// ---------------------------------------------------------------------------
// TRENDING — Cloud Functions (Redis-cached) with Firestore fallback
// ---------------------------------------------------------------------------

export const getTrending = async (maxResults: number = 12): Promise<Product[]> => {
  // Try Cloud Functions API first (Redis-cached)
  const cached = await fetchCachedApi<{ products: CachedProduct[] }>(
    'getTrending',
    { limit: String(maxResults) }
  );

  if (cached?.products?.length) {
    return cached.products.map(cachedToProduct);
  }

  // Fallback to direct Firestore query
  return firestoreTrending(maxResults);
};

// ---------------------------------------------------------------------------
// POPULAR — Cloud Functions (Redis-cached) with Firestore fallback
// ---------------------------------------------------------------------------

export const getPopular = async (
  maxResults: number = 12,
  category?: string
): Promise<Product[]> => {
  const cached = await fetchCachedApi<{ products: CachedProduct[] }>(
    'getPopular',
    { limit: String(maxResults), category: category || '' }
  );

  if (cached?.products?.length) {
    return cached.products.map(cachedToProduct);
  }

  return firestorePopular(maxResults);
};

// ---------------------------------------------------------------------------
// PERSONALIZED RECOMMENDATIONS — Cloud Functions with Firestore fallback
// ---------------------------------------------------------------------------

export const getPersonalizedRecommendations = async (
  userId?: string | null,
  excludeIds: string[] = [],
  maxResults: number = 12
): Promise<Product[]> => {
  // Try Cloud Functions API for logged-in users
  if (userId) {
    const cached = await fetchCachedApi<{ products: CachedProduct[] }>(
      'getRecommendations',
      {
        userId,
        limit: String(maxResults),
        exclude: excludeIds.join(','),
      }
    );

    if (cached?.products?.length) {
      return cached.products.map(cachedToProduct);
    }
  }

  // Fallback: compute locally from activity history
  let categoryWeights: Record<string, number> = {};

  if (userId) {
    const activity = await getUserRecentActivity(userId, 'view', 30);
    activity.forEach(a => {
      categoryWeights[a.category] = (categoryWeights[a.category] || 0) + 1;
    });
  }

  if (Object.keys(categoryWeights).length === 0) {
    const history = getLocalHistory();
    history.forEach(e => {
      categoryWeights[e.category] = (categoryWeights[e.category] || 0) + 1;
    });
  }

  if (Object.keys(categoryWeights).length === 0) return [];

  const topCategories = Object.entries(categoryWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  const excludeSet = new Set(excludeIds);
  const results: Product[] = [];

  for (const cat of topCategories) {
    if (results.length >= maxResults) break;
    const products = await getProductsByCategory(cat, undefined, 8);
    products
      .filter(p => !excludeSet.has(p.id))
      .forEach(p => {
        if (results.length < maxResults && !results.some(r => r.id === p.id)) {
          results.push(p);
        }
      });
  }

  return results;
};

// ---------------------------------------------------------------------------
// CUSTOMERS ALSO VIEWED — Cloud Functions with Firestore fallback
// ---------------------------------------------------------------------------

export const getCustomersAlsoViewed = async (
  productId: string,
  maxResults: number = 8
): Promise<Product[]> => {
  // Try Cloud Functions API first
  const cached = await fetchCachedApi<{ products: CachedProduct[] }>(
    'getAlsoViewed',
    { productId, limit: String(maxResults) }
  );

  if (cached?.products?.length) {
    return cached.products.map(cachedToProduct);
  }

  // Fallback to direct Firestore queries
  const ids = await getAlsoViewedProductIds(productId, 15, maxResults);
  if (ids.length === 0) return [];
  return getProductsByIds(ids);
};

// ---------------------------------------------------------------------------
// SIMILAR PRODUCTS — Enhanced with category + tags + popularity
// ---------------------------------------------------------------------------

export const getSimilarProducts = async (
  product: Product,
  maxResults: number = 8
): Promise<Product[]> => {
  const sameCategoryProducts = await getProductsByCategory(
    product.category,
    product.id,
    maxResults + 4
  );

  if (sameCategoryProducts.length === 0) return [];

  const productTags = new Set(product.tags || []);
  const scored = sameCategoryProducts.map(p => {
    let score = p.views || 0;
    if (product.subCategory && p.subCategory === product.subCategory) score += 500;
    if (productTags.size > 0 && p.tags) {
      const overlap = p.tags.filter(t => productTags.has(t)).length;
      score += overlap * 100;
    }
    const priceDiff = Math.abs(p.price - product.price) / Math.max(product.price, 1);
    if (priceDiff < 0.3) score += 200;
    return { product: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(s => s.product);
};
