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
  runTransaction, onSnapshot,
  COLLECTIONS,
} from './constants';
import type { QueryDocumentSnapshot, Unsubscribe } from './constants';
import { getFirebaseFunctions } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
export const PAGE_SIZE = 20;

/**
 * Nombre maximum de vendeurs distincts pouvant répondre à une même demande.
 * Source de vérité unique — la rule Firestore bloque côté serveur, la
 * transaction client la respecte aussi. Pour changer la valeur, mettre à
 * jour ici ET dans firestore.rules (la rule utilise 5 en dur — chiffres
 * désynchronisés = bug silencieux).
 */
export const MAX_SELLERS_PER_REQUEST = 5;

// ─── Converters ───────────────────────────────────────────────────────────────

export function docToBuyerRequest(data: any, id: string): BuyerRequest {
  return {
    id,
    title:              data.title || '',
    description:        data.description || undefined,
    countryId:          data.countryId || '',
    province:           data.province || '',
    city:               data.city || '',
    category:           data.category || undefined,
    budget:             data.budget ?? undefined,
    budgetCurrency:     data.budgetCurrency || undefined,
    imageUrl:           data.imageUrl || undefined,
    whatsapp:           data.whatsapp || '',
    buyerId:            data.buyerId || undefined,
    buyerName:          data.buyerName || 'Acheteur',
    status:             data.status || 'active',
    createdAt:          data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
    expiresAt:          data.expiresAt?.toMillis?.() || data.expiresAt || Date.now() + SEVEN_DAYS_MS,
    viewCount:          data.viewCount || 0,
    contactCount:       data.contactCount || 0,
    // Lectures défensives : `?? 0` / `?? false` pour les demandes anciennes
    // pas encore touchées par la CF backfillBuyerRequestCounters.
    uniqueSellerCount:  typeof data.uniqueSellerCount === 'number' ? data.uniqueSellerCount : 0,
    isFull:             data.isFull === true,
    updatedAt:          data.updatedAt?.toMillis?.() || data.updatedAt || undefined,
    moderationFlag:     data.moderationFlag === true ? true : undefined,
    moderationReason:   data.moderationReason || undefined,
    // ── Sécurité (refonte 2026-06-04) ─────────────────────────────────
    // Anciens docs : visible absent ⇒ default true (compatibilité)
    visible:            data.visible === false ? false : (data.visible === true ? true : undefined),
    confirmationCode:   data.confirmationCode || undefined,
    confirmationExpiresAt: typeof data.confirmationExpiresAt === 'number' ? data.confirmationExpiresAt : undefined,
    confirmedAt:        typeof data.confirmedAt === 'number' ? data.confirmedAt : (data.confirmedAt === null ? null : undefined),
    deviceId:           data.deviceId || undefined,
    deviceIp:           data.deviceIp || undefined,
    deviceUserAgent:    data.deviceUserAgent || undefined,
    deviceConfirmIp:    data.deviceConfirmIp || undefined,
    deviceConfirmDeviceId: data.deviceConfirmDeviceId || undefined,
    scoreConfiance:     typeof data.scoreConfiance === 'number' ? data.scoreConfiance : undefined,
    scoreSignals:       Array.isArray(data.scoreSignals) ? data.scoreSignals : undefined,
    isAbuse:            data.isAbuse === true ? true : undefined,
    abuseSignaledAt:    typeof data.abuseSignaledAt === 'number' ? data.abuseSignaledAt : undefined,
    suspendedReason:    data.suspendedReason || undefined,
    expiredReason:      data.expiredReason || undefined,
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
  // Refonte 2026-06-04 — sécurité confirmation
  deviceId?: string | null;
  deviceUserAgent?: string | null;
}

/**
 * Retour de la CF submitBuyerRequest depuis la refonte 2026-06-04.
 * - active direct (score ≥ 70)  ⇒ requiresConfirmation=false, pas de code
 * - pending_confirmation (< 70) ⇒ requiresConfirmation=true + code 8-char
 */
export type CreateBuyerRequestResult =
  | { id: string; requiresConfirmation: false; status: 'active' }
  | {
      id: string;
      requiresConfirmation: true;
      status: 'pending_confirmation';
      confirmationCode: string;
      expiresInMinutes: number;
    };

export async function createBuyerRequest(
  data: CreateBuyerRequestData,
): Promise<CreateBuyerRequestResult> {
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

  const fn = httpsCallable<CreateBuyerRequestData, CreateBuyerRequestResult>(fns, 'submitBuyerRequest');
  const result = await fn(data);
  return result.data;
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
  // Filtrage en mémoire :
  //   - expiresAt passé (cron 03:00 UTC pas encore exécuté)
  //   - visible === false : refonte 2026-06-04, exclut les pending_confirmation
  //     (défense en profondeur — la query filtre déjà sur status='active' par défaut).
  //     Pour les anciens docs sans champ visible, défaut autorisé.
  const requests = snap.docs
    .map(d => docToBuyerRequest(d.data(), d.id))
    .filter(r => r.expiresAt > now && r.visible !== false);
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

// ─── Realtime subscription ────────────────────────────────────────────────────

/**
 * Abonnement live à une demande pour mettre à jour la barre de progression
 * et le badge isFull devant les yeux du vendeur. Si un autre vendeur clique,
 * le compteur s'incrémente sans recharge.
 */
export function subscribeBuyerRequest(
  requestId: string,
  callback: (req: BuyerRequest | null) => void,
): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, COLLECTIONS.BUYER_REQUESTS, requestId),
    (snap) => callback(snap.exists() ? docToBuyerRequest(snap.data(), snap.id) : null),
    () => callback(null),
  );
}

