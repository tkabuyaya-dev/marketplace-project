/**
 * NUNULIA — Réseau B2B Service
 *
 * Lecture / écriture des posts, helps et confirmations B2B.
 * Toutes les ids dérivées (`postId_userId`) sont déterministes pour profiter
 * de l'unicité native Firestore — pas de race, pas de getAfter coûteux.
 *
 * Les compteurs (helpCount, confirmCount) sont incrémentés par les CFs
 * onB2bHelp / onB2bConfirmation — le client ne les écrit JAMAIS.
 */

import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, onSnapshot, COLLECTIONS,
} from './constants';
import type { QueryDocumentSnapshot, Unsubscribe } from './constants';
import type {
  B2BPost, B2BHelp, B2BConfirmation, B2BCategory, B2BLang,
} from '../../types';

const POSTS_PAGE_SIZE = 20;
const POST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

// ── Helpers de conversion ────────────────────────────────────────────────────

function docToPost(data: any, id: string): B2BPost {
  return {
    id,
    authorId:                data.authorId,
    authorName:              data.authorName,
    authorCity:              data.authorCity || '',
    authorProvince:          data.authorProvince || '',
    authorCountry:           data.authorCountry,
    authorWhatsApp:          data.authorWhatsApp,
    authorTier:              data.authorTier || 'pro',
    authorReputationAtPost:  typeof data.authorReputationAtPost === 'number' ? data.authorReputationAtPost : 0,
    category:                data.category,
    originalText:            data.originalText || '',
    mediaUrl:                typeof data.mediaUrl === 'string' && data.mediaUrl ? data.mediaUrl : undefined,
    originalLang:            data.originalLang,
    translations:            data.translations || {},
    translationStatus:       data.translationStatus || 'pending',
    translatedAt:            data.translatedAt?.toMillis?.() || data.translatedAt || null,
    helpCount:               data.helpCount || 0,
    confirmCount:            data.confirmCount || 0,
    uniqueCitiesConfirmed:   Array.isArray(data.uniqueCitiesConfirmed) ? data.uniqueCitiesConfirmed : [],
    isVerified:              data.isVerified === true,
    status:                  data.status || 'open',
    createdAt:               data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
    updatedAt:               data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
    expiresAt:               data.expiresAt?.toMillis?.() || data.expiresAt || Date.now(),
  };
}

function docToHelp(data: any, id: string): B2BHelp {
  return {
    id,
    postId:         data.postId,
    helperId:       data.helperId,
    helperName:     data.helperName,
    helperCity:     data.helperCity || '',
    helperCountry:  data.helperCountry || '',
    helperWhatsApp: data.helperWhatsApp,
    helperTier:     data.helperTier || 'pro',
    createdAt:      data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
  };
}

// ── Subscriptions (feed) ─────────────────────────────────────────────────────

interface FeedFilters {
  country: string;       // ISO2 ; '' = tous pays
  category?: B2BCategory;
}

/**
 * Feed paginé. La pagination cursor-based passe par lastDoc — pas d'offset.
 * Le composant orchestre les pages (cf. useB2BPosts hook).
 */
export function subscribeToB2BPosts(
  filters: FeedFilters,
  callback: (posts: B2BPost[]) => void,
): Unsubscribe {
  if (!db) return () => {};

  const constraints: any[] = [where('status', '==', 'open')];
  if (filters.country) constraints.push(where('authorCountry', '==', filters.country));
  if (filters.category) constraints.push(where('category', '==', filters.category));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(POSTS_PAGE_SIZE));

  const q = query(collection(db, COLLECTIONS.B2B_POSTS), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToPost(d.data(), d.id)));
  });
}

export async function fetchMoreB2BPosts(
  filters: FeedFilters,
  cursor: QueryDocumentSnapshot,
): Promise<{ posts: B2BPost[]; lastDoc: QueryDocumentSnapshot | null }> {
  if (!db) return { posts: [], lastDoc: null };

  const constraints: any[] = [where('status', '==', 'open')];
  if (filters.country) constraints.push(where('authorCountry', '==', filters.country));
  if (filters.category) constraints.push(where('category', '==', filters.category));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(startAfter(cursor));
  constraints.push(limit(POSTS_PAGE_SIZE));

  const q = query(collection(db, COLLECTIONS.B2B_POSTS), ...constraints);
  const snap = await getDocs(q);
  return {
    posts: snap.docs.map((d) => docToPost(d.data(), d.id)),
    lastDoc: snap.docs.length === POSTS_PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null,
  };
}

/**
 * Compte les posts ouverts par catégorie dans un pays — sert aux chips de
 * filtre. Lecture one-shot (cache Firestore) : pas de listener live, le coût
 * sur 4G/3G serait trop lourd.
 */
export async function countOpenPostsByCategory(country: string): Promise<Record<B2BCategory, number>> {
  const totals: Record<B2BCategory, number> = {
    fournisseur: 0, revendeur: 0, marche: 0, transport: 0,
  };
  if (!db) return totals;

  const constraints: any[] = [where('status', '==', 'open')];
  if (country) constraints.push(where('authorCountry', '==', country));
  constraints.push(limit(500));
  const snap = await getDocs(query(collection(db, COLLECTIONS.B2B_POSTS), ...constraints));
  snap.forEach((d) => {
    const cat = (d.data().category as B2BCategory | undefined);
    if (cat && cat in totals) totals[cat] += 1;
  });
  return totals;
}

