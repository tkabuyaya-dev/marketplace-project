/**
 * NUNULIA — Subscription Requests Service
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
  query, where, orderBy, limit, serverTimestamp, onSnapshot, runTransaction,
  COLLECTIONS,
  Unsubscribe,
} from './constants';
import { createNotification } from './notifications';

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

/**
 * Confirms a payment by attaching the transaction reference (and optionally
 * a Cloudinary proof URL) to the request.
 *
 * Idempotency: wrapped in a transaction that only writes if the request is
 * still in `pending` state. A second click does not duplicate writes — it
 * either no-ops (if already submitted with same ref) or throws (if a different
 * ref is submitted on the same request, which would mean tampering).
 *
 * Trim is applied here so the value stored matches what the admin will see.
 */
export const confirmPayment = async (
  requestId: string,
  transactionRef: string,
  proofUrl?: string | null,
): Promise<void> => {
  if (!db) return;

  const trimmedRef = transactionRef.trim();
  if (trimmedRef.length < 4) throw new Error('Référence trop courte');

  const requestRef = doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId);
  const normalizedProof: string | null =
    typeof proofUrl === 'string' && proofUrl.trim().length > 0 ? proofUrl.trim() : null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists()) throw new Error('Demande introuvable');

    const data = snap.data() as SubscriptionRequest;

    // Already submitted with the same ref → no-op (idempotent on retry/double-click)
    if (
      data.status === 'pending_validation' &&
      data.transactionRef === trimmedRef &&
      (data.proofUrl ?? null) === normalizedProof
    ) {
      return;
    }

    // Already moved past pending → cannot mutate
    if (data.status !== 'pending') {
      throw new Error('Cette demande ne peut plus être modifiée');
    }

    tx.update(requestRef, {
      status: 'pending_validation',
      transactionRef: trimmedRef,
      proofUrl: normalizedProof,
      updatedAt: Date.now(),
    });
  });
};

// ── Approve Request (Admin) ──

/**
 * Approves a subscription request atomically.
 *
 * All Firestore writes (request status, user subscription, expiration) happen
 * in a single transaction. If any write fails the entire operation rolls back,
 * preventing partial state (e.g. tier upgraded but expiration not set).
 *
 * Idempotency: throws if the request is already approved/rejected.
 *
 * Notification is sent AFTER the transaction commits (notifications are
 * non-critical and should not block the financial operation).
 */
export const approveSubscriptionRequest = async (
  requestId: string,
  adminId: string,
): Promise<void> => {
  if (!db) return;

  const requestRef = doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId);
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  // Capture data needed for the post-commit notification
  let notifPayload: { userId: string; planLabel: string; maxProducts: number } | null = null;

  await runTransaction(db, async (tx) => {
    const reqSnap = await tx.get(requestRef);
    if (!reqSnap.exists()) throw new Error('Demande introuvable');

    const request = { id: reqSnap.id, ...reqSnap.data() } as SubscriptionRequest;

    // Idempotency guard — never re-approve a finalized request
    if (request.status === 'approved') throw new Error('Demande déjà approuvée');
    if (request.status === 'rejected') throw new Error('Demande déjà refusée');

    const userRef = doc(db!, COLLECTIONS.USERS, request.userId);

    // 1. Mark request approved
    tx.update(requestRef, {
      status: 'approved',
      approvedBy: adminId,
      expiresAt,
      updatedAt: Date.now(),
    });

    // 2. Activate subscription + set expiration on user (single write).
    //    All reminder dedup guards are reset so the next cycle can fire fresh
    //    J-7/J-3/J-1 notifications.
    tx.update(userRef, {
      'sellerDetails.maxProducts': request.maxProducts,
      'sellerDetails.tierLabel': request.planLabel,
      'sellerDetails.subscriptionExpiresAt': expiresAt,
      'sellerDetails.reminderSentForExpiry': null, // legacy guard
      'sellerDetails.reminderSentJ7': null,
      'sellerDetails.reminderSentJ3': null,
      'sellerDetails.reminderSentJ1': null,
    });

    notifPayload = {
      userId: request.userId,
      planLabel: request.planLabel,
      maxProducts: request.maxProducts,
    };
  });

  // Post-commit: notification (non-critical, best-effort)
  if (notifPayload) {
    const { userId, planLabel, maxProducts } = notifPayload;
    try {
      await createNotification({
        userId,
        type: 'subscription_change',
        title: 'Abonnement activé !',
        body: `Votre plan "${planLabel}" est maintenant actif pour 30 jours (${maxProducts >= 99999 ? 'produits illimités' : maxProducts + ' produits max'}).`,
        read: false,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.warn('[approveSubscriptionRequest] Notification failed (subscription still active):', err);
    }
  }
};

// NOTE: rejectSubscriptionRequest moved to Cloud Function `rejectSubscription`
// (functions/src/reject-subscription.ts). Audit logs require admin SDK writes,
// which clients cannot perform — see firestore.rules `auditLogs` (write: false).

// ── Get Subscription Pricing for a country ──

export const getSubscriptionPricing = async (countryId: string): Promise<SubscriptionPricing> => {
  const fallback = DEFAULT_SUBSCRIPTION_PRICING[countryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
  if (!db) return fallback;

  try {
    const docSnap = await getDoc(doc(db, COLLECTIONS.SUBSCRIPTION_PRICING, countryId));
    if (docSnap.exists()) {
      return docSnap.data() as SubscriptionPricing;
    }
    // Seed Firestore with defaults so admin edits persist
    await setDoc(doc(db, COLLECTIONS.SUBSCRIPTION_PRICING, countryId), fallback);
  } catch {
    // Fallback to defaults
  }

  return fallback;
};

/** Real-time listener for subscription pricing — bypasses persistentLocalCache staleness */
export const subscribeToSubscriptionPricing = (
  countryId: string,
  callback: (pricing: SubscriptionPricing) => void,
): Unsubscribe => {
  const fallback = DEFAULT_SUBSCRIPTION_PRICING[countryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
  if (!db) {
    callback(fallback);
    return () => {};
  }
  return onSnapshot(doc(db, COLLECTIONS.SUBSCRIPTION_PRICING, countryId), (snap) => {
    if (snap.exists()) {
      callback(snap.data() as SubscriptionPricing);
    } else {
      callback(fallback);
    }
  }, () => {
    callback(fallback);
  });
};

// ── Subscribe to Seller's Requests (real-time) ──

export const subscribeToMyRequests = (
  userId: string,
  callback: (requests: SubscriptionRequest[]) => void,
): Unsubscribe => {
  if (!db) { callback([]); return () => {}; }

  const q = query(
    collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SubscriptionRequest)));
  }, (err) => {
    console.error('[Subscriptions] subscribeToMyRequests error:', err.message);
    callback([]);
  });
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
