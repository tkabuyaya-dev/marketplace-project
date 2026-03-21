/**
 * AURABUJA — Firebase Cloud Functions
 *
 * Exports:
 * - Algolia sync triggers (onProductWrite, onSellerWrite)
 * - Algolia setup/reindex (setupAlgoliaIndexes)
 * - Cached recommendations API (getTrending, getPopular, getRecommendations, getAlsoViewed)
 */

import { setGlobalOptions } from "firebase-functions/v2/options";

// NOTE: firebase-admin is NOT imported here — it takes 9+ seconds on Node 24,
// which exceeds Firebase CLI's 10-second deployment analysis timeout.
// Instead, each function lazily initializes via ./admin.ts on first invocation.

// Global options: limit concurrency for cost control
setGlobalOptions({ maxInstances: 10, region: "europe-west1" });

// Algolia sync triggers
export { onProductWrite, onSellerWrite } from "./algolia-sync.js";

// Algolia setup/reindex
export { setupAlgoliaIndexes } from "./algolia-setup.js";

// Cached recommendations API
export {
  getTrending,
  getPopular,
  getRecommendations,
  getAlsoViewed,
} from "./recommendations.js";

// Cached search proxy (Redis-backed Algolia proxy)
export { cachedSearch } from "./search-proxy.js";

// reCAPTCHA v3 verification
export { verifyRecaptcha } from "./recaptcha.js";

// Subscription expiration cron (daily at 02:00 UTC)
export { checkSubscriptions } from "./subscription-cron.js";
