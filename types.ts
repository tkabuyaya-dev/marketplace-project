export type Role = 'buyer' | 'seller' | 'admin';
export type ProductStatus = 'pending' | 'approved' | 'rejected';

// Niveaux de vérification — gradation de confiance
// 'none'     : aucune vérification
// 'phone'    : téléphone vérifié par OTP SMS (réservé Phase 4)
// 'identity' : pièces + numéros confirmés à distance par l'équipe
// 'shop'     : visite terrain effectuée par l'équipe ou un ambassadeur
export type VerificationTier = 'none' | 'phone' | 'identity' | 'shop';
export type VerificationMethod = 'phone_otp' | 'document_review' | 'field_visit';

// Structure GPS
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Country {
  id: string;
  name: string;
  code: string; // ex: BI, CD, RW
  currency: string;
  flag: string;
  isActive: boolean; // Nouveau: Pour activer/désactiver le pays
}

// Informations légales Vendeur (Burundi + Future)
export interface SellerDetails {
  cni: string;
  phone: string;
  countryId: string;
  province: string;
  commune: string;
  quartier: string;
  shopName?: string;
  shopImage?: string;
  sellerType: 'shop' | 'street' | 'online';
  locationUrl?: string;
  gps?: Coordinates;
  categories: string[];
  nif?: string;
  registryNumber?: string;
  hasNif: boolean;
  hasRegistry: boolean;
  documents?: {
    cniUrl?: string;
    nifUrl?: string;
    registryUrl?: string;
  };
  verificationStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  verificationNote?: string;
  verifiedAt?: number;              // Timestamp de la dernière approbation admin
  verificationMethod?: VerificationMethod; // Trace d'audit — comment ça a été vérifié
  maxProducts?: number;
  tierLabel?: string;
  subscriptionExpiresAt?: number;    // timestamp — 30-day expiration for paid tiers
  reminderSentForExpiry?: number;    // legacy J-3 dedup guard (kept in sync with reminderSentJ3 for backward compat)
  reminderSentJ7?: number;           // equals subscriptionExpiresAt when J-7 reminder was sent
  reminderSentJ3?: number;           // equals subscriptionExpiresAt when J-3 reminder was sent
  reminderSentJ1?: number;           // equals subscriptionExpiresAt when J-1 reminder was sent
  gracePhaseSince?: number;          // ms timestamp when downgrade phase 1 started (expiry date)
  downgradePhase?: 1 | 2 | 3;       // 1=J0-J3 products visible / 2=J3-J14 top-5 / 3=deletion scheduled
}

export interface User {
  id: string;
  slug?: string;
  name: string;
  email: string;
  avatar: string;
  isVerified: boolean;                    // Reste la source de vérité pour le badge public
  verificationTier?: VerificationTier;    // Détail du niveau — null pour anciens comptes (= 'none')
  verifiedAt?: number;                    // Timestamp de la dernière approbation admin (racine + miroir dans sellerDetails)
  verificationMethod?: VerificationMethod; // Méthode utilisée (document_review, field_visit, phone_otp)
  trustScore?: number;                    // 0-100, calculé périodiquement ou à l'affichage
  isSuspended?: boolean;
  role: Role;
  whatsapp?: string;
  joinDate: number;
  banner?: string;
  bio?: string;
  productCount?: number;
  sellerDetails?: SellerDetails;
}

export interface SubscriptionTier {
  id: string;
  min: number;
  max: number | null; // null = illimité
  label: string;
  requiresNif: boolean;
}

// Plan IDs canoniques (post-refonte 2026-06)
export type PlanId = 'free' | 'vendeur' | 'pro' | 'grossiste';

export interface PlanFeatures {
  maxProducts: number;
  canContactBuyer: boolean;        // ✅ contacter un acheteur Je Cherche (Pro + Grossiste)
  badge: 'pro' | 'grossiste' | null;
  priorityRanking: boolean;        // priorité dans la recherche
  requiresNif: boolean;            // NIF obligatoire à l'inscription
  dailyStudioSessions: number;     // 📸 Photo Studio — sessions max/jour (Free=1, Vendeur=2, Pro=3, Grossiste=5)
}

