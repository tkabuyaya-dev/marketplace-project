/**
 * NUNULIA — Notifications Service
 */

import { AppNotification } from '../../types';
import {
  db, collection, doc, addDoc, getDocs, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
  onSnapshot, writeBatch, COLLECTIONS,
} from './constants';
import type { Unsubscribe } from './constants';

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: AppNotification[]) => void
): Unsubscribe => {
  if (!db) return () => {};

  const q = query(
    collection(db, COLLECTIONS.NOTIFICATIONS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt || Date.now(),
    } as AppNotification)));
  });
};

export const markNotificationRead = async (notifId: string): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, notifId), { read: true });
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  if (!db) return;
  const q = query(
    collection(db, COLLECTIONS.NOTIFICATIONS),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
};

export const createNotification = async (notification: Omit<AppNotification, 'id'>): Promise<void> => {
  if (!db) return;
  await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
    ...notification,
    createdAt: serverTimestamp(),
  });
};
