/**
 * NUNULIA — Boost Requests Service
 *
 * Gère les demandes de mise en avant payante (7 jours).
 * Flux : vendeur crée → vendeur confirme paiement → admin active
 *
 * Calqué sur subscription-requests.ts pour cohérence.
 */

import { BoostRequest, BoostRequestStatus, BoostPricing } from '../../types';
import { DEFAULT_BOOST_PRICING } from '../../constants';
import {
  db, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot,
  COLLECTIONS,
  Unsubscribe,
  docToProduct,
} from './constants';
import type { Product } from '../../types';
import { createNotification } from './notifications';

// ── Durée d'un boost : 7 jours ─────────────────────────────────────────────
const BOOST_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// ── Créer une demande de boost (vendeur) ────────────────────────────────────

export const createBoostRequest = async (
  request: Omit<BoostRequest, 'id' | 'createdAt' | 'updatedAt' | 'approvedBy' | 'boostStartAt' | 'boostExpiresAt' | 'rejectionReason'>
): Promise<string> => {
  if (!db) throw new Error('Firebase non initialisé');

  const docRef = await addDoc(collection(db, COLLECTIONS.BOOST_REQUESTS), {
    ...request,
    status: 'pending',
    transactionRef: null,
    rejectionReason: null,
    approvedBy: null,
    boostStartAt: null,
    boostExpiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return docRef.id;
};

// ── Confirmer le paiement (vendeur soumet sa référence de transaction) ──────

export const confirmBoostPayment = async (
  requestId: string,
  transactionRef: string,
): Promise<void> => {
  if (!db) return;

  await updateDoc(doc(db, COLLECTIONS.BOOST_REQUESTS, requestId), {
    status: 'pending_validation',
    transactionRef,
    updatedAt: Date.now(),
  });
};

// ── Approuver et activer le boost (admin) ───────────────────────────────────

export const approveBoostRequest = async (
  requestId: string,
  adminId: string,
): Promise<void> => {
  if (!db) return;

  const reqSnap = await getDoc(doc(db, COLLECTIONS.BOOST_REQUESTS, requestId));
  if (!reqSnap.exists()) throw new Error('Demande de boost introuvable');

  const request = { id: reqSnap.id, ...reqSnap.data() } as BoostRequest;
  const now = Date.now();
  const boostExpiresAt = now + BOOST_DURATION_MS;

  // 1. Mettre à jour la demande
  await updateDoc(doc(db, COLLECTIONS.BOOST_REQUESTS, requestId), {
    status: 'approved',
    approvedBy: adminId,
    boostStartAt: now,
    boostExpiresAt,
    updatedAt: now,
  });

  // 2. Activer le boost sur le produit
  await updateDoc(doc(db, COLLECTIONS.PRODUCTS, request.productId), {
    isBoosted: true,
    boostExpiresAt,
  });

  // 3. Notifier le vendeur
  await createNotification({
    userId: request.userId,
    type: 'boost_activated',
    title: '🚀 Boost activé !',
    body: `Votre produit "${request.productTitle}" est maintenant mis en avant pendant 7 jours.`,
    read: false,
    createdAt: now,
    data: {},
  });
};

// ── Rejeter une demande de boost (admin) ────────────────────────────────────

export const rejectBoostRequest = async (
  requestId: string,
  reason: string,
): Promise<void> => {
  if (!db) return;

  const reqSnap = await getDoc(doc(db, COLLECTIONS.BOOST_REQUESTS, requestId));
  if (!reqSnap.exists()) throw new Error('Demande de boost introuvable');

  const request = { id: reqSnap.id, ...reqSnap.data() } as BoostRequest;

  await updateDoc(doc(db, COLLECTIONS.BOOST_REQUESTS, requestId), {
    status: 'rejected',
    rejectionReason: reason,
    updatedAt: Date.now(),
  });

  await createNotification({
    userId: request.userId,
    type: 'system',
    title: 'Demande de boost refusée',
    body: `Votre demande de boost pour "${request.productTitle}" a été refusée. Raison : ${reason}`,
    read: false,
    createdAt: Date.now(),
    data: {},
  });
};

// ── Toutes les demandes (admin) ─────────────────────────────────────────────

export const getAllBoostRequests = async (
  statusFilter?: BoostRequestStatus,
): Promise<BoostRequest[]> => {
  if (!db) return [];

  const q = statusFilter
    ? query(
        collection(db, COLLECTIONS.BOOST_REQUESTS),
        where('status', '==', statusFilter),
        orderBy('createdAt', 'desc'),
        limit(100),
      )
    : query(
        collection(db, COLLECTIONS.BOOST_REQUESTS),
        orderBy('createdAt', 'desc'),
        limit(100),
      );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as BoostRequest));
};

