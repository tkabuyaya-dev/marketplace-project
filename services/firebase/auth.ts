/**
 * NUNULIA — Authentication Service
 *
 * Strategy:
 * 1. Always try signInWithPopup (works on desktop + most mobile browsers)
 * 2. If popup blocked → fallback to signInWithRedirect (last resort)
 * 3. NEVER rely on getRedirectResult — it breaks on storage-partitioned browsers
 *    (iOS standalone PWA, Safari ITP, Chrome third-party cookie deprecation)
 * 4. onAuthStateChanged handles ALL auth results (popup + redirect + existing session)
 * 5. resolveFirebaseUser creates profile on first login — called from both flows
 *
 * Cache user in localStorage for instant app shell on 2G/3G networks.
 */

import {
  signInWithPopup,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { User } from '../../types';
import {
  db, auth, doc, getDoc, setDoc, serverTimestamp,
  onSnapshot, COLLECTIONS, docToUser,
} from './constants';
import type { Unsubscribe } from './constants';

// ── Cached User (instant app shell on 2G/3G) ──
const USER_CACHE_KEY = 'nunulia_cached_user';

export const getCachedUser = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const cacheUser = (user: User | null) => {
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch { /* quota exceeded — non-critical */ }
};

export const clearCachedUser = () => {
  try { localStorage.removeItem(USER_CACHE_KEY); } catch {}
};

/**
 * Resolve a Firebase user into a Nunulia User.
 * Creates the Firestore profile on first login.
 * Idempotent — safe to call from both popup handler and onAuthStateChanged.
 */
const resolveFirebaseUser = async (firebaseUser: FirebaseUser): Promise<User> => {
  if (!db) throw new Error('Firebase non initialisé');

  const userRef = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUser: Omit<User, 'id'> = {
      name:        firebaseUser.displayName || 'Utilisateur',
      email:       firebaseUser.email || '',
      avatar:      firebaseUser.photoURL || '',
      isVerified:  false,
      isSuspended: false,
      role:        'buyer',
      joinDate:    Date.now(),
      productCount: 0,
    };
    await setDoc(userRef, { ...newUser, joinDate: serverTimestamp(), nameLower: (firebaseUser.displayName || 'utilisateur').toLowerCase() });
    const user = { id: firebaseUser.uid, ...newUser };
    cacheUser(user);
    return user;
  }

  const user = docToUser(userSnap.data(), firebaseUser.uid);
  cacheUser(user);
  return user;
};

// ── Détection d'environnement ──

/** iOS PWA ajouté à l'écran d'accueil (standalone mode) */
const isIOSStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  ((window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches);

/** In-app browser : WebView iOS/Android, Facebook, Instagram, WhatsApp... */
const isWebView = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /(WebView|wv\b)/i.test(ua) ||
    /FBAN|FBAV|Instagram|LinkedInApp|TwitterAndroid/i.test(ua) ||
    (/iPhone|iPod|iPad/i.test(ua) && !/Safari\//i.test(ua) && !/CriOS/i.test(ua))
  );
};

/**
 * Sign in with Google — stratégie popup uniquement, JAMAIS de redirect.
 *
 * signInWithRedirect est définitivement supprimé car il cause :
 * - "missing initial state" sur iOS Safari (ITP efface sessionStorage)
 * - Écran blanc au retour du redirect sur iOS PWA standalone
 * - Boucles de redirect sur certains Android WebView
 *
 * Stratégie :
 * 1. signInWithPopup → fonctionne sur desktop + Android Chrome + Safari mobile
 * 2. Popup bloqué sur iOS PWA/WebView → ouvre /auth-google dans Safari full
 * 3. Popup bloqué ailleurs → message clair "activez les popups"
 */
export const signInWithGoogle = async (): Promise<User | null> => {
  if (!auth || !db) throw new Error('Firebase non initialisé');

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    return resolveFirebaseUser(result.user);
  } catch (err: any) {
    // Utilisateur a fermé / annulé — pas une erreur
    if (
      err.code === 'auth/popup-closed-by-user' ||
      err.code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }

    // Popup bloqué ou environnement sans support popup
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/operation-not-supported-in-this-environment' ||
      err.code === 'auth/web-storage-unsupported'
    ) {
      if (isIOSStandalone() || isWebView()) {
        // iOS PWA / in-app browser → ouvrir dans Safari full
        // (window.open '_blank' depuis une PWA iOS ouvre dans Safari, pas dans la PWA)
        const opened = window.open(`${window.location.origin}/auth-google`, '_blank');
        if (!opened) {
          const e: any = new Error('Ouvrez cette page dans votre navigateur pour vous connecter.');
          e.code = 'auth/needs-browser-open';
          throw e;
        }
        return null;
      }

      // Tout autre cas (popup bloqué par extension, paramètres navigateur)
      const e: any = new Error('Les popups sont bloqués. Autorisez-les pour ce site dans votre navigateur.');
      e.code = 'auth/popup-blocked-manual';
      throw e;
    }

    throw err;
  }
};

export const signOut = async (): Promise<void> => {
  if (!auth) return;
  clearCachedUser();
  await firebaseSignOut(auth);
};

export const getCurrentUserFromFirestore = async (): Promise<User | null> => {
  if (!auth?.currentUser || !db) return null;
  const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid));
  if (!userSnap.exists()) return null;
  return docToUser(userSnap.data(), auth.currentUser.uid);
};

export const getCurrentUser = (): FirebaseUser | null => {
  return auth?.currentUser || null;
};

/**
 * Subscribe to auth state changes.
 *
 * This is the SINGLE source of truth for user state. It handles:
 * - Existing sessions (page reload with valid token)
 * - Popup login results (onAuthStateChanged fires after popup completes)
 * - Redirect login results (onAuthStateChanged fires after redirect returns)
 * - Sign out
 *
 * Uses resolveFirebaseUser to create profiles for first-time users,
 * so it works correctly even after a signInWithRedirect that lost sessionStorage.
 */
export const subscribeToAuth = (callback: (user: User | null) => void): Unsubscribe => {
  if (!auth) { callback(null); return () => {}; }

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser || !db) {
      cacheUser(null);
      callback(null);
      return;
    }
    try {
      // resolveFirebaseUser reads existing profile OR creates one for new users
      const user = await resolveFirebaseUser(firebaseUser);
      callback(user);
    } catch {
      // Network error — use cached user if available (offline/slow network)
      const cached = getCachedUser();
      if (cached && cached.id === firebaseUser.uid) {
        callback(cached);
      } else {
        callback(null);
      }
    }
  });
};

export const subscribeToUserProfile = (
  userId: string,
  callback: (user: User) => void
): Unsubscribe => {
  if (!db) return () => {};
  return onSnapshot(doc(db, COLLECTIONS.USERS, userId), (snap) => {
    if (snap.exists()) {
      callback(docToUser(snap.data(), userId));
    }
  });
};

export const reauthenticateWithGoogle = async (): Promise<void> => {
  const user = getCurrentUser();
  if (!user) throw new Error('No user logged in');
  const provider = new GoogleAuthProvider();
  await reauthenticateWithPopup(user, provider);
};