export interface Product {
  id: string;
  slug?: string;
  title: string;
  price: number;
  originalPrice?: number;
  currency?: string; // code devise (BIF, CDF, USD, etc.) — defaults to seller's country currency
  description: string;
  images: string[];
  category: string;
  subCategory?: string;
  tags?: string[];
  rating: number;
  reviews: number;
  countryId?: string;
  seller: User;
  isPromoted?: boolean;
  isSponsored?: boolean;
  status: ProductStatus;
  rejectionReason?: string;
  resubmittedAt?: number;
  resubmitCount?: number; // nombre de fois que le vendeur a resoumis ce produit (max 3)
  views: number;
  likesCount?: number;
  reports: number;
  createdAt: number;
  // Stock & Promotions
  stockQuantity?: number;
  discountPrice?: number;
  promotionStart?: number;
  promotionEnd?: number;
  // B2B Wholesale
  isWholesale?: boolean;
  minOrderQuantity?: number;
  wholesalePrice?: number;
  // Progressive image (LQIP)
  blurhash?: string;
  // Boost (mise en avant payante)
  isBoosted?: boolean;
  boostExpiresAt?: number; // timestamp ms
}

// ─── Currencies ───
export interface Currency {
  id: string;       // ex: 'BIF', 'CDF', 'USD'
  code: string;     // same as id
  name: string;     // ex: 'Franc Burundais'
  symbol: string;   // ex: 'FBu', 'FC', '$'
  countryId: string; // linked country ('bi', 'cd', etc.) or 'intl' for USD
  isActive: boolean;
}

// --- Reviews ---
export interface Review {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  productId: string;
  rating: number;
  comment: string;
  images?: string[];
  createdAt: number;
}

// --- User Activity Tracking ---
export type ActivityAction = 'view' | 'like' | 'contact';

export interface UserActivity {
  id: string;
  userId: string;
  productId: string;
  category: string;
  action: ActivityAction;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  slug: string;
  order?: number;
  subCategories: string[];
}

export enum RouteName {
  HOME = 'home',
  PRODUCT = 'product',
  SHOP = 'shop',
  SELLER_DASHBOARD = 'seller_dashboard',
  SELLER_REGISTRATION = 'seller_registration', 
  ADMIN_DASHBOARD = 'admin_dashboard',
  PROFILE = 'profile',
  LOGIN = 'login',
  PLANS = 'plans'
}

export interface NavigationState {
  route: RouteName;
  params?: any;
}

export interface ThemeColors {
  primary: string;
  accent: string;
  gradient: string;
  heroGradient: string;
}

// ─── Notifications ───
export type NotificationType =
  | 'product_approved'
  | 'product_rejected'
  | 'new_message'
  | 'subscription_change'
  | 'subscription_reminder'
  | 'boost_activated'
  | 'boost_expired'
  | 'buyer_request_match'
  | 'buyer_request_help'
  | 'buyer_request_suspended'   // Admin alert : 3 sellers ont signalé une demande
  | 'photo_session_ready'       // 📸 Photo Studio — photos traitées, vendeur peut publier
  | 'system';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  data?: {
    productSlug?: string;
    sellerSlug?: string;
    link?: string;
  };
}

export interface SearchFilters {
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sort: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
  category?: string;
  sellerId?: string;
  inStock?: boolean;
  countryId?: string;
}

// ─── Subscription Requests ───
export type SubscriptionPeriod = '1m' | '3m' | '12m';
export type SubscriptionRequestStatus =
  | 'pending'             // créée, paiement non confirmé par le vendeur
  | 'pending_validation'  // vendeur a soumis sa référence, attente admin
  | 'approved'            // admin a validé
  | 'rejected'            // admin a refusé (rejectionReason)
  | 'cancelled';          // vendeur a annulé lui-même (avant approbation)

