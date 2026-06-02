/**
 * NUNULIA — Photo Sessions Service (Nunulia Studio)
 *
 * Couche d'abstraction entre les composants React et :
 *   - les 4 callables Cloud Functions (photoSessionCreate / SetProcessing /
 *     Attach / Publish)
 *   - les listeners Firestore realtime (active session + today usage)
 *
 * Toutes les transitions de status sont opérées server-side par les CFs.
 * Ce module ne fait QUE :
 *   - lire (subscribe / query)
 *   - appeler les callables
 * Aucune écriture directe sur photoSessions/ — c'est verrouillé par les rules.
 *
 * Erreurs callables : on propage les HttpsError telles quelles. Les codes
 * (resource-exhausted, permission-denied, failed-precondition, etc.) sont
 * lisibles côté UI via err.code pour afficher un toast adapté.
 */

import {
  PhotoSession,
  PhotoSessionStatus,
  PhotoSessionVisionSuggestions,
  PlanId,
} from '../../types';
import {
  db,
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from './constants';
import type { Unsubscribe } from './constants';
import { getFirebaseFunctions } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';

const COLLECTION_NAME = 'photoSessions';

// ─── Converter ────────────────────────────────────────────────────────────

function docToPhotoSession(data: any, id: string): PhotoSession {
  return {
    id,
    vendorId:           data.vendorId || '',
    vendorName:         data.vendorName || '',
    vendorPhone:        data.vendorPhone || '',
    countryId:          data.countryId || '',
    plan:               (data.plan || 'free') as PlanId,
    status:             (data.status || 'waiting_photos') as PhotoSessionStatus,
    createdAt:          typeof data.createdAt === 'number' ? data.createdAt : 0,
    expiresAt:          typeof data.expiresAt === 'number' ? data.expiresAt : 0,
    rawPhotoCount:      typeof data.rawPhotoCount === 'number' ? data.rawPhotoCount : undefined,
    processedUrls:      Array.isArray(data.processedUrls) ? data.processedUrls : [],
    visionSuggestions:  data.visionSuggestions as PhotoSessionVisionSuggestions | undefined,
    attachedAt:         typeof data.attachedAt === 'number' ? data.attachedAt : undefined,
    publishedProductId: data.publishedProductId ?? null,
    publishedAt:        typeof data.publishedAt === 'number' ? data.publishedAt : null,
    internalNote:       data.internalNote || undefined,
    shareCardUrl:       data.shareCardUrl || undefined,
    shareCaption:       data.shareCaption || undefined,
  };
}

// ─── Realtime subscriptions ───────────────────────────────────────────────

/**
 * Subscribe à une session précise (utilisé par /studio/:sessionId).
 * Callback reçoit `null` si la session n'existe pas ou n'est pas lisible.
 */
export function subscribeToPhotoSession(
  sessionId: string,
  cb: (session: PhotoSession | null) => void,
): Unsubscribe {
  if (!db || !sessionId) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, COLLECTION_NAME, sessionId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(docToPhotoSession(snap.data(), snap.id));
    },
    (err) => {
      // Erreur permissions (rules) ou réseau — on signale null pour que l'UI
      // affiche son fallback "pas accessible" / "réessayer".
      console.warn('[subscribeToPhotoSession] error', err);
      cb(null);
    },
  );
}

/**
 * Subscribe à la session la plus récente d'un vendeur (n'importe quel
 * status). Utilisé par le dashboard pour afficher la carte Photo Studio
 * avec son tracker temps-réel.
 *
 * Stratégie : `orderBy createdAt desc + limit 1`. Le hook côté composant
 * décide quoi afficher selon `status` :
 *   - waiting_photos / processing / ready → afficher le tracker
 *   - published / expired                 → traiter comme "pas de session
 *     active" (afficher CTA Démarrer si quota OK)
 *   - null (pas de doc)                   → carte d'accueil "Démarrer"
 */
export function subscribeToLatestVendorSession(
  vendorId: string,
  cb: (session: PhotoSession | null) => void,
): Unsubscribe {
  if (!db || !vendorId) {
    cb(null);
    return () => {};
  }
  const q = query(
    collection(db, COLLECTION_NAME),
    where('vendorId', '==', vendorId),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        cb(null);
        return;
      }
      const d = snap.docs[0];
      cb(docToPhotoSession(d.data(), d.id));
    },
    (err) => {
      console.warn('[subscribeToLatestVendorSession] error', err);
      cb(null);
    },
  );
}

/**
 * Subscribe au nombre de sessions créées AUJOURD'HUI par un vendeur (UTC+2
 * Bujumbura). Utilisé pour afficher le compteur "X/Y sessions aujourd'hui".
 *
 * On compte TOUS les statuts (y compris expired/published) — alignement
 * avec le throttling server-side dans photoSessionCreate. Sinon le vendeur
 * pourrait penser pouvoir relancer une session après expiration alors que
 * le serveur refuserait.
 */
export function subscribeToTodayStudioUsage(
  vendorId: string,
  cb: (count: number) => void,
): Unsubscribe {
  if (!db || !vendorId) {
    cb(0);
    return () => {};
  }

  // Minuit UTC+2 du jour courant → timestamp ms UTC
  const startOfDayUtc = getStartOfTodayUtcPlus2();

  const q = query(
    collection(db, COLLECTION_NAME),
    where('vendorId', '==', vendorId),
    where('createdAt', '>=', startOfDayUtc),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.size),
    (err) => {
      console.warn('[subscribeToTodayStudioUsage] error', err);
      cb(0);
    },
  );
}

