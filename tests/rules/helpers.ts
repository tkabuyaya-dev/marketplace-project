/**
 * Shared helpers for Firestore Security Rules tests.
 * All tests run against the Firebase Emulator — no real Firestore data is touched.
 */
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const PROJECT_ID = 'nunulia-test';

const RULES_PATH = resolve(__dirname, '../../firestore.rules');

let testEnv: RulesTestEnvironment;

export async function setupTestEnv(): Promise<RulesTestEnvironment> {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  return testEnv;
}

export async function teardownTestEnv(): Promise<void> {
  await testEnv?.cleanup();
}

export async function clearFirestore(): Promise<void> {
  await testEnv?.clearFirestore();
}

/** Authenticated user context */
export function authed(uid: string, tokenAttrs?: Record<string, unknown>): RulesTestContext {
  return testEnv.authenticatedContext(uid, tokenAttrs);
}

/** Unauthenticated (anonymous) context */
export function anon(): RulesTestContext {
  return testEnv.unauthenticatedContext();
}

/** Admin SDK context — bypasses rules (for seeding test data) */
export function adminCtx() {
  return testEnv.withSecurityRulesDisabled(async (ctx) => ctx.firestore());
}

/**
 * Seed a Firestore document as admin (bypasses rules).
 * Use this to set up preconditions for each test.
 */
export async function seedDoc(
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection(collection).doc(id).set(data);
  });
}

/** Assert that a promise rejects with a permission-denied error */
export async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: 'permission-denied' });
}

/** Assert that a promise resolves (permission granted) */
export async function expectPermissionGranted(promise: Promise<unknown>): Promise<void> {
  // Write ops (updateDoc, setDoc, deleteDoc) resolve to void/undefined,
  // so we can't use .toBeDefined(). Map to a sentinel and check that.
  await expect(promise.then(() => 'ok')).resolves.toBe('ok');
}
