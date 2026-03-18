/**
 * AURABUJA — Browser-Side Search Cache (LRU + TTL)
 *
 * Caches Algolia search results in memory to avoid redundant API calls.
 * Identical queries within the TTL window return instantly from cache.
 *
 * Architecture layer: User → Local suggestions → [THIS] → Backend cache → Algolia
 */

import { Product, User, SearchFilters } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_ENTRIES = 50;

const productCache = new Map<string, CacheEntry<Product[]>>();
const sellerCache = new Map<string, CacheEntry<User[]>>();

/**
 * Build a deterministic cache key from query + filters.
 */
function buildKey(query: string, filters?: SearchFilters): string {
  const q = query.trim().toLowerCase();
  if (!filters) return q;
  const parts = [q];
  if (filters.sort && filters.sort !== 'relevance') parts.push(`s:${filters.sort}`);
  if (filters.minPrice !== undefined) parts.push(`min:${filters.minPrice}`);
  if (filters.maxPrice !== undefined) parts.push(`max:${filters.maxPrice}`);
  if (filters.minRating) parts.push(`r:${filters.minRating}`);
  if (filters.category) parts.push(`c:${filters.category}`);
  return parts.join('|');
}

/**
 * Evict oldest entries when cache exceeds MAX_ENTRIES.
 */
function evict<T>(cache: Map<string, CacheEntry<T>>): void {
  if (cache.size <= MAX_ENTRIES) return;
  const oldest = [...cache.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .slice(0, cache.size - MAX_ENTRIES);
  for (const [key] of oldest) {
    cache.delete(key);
  }
}

/**
 * Get cached product results. Returns undefined on miss.
 */
export function getCachedProducts(query: string, filters?: SearchFilters): Product[] | undefined {
  const key = buildKey(query, filters);
  const entry = productCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    productCache.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Store product results in cache.
 */
export function setCachedProducts(query: string, filters: SearchFilters | undefined, data: Product[]): void {
  const key = buildKey(query, filters);
  productCache.set(key, { data, timestamp: Date.now() });
  evict(productCache);
}

/**
 * Get cached seller results.
 */
export function getCachedSellers(query: string): User[] | undefined {
  const key = query.trim().toLowerCase();
  const entry = sellerCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    sellerCache.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Store seller results in cache.
 */
export function setCachedSellers(query: string, data: User[]): void {
  const key = query.trim().toLowerCase();
  sellerCache.set(key, { data, timestamp: Date.now() });
  evict(sellerCache);
}

/**
 * Clear all search caches (useful after product mutations).
 */
export function clearSearchCache(): void {
  productCache.clear();
  sellerCache.clear();
}