export interface SubscriptionRequest {
  id: string;
  userId: string;
  sellerName: string;
  countryId: string;
  planId: string;
  planLabel: string;
  amount: number;
  currency: string;
  status: SubscriptionRequestStatus;
  transactionRef: string | null;
  proofUrl: string | null;
  createdAt: number;
  updatedAt: number;
  approvedBy: string | null;
  expiresAt: number | null;
  rejectionReason: string | null;
  maxProducts: number;
  receiptUrl?: string | null;
  period?: SubscriptionPeriod;
  // ─── Lifecycle complet (post-refonte 2026-06) ─────────────────────────────
  cancelledAt?: number | null;     // ms — set par CF cancelSubscriptionRequest
  cancelledBy?: string | null;     // userId du seller (auto-cancellation only)
  reviewedAt?: number | null;      // ms — set par approve/reject (action admin)
  modifiedAt?: number | null;      // ms — set par CF modifySubscriptionRequest
  modifiedFrom?: {                 // snapshot des valeurs précédentes (audit utile)
    planId: string;
    planLabel?: string;
    period?: SubscriptionPeriod;
    amount?: number;
  } | null;
  isUpgrade?: boolean;             // true si vendeur déjà sur un plan payant actif
}

/**
 * Sous-collection subscriptionRequests/{id}/history/{eventId} — traçabilité
 * complète du cycle de vie. Toujours écrite par CF admin SDK (write=false côté
 * client dans les rules).
 */
export type SubscriptionHistoryAction =
  | 'created'      // request créée (status=pending)
  | 'submitted'    // vendeur a confirmé son paiement (pending → pending_validation)
  | 'modified'     // vendeur a changé plan/period via CF modifySubscriptionRequest
  | 'cancelled'    // vendeur a annulé via CF cancelSubscriptionRequest
  | 'approved'     // admin a approuvé
  | 'rejected';    // admin a refusé

export interface SubscriptionHistoryEvent {
  id: string;
  action: SubscriptionHistoryAction;
  by: { userId: string; role: 'seller' | 'admin' | 'system' };
  payload?: {
    planId?: string;
    planLabel?: string;
    period?: SubscriptionPeriod;
    amount?: number;
    transactionRef?: string | null;
    proofUrl?: string | null;
    reason?: string;        // rejet / annulation
    previous?: { planId: string; planLabel?: string; period?: SubscriptionPeriod; amount?: number };
  };
  timestamp: number;
}

export interface PaymentMethod {
  name: string;
  number: string;
  icon: string;
}

// ─── Buyer Requests ("Je Cherche") ───
export type BuyerRequestStatus = 'active' | 'fulfilled' | 'expired' | 'deleted' | 'suspended';

/** Raison d'un signalement community. */
export type BuyerRequestFlagReason = 'spam' | 'illegal' | 'scam' | 'fake_number' | 'other';

export interface BuyerRequestFlag {
  id: string;
  requestId: string;
  sellerId: string;
  reason: BuyerRequestFlagReason;
  comment?: string;       // Optionnel — pour reason='other'
  createdAt: number;
}

export interface BuyerRequest {
  id: string;
  title: string;           // Produit/service recherché
  description?: string;    // Détails optionnels
  countryId: string;       // Pays
  province: string;        // Province / Région
  city: string;            // Commune / Ville
  category?: string;       // Catégorie (optionnel)
  budget?: number;         // Budget (optionnel)
  budgetCurrency?: string; // Devise du budget
  imageUrl?: string;       // Photo (optionnel, Cloudinary)
  whatsapp: string;        // Numéro WhatsApp acheteur
  buyerId?: string;        // UID Firebase (null si anonyme)
  buyerName: string;       // Prénom ou "Acheteur anonyme"
  status: BuyerRequestStatus;
  createdAt: number;
  expiresAt: number;       // createdAt + 7 jours
  viewCount: number;
  contactCount: number;    // Clics WhatsApp
  // Modération Claude Haiku 4.5 (cf. functions/src/moderate-buyer-request.ts).
  // Si true, demande publiée mais à vérifier par l'admin (verdict "borderline").
  // Les "reject" ne sont jamais persistés (HttpsError côté CF, audit dans Cloud Logs).
  moderationFlag?: boolean;
  moderationReason?: string;
}

export interface BuyerRequestContact {
  id: string;
  requestId: string;
  sellerId: string;
  sellerTierId: string;
  timestamp: number;
}

export interface SubscriptionPricing {
  prices: Record<string, number>; // tierId → price in local currency
  currency: string;
}

// ─── Boost Requests (mise en avant payante 7 jours) ───
export type BoostRequestStatus = 'pending' | 'pending_validation' | 'approved' | 'rejected';

