/**
 * AURABUJA — Subscription Requests Service
 *
 * CRUD for subscription upgrade requests.
 * Sellers create requests → Admin approves/rejects → Auto-activate on approval.
 */

import {
  SubscriptionRequest, SubscriptionRequestStatus, SubscriptionPricing,
} from '../../types';
import {
  DEFAULT_SUBSCRIPTION_PRICING,
} from '../../constants';
import {
  db, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
  COLLECTIONS,
} from './constants';
import { createNotification } from './notifications';
import { updateUserSubscription } from './users';

// ── Create Subscription Request ──

export const createSubscriptionRequest = async (
  request: Omit<SubscriptionRequest, 'id' | 'createdAt' | 'updatedAt' | 'approvedBy' | 'expiresAt' | 'rejectionReason'>
): Promise<string> => {
  if (!db) throw new Error('Firebase non initialisé');

  const docRef = await addDoc(collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS), {
    ...request,
    status: 'pending',
    approvedBy: null,
    expiresAt: null,
    rejectionReason: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return docRef.id;
};

// ── Get Requests (Seller — own requests) ──

export const getMySubscriptionRequests = async (userId: string): Promise<SubscriptionRequest[]> => {
  if (!db) return [];

  const q = query(
    collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SubscriptionRequest));
};

// ── Get All Requests (Admin) ──

export const getAllSubscriptionRequests = async (
  statusFilter?: SubscriptionRequestStatus
): Promise<SubscriptionRequest[]> => {
  if (!db) return [];

  let q;
  if (statusFilter) {
    q = query(
      collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
  } else {
    q = query(
      collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SubscriptionRequest));
};

// ── Confirm Payment (Seller submits transaction ref) ──

export const confirmPayment = async (
  requestId: string,
  transactionRef: string,
): Promise<void> => {
  if (!db) return;

  await updateDoc(doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId), {
    status: 'pending_validation',
    transactionRef,
    updatedAt: Date.now(),
  });
};

// ── Approve Request (Admin) ──

export const approveSubscriptionRequest = async (
  requestId: string,
  adminId: string,
): Promise<void> => {
  if (!db) return;

  const reqDoc = await getDoc(doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId));
  if (!reqDoc.exists()) throw new Error('Demande introuvable');

  const request = { id: reqDoc.id, ...reqDoc.data() } as SubscriptionRequest;
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  // Update request
  await updateDoc(doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId), {
    status: 'approved',
    approvedBy: adminId,
    expiresAt,
    updatedAt: Date.now(),
  });

  // Activate subscription on user
  await updateUserSubscription(request.userId, {
    maxProducts: request.maxProducts,
    tierLabel: request.planLabel,
  });

  // Set expiration
  await updateDoc(doc(db, COLLECTIONS.USERS, request.userId), {
    'sellerDetails.subscriptionExpiresAt': expiresAt,
  });

  // Notify seller
  await createNotification({
    userId: request.userId,
    type: 'subscription_change',
    title: 'Abonnement activé !',
    body: `Votre plan "${request.planLabel}" est maintenant actif pour 30 jours (${request.maxProducts >= 99999 ? 'produits illimités' : request.maxProducts + ' produits max'}).`,
    read: false,
    createdAt: Date.now(),
  });
};

// ── Reject Request (Admin) ──

export const rejectSubscriptionRequest = async (
  requestId: string,
  reason: string,
): Promise<void> => {
  if (!db) return;

  const reqDoc = await getDoc(doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId));
  if (!reqDoc.exists()) throw new Error('Demande introuvable');

  const request = { id: reqDoc.id, ...reqDoc.data() } as SubscriptionRequest;

  await updateDoc(doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId), {
    status: 'rejected',
    rejectionReason: reason,
    updatedAt: Date.now(),
  });

  // Notify seller
  await createNotification({
    userId: request.userId,
    type: 'subscription_change',
    title: 'Demande d\'abonnement refusée',
    body: `Votre demande pour le plan "${request.planLabel}" a été refusée. Raison : ${reason}`,
    read: false,
    createdAt: Date.now(),
  });
};

// ── Get Subscription Pricing for a country ──

export const getSubscriptionPricing = async (countryId: string): Promise<SubscriptionPricing> => {
  if (!db) return DEFAULT_SUBSCRIPTION_PRICING[countryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];

  try {
    const docSnap = await getDoc(doc(db, COLLECTIONS.SUBSCRIPTION_PRICING, countryId));
    if (docSnap.exists()) {
      return docSnap.data() as SubscriptionPricing;
    }
  } catch {
    // Fallback to defaults
  }

  return DEFAULT_SUBSCRIPTION_PRICING[countryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
};

// ── Count pending requests (Admin badge) ──

export const countPendingRequests = async (): Promise<number> => {
  if (!db) return 0;

  const q = query(
    collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS),
    where('status', 'in', ['pending', 'pending_validation'])
  );
  const snap = await getDocs(q);
  return snap.size;
};
