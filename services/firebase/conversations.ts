/**
 * AURABUJA — Conversations & Messaging Service
 */

import { User, Message, Conversation } from '../../types';
import {
  db, auth, collection, doc, addDoc, getDocs, updateDoc,
  query, where, orderBy, limit, serverTimestamp, increment,
  onSnapshot, writeBatch, COLLECTIONS,
} from './constants';
import type { Unsubscribe } from './constants';
import { getUserById } from './users';

export const getConversations = async (): Promise<Conversation[]> => {
  if (!db || !auth?.currentUser) return [];

  const q = query(
    collection(db, COLLECTIONS.CONVERSATIONS),
    where('participantIds', 'array-contains', auth.currentUser.uid),
    orderBy('lastMessageAt', 'desc'),
    limit(20)
  );

  const snap = await getDocs(q);

  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const otherUserId = data.participantIds.find((id: string) => id !== auth.currentUser!.uid);
      const otherUser = otherUserId ? await getUserById(otherUserId) : null;

      return {
        id: d.id,
        participants: [
          { id: auth.currentUser!.uid } as User,
          otherUser || { id: otherUserId } as User
        ],
        lastMessage: data.lastMessage as Message,
        unreadCount: data.unreadCount || 0,
        productId: data.productId,
      } as Conversation;
    })
  );
};

export const getMessages = async (conversationId: string): Promise<Message[]> => {
  if (!db) return [];

  const q = query(
    collection(db, COLLECTIONS.CONVERSATIONS, conversationId, COLLECTIONS.MESSAGES),
    orderBy('timestamp', 'asc'),
    limit(50)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    text:       d.data().text,
    senderId:   d.data().senderId,
    receiverId: d.data().receiverId,
    timestamp:  d.data().timestamp?.toMillis() || Date.now(),
    read:       d.data().read || false,
  }));
};

export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: Message[]) => void
): Unsubscribe => {
  if (!db) return () => {};

  const q = query(
    collection(db, COLLECTIONS.CONVERSATIONS, conversationId, COLLECTIONS.MESSAGES),
    orderBy('timestamp', 'asc'),
    limit(100)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({
      id: d.id,
      text:       d.data().text,
      senderId:   d.data().senderId,
      receiverId: d.data().receiverId,
      timestamp:  d.data().timestamp?.toMillis() || Date.now(),
      read:       d.data().read || false,
    })));
  });
};

export const sendMessage = async (
  text: string,
  conversationId: string,
  receiverId: string
): Promise<Message> => {
  if (!db || !auth?.currentUser) throw new Error('Non authentifié');

  const sanitizedText = text.trim().substring(0, 2000);
  if (!sanitizedText) throw new Error('Message vide');

  const batch = writeBatch(db);

  const msgRef = doc(collection(db, COLLECTIONS.CONVERSATIONS, conversationId, COLLECTIONS.MESSAGES));
  const messageData = {
    text:       sanitizedText,
    senderId:   auth.currentUser.uid,
    receiverId,
    timestamp:  serverTimestamp(),
    read:       false,
  };
  batch.set(msgRef, messageData);

  const convRef = doc(db, COLLECTIONS.CONVERSATIONS, conversationId);
  batch.update(convRef, {
    lastMessage:   { text: sanitizedText, senderId: auth.currentUser.uid },
    lastMessageAt: serverTimestamp(),
    unreadCount:   increment(1),
  });

  await batch.commit();

  try {
    const senderName = auth.currentUser.displayName || 'Quelqu\'un';
    await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
      userId: receiverId,
      type: 'new_message',
      title: 'Nouveau message',
      body: `${senderName}: ${sanitizedText.substring(0, 80)}${sanitizedText.length > 80 ? '…' : ''}`,
      read: false,
      createdAt: serverTimestamp(),
      data: { conversationId },
    });
  } catch (e) {
    console.warn('Notification non créée:', e);
  }

  return {
    id:         msgRef.id,
    text:       sanitizedText,
    senderId:   auth.currentUser.uid,
    receiverId,
    timestamp:  Date.now(),
    read:       false,
  };
};

export const resetConversationUnread = async (conversationId: string): Promise<void> => {
  if (!db || !auth?.currentUser) return;
  try {
    const convRef = doc(db, COLLECTIONS.CONVERSATIONS, conversationId);
    await updateDoc(convRef, { unreadCount: 0 });
  } catch (e) {
    console.warn('Reset unread failed:', e);
  }
};

export const getAllMessagesAdmin = async (): Promise<Message[]> => { return []; };

export const createOrGetConversation = async (
  otherUserId: string,
  productId?: string
): Promise<string> => {
  if (!db || !auth?.currentUser) throw new Error('Non authentifié');

  const myUid = auth.currentUser.uid;

  const q = query(
    collection(db, COLLECTIONS.CONVERSATIONS),
    where('participantIds', 'array-contains', myUid),
    limit(50)
  );
  const snap = await getDocs(q);

  const existing = snap.docs.find(d => {
    const ids = d.data().participantIds as string[];
    return ids.includes(otherUserId);
  });

  if (existing) return existing.id;

  const convRef = await addDoc(collection(db, COLLECTIONS.CONVERSATIONS), {
    participantIds: [myUid, otherUserId],
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    unreadCount: 0,
    productId: productId || null,
  });

  return convRef.id;
};
