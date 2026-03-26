/**
 * AURABUJA — Authentication Service
 *
 * Performance strategy: Cache user in localStorage for instant app shell.
 * Firebase Auth verifies in background; if result differs, update silently.
 */

import {
  signInWithPopup,
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
const USER_CACHE_KEY = 'aurabuja_cached_user';

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

export const signInWithGoogle = async (): Promise<User> => {
  if (!auth || !db) throw new Error('Firebase non initialisé');

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const firebaseUser = result.user;

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
    return { id: firebaseUser.uid, ...newUser };
  }

  const user = docToUser(userSnap.data(), firebaseUser.uid);
  cacheUser(user);
  return user;
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

export const subscribeToAuth = (callback: (user: User | null) => void): Unsubscribe => {
  if (!auth) return () => {};

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser || !db) {
      cacheUser(null);
      callback(null);
      return;
    }
    try {
      const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid));
      if (userSnap.exists()) {
        const user = docToUser(userSnap.data(), firebaseUser.uid);
        cacheUser(user);
        callback(user);
      } else {
        cacheUser(null);
        callback(null);
      }
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