/**
 * Calcule le timestamp ms UTC correspondant à minuit UTC+2 du jour courant.
 * Aligné EXACTEMENT avec functions/src/photo-session-create.ts pour que le
 * compteur affiché côté front matche le throttling serveur.
 */
function getStartOfTodayUtcPlus2(): number {
  const offsetMs = 2 * 60 * 60 * 1000;
  const localISO = new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
  const [y, m, d] = localISO.split('-').map((n) => parseInt(n, 10));
  // Minuit UTC+2 = 22:00 UTC veille (heure UTC = heure locale - 2h)
  return Date.UTC(y, m - 1, d, -2, 0, 0);
}

// ─── Cloud Function wrappers ──────────────────────────────────────────────

export interface CreatePhotoSessionResult {
  sessionId: string;
  expiresAt: number;
  whatsappLink: string;
  whatsappMessage: string;
}

/**
 * Démarre une nouvelle session. Côté UI : appeler puis rediriger vers
 * `whatsappLink` (window.location.href = result.whatsappLink) — WhatsApp
 * s'ouvre avec le message déjà tapé, le vendeur joint ses photos et envoie.
 *
 * Erreurs typiques :
 *   - 'functions/unauthenticated'   → vendeur pas connecté
 *   - 'functions/permission-denied' → pas vendeur OU suspendu
 *   - 'functions/resource-exhausted' → quota du jour atteint
 *   - 'functions/internal'           → collision sessionId (très rare) ou autre
 */
export async function createPhotoSession(): Promise<CreatePhotoSessionResult> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<Record<string, never>, CreatePhotoSessionResult>(
    fns,
    'photoSessionCreate',
  );
  const res = await fn({});
  return res.data;
}

export interface PublishFromStudioInput {
  sessionId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  subCategory?: string;
  condition?: 'new' | 'good' | 'fair';
  currency?: string;
  originalPrice?: number;
  isWholesale?: boolean;
  minOrderQuantity?: number;
  wholesalePrice?: number;
}

export interface PublishFromStudioResult {
  ok: true;
  productId: string;
  productSlug: string;
  status: 'pending';
}

/**
 * Publie le produit depuis /studio/:sessionId. Transaction atomique côté
 * serveur — le produit ET la fermeture de session sont garantis cohérents.
 *
 * Erreurs typiques :
 *   - 'functions/unauthenticated'    → pas connecté
 *   - 'functions/permission-denied'  → suspendu OU pas le propriétaire de la session
 *   - 'functions/failed-precondition'→ session pas ready / expirée / déjà publiée
 *   - 'functions/resource-exhausted' → quota produits atteint ou cooldown 20s
 *   - 'functions/invalid-argument'   → champs invalides (titre trop court, etc.)
 */
export async function publishFromStudio(
  input: PublishFromStudioInput,
): Promise<PublishFromStudioResult> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<PublishFromStudioInput, PublishFromStudioResult>(
    fns,
    'photoSessionPublish',
  );
  const res = await fn(input);
  return res.data;
}

// ─── Admin Cloud Function wrappers ────────────────────────────────────────

export interface AdminSetProcessingResult {
  ok: true;
  status: 'processing' | 'already_advanced';
}

/** ADMIN : marque une session comme "en traitement". */
export async function adminSetSessionProcessing(
  sessionId: string,
): Promise<AdminSetProcessingResult> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<{ sessionId: string }, AdminSetProcessingResult>(
    fns,
    'photoSessionSetProcessing',
  );
  const res = await fn({ sessionId });
  return res.data;
}

export interface AdminAttachInput {
  sessionId: string;
  processedUrls: string[];     // 1-5 URLs Cloudinary HTTPS
  rawPhotoCount?: number;
  internalNote?: string;
}

export interface AdminAttachResult {
  ok: true;
  status: 'ready';
  magicLink: string;
  whatsappMessageTemplate: string;
  visionApplied: boolean;
}

/** ADMIN : uploade les URLs Cloudinary traitées + déclenche Vision + notif. */
export async function adminAttachSessionPhotos(
  input: AdminAttachInput,
): Promise<AdminAttachResult> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<AdminAttachInput, AdminAttachResult>(
    fns,
    'photoSessionAttach',
  );
  const res = await fn(input);
  return res.data;
}

// ─── Admin read (file d'attente) ──────────────────────────────────────────

/**
 * ADMIN : liste paginée de la file Studio par status. Lecture autorisée par
 * les rules pour role=admin (cf. firestore.rules).
 *
 * Pour un realtime live de la file, préférer subscribeToStudioQueueForAdmin
 * ci-dessous (utilisé dans le dashboard admin).
 */
export function subscribeToStudioQueueForAdmin(
  statusFilter: PhotoSessionStatus | 'active' | 'all',
  cb: (sessions: PhotoSession[]) => void,
  maxResults: number = 50,
): Unsubscribe {
  if (!db) {
    cb([]);
    return () => {};
  }

  let q;
  if (statusFilter === 'all') {
    q = query(
      collection(db, COLLECTION_NAME),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    );
  } else if (statusFilter === 'active') {
    // "active" = tout sauf published/expired. Firestore "in" supporte max 10
    // valeurs et compatible avec orderBy si on a l'index correspondant.
    q = query(
      collection(db, COLLECTION_NAME),
      where('status', 'in', ['waiting_photos', 'processing', 'ready']),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    );
  } else {
    q = query(
      collection(db, COLLECTION_NAME),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    );
  }

  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => docToPhotoSession(d.data(), d.id)));
    },
    (err) => {
      console.warn('[subscribeToStudioQueueForAdmin] error', err);
      cb([]);
    },
  );
}
