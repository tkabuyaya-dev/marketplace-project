/**
 * NUNULIA — Lazy Firebase Admin Initialization
 *
 * Defers loading firebase-admin until first function invocation.
 * This avoids the 9+ second module load time during Firebase CLI
 * deployment analysis, which has a 10-second timeout.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

let initialized = false;
let _db: Firestore;
let _auth: Auth;

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

export async function getAuth(): Promise<Auth> {
  await ensureInitialized();
  if (!_auth) {
    const { getAuth: _getAuth } = await import("firebase-admin/auth");
    _auth = _getAuth();
  }
  return _auth;
}
