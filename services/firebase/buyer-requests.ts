/**
 * NUNULIA — Buyer Requests Service ("Je Cherche")
 *
 * Handles creation, reading, tracking and moderation of buyer demand requests.
 * - Buyers (anonymous or logged-in) post needs
 * - All sellers can browse requests
 * - Only Pro / Grossiste sellers can contact via WhatsApp
 *   (source de vérité : utils/planFeatures.ts)
 */

import {
  BuyerRequest,
  BuyerRequestContact,
  BuyerRequestStatus,
  BuyerRequestFlag,
  BuyerRequestFlagReason,
} from '../../types';
import { featuresForLabel } from '../../utils/planFeatures';
import {
  db, collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, increment,
  COLLECTIONS,
} from './constants';
import type { QueryDocumentSnapshot } from './constants';
import { getFirebaseFunctions } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
export const PAGE_SIZE = 20;

// ─── Converters ───────────────────────────────────────────────────────────────

function docToBuyerRequest(data: any, id: string): BuyerRequest {
  return {
    id,
    title:            data.title || '',
    description:      data.description || undefined,
    countryId:        data.countryId || '',
    province:         data.province || '',
    city:             data.city || '',
    category:         data.category || undefined,
    budget:           data.budget ?? undefined,
    budgetCurrency:   data.budgetCurrency || undefined,
    imageUrl:         data.imageUrl || undefined,
    whatsapp:         data.whatsapp || '',
    buyerId:          data.buyerId || undefined,
    buyerName:        data.buyerName || 'Acheteur',
    status:           data.status || 'active',
    createdAt:        data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
    expiresAt:        data.expiresAt?.toMillis?.() || data.expiresAt || Date.now() + SEVEN_DAYS_MS,
    viewCount:        data.viewCount || 0,
    contactCount:     data.contactCount || 0,
    moderationFlag:   data.moderationFlag === true ? true : undefined,
    moderationReason: data.moderationReason || undefined,
  };
}

// ─── Rate Limit Check ─────────────────────────────────────────────────────────

/**
 * Returns the number of active requests posted in the last 24h by a WhatsApp number.
 * Used to enforce the max 3 requests/day rule.
 */
export async function getRecentRequestCountByWhatsApp(whatsapp: string): Promise<number> {
  if (!db) return 0;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUESTS),
    where('whatsapp', '==', whatsapp),
    where('createdAt', '>=', since),
    where('status', 'in', ['active', 'fulfilled']),
  );
  const snap = await getDocs(q);
  return snap.size;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateBuyerRequestData {
  title: string;
  description?: string;
  countryId: string;
  province: string;
  city: string;
  category?: string;
  budget?: number;
  budgetCurrency?: string;
  imageUrl?: string;
  whatsapp: string;
  buyerId?: string;
  buyerName: string;
}

