/**
 * AURABUJA — Likes Service
 */

import {
  db, auth, collection, doc, getDoc, getDocs,
  query, where, limit, serverTimestamp, increment,
  runTransaction, writeBatch, COLLECTIONS,
} from './constants';

export const toggleLikeProduct = async (productId: string, userId: string): Promise<boolean> => {
  if (!db) return false;

  const likeId = `${productId}_${userId}`;
  const likeRef = doc(db, COLLECTIONS.LIKES, likeId);
  const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);

  return runTransaction(db, async (tx) => {
    const likeSnap = await tx.get(likeRef);
    const isLiked = likeSnap.exists();

    if (isLiked) {
      tx.delete(likeRef);
      tx.update(productRef, { likesCount: increment(-1) });
      return false;
    } else {
      tx.set(likeRef, { productId, userId, createdAt: serverTimestamp() });
      tx.update(productRef, { likesCount: increment(1) });
      return true;
    }
  });
};

export const checkIsLiked = async (productId: string, userId: string): Promise<boolean> => {
  if (!db) return false;
  const likeSnap = await getDoc(doc(db, COLLECTIONS.LIKES, `${productId}_${userId}`));
  return likeSnap.exists();
};

export const checkIsLikedBatch = async (
  productIds: string[],
  userId: string
): Promise<Record<string, boolean>> => {
  if (!db || !userId || productIds.length === 0) return {};
  const q = query(
    collection(db, COLLECTIONS.LIKES),
    where('userId', '==', userId),
    limit(100)
  );
  const snap = await getDocs(q);
  const likedSet = new Set(snap.docs.map(d => d.data().productId));
  const result: Record<string, boolean> = {};
  productIds.forEach(id => { result[id] = likedSet.has(id); });
  return result;
};

export const reportProduct = async (productId: string, reason: string): Promise<void> => {
  if (!db || !auth?.currentUser) return;

  const batch = writeBatch(db);

  const reportRef = doc(collection(db, COLLECTIONS.REPORTS));
  batch.set(reportRef, {
    productId,
    reporterId: auth.currentUser.uid,
    reason,
    createdAt: serverTimestamp(),
  });

  batch.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
    reports: increment(1),
  });

  await batch.commit();
};
