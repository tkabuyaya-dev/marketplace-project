/**
 * NUNULIA — Firebase Service Constants & Helpers
 *
 * Shared constants, collection names, and Firestore document converters.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  getDocsFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  serverTimestamp,
  increment,
  runTransaction,
  onSnapshot,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';

import { db, auth } from '../../firebase-config';
import { User, Product } from '../../types';

// Re-export everything downstream modules need
export {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  getDocsFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  runTransaction,
  onSnapshot,
  writeBatch,
  db,
  auth,
};
export type { QueryDocumentSnapshot, Unsubscribe };

export const PRODUCTS_PAGE_SIZE = 12;
export const MAX_SEARCH_RESULTS = 20;

export const COLLECTIONS = {
  USERS:              'users',
  PRODUCTS:           'products',
  CATEGORIES:         'categories',
  SUBSCRIPTION_TIERS: 'subscriptionTiers',
  COUNTRIES:          'countries',
  // CONVERSATIONS removed — chat feature deprecated
  MESSAGES:           'messages',
  LIKES:              'likes',
  REPORTS:            'reports',
  AUDIT_LOGS:         'auditLogs',
  BANNERS:            'banners',
  NOTIFICATIONS:      'notifications',
  REVIEWS:            'reviews',
  USER_ACTIVITY:      'userActivity',
  CURRENCIES:         'currencies',
  SUBSCRIPTION_REQUESTS: 'subscriptionRequests',
  SUBSCRIPTION_PRICING:  'subscriptionPricing',
  APP_SETTINGS:          'appSettings',
  BUYER_REQUESTS:        'buyerRequests',
  BUYER_REQUEST_CONTACTS: 'buyerRequestContacts',
  BOOST_REQUESTS:        'boostRequests',
  BOOST_PRICING:         'boostPricing',
} as const;

/** Converts a Firestore document to User type */
export function docToUser(docData: any, id: string): User {
  return {
    id,
    slug:             docData.slug,
    name:             docData.name || 'Utilisateur',
    email:            docData.email || '',
    avatar:           docData.avatar || '',
    isVerified:       docData.isVerified || false,
    verificationTier: docData.verificationTier || (docData.isVerified ? 'identity' : 'none'),
    trustScore:       typeof docData.trustScore === 'number' ? docData.trustScore : undefined,
    isSuspended:      docData.isSuspended || false,
    role:             docData.role || 'buyer',
    whatsapp:         docData.whatsapp,
    joinDate:         docData.joinDate?.toMillis?.() || docData.joinDate || Date.now(),
    banner:           docData.banner,
    bio:              docData.bio,
    productCount:     docData.productCount || 0,
    sellerDetails:    docData.sellerDetails,
  };
}

/** Converts a Firestore document to Product type */
export function docToProduct(docData: any, id: string): Product {
  return {
    id,
    slug:          docData.slug,
    title:         docData.title,
    price:         docData.price,
    originalPrice: docData.originalPrice,
    description:   docData.description,
    images:        docData.images || [],
    category:      docData.category,
    subCategory:   docData.subCategory,
    rating:        docData.rating || 0,
    reviews:       docData.reviews || 0,
    seller: {
      id:        docData.sellerId,
      name:      docData.sellerName || 'Vendeur',
      email:     docData.sellerEmail || '',
      avatar:    docData.sellerAvatar || '',
      isVerified: docData.sellerIsVerified || false,
      verificationTier: docData.sellerVerificationTier || (docData.sellerIsVerified ? 'identity' : 'none'),
      role:      'seller',
      joinDate:  0,
      whatsapp:  docData.sellerWhatsapp,
      sellerDetails: (docData.sellerCommune || docData.sellerProvince)
        ? { commune: docData.sellerCommune || '', province: docData.sellerProvince || '' }
        : undefined,
    } as any,
    currency:    docData.currency || undefined,
    countryId:   docData.countryId || undefined,
    isPromoted:  docData.isPromoted || false,
    status:      docData.status,
    rejectionReason: docData.rejectionReason || '',
    resubmittedAt: docData.resubmittedAt || undefined,
    views:       docData.views || 0,
    likesCount:  docData.likesCount || 0,
    reports:     docData.reports || 0,
    createdAt:   docData.createdAt?.toMillis?.() || docData.createdAt || Date.now(),
    tags:            docData.tags || [],
    stockQuantity:   docData.stockQuantity ?? undefined,
    discountPrice:   docData.discountPrice ?? undefined,
    promotionStart:  docData.promotionStart?.toMillis?.() || docData.promotionStart || undefined,
    promotionEnd:    docData.promotionEnd?.toMillis?.() || docData.promotionEnd || undefined,
    // B2B Wholesale
    isWholesale:       docData.isWholesale || false,
    minOrderQuantity:  docData.minOrderQuantity ?? undefined,
    wholesalePrice:    docData.wholesalePrice ?? undefined,
    // Progressive image (LQIP)
    blurhash:          docData.blurhash || undefined,
    // Boost (mise en avant payante)
    isBoosted:         docData.isBoosted || false,
    boostExpiresAt:    docData.boostExpiresAt?.toMillis?.() || docData.boostExpiresAt || undefined,
  } as Product;
}
