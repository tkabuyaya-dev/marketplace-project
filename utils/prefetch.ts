/**
 * NUNULIA — Image Prefetch Utility
 *
 * Pre-warms the Service Worker Cloudinary cache for below-the-fold images.
 * When the user scrolls down, images are already in the SW cache and appear
 * instantly — no loading delay.
 *
 * Strategy:
 * 1. After main product grid renders, schedule prefetch via requestIdleCallback
 * 2. For each below-fold product, prefetch its 400px thumbnail into SW cache
 * 3. Only prefetch if already in cache is checked first (avoid redundant fetches)
 * 4. Uses 'no-cors' + 'force-cache' to avoid double-counting bandwidth
 */

import { getOptimizedUrl } from '../services/cloudinary';

const PREFETCH_WIDTH  = 400; // px — matches ProductCard grid thumbnail size
const PREFETCH_CACHE  = 'cloudinary-images'; // Must match SW runtimeCaching cacheName
const MAX_PREFETCH    = 20;  // Max images to prefetch per call (avoid overwhelming 2G)

/**
 * Prefetch a batch of Cloudinary image URLs into the SW cache.
 * Fire-and-forget — errors are silent.
 *
 * @param urls    Raw Cloudinary image URLs (first image of each product)
 * @param slow    If true, skip prefetch entirely (2G/data saver mode)
 */
export function prefetchProductImages(urls: string[], slow = false): void {
  if (slow || !urls.length || typeof requestIdleCallback === 'undefined') return;
  if (!('caches' in window)) return; // Not in a secure context or SW unavailable

  const toFetch = urls
    .filter(u => u?.includes('cloudinary.com'))
    .slice(0, MAX_PREFETCH);

  if (!toFetch.length) return;

  requestIdleCallback(
    async () => {
      let cache: Cache;
      try {
        cache = await caches.open(PREFETCH_CACHE);
      } catch {
        return; // Cache API unavailable
      }

      for (const url of toFetch) {
        try {
          const optimized = getOptimizedUrl(url, PREFETCH_WIDTH);

          // Skip if already cached — no redundant network request
          const existing = await cache.match(optimized);
          if (existing) continue;

          // Fetch with low priority, no-cors to avoid CORS preflight overhead
          fetch(optimized, {
            mode:        'no-cors',
            credentials: 'omit',
            cache:       'force-cache',
          }).catch(() => {/* Silent — prefetch is best-effort */});
        } catch {
          // Continue with next URL on any error
        }
      }
    },
    { timeout: 3000 } // Must start within 3s (browser may postpone idle callbacks)
  );
}