export async function createBuyerRequest(data: CreateBuyerRequestData): Promise<string> {
  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  ⚠️  NE PAS MODIFIER — FIX CRITIQUE iOS Safari                          ║
  // ║                                                                          ║
  // ║  Cette fonction DOIT passer par la Cloud Function `submitBuyerRequest`.  ║
  // ║  NE PAS remplacer par un addDoc() direct vers Firestore.                 ║
  // ║                                                                          ║
  // ║  Raison : sur iOS Safari (ITP), le SDK Firebase JS encode Date.now()     ║
  // ║  en double_value protobuf au lieu d'integer_value. Les règles Firestore  ║
  // ║  rejettent alors l'écriture → "Missing or insufficient permissions".     ║
  // ║  L'Admin SDK côté serveur bypasse les rules et génère le timestamp       ║
  // ║  server-side → fonctionne sur iOS, Android et tout navigateur.           ║
  // ║                                                                          ║
  // ║  Fix validé en production le 2026-04-14. Ne pas toucher.                 ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions not initialized');

  const fn = httpsCallable<CreateBuyerRequestData, { id: string }>(fns, 'submitBuyerRequest');
  const result = await fn(data);
  return result.data.id;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export interface BuyerRequestFilters {
  countryId?: string;
  province?: string;
  city?: string;
  category?: string;
  status?: BuyerRequestStatus;
}

export async function getBuyerRequests(
  filters: BuyerRequestFilters = {},
  lastDoc?: QueryDocumentSnapshot,
): Promise<{ requests: BuyerRequest[]; lastDoc: QueryDocumentSnapshot | null }> {
  if (!db) return { requests: [], lastDoc: null };

  const constraints: any[] = [
    where('status', '==', filters.status || 'active'),
    orderBy('createdAt', 'desc'),
  ];

  if (filters.countryId) constraints.push(where('countryId', '==', filters.countryId));
  if (filters.province)  constraints.push(where('province', '==', filters.province));
  if (filters.city)      constraints.push(where('city', '==', filters.city));
  if (filters.category)  constraints.push(where('category', '==', filters.category));

  if (lastDoc) constraints.push(startAfter(lastDoc));
  constraints.push(limit(PAGE_SIZE));

  const q = query(collection(db, COLLECTIONS.BUYER_REQUESTS), ...constraints);
  const snap = await getDocs(q);
  const now = Date.now();
  // Filter out requests whose expiresAt has passed but the cron hasn't run yet (runs at 03:00 UTC once/day)
  const requests = snap.docs
    .map(d => docToBuyerRequest(d.data(), d.id))
    .filter(r => r.expiresAt > now);
  const last = snap.docs[snap.docs.length - 1] ?? null;

  return { requests, lastDoc: last };
}

export async function getBuyerRequestById(id: string): Promise<BuyerRequest | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, id));
  if (!snap.exists()) return null;
  return docToBuyerRequest(snap.data(), snap.id);
}

/** Stats for virality display (today's active + total fulfilled) */
export async function getBuyerRequestStats(): Promise<{ todayCount: number; fulfilledCount: number }> {
  if (!db) return { todayCount: 0, fulfilledCount: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySnap, fulfilledSnap] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.BUYER_REQUESTS),
      where('status', '==', 'active'),
      where('createdAt', '>=', todayStart.getTime()),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.BUYER_REQUESTS),
      where('status', '==', 'fulfilled'),
    )),
  ]);

  return {
    todayCount:    todaySnap.size,
    fulfilledCount: fulfilledSnap.size,
  };
}

/** Get all requests posted by a specific buyer (by buyerId or whatsapp) */
export async function getMyBuyerRequests(buyerId?: string, whatsapp?: string): Promise<BuyerRequest[]> {
  if (!db || (!buyerId && !whatsapp)) return [];

  const q = buyerId
    ? query(collection(db, COLLECTIONS.BUYER_REQUESTS), where('buyerId', '==', buyerId), orderBy('createdAt', 'desc'), limit(10))
    : query(collection(db, COLLECTIONS.BUYER_REQUESTS), where('whatsapp', '==', whatsapp), orderBy('createdAt', 'desc'), limit(10));

  const snap = await getDocs(q);
  return snap.docs.map(d => docToBuyerRequest(d.data(), d.id));
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function markRequestFulfilled(requestId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, requestId), { status: 'fulfilled' });
}

export async function deleteBuyerRequest(requestId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, requestId), { status: 'deleted' });
}

export async function adminDeleteBuyerRequest(requestId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, requestId));
}

/** Admin : marque une demande borderline comme validée (clear le flag). */
export async function clearModerationFlag(requestId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, requestId), {
    moderationFlag: false,
  });
}

// ─── Health Dashboard Queries ─────────────────────────────────────────────────

/** Récupère toutes les demandes des N derniers jours (admin only). */
export async function getRecentRequestsForHealth(daysBack: number): Promise<BuyerRequest[]> {
  if (!db) return [];
  const since = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUESTS),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
    limit(2000),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToBuyerRequest(d.data(), d.id));
}

// ─── Community Flag (signalement seller) ─────────────────────────────────────

/**
 * Appelle la CF flagBuyerRequest pour signaler une demande suspecte.
 * Idempotent côté serveur (1 flag max par seller/demande).
 */
export async function flagBuyerRequest(
  requestId: string,
  reason: BuyerRequestFlagReason,
  comment?: string,
): Promise<{ ok: boolean; flagCount: number | null; suspended?: boolean; alreadyHandled?: boolean }> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<
    { requestId: string; reason: string; comment?: string },
    { ok: boolean; flagCount: number | null; suspended?: boolean; alreadyHandled?: boolean }
  >(fns, 'flagBuyerRequest');
  const res = await fn({ requestId, reason, comment });
  return res.data;
}

