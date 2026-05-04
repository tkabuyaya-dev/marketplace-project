/**
 * NUNULIA — Firebase Cloud Functions
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
setGlobalOptions({ maxInstances: 15, region: "europe-west1" });

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

// Account deletion (callable)
export { deleteUserAccount } from "./delete-account.js";

// Buyer requests expiration cron (daily at 03:00 UTC)
export { expireBuyerRequests } from "./expire-buyer-requests.js";

// Buyer request submission — callable, contourne les rules iOS
export { submitBuyerRequest } from "./submit-buyer-request.js";

// User activity purge cron (daily at 04:00 UTC — deletes docs older than 90 days)
export { purgeUserActivity } from "./purge-activity.js";

// Seller suspension propagation (Firestore trigger — updates all products server-side)
export { onSellerStatusChange } from "./suspend-seller.js";

// A2 — Sync user role/suspension into Firebase Auth custom claims.
// onUserRoleWrite: Firestore trigger keeping claims fresh on every users/{uid} write.
// backfillUserClaims: HTTP admin endpoint, run once after deploy to seed existing users.
export { onUserRoleWrite, backfillUserClaims } from "./sync-user-claims.js";

// Boost expiration cron (daily at 05:00 UTC)
export { expireBoosts } from "./expire-boosts.js";

// Cloudinary cleanup on product deletion (Firestore trigger)
export { onProductDelete } from "./on-product-delete.js";

// Monitoring: Algolia usage check, daily stats report, Firestore backup
export { getAlgoliaUsage, getDailyStats, triggerFirestoreBackup } from "./monitoring.js";

// Subscription management with Cloudinary cleanup
export { expireSellers } from "./expire-sellers.js";
export { deleteProducts } from "./delete-products.js";
export { approveRenewal } from "./approve-renewal.js";
export { rejectSubscription } from "./reject-subscription.js";

// One-shot backfill: verificationTier migration for existing users
export { backfillVerificationTier } from "./backfill-verification-tier.js";

// Seller analytics — returns 30-day activity for the caller's own products
// (bypasses the userActivity rule that hides viewer identities).
export { getMyProductsActivity } from "./seller-stats.js";
