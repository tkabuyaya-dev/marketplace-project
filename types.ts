export type Role = 'buyer' | 'seller' | 'admin';
export type ProductStatus = 'pending' | 'approved' | 'rejected';

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
  maxProducts?: number;
  tierLabel?: string;
  subscriptionExpiresAt?: number; // timestamp — 30-day expiration for paid tiers
}

export interface User {
  id: string;
  slug?: string;
  name: string;
  email: string;
  avatar: string;
  isVerified: boolean;
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
  // Auction
  isAuction?: boolean;
  auctionEndTime?: number;
  startingBid?: number;
  currentBid?: number;
  currentBidderId?: string;
  bidCount?: number;
  // Progressive image (LQIP)
  blurhash?: string;
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
export type SubscriptionRequestStatus = 'pending' | 'pending_validation' | 'approved' | 'rejected';

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
}

export interface PaymentMethod {
  name: string;
  number: string;
  icon: string;
}

// ─── Buyer Requests ("Je Cherche") ───
export type BuyerRequestStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';

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