/**
 * NUNULIA — Users Service
 */

import { User, SellerDetails } from '../../types';
import { slugify, generateUniqueSlug } from '../../utils/slug';
import {
  db, collection, doc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, writeBatch, COLLECTIONS, docToUser,
} from './constants';
import type { QueryDocumentSnapshot } from './constants';

export const getUserById = async (userId: string): Promise<User | null> => {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
  if (!snap.exists()) return null;
  return docToUser(snap.data(), userId);
};

export const getUserBySlugOrId = async (slugOrId: string): Promise<User | null> => {
  if (!db) return null;

  const slugQuery = query(
    collection(db, COLLECTIONS.USERS),
    where('slug', '==', slugOrId),
    limit(1)
  );
  const slugSnap = await getDocs(slugQuery);
  if (!slugSnap.empty) {
    return docToUser(slugSnap.docs[0].data(), slugSnap.docs[0].id);
  }

  return getUserById(slugOrId);
};

export const searchSellers = async (queryText: string): Promise<User[]> => {
  if (!db || queryText.trim().length < 2) return [];

  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('role', '==', 'seller'),
    where('nameLower', '>=', queryText.toLowerCase()),
    where('nameLower', '<=', queryText.toLowerCase() + '\uf8ff'),
    limit(10)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => docToUser(d.data(), d.id));
};

export const getAllUsers = async (lastDoc?: QueryDocumentSnapshot): Promise<{ users: User[]; lastDoc: QueryDocumentSnapshot | null }> => {
  if (!db) return { users: [], lastDoc: null };

  const constraints: any[] = [orderBy('joinDate', 'desc'), limit(50)];
  if (lastDoc) constraints.push(startAfter(lastDoc));

  const q = query(collection(db, COLLECTIONS.USERS), ...constraints);
  const snap = await getDocs(q);

  return {
    users: snap.docs.map(d => docToUser(d.data(), d.id)),
    lastDoc: snap.docs.length === 50 ? snap.docs[snap.docs.length - 1] : null,
  };
};

export const updateUserStatus = async (userId: string, isSuspended: boolean): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { isSuspended });

  // Batch-update all seller's products: mark/unmark as sellerSuspended
  const productsQuery = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('sellerId', '==', userId)
  );
  const snap = await getDocs(productsQuery);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(d.ref, { sellerSuspended: isSuspended });
  });
  await batch.commit();
};

export const deleteUser = async (userId: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
};

export const updateUserProfile = async (
  userId: string,
  updates: Record<string, any>
): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), updates);
};

export const updateUserSubscription = async (
  userId: string,
  tierUpdate: { maxProducts: number; tierLabel: string }
): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    'sellerDetails.maxProducts': tierUpdate.maxProducts,
    'sellerDetails.tierLabel': tierUpdate.tierLabel,
  });
};

export const getFirstAdmin = async (): Promise<User | null> => {
  if (!db) return null;
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('role', '==', 'admin'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return docToUser(snap.docs[0].data(), snap.docs[0].id);
};

export const registerSeller = async (userId: string, data: SellerDetails): Promise<User> => {
  if (!db) throw new Error('Firebase non initialisé');

  const userRef = doc(db, COLLECTIONS.USERS, userId);

  const shopName = data.shopName || (await getDoc(userRef)).data()?.name || 'boutique';
  const baseSlug = slugify(shopName);
  let sellerSlug = baseSlug;
  const slugCheck = await getDocs(query(
    collection(db, COLLECTIONS.USERS),
    where('slug', '==', sellerSlug),
    limit(1)
  ));
  if (!slugCheck.empty) {
    sellerSlug = generateUniqueSlug(shopName);
  }

  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleanData[key] = value;
  }

  await updateDoc(userRef, {
    role:          'seller',
    slug:          sellerSlug,
    sellerDetails: { ...cleanData, maxProducts: 5, tierLabel: 'Découverte (Gratuit)' },
    whatsapp:      data.phone,
    isVerified:    false,
    productCount:  0,
    nameLower:     shopName.toLowerCase(),
  });

  const updatedSnap = await getDoc(userRef);
  return docToUser(updatedSnap.data()!, userId);
};
