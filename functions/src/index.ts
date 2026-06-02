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

// Seller lifecycle actions sur ses propres demandes d'abonnement (callables).
// Atomicité transaction + écriture sous-collection history (admin SDK only).
export { cancelSubscriptionRequest } from "./cancel-subscription-request.js";
export { modifySubscriptionRequest } from "./modify-subscription-request.js";

// One-shot backfill: verificationTier migration for existing users
export { backfillVerificationTier } from "./backfill-verification-tier.js";

// One-shot backfill: sellerShopName on existing products (post-fix denormalization)
export { backfillSellerShopName } from "./backfill-shop-name.js";

// One-shot seed: 3 nouvelles catégories Immobilier + Emploi + Événements (V1 expansion 14→17)
export { seedNewCategories } from "./seed-new-categories.js";

// Génération IA de description produit (Claude Haiku 4.5 + cache + quota gating Pro).
export { generateProductDescription } from "./generate-product-description.js";

// Retouche photo PhotoRoom — option facultative dans "Ajouter produit".
// 3 styles (white/blur/branded), quota partagé avec Photo Studio asynchrone.
export { enhanceProductPhoto } from "./enhance-product-photo.js";

// Test push FCM pour la page /fcm-debug — envoie un push à ses propres devices.
export { sendTestPush } from "./send-test-push.js";

// Seller analytics — returns 30-day activity for the caller's own products
// (bypasses the userActivity rule that hides viewer identities).
export { getMyProductsActivity } from "./seller-stats.js";

// FCM push sender — triggers on new notifications/{id} doc, sends push to
// all registered devices of the recipient. Prunes invalid tokens automatically.
export { onNotificationCreate } from "./fcm-send.js";

// User-initiated engagement notifications — crée des docs notifications
// quand un user like ou review un produit, ce qui fait remonter la
// cloche in-app + déclenche derrière le push FCM via onNotificationCreate.
export { onLikeCreate, onReviewCreate } from "./notify-on-engagement.js";

// Buyer Request → Sellers matching push (catégorie + pays).
// Pendant offre/demande de la feature "Je Cherche".
export { onBuyerRequestMatch } from "./notify-buyer-request-match.js";

// Signalement community : seller flag une demande suspecte.
// 3 flags indépendants → status='suspended' auto + notif admin.
export { flagBuyerRequest } from "./flag-buyer-request.js";

// Notif "produit approuvé" : trigger sur products/{id} quand status
// passe de pending → approved. Push immédiat au seller avec deep link.
export { onProductApproved } from "./notify-product-approved.js";

// ─── Photo Studio (Nunulia Studio) ─────────────────────────────────────────
// 4 callables + 1 cron — flow complet de la création de session à la
// publication du produit. Toutes les transitions de status passent par ces
// CFs (rules client = create/update/delete photoSessions interdits).
//
// Lifecycle :
//   photoSessionCreate         (seller) waiting_photos
//   photoSessionSetProcessing  (admin)  waiting_photos → processing
//   photoSessionAttach         (admin)  processing → ready  [+ Haiku Vision]
//   photoSessionPublish        (seller) ready → published [transaction prod]
//   expirePhotoSessions        (cron)   * → expired         [TTL 48h]
export { photoSessionCreate } from "./photo-session-create.js";
export { photoSessionSetProcessing } from "./photo-session-set-processing.js";
export { photoSessionAttach } from "./photo-session-attach.js";
export { photoSessionPublish } from "./photo-session-publish.js";
export { expirePhotoSessions } from "./expire-photo-sessions.js";

// Phase 7 : carte virale 1080×1920 + caption Haiku, déclenchée en async
// quand session.status passe à 'published'. Découplé de photoSessionPublish.
export { onPhotoSessionPublished } from "./share-card-trigger.js";
