/**
 * NUNULIA — User Activity Tracking Service
 */

import { ActivityAction } from '../../types';
import {
  db, collection, addDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, COLLECTIONS,
} from './constants';
import { getFirebaseFunctions } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';

export type ActivityEntry = {
  productId: string;
  action: ActivityAction;
  createdAt: number; // ms timestamp
};

export const trackUserActivity = async (
  userId: string,
  productId: string,
  category: string,
  action: ActivityAction
): Promise<void> => {
  if (!db) return;
  try {
    await addDoc(collection(db, COLLECTIONS.USER_ACTIVITY), {
      userId,
      productId,
      category,
      action,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[trackUserActivity]', e);
  }
};

export const getUserRecentActivity = async (
  userId: string,
  actionFilter: ActivityAction = 'view',
  maxResults: number = 20
): Promise<{ productId: string; category: string }[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.USER_ACTIVITY),
    where('userId', '==', userId),
    where('action', '==', actionFilter),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    productId: d.data().productId,
    category: d.data().category,
  }));
};

export const getAlsoViewedProductIds = async (
  productId: string,
  maxViewers: number = 15,
  maxResults: number = 10
): Promise<string[]> => {
  if (!db) return [];

  const viewersQuery = query(
    collection(db, COLLECTIONS.USER_ACTIVITY),
    where('productId', '==', productId),
    where('action', '==', 'view'),
    orderBy('createdAt', 'desc'),
    limit(maxViewers)
  );
  const viewersSnap = await getDocs(viewersQuery);
  const viewerIds = [...new Set(viewersSnap.docs.map(d => d.data().userId))];

  if (viewerIds.length === 0) return [];

  const batchIds = viewerIds.slice(0, 30);
  const otherViewsQuery = query(
    collection(db, COLLECTIONS.USER_ACTIVITY),
    where('userId', 'in', batchIds),
    where('action', '==', 'view'),
    orderBy('createdAt', 'desc'),
    limit(60)
  );
  const otherSnap = await getDocs(otherViewsQuery);

  const counts: Record<string, number> = {};
  otherSnap.docs.forEach(d => {
    const pid = d.data().productId;
    if (pid !== productId) {
      counts[pid] = (counts[pid] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([id]) => id);
};

/**
 * Returns all activity events for a list of product IDs within the last 30 days.
 *
 * Routed through the `getMyProductsActivity` callable Cloud Function rather
 * than a direct Firestore query: the userActivity rule restricts reads to the
 * event's author (to keep viewer identity private), so a seller cannot read
 * activity on their own products from the client. The Cloud Function runs as
 * admin, validates ownership of every requested productId server-side, and
 * returns only `{ productId, action, createdAt }` triples.
 *
 * Returns an empty array on any failure — the caller's UI degrades gracefully
 * to product-level lifetime counters (`product.views`, `product.likesCount`).
 */
export const getProductActivityLast30Days = async (
  productIds: string[]
): Promise<ActivityEntry[]> => {
  if (productIds.length === 0) return [];
  try {
    const fns = await getFirebaseFunctions();
    if (!fns) return [];
    const fn = httpsCallable<{ productIds: string[] }, { entries: ActivityEntry[] }>(
      fns,
      'getMyProductsActivity'
    );
    const res = await fn({ productIds });
    return res.data?.entries || [];
  } catch (e) {
    console.warn('[getProductActivityLast30Days] callable failed:', e);
    return [];
  }
};