export interface BoostRequest {
  id: string;
  userId: string;
  sellerName: string;
  countryId: string;
  productId: string;
  productTitle: string;
  amount: number;
  currency: string;
  status: BoostRequestStatus;
  transactionRef: string | null;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
  approvedBy: string | null;
  boostStartAt: number | null;
  boostExpiresAt: number | null;
}

export interface BoostPricing {
  amount: number;   // prix pour 7 jours
  currency: string; // ex: 'BIF', 'CDF', 'USD'
}

// ─── Photo Studio (Nunulia Studio) ───────────────────────────────────────────
// Le vendeur démarre une session, envoie ses photos brutes sur WhatsApp,
// l'équipe Nunulia les retouche manuellement (PhotoRoom Max) puis renvoie un
// lien magique /studio/:sessionId où le vendeur publie son produit en
// remplissant un formulaire pré-rempli par Claude Haiku Vision.
//
// Lifecycle (transitions toutes opérées par CFs admin SDK — voir
// functions/src/photo-session-*.ts) :
//   waiting_photos → processing → ready → published
//   waiting_photos | processing | ready → expired  (cron 48h TTL)

export type PhotoSessionStatus =
  | 'waiting_photos'   // session créée, photos pas encore reçues sur WhatsApp
  | 'processing'       // admin a démarré le traitement PhotoRoom
  | 'ready'            // photos traitées uploadées, vendeur peut publier
  | 'published'        // produit publié, productId stocké
  | 'expired';         // 48h écoulées sans publication

/**
 * Pré-remplissage IA depuis les photos traitées (Claude Haiku 4.5 Vision).
 * Calculé par photo-session-attach.ts au moment où l'admin uploade les
 * photos traitées. Affiché en pré-rempli sur /studio/:id avec un indicateur
 * "Suggéré par IA — vérifiez". Vendeur peut tout corriger librement.
 */
export interface PhotoSessionVisionSuggestions {
  title?: string;                                          // 4-6 mots max
  category?: string;                                       // category slug (FK)
  condition?: 'new' | 'good' | 'fair';                     // état apparent
  characteristics?: string[];                              // 3-5 puces visibles
}

export interface PhotoSession {
  id: string;                              // sessionId 6 chars alphanum (ex: AM7K2P)
  vendorId: string;                        // owner — Rules: lecture seller propre + admin
  vendorName: string;                      // shopName dénormalisé pour file admin
  vendorPhone: string;                     // pour fallback admin si seller perd l'ID
  countryId: string;
  plan: PlanId;                            // snapshot du plan à la création (pour métriques)
  status: PhotoSessionStatus;
  createdAt: number;                       // ms — serverTimestamp à la création
  expiresAt: number;                       // createdAt + STUDIO_SESSION_TTL_MS
  rawPhotoCount?: number;                  // saisi optionnellement par admin (stats)
  processedUrls: string[];                 // Cloudinary URLs — max STUDIO_MAX_PHOTOS
  visionSuggestions?: PhotoSessionVisionSuggestions;
  attachedAt?: number;                     // ms — admin a uploadé les photos
  publishedProductId?: string | null;      // set après publishFromStudio
  publishedAt?: number | null;
  internalNote?: string;                   // notes admin uniquement (jamais lu par seller)
  shareCardUrl?: string;                   // carte 1080×1920 avant/après (Cloudinary)
  shareCaption?: string;                   // texte Haiku pour partage WhatsApp Status
}

/**
 * Sous-collection photoSessions/{id}/events/{eventId} — traçabilité du cycle.
 * Toujours écrite par CF admin SDK. Rules client : write=false.
 */
export type PhotoSessionEventAction =
  | 'created'              // vendeur a démarré la session
  | 'processing_started'   // admin a cliqué "marquer en traitement"
  | 'attached'             // admin a uploadé les photos traitées
  | 'vision_filled'        // Claude Haiku Vision a rempli les suggestions
  | 'published'            // vendeur a publié le produit
  | 'expired';             // cron a expiré la session

export interface PhotoSessionEvent {
  id: string;
  action: PhotoSessionEventAction;
  by: { userId: string; role: 'seller' | 'admin' | 'system' };
  payload?: Record<string, unknown>;
  timestamp: number;
}