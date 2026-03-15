/**
 * AURABUJA — Authentication Service
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

  return docToUser(userSnap.data(), firebaseUser.uid);
};

export const signOut = async (): Promise<void> => {
  if (!auth) return;
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
      callback(null);
      return;
    }
    try {
      const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid));
      if (userSnap.exists()) {
        callback(docToUser(userSnap.data(), firebaseUser.uid));
      } else {
        callback(null);
      }
    } catch {
      callback(null);
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
