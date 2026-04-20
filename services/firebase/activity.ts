/**
 * NUNULIA — User Activity Tracking Service
 */

import { ActivityAction } from '../../types';
import {
  db, collection, addDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, COLLECTIONS,
} from './constants';

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
 * Batches in groups of 30 (Firestore 'in' limit).
 * Client-side date filter to avoid needing a composite index.
 */
export const getProductActivityLast30Days = async (
  productIds: string[]
): Promise<ActivityEntry[]> => {
  if (!db || productIds.length === 0) return [];

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const results: ActivityEntry[] = [];

  for (let i = 0; i < productIds.length; i += 30) {
    const batch = productIds.slice(i, i + 30);
    try {
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.USER_ACTIVITY),
          where('productId', 'in', batch),
          limit(500)
        )
      );
      snap.docs.forEach(d => {
        const data = d.data();
        const ts: number = data.createdAt?.toMillis?.() ?? 0;
        if (ts >= thirtyDaysAgo) {
          results.push({
            productId: data.productId as string,
            action: data.action as ActivityAction,
            createdAt: ts,
          });
        }
      });
    } catch (e) {
      console.warn('[getProductActivityLast30Days] batch error:', e);
    }
  }

  return results;
};
