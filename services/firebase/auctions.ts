/**
 * NUNULIA — Auction Service
 */

import { Product } from '../../types';
import {
  db, doc, updateDoc, increment, serverTimestamp, COLLECTIONS,
} from './constants';
import { auth } from '../../firebase-config';

export const placeBid = async (
  productId: string,
  bidAmount: number
): Promise<void> => {
  if (!db || !auth?.currentUser) throw new Error('Non authentifié');

  const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);

  // Optimistic — Firestore security rules should also validate:
  // - bidAmount > currentBid
  // - auctionEndTime > now
  // - bidder !== seller
  await updateDoc(productRef, {
    currentBid: bidAmount,
    currentBidderId: auth.currentUser.uid,
    bidCount: increment(1),
  });
};
