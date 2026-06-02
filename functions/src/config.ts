/**
 * NUNULIA — Cloud Functions Configuration
 *
 * All sensitive keys are stored in Firebase Functions environment config.
 * Set them via:
 *   firebase functions:secrets:set ALGOLIA_APP_ID
 *   firebase functions:secrets:set ALGOLIA_ADMIN_KEY
 *   firebase functions:secrets:set REDIS_URL
 *   firebase functions:secrets:set RECAPTCHA_SECRET_KEY
 *
 * Or via .env in functions/ for local development:
 *   ALGOLIA_APP_ID=xxx
 *   ALGOLIA_ADMIN_KEY=xxx
 *   REDIS_URL=redis://...
 */

import { defineSecret } from "firebase-functions/params";

export const ALGOLIA_APP_ID = defineSecret("ALGOLIA_APP_ID");
export const ALGOLIA_ADMIN_KEY = defineSecret("ALGOLIA_ADMIN_KEY");
export const REDIS_URL = defineSecret("REDIS_URL");
export const RECAPTCHA_SECRET_KEY = defineSecret("RECAPTCHA_SECRET_KEY");

// Subscription management & Cloudinary cleanup
export const NUNULIA_SECRET_TOKEN = defineSecret("NUNULIA_SECRET_TOKEN");
export const CLOUDINARY_CLOUD_NAME = defineSecret("CLOUDINARY_CLOUD_NAME");
export const CLOUDINARY_API_KEY = defineSecret("CLOUDINARY_API_KEY");
export const CLOUDINARY_API_SECRET = defineSecret("CLOUDINARY_API_SECRET");

// Claude Haiku 4.5 — classification de catégorie pour les buyer requests
// quand le buyer choisit "Je ne sais pas trop" (cf. notify-buyer-request-match).
export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Index names
export const ALGOLIA_PRODUCTS_INDEX = "products";
export const ALGOLIA_SELLERS_INDEX = "sellers";

// Cache TTLs (seconds)
export const CACHE_TTL = {
  TRENDING: 5 * 60,         // 5 minutes
  RECOMMENDATIONS: 15 * 60, // 15 minutes
  POPULAR: 10 * 60,         // 10 minutes
  SEARCH_RESULTS: 20 * 60,  // 20 minutes (shared Redis cache — product catalog stable)
} as const;

// CORS: restrict to known origins (Firebase Hosting + local dev)
export const ALLOWED_ORIGINS = [
  "https://nunulia.com",
  "https://www.nunulia.com",
  "https://aurburundi-e2fe2.web.app",
  "https://aurburundi-e2fe2.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5173",
];

// ─── PHOTO STUDIO (Nunulia Studio) ────────────────────────────────────────
// Numéro WhatsApp provisoire (compte personnel fondateur, Burundi). Sera
// remplacé par le numéro pro LIMITEL dès qu'il sera obtenu — pour éviter un
// redéploiement, la CF photoSessionCreate lit d'abord appSettings/studio
// (Firestore) et tombe sur cette constante en fallback.
//
// Format E.164 (+ + chiffres uniquement, sans 00 ni espaces). La conversion
// vers le format wa.me (chiffres seuls) se fait dans la CF.
export const STUDIO_DEFAULT_WHATSAPP = "+25768515135";

// URL publique pour le lien magique envoyé au vendeur sur WhatsApp.
// Doit matcher ALLOWED_ORIGINS[0] (hosting prod). Pour les previews,
// utiliser firebase hosting:channel:deploy puis pointer manuellement.
export const STUDIO_PUBLIC_BASE_URL = "https://nunulia.com";
