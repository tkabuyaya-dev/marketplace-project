/**
 * NUNULIA — Firebase Cloud Messaging (FCM) client service
 *
 * Architecture:
 * - Token stocké dans la subcollection `users/{uid}/fcmTokens/{tokenId}`.
 *   Une CF `onNotificationCreate` lit cette subcollection pour envoyer les
 *   push correspondants aux notifs in-app déjà créées.
 * - Permission demandée explicitement depuis Profile (toggle utilisateur),
 *   jamais à l'auto-load. Sticky une fois refusée, donc on protège le UX.
 * - Graceful degradation totale : si VAPID absente, browser non supporté,
 *   permission refusée, ou erreur SDK → toutes les fonctions retournent
 *   silencieusement sans casser l'app.
 *
 * Imports lazy : firebase/messaging n'est jamais embarqué dans le bundle
 * initial (~30 kB économisés). Chargé uniquement à la 1ʳᵉ demande.
 */

import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, isConfigured } from '../firebase-config';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const TOKEN_LOCAL_KEY = 'nunulia_fcm_token';

/** Scope du SW FCM dédié — séparé du Workbox SW qui occupe '/'. */
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

/**
 * Registration à utiliser pour AFFICHER une notification dont le clic doit
 * naviguer dans l'app (focus onglet + NOTIFICATION_NAVIGATE).
 *
 * Pourquoi c'est critique : `notificationclick` est dispatché au SW
 * propriétaire de la registration qui a AFFICHÉ la notif — pas au SW qui
 * contrôle la page. Le seul SW qui gère ce clic est firebase-messaging-sw.js
 * (scope FCM_SW_SCOPE). Afficher via le SW Workbox (scope '/') rend le clic
 * muet : son handler (sw-extras.js) ignore tout tag ≠ drafts-sync, la notif
 * ne se ferme même pas.
 *
 * Fallback `.ready` (SW Workbox) si le SW FCM n'est pas enregistré : la
 * notif s'affiche quand même — on ne dégrade jamais l'affichage.
 */
export async function getNotificationSwRegistration(): Promise<ServiceWorkerRegistration> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
    if (reg) return reg;
  } catch { /* ignore — fallback ci-dessous */ }
  return navigator.serviceWorker.ready;
}

/**
 * Feature detection. FCM ne fonctionne pas sur :
 * - Safari iOS < 16.4 (et Safari macOS < 16.4)
 * - Tout navigateur sans Service Worker ou Push API
 * - PWA non installée (sur iOS, web push exige l'install)
 */
export async function isFcmSupported(): Promise<boolean> {
  if (!isConfigured) return false;
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (typeof Notification === 'undefined') return false;
  try {
    const { isSupported } = await import('firebase/messaging');
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Retourne le token FCM courant (ou null si indispo).
 * Enregistre côté Firestore et garde une copie en localStorage pour
 * détecter les changements de token entre sessions.
 */
async function fetchToken(uid: string): Promise<string | null> {
  if (!VAPID_KEY) return null;
  if (!db) return null;

  try {
    // Le SW dédié doit être enregistré explicitement — Workbox occupe '/'
    // donc on lui donne son propre scope pour éviter le conflit.
    const swReg = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: FCM_SW_SCOPE }
    );

    const { getMessaging, getToken } = await import('firebase/messaging');
    const { getApps } = await import('firebase/app');

    // Réutilise l'app principale si déjà initialisée
    const app = getApps()[0];
    if (!app) return null;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) return null;

    // Persiste en Firestore : 1 doc par token. tokenId = hash court du token
    // pour rester ASCII-safe en doc ID.
    const tokenId = await shortHash(token);
    await setDoc(doc(db, 'users', uid, 'fcmTokens', tokenId), {
      token,
      platform: navigator.platform || 'web',
      userAgent: navigator.userAgent.slice(0, 240),
      lang: navigator.language || 'fr',
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }, { merge: true });

    try { localStorage.setItem(TOKEN_LOCAL_KEY, tokenId); } catch { /* ignore */ }
    return token;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[FCM] Token registration failed:', err);
    return null;
  }
}

/**
 * Point d'entrée principal. À appeler après que l'utilisateur ait
 * explicitement accepté les notifications (depuis le Profile).
 */
export async function registerFcmForUser(uid: string): Promise<boolean> {
  if (!uid) return false;
  if (Notification.permission !== 'granted') return false;
  if (!(await isFcmSupported())) return false;

  const token = await fetchToken(uid);
  return !!token;
}

/**
 * Re-vérification silencieuse au login si la permission est déjà 'granted'.
 * Pas de prompt — juste un refresh du token si nécessaire.
 */
export async function refreshFcmTokenSilent(uid: string): Promise<void> {
  if (!uid) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!VAPID_KEY) return;
  if (!(await isFcmSupported())) return;

  // Best-effort : on ignore les erreurs (token déjà valide, hors-ligne, etc.)
  await fetchToken(uid).catch(() => {});
}

/**
 * Désactivation côté serveur (le navigateur garde quand même la permission ;
 * c'est volontaire — il pourra réactiver via le toggle Profile sans re-prompt).
 */
export async function unregisterFcmForUser(uid: string): Promise<void> {
  if (!uid || !db) return;
  try {
    const tokenId = localStorage.getItem(TOKEN_LOCAL_KEY);
    if (!tokenId) return;
    await deleteDoc(doc(db, 'users', uid, 'fcmTokens', tokenId));
    localStorage.removeItem(TOKEN_LOCAL_KEY);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[FCM] Unregister failed:', err);
  }
}

/**
 * Handler des messages reçus pendant que l'app est au premier plan.
 * (En arrière-plan, c'est firebase-messaging-sw.js qui affiche la notif système.)
 * Retourne la fonction de désinscription.
 */
export async function onForegroundMessage(
  cb: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
): Promise<() => void> {
  if (!(await isFcmSupported())) return () => {};
  try {
    const { getMessaging, onMessage } = await import('firebase/messaging');
    const { getApps } = await import('firebase/app');
    const app = getApps()[0];
    if (!app) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      cb({
        title: payload.notification?.title || payload.data?.title,
        body:  payload.notification?.body  || payload.data?.body,
        data:  payload.data,
      });
    });
  } catch {
    return () => {};
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Hash court (8 chars hex) pour transformer le token FCM (160+ chars,
 * contient des `:` qui ne sont pas valides comme doc ID Firestore) en
 * identifiant compact stable.
 */
async function shortHash(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest).slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
