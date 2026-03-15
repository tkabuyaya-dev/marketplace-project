/**
 * AURABUJA — User Activity Tracking Service
 */

import { ActivityAction } from '../../types';
import {
  db, collection, doc, addDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, COLLECTIONS,
} from './constants';

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
