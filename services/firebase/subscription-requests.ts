/**
 * NUNULIA — Subscription Requests Service
 *
 * CRUD for subscription upgrade requests.
 * Sellers create requests → Admin approves/rejects → Auto-activate on approval.
 */

import {
  SubscriptionRequest, SubscriptionRequestStatus, SubscriptionPricing, SubscriptionPeriod,
  SubscriptionHistoryEvent,
} from '../../types';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../firebase-config';

function periodToDurationMs(period?: SubscriptionPeriod | string): number {
  if (period === '3m')  return 90  * 24 * 60 * 60 * 1000;
  if (period === '12m') return 365 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000; // default 1m
}

function periodLabel(period?: SubscriptionPeriod | string): string {
  if (period === '3m')  return '3 mois';
  if (period === '12m') return '12 mois';
  return '30 jours';
}
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

/**
 * Crée une demande d'abonnement.
 *
 * Détection automatique `isUpgrade` : si le vendeur a déjà un plan payant
 * actif (subscriptionExpiresAt dans le futur), la demande est marquée
 * `isUpgrade: true`. Permet à l'admin de différencier "NOUVEAU" vs "UPGRADE"
 * dans la file de validation. Le plan actif reste actif jusqu'à approbation.
 */
export const createSubscriptionRequest = async (
  request: Omit<SubscriptionRequest, 'id' | 'createdAt' | 'updatedAt' | 'approvedBy' | 'expiresAt' | 'rejectionReason'>
): Promise<string> => {
  if (!db) throw new Error('Firebase non initialisé');

  // Auto-détection isUpgrade : lecture du profil seller pour vérifier
  // s'il a déjà un plan payant non expiré.
  let isUpgrade = false;
  try {
    const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, request.userId));
    if (userSnap.exists()) {
      const sellerDetails = (userSnap.data() as any)?.sellerDetails;
      const expiresAt = sellerDetails?.subscriptionExpiresAt;
      const maxProducts = sellerDetails?.maxProducts ?? 0;
      // Plan payant = maxProducts > 5 ET non expiré
      if (maxProducts > 5 && typeof expiresAt === 'number' && expiresAt > Date.now()) {
        isUpgrade = true;
      }
    }
  } catch {
    // Best-effort — si la lecture échoue, on crée la demande sans flag (défaut sûr).
  }

  const docRef = await addDoc(collection(db, COLLECTIONS.SUBSCRIPTION_REQUESTS), {
    ...request,
    status: 'pending',
    approvedBy: null,
    expiresAt: null,
    rejectionReason: null,
    isUpgrade,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // P4 (Lot 4) : write-after rate-limit guard. Le rule sur create exige que
  // lastSubRequestCreatedAt soit antérieur de >60s à la prochaine création.
  // Best-effort : si l'update échoue, la rate-limit est juste désactivée pour
  // ce vendeur jusqu'au prochain create réussi. Pas bloquant.
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, request.userId), {
      'sellerDetails.lastSubRequestCreatedAt': Date.now(),
    });
  } catch {
    // Non bloquant — la demande est créée, le rate-limit deviendra effectif
    // au prochain update réussi des sellerDetails.
  }

  return docRef.id;
};

// ── Lifecycle actions via Cloud Functions ──

/**
 * Annule la demande du vendeur. Statuts autorisés : `pending`, `pending_validation`.
 * Idempotent : retour `{ ok, alreadyCancelled }` si déjà annulée.
 */
export async function cancelMyRequest(
  requestId: string,
): Promise<{ ok: boolean; alreadyCancelled?: boolean }> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<
    { requestId: string },
    { ok: boolean; alreadyCancelled?: boolean }
  >(fns, 'cancelSubscriptionRequest');
  const res = await fn({ requestId });
  return res.data;
}

/**
 * Modifie la demande du vendeur (plan / période). Statut autorisé : `pending`.
 * Montant recalculé côté serveur. transactionRef/proofUrl réinitialisés.
 */