// ── Demandes d'un vendeur (temps réel) ──────────────────────────────────────

export const subscribeToMyBoostRequests = (
  userId: string,
  callback: (requests: BoostRequest[]) => void,
): Unsubscribe => {
  if (!db) { callback([]); return () => {}; }

  const q = query(
    collection(db, COLLECTIONS.BOOST_REQUESTS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20),
  );

  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as BoostRequest)));
  }, err => {
    console.error('[Boost] subscribeToMyBoostRequests error:', err.message);
    callback([]);
  });
};

// ── Nombre de demandes en attente (badge admin) ─────────────────────────────

export const countPendingBoostRequests = async (): Promise<number> => {
  if (!db) return 0;

  const q = query(
    collection(db, COLLECTIONS.BOOST_REQUESTS),
    where('status', 'in', ['pending', 'pending_validation']),
  );
  const snap = await getDocs(q);
  return snap.size;
};

// ── Prix du boost pour un pays (temps réel) ─────────────────────────────────

export const subscribeToBoostPricing = (
  countryId: string,
  callback: (pricing: BoostPricing) => void,
): Unsubscribe => {
  const fallback = DEFAULT_BOOST_PRICING[countryId] || DEFAULT_BOOST_PRICING['bi'];
  if (!db) {
    callback(fallback);
    return () => {};
  }

  return onSnapshot(doc(db, COLLECTIONS.BOOST_PRICING, countryId), snap => {
    if (snap.exists()) {
      callback(snap.data() as BoostPricing);
    } else {
      // Seed Firestore avec les defaults pour que l'admin puisse les modifier
      setDoc(doc(db, COLLECTIONS.BOOST_PRICING, countryId), fallback).catch(() => {});
      callback(fallback);
    }
  }, () => {
    callback(fallback);
  });
};

// ── Produits boostés actifs pour la Home ────────────────────────────────────

export const getBoostedProducts = async (countryId?: string): Promise<Product[]> => {
  if (!db) return [];

  const now = Date.now();

  if (countryId) {
    // Fetch boosted products for this country + those without a country (global boosts)
    // Two parallel queries — merged client-side, deduplicated, limited to 10
    const [snapCountry, snapGlobal] = await Promise.all([
      getDocs(query(
        collection(db, COLLECTIONS.PRODUCTS),
        where('isBoosted', '==', true),
        where('status', '==', 'approved'),
        where('countryId', '==', countryId),
        limit(10),
      )),
      getDocs(query(
        collection(db, COLLECTIONS.PRODUCTS),
        where('isBoosted', '==', true),
        where('status', '==', 'approved'),
        limit(10),
      )),
    ]);

    const seen = new Set<string>();
    const all: Product[] = [];
    for (const snap of [snapCountry, snapGlobal]) {
      for (const d of snap.docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          all.push(docToProduct(d.data(), d.id));
        }
      }
    }
    return all
      .filter(p => (!p.countryId || p.countryId === countryId) && (!p.boostExpiresAt || p.boostExpiresAt > now))
      .slice(0, 10);
  }

  // No country filter — return all active boosts
  const snap = await getDocs(query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('isBoosted', '==', true),
    where('status', '==', 'approved'),
    limit(10),
  ));
  return snap.docs
    .map(d => docToProduct(d.data(), d.id))
    .filter(p => !p.boostExpiresAt || p.boostExpiresAt > now);
};