/** Admin : récupère tous les flags pour une demande (pour la voir dans /admin). */
export async function getFlagsForRequest(requestId: string): Promise<BuyerRequestFlag[]> {
  if (!db) return [];
  const q = query(
    collection(db, 'buyerRequestFlags'),
    where('requestId', '==', requestId),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      requestId: data.requestId || '',
      sellerId: data.sellerId || '',
      reason: (data.reason || 'other') as BuyerRequestFlagReason,
      comment: data.comment || undefined,
      createdAt: data.createdAt || 0,
    };
  });
}

/** Admin : restaure une demande suspendue (status → active). */
export async function restoreBuyerRequest(requestId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, requestId), {
    status: 'active',
  });
}

/** Récupère tous les contacts WhatsApp des N derniers jours (admin only). */
export async function getRecentContactsForHealth(daysBack: number): Promise<BuyerRequestContact[]> {
  if (!db) return [];
  const since = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUEST_CONTACTS),
    where('timestamp', '>=', since),
    orderBy('timestamp', 'desc'),
    limit(5000),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      requestId: data.requestId || '',
      sellerId: data.sellerId || '',
      sellerTierId: data.sellerTierId || '',
      timestamp: data.timestamp || 0,
    };
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAllBuyerRequestsForAdmin(
  statusFilter: BuyerRequestStatus | 'all' = 'all',
  lastDoc?: QueryDocumentSnapshot,
): Promise<{ requests: BuyerRequest[]; lastDoc: QueryDocumentSnapshot | null }> {
  if (!db) return { requests: [], lastDoc: null };

  const constraints: any[] = [orderBy('createdAt', 'desc')];
  if (statusFilter !== 'all') constraints.push(where('status', '==', statusFilter));
  if (lastDoc) constraints.push(startAfter(lastDoc));
  constraints.push(limit(50));

  const q = query(collection(db, COLLECTIONS.BUYER_REQUESTS), ...constraints);
  const snap = await getDocs(q);
  return {
    requests: snap.docs.map(d => docToBuyerRequest(d.data(), d.id)),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

// ─── WhatsApp Contact Tracking ────────────────────────────────────────────────

/**
 * Records a WhatsApp click from a seller, increments contactCount.
 * Returns the unmasked WhatsApp number.
 */
export async function trackWhatsAppContact(
  requestId: string,
  sellerId: string,
  sellerTierId: string,
): Promise<void> {
  if (!db) return;

  await Promise.all([
    // Increment contactCount on the request
    updateDoc(doc(db, COLLECTIONS.BUYER_REQUESTS, requestId), {
      contactCount: increment(1),
    }),
    // Record the contact event
    addDoc(collection(db, COLLECTIONS.BUYER_REQUEST_CONTACTS), {
      requestId,
      sellerId,
      sellerTierId,
      timestamp: Date.now(),
    } satisfies Omit<BuyerRequestContact, 'id'>),
  ]);
}

// ─── Plan Eligibility ─────────────────────────────────────────────────────────

/**
 * Returns true if the seller's current (non-expired) plan allows WhatsApp contact.
 * Single source of truth : utils/planFeatures.ts (PLAN_FEATURES[id].canContactBuyer).
 * Plans éligibles : Pro + Grossiste (inclus aliases legacy Business Pro / Élite /
 * Grossiste Illimité). Cf. planFeatures.ts pour le mapping complet.
 */
export function canContactBuyer(sellerDetails?: {
  tierLabel?: string;
  maxProducts?: number;
  subscriptionExpiresAt?: number;
}): boolean {
  if (!sellerDetails) return false;
  const { tierLabel, maxProducts = 5, subscriptionExpiresAt } = sellerDetails;

  // Check subscription not expired
  if (subscriptionExpiresAt && Date.now() > subscriptionExpiresAt) return false;

  // Source de vérité : PLAN_FEATURES
  if (featuresForLabel(tierLabel).canContactBuyer) return true;

  // Fallback robustesse : maxProducts ≥ 100 = Pro/Grossiste même si tierLabel incohérent
  return (maxProducts ?? 0) >= 100;
}