// ─── A déjà répondu ? ─────────────────────────────────────────────────────────

/**
 * Lit le doc déterministe `${requestId}_${sellerId}` dans buyerRequestContacts.
 * Si présent → ce vendeur a déjà cliqué sur cette demande (on doit ouvrir
 * WhatsApp sans toucher au compteur).
 */
export async function hasSellerResponded(
  requestId: string,
  sellerId: string,
): Promise<boolean> {
  if (!db) return false;
  const id = `${requestId}_${sellerId}`;
  const snap = await getDoc(doc(db, COLLECTIONS.BUYER_REQUEST_CONTACTS, id));
  return snap.exists();
}

// ─── Demandes similaires (quand isFull) ──────────────────────────────────────

/**
 * Retourne jusqu'à 3 autres demandes ouvertes (status=active, isFull=false)
 * de la même catégorie. Utilisé pour rediriger un vendeur frustré par une
 * demande déjà saturée vers des alternatives encore disponibles.
 */
export async function getSimilarOpenRequests(
  category: string,
  excludeId: string,
  max = 3,
): Promise<BuyerRequest[]> {
  if (!db || !category) return [];
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUESTS),
    where('status', '==', 'active'),
    where('category', '==', category),
    where('isFull', '==', false),
    orderBy('createdAt', 'desc'),
    limit(max + 5),
  );
  const snap = await getDocs(q);
  const now = Date.now();
  return snap.docs
    .map((d) => docToBuyerRequest(d.data(), d.id))
    .filter((r) => r.id !== excludeId && r.expiresAt > now)
    .slice(0, max);
}

// ─── Réponse transactionnelle ─────────────────────────────────────────────────

export type RespondResult =
  | { ok: true; alreadyResponded: boolean; isFullAfter: boolean }
  | { ok: false; reason: 'full' };

/**
 * Transaction atomique : enregistre un vendeur sur une demande en respectant
 * le plafond MAX_SELLERS_PER_REQUEST.
 *
 * Si le vendeur a déjà répondu → no-op transaction (lit, ne touche à rien),
 * retour `alreadyResponded=true` → l'appelant ouvre WhatsApp sans rien
 * incrémenter.
 *
 * Si le compteur atteint déjà la limite → retour `{ok:false, reason:'full'}`.
 *
 * Sinon : crée `buyerRequestContacts/${reqId}_${sellerId}` (id déterministe
 * = anti-double-click natif côté Rules) ET incrémente atomiquement
 * uniqueSellerCount + contactCount + bascule isFull à true si on touche la
 * limite. Les deux writes sont dans la même transaction → état toujours
 * cohérent même sur 50 clics simultanés.
 */
export async function respondToBuyerRequest(
  requestId: string,
  sellerId: string,
  sellerTierId: string,
): Promise<RespondResult> {
  if (!db) throw new Error('Firebase non initialisé');

  const reqRef = doc(db, COLLECTIONS.BUYER_REQUESTS, requestId);
  const contactRef = doc(db, COLLECTIONS.BUYER_REQUEST_CONTACTS, `${requestId}_${sellerId}`);

  return runTransaction<RespondResult>(db, async (tx) => {
    const [reqSnap, contactSnap] = await Promise.all([tx.get(reqRef), tx.get(contactRef)]);

    // 1) Déjà répondu : open-only path
    if (contactSnap.exists()) {
      return { ok: true, alreadyResponded: true, isFullAfter: reqSnap.data()?.isFull === true };
    }

    // 2) Plafond atteint entre-temps, demande invisible ou non-active
    const data = reqSnap.exists() ? reqSnap.data() : null;
    if (!data) return { ok: false, reason: 'full' };
    const currentUnique = typeof data.uniqueSellerCount === 'number' ? data.uniqueSellerCount : 0;
    if (data.isFull === true || currentUnique >= MAX_SELLERS_PER_REQUEST) {
      return { ok: false, reason: 'full' };
    }
    // Refonte 2026-06-04 : la rule serveur bloque déjà, mais on évite un round-trip.
    // Anciens docs : `visible` absent ⇒ default true (compatibilité).
    const status = typeof data.status === 'string' ? data.status : 'active';
    const visible = data.visible === false ? false : true;
    if (!visible || status !== 'active') {
      // Identique à "full" pour le client — UI affiche "Demande complète".
      // On ne révèle pas l'état réel pour rester cohérent avec le honeypot CF.
      return { ok: false, reason: 'full' };
    }

    // 3) Insertion atomique
    const newUnique = currentUnique + 1;
    const becomesFull = newUnique >= MAX_SELLERS_PER_REQUEST;
    const now = Date.now();

    tx.set(contactRef, {
      requestId,
      sellerId,
      sellerTierId,
      timestamp: now,
    } satisfies Omit<BuyerRequestContact, 'id'>);

    tx.update(reqRef, {
      uniqueSellerCount: newUnique,
      contactCount: increment(1),
      isFull: becomesFull,
      updatedAt: now,
    });

    return { ok: true, alreadyResponded: false, isFullAfter: becomesFull };
  });
}

// ─── DEPRECATED — kept as no-op to avoid breaking other callers ──────────────
// Le tracker existe désormais via la transaction de respondToBuyerRequest.
// Si du code legacy l'appelle encore, c'est sans effet (le contact réel a
// déjà été enregistré par respondToBuyerRequest). À supprimer après audit.
export async function trackWhatsAppContact(
  _requestId: string,
  _sellerId: string,
  _sellerTierId: string,
): Promise<void> {
  /* no-op — voir respondToBuyerRequest */
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
