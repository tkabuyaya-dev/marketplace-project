/**
 * NUNULIA — Seller Inventory IndexedDB Cache
 *
 * Persists the seller's product list across page reloads AND offline so the
 * dashboard can render instantly (cache-first) and stay usable when the
 * network drops mid-session. Sits alongside the drafts queue (draftsIdb.ts)
 * in the seller's offline toolkit.
 *
 * TTL is loose (24 h) — the dashboard always re-fetches on mount when online
 * to refresh, and writes back on success. The staleness label in the UI is
 * derived from `ts`, not from this TTL.
 *
 * Scoped per `userId`: switching accounts on a shared device must not show
 * the previous seller's products. The store keys by userId directly.
 *
 * All public functions are silent on IDB failure (private browsing, quota).
 * Returning `null` from `getInventoryFromIDB` means "no cache" — the caller
 * proceeds normally with a network fetch.
 */
import type { Product } from '../types';

const DB_NAME    = 'nunulia-inventory-v1';
const DB_VERSION = 1;
const STORE      = 'snapshots';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 h

export interface InventorySnapshot {
  userId: string;
  products: Product[];
  ts: number;
}

let _db: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'userId' });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; _dbPromise = null; };
      resolve(_db);
    };

    req.onerror = () => {
      _dbPromise = null;
      reject(req.error);
    };
  });

  return _dbPromise;
}

/**
 * Read the cached inventory for a user. Returns null if absent OR older
 * than MAX_AGE_MS (24 h) — older snapshots are treated as missing so we
 * never render data so stale it could mislead the seller.
 */
export async function getInventoryFromIDB(userId: string): Promise<InventorySnapshot | null> {
  try {
    const db = await openDB();
    return await new Promise<InventorySnapshot | null>((resolve) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => {
        const r = req.result as InventorySnapshot | undefined;
        if (!r || Date.now() - r.ts > MAX_AGE_MS) {
          resolve(null);
        } else {
          resolve(r);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveInventoryToIDB(userId: string, products: Product[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ userId, products, ts: Date.now() } satisfies InventorySnapshot);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch {
    // Silent — cache miss next time, dashboard still works
  }
}