// ── Helps ───────────────────────────────────────────────────────────────────

function helpId(postId: string, helperId: string): string {
  return `${postId}_${helperId}`;
}

export function subscribeHelpsForPost(
  postId: string,
  callback: (helps: B2BHelp[]) => void,
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, COLLECTIONS.B2B_HELPS),
    where('postId', '==', postId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToHelp(d.data(), d.id)));
  });
}

/**
 * Récupère un seul help (utilisé pour savoir si le user courant a déjà aidé
 * un post — l'id étant déterministe, on évite la query).
 */
export async function getMyHelpForPost(postId: string, helperId: string): Promise<B2BHelp | null> {
  if (!db) return null;
  const ref = doc(db, COLLECTIONS.B2B_HELPS, helpId(postId, helperId));
  const snap = await getDoc(ref);
  return snap.exists() ? docToHelp(snap.data(), snap.id) : null;
}

export async function offerHelp(input: {
  postId: string;
  helperId: string;
  helperName: string;
  helperCity: string;
  helperCountry: string;
  helperWhatsApp: string;
  helperTier: 'free' | 'vendeur' | 'pro' | 'grossiste';
}): Promise<void> {
  if (!db) throw new Error('Firebase non initialisé');
  const id = helpId(input.postId, input.helperId);
  // setDoc avec un id explicite : si l'id existe déjà, create est rejeté par
  // les rules (helpId == postId + '_' + uid garantit l'unicité native).
  await setDoc(doc(db, COLLECTIONS.B2B_HELPS, id), {
    postId:         input.postId,
    helperId:       input.helperId,
    helperName:     input.helperName,
    helperCity:     input.helperCity || '',
    helperCountry:  input.helperCountry || '',
    helperWhatsApp: input.helperWhatsApp,
    helperTier:     input.helperTier,
    createdAt:      Date.now(),
  });
}

// ── Confirmations ───────────────────────────────────────────────────────────

function confirmId(postId: string, confirmerId: string): string {
  return `${postId}_${confirmerId}`;
}

export async function getMyConfirmationForPost(postId: string, confirmerId: string): Promise<boolean> {
  if (!db) return false;
  const ref = doc(db, COLLECTIONS.B2B_CONFIRMATIONS, confirmId(postId, confirmerId));
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function confirmPost(input: {
  postId: string;
  confirmerId: string;
  confirmerCity: string;
  confirmerCountry: string;
}): Promise<void> {
  if (!db) throw new Error('Firebase non initialisé');
  const id = confirmId(input.postId, input.confirmerId);
  await setDoc(doc(db, COLLECTIONS.B2B_CONFIRMATIONS, id), {
    postId:           input.postId,
    confirmerId:      input.confirmerId,
    confirmerCity:    input.confirmerCity || '',
    confirmerCountry: input.confirmerCountry || '',
    createdAt:        Date.now(),
  });
}

// ── Publish ─────────────────────────────────────────────────────────────────

export async function publishB2BPost(input: {
  authorId: string;
  authorName: string;
  authorCity: string;
  authorProvince: string;
  authorCountry: string;
  authorWhatsApp: string;
  authorTier: 'pro' | 'grossiste';
  authorReputationAtPost: number;
  category: B2BCategory;
  originalText: string;
  originalLang: B2BLang;
  mediaUrl?: string;
}): Promise<string> {
  if (!db) throw new Error('Firebase non initialisé');

  const now = Date.now();
  const ref = doc(collection(db, COLLECTIONS.B2B_POSTS));
  // mediaUrl n'est écrit que s'il est non vide : la rule create valide alors
  // le format (whitelist sociale). Absent = aucune validation requise.
  const media = (input.mediaUrl || '').trim();
  await setDoc(ref, {
    ...(media ? { mediaUrl: media } : {}),
    authorId:                input.authorId,
    authorName:              input.authorName,
    authorCity:              input.authorCity || '',
    authorProvince:          input.authorProvince || '',
    authorCountry:           input.authorCountry.toUpperCase(),
    authorWhatsApp:          input.authorWhatsApp,
    authorTier:              input.authorTier,
    authorReputationAtPost:  input.authorReputationAtPost,
    category:                input.category,
    originalText:            input.originalText.trim().slice(0, 280),
    originalLang:            input.originalLang,
    translations:            {},
    translationStatus:       'pending',
    translatedAt:            null,
    helpCount:               0,
    confirmCount:            0,
    uniqueCitiesConfirmed:   [],
    isVerified:              false,
    status:                  'open',
    createdAt:               now,
    updatedAt:               now,
    expiresAt:               now + POST_TTL_MS,
  });
  return ref.id;
}

export async function closeMyPost(postId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.B2B_POSTS, postId), {
    status: 'closed',
    updatedAt: Date.now(),
  });
}

export async function deleteMyPost(postId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.B2B_POSTS, postId));
}

// ── Helper de lecture d'un post unique (pour le sub-screen "mes helps") ──────

export async function getB2BPost(postId: string): Promise<B2BPost | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.B2B_POSTS, postId));
  return snap.exists() ? docToPost(snap.data(), snap.id) : null;
}
