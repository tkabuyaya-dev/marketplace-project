/**
 * NUNULIA — Authentication Service
 *
 * Strategy:
 * 1. ALL platforms → Google One Tap (native overlay, no popup/redirect)
 * 2. Fallback desktop → signInWithPopup (if One Tap unavailable)
 * 3. Fallback iOS PWA / WebView → /auth-google in Safari
 * 4. NEVER use signInWithRedirect — "missing initial state" on mobile Chrome
 * 5. resolveFirebaseUser creates profile on first login — called from all flows
 *
 * Cache user in localStorage for instant app shell on 2G/3G networks.
 */

import {
  signInWithPopup,
  signInWithCredential,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { promptOneTap } from '../google-one-tap';
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
      verificationTier: 'none',
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

/** Android mobile browser (not WebView). Popup opens a new tab that never closes → white screen. */
const isAndroidBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(navigator.userAgent) && !isWebView();
};

/** Desktop browser (not mobile, not WebView, not iOS standalone). */
const isDesktop = (): boolean => !isWebView() && !isIOSStandalone() && !isAndroidBrowser();

/**
 * Sign in with Google.
 *
 * Stratégie (dépend de la plateforme) :
 *
 * DESKTOP → `signInWithPopup` directement. One Tap sur desktop (avec FedCM
 *   désormais obligatoire sur Chrome) consomme l'user activation pendant que
 *   le callback n'est plus fiable, ce qui provoque `auth/popup-blocked` sur
 *   le popup qui suit. Le popup fonctionne proprement sur desktop — pas
 *   d'onglet orphelin à ce niveau, contrairement à Android.
 *
 * MOBILE :
 *   1. Google One Tap — overlay natif, évite le popup/redirect pénible
 *   2. WebView (FB/Insta/WA) → ouvrir /auth-google dans le navigateur
 *   3. iOS PWA standalone → ouvrir /auth-google dans Safari
 *   4. Android browser → `window.location.href = '/auth-google'`
 *
 * JAMAIS `signInWithRedirect` — "missing initial state" sur Chrome mobile.
 */
export const signInWithGoogle = async (): Promise<User | null> => {
  if (!auth || !db) throw new Error('Firebase non initialisé');

  // ── DESKTOP: popup direct, pas de One Tap ──
  // L'attente asynchrone One Tap invalide l'user activation avant le popup.
  if (isDesktop()) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      return resolveFirebaseUser(result.user);
    } catch (err: any) {
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) {
        return null;
      }

      if (
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/operation-not-supported-in-this-environment' ||
        err.code === 'auth/web-storage-unsupported'
      ) {
        const e: any = new Error('Les popups sont bloqués. Autorisez-les pour ce site dans votre navigateur.');
        e.code = 'auth/popup-blocked-manual';
        throw e;
      }

      throw err;
    }
  }

  // ── MOBILE: One Tap d'abord ──
  const oneTapResult = await promptOneTap();
  if (oneTapResult) {
    const credential = GoogleAuthProvider.credential(oneTapResult.credential);
    const result = await signInWithCredential(auth, credential);
    return resolveFirebaseUser(result.user);
  }

  // ── Fallbacks mobiles ──

  // WebView (Facebook, Instagram, WhatsApp) → /auth-google dans le navigateur
  if (isWebView()) {
    const opened = window.open(`${window.location.origin}/auth-google`, '_blank');
    if (!opened) {
      const e: any = new Error('Ouvrez cette page dans votre navigateur pour vous connecter.');
      e.code = 'auth/needs-browser-open';
      throw e;
    }
    return null;
  }

  // iOS PWA standalone → /auth-google dans Safari
  if (isIOSStandalone()) {
    window.open(`${window.location.origin}/auth-google`, '_blank');
    return null;
  }

  // Android browser → /auth-google via navigation SPA (caller utilise React Router).
  // Un `window.location.href` ici ferait un hard reload → 1-3s d'écran blanc sur 3G/4G
  // pendant que /auth-google charge. On throw un code dédié pour que le caller
  // (AuthContext.handleLogin) fasse une transition SPA fluide via `navigate()`.
  if (isAndroidBrowser()) {
    const e: any = new Error('Auth page redirect required');
    e.code = 'auth/needs-auth-page';
    throw e;
  }

  return null;
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

    // ── Fast path: unblock authReady immediately with cached user ──
    // Calling callback here (before the Firestore await) means the app
    // renders content instantly on page reload without waiting for the network.
    // The second callback below updates with fresh Firestore data.
    const cached = getCachedUser();
    if (cached && cached.id === firebaseUser.uid) {
      callback(cached);
    }

    try {
      // resolveFirebaseUser reads existing profile OR creates one for new users
      const user = await resolveFirebaseUser(firebaseUser);
      callback(user); // refresh with live Firestore data (may cause a silent re-render)
    } catch {
      // Network error — if we already called back with cached, don't regress to null
      if (!cached || cached.id !== firebaseUser.uid) {
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
  let prevClaimsTs: number | null = null;
  return onSnapshot(doc(db, COLLECTIONS.USERS, userId), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback(docToUser(data, userId));
      const claimsTs = data.claimsUpdatedAt?.toMillis?.() ?? null;
      if (prevClaimsTs !== null && claimsTs !== null && claimsTs !== prevClaimsTs) {
        auth?.currentUser?.getIdToken(true).catch(() => {});
      }
      prevClaimsTs = claimsTs;
    }
  });
};

export async function withClaimsRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err: any) {
    if (err?.code === 'permission-denied' && auth?.currentUser) {
      await auth.currentUser.getIdToken(true);
      return await operation();
    }
    throw err;
  }
}

export const reauthenticateWithGoogle = async (): Promise<void> => {
  const user = getCurrentUser();
  if (!user) throw new Error('No user logged in');
  const provider = new GoogleAuthProvider();
  await reauthenticateWithPopup(user, provider);
};