export async function modifyMyRequest(
  requestId: string,
  payload: { planId: string; period: SubscriptionPeriod },
): Promise<{ ok: boolean; newAmount: number; newCurrency: string; newPlanLabel: string }> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<
    { requestId: string; planId: string; period: SubscriptionPeriod },
    { ok: boolean; newAmount: number; newCurrency: string; newPlanLabel: string }
  >(fns, 'modifySubscriptionRequest');
  const res = await fn({ requestId, planId: payload.planId, period: payload.period });
  return res.data;
}

// ── History (sous-collection) ──

/** Lit l'historique d'une demande (seller pour la sienne, admin pour toutes). */
export async function getSubscriptionRequestHistory(
  requestId: string,
): Promise<SubscriptionHistoryEvent[]> {
  if (!db) return [];
  const histRef = collection(
    db,
    COLLECTIONS.SUBSCRIPTION_REQUESTS,
    requestId,
    COLLECTIONS.SUBSCRIPTION_HISTORY,
  );
  const q = query(histRef, orderBy('timestamp', 'desc'), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SubscriptionHistoryEvent));
}

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
 * @deprecated Lot 4 P1 (2026-06) — l'approbation passe désormais ENTIÈREMENT
 * par la CF `approveRenewal` qui fait tout en une transaction admin SDK
 * atomique (request + user + history + audit + receipt + product reactivation).
 *
 * Cette fonction reste exportée comme fallback d'urgence si la CF est
 * indisponible (panne réseau, quota dépassé). À ne plus utiliser dans le code
 * normal — voir `pages/admin/Subscriptions.tsx#handleApproveRequest`.
 *
 * Approves a subscription request atomically. All Firestore writes (request
 * status, user subscription, expiration) happen in a single transaction.
 * Idempotency: throws if the request is already approved/rejected.
 */
export const approveSubscriptionRequest = async (
  requestId: string,
  adminId: string,
): Promise<void> => {
  if (!db) return;

  const requestRef = doc(db, COLLECTIONS.SUBSCRIPTION_REQUESTS, requestId);

  // Capture data needed for the post-commit notification
  let notifPayload: { userId: string; planLabel: string; maxProducts: number; period?: SubscriptionPeriod } | null = null;

  await runTransaction(db, async (tx) => {
    const reqSnap = await tx.get(requestRef);
    if (!reqSnap.exists()) throw new Error('Demande introuvable');

    const request = { id: reqSnap.id, ...reqSnap.data() } as SubscriptionRequest;

    // Idempotency guard — never re-approve a finalized request
    if (request.status === 'approved') throw new Error('Demande déjà approuvée');
    if (request.status === 'rejected') throw new Error('Demande déjà refusée');

    const expiresAt = Date.now() + periodToDurationMs(request.period);
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
      'sellerDetails.gracePhaseSince': null,
      'sellerDetails.downgradePhase': null,
    });

    notifPayload = {
      userId: request.userId,
      planLabel: request.planLabel,
      maxProducts: request.maxProducts,
      period: request.period,
    };
  });

  // Post-commit: notification (non-critical, best-effort)
  if (notifPayload) {
    const { userId, planLabel, maxProducts, period } = notifPayload;
    try {
      await createNotification({
        userId,
        type: 'subscription_change',
        title: 'Abonnement activé !',
        body: `Votre plan "${planLabel}" est maintenant actif pour ${periodLabel(period)} (${maxProducts >= 99999 ? 'produits illimités' : maxProducts + ' produits max'}).`,
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

/** Admin: persist updated pricing for a country (overwrites entire document) */
export const updateSubscriptionPricing = async (
  countryId: string,
  pricing: SubscriptionPricing,
): Promise<void> => {
  if (!db) throw new Error('Firebase non initialisé');
  await setDoc(doc(db, COLLECTIONS.SUBSCRIPTION_PRICING, countryId), pricing);
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
