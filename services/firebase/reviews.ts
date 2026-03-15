/**
 * AURABUJA — Reviews Service
 */

import { Review } from '../../types';
import {
  db, auth, collection, doc, addDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp,
  runTransaction, COLLECTIONS,
} from './constants';

export const getProductReviews = async (
  productId: string,
  maxResults: number = 30
): Promise<Review[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('productId', '==', productId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt || Date.now(),
  } as Review));
};

export const addReview = async (
  productId: string,
  rating: number,
  comment: string,
  images?: string[]
): Promise<Review> => {
  if (!db || !auth?.currentUser) throw new Error('Non authentifié');

  const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid));
  if (!userSnap.exists()) throw new Error('Profil introuvable');
  const userData = userSnap.data();

  const existingQuery = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('productId', '==', productId),
    where('userId', '==', auth.currentUser.uid),
    limit(1)
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) throw new Error('Vous avez déjà laissé un avis pour ce produit.');

  const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));
  const sanitizedComment = comment.trim().substring(0, 1000);

  const reviewData = {
    userId: auth.currentUser.uid,
    userName: userData.name || 'Utilisateur',
    userAvatar: userData.avatar || '',
    productId,
    rating: clampedRating,
    comment: sanitizedComment,
    images: images || [],
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLECTIONS.REVIEWS), reviewData);

  const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
  await runTransaction(db, async (tx) => {
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) return;
    const data = productSnap.data();
    const currentReviews = data.reviews || 0;
    const currentRating = data.rating || 0;
    const newReviewCount = currentReviews + 1;
    const newAvgRating = ((currentRating * currentReviews) + clampedRating) / newReviewCount;
    tx.update(productRef, {
      reviews: newReviewCount,
      rating: Math.round(newAvgRating * 10) / 10,
    });
  });

  return {
    id: docRef.id,
    ...reviewData,
    createdAt: Date.now(),
  } as Review;
};
