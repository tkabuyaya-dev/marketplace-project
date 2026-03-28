/**
 * NUNULIA — Lazy Firebase Admin Initialization
 *
 * Defers loading firebase-admin until first function invocation.
 * This avoids the 9+ second module load time during Firebase CLI
 * deployment analysis, which has a 10-second timeout.
 */

import type { Firestore } from "firebase-admin/firestore";

let initialized = false;
let _db: Firestore;

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const { initializeApp } = await import("firebase-admin/app");
  initializeApp();
  initialized = true;
}

export async function getDb(): Promise<Firestore> {
  await ensureInitialized();
  if (!_db) {
    const { getFirestore } = await import("firebase-admin/firestore");
    _db = getFirestore();
  }
  return _db;
}
