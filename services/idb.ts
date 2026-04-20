/**
 * NUNULIA — IndexedDB Feed Cache
 *
 * Persists the product feed across full page reloads.
 *
 * Why this layer exists:
 *   - Module-level _homeCache in Home.tsx is in-memory only → dies on page reload
 *   - Firestore's persistentLocalCache (IndexedDB) returns CACHED data for
 *     getDocs() only when OFFLINE. When online-but-slow (2G), it still waits
 *     for the network response.
 *   - This IDB layer stores the full feed snapshot (products + banners +
 *     boosted products) so that even on page reload, the user sees content
 *     in < 50ms while the network fetch runs in background.
 *
 * TTL: 24 hours — long enough for offline sessions, short enough to avoid
 *      seriously stale data.
 */

import type { Product } from '../types';
import type { Banner } from '../components/BannerCarousel';

const DB_NAME   = 'nunulia-feed-v1';
const DB_VERSION = 1;
const STORE     = 'feeds';
const TTL_MS    = 24 * 60 * 60 * 1000; // 24 hours

export interface FeedSnapshot {
  key: string;             // cacheKey string: "category|country|wholesale"
  products: Product[];
  banners: Banner[];
  boostedProducts: Product[];
  ts: number;              // Date.now() when saved
}

// ─── Singleton DB connection ──────────────────────────────────────────────────
// Re-use one open connection per page session. Opening IndexedDB on every
// read/write adds unnecessary overhead (typically 5-20ms per open).

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
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      // If DB is unexpectedly closed (e.g. quota exceeded), reset singleton
      _db.onclose = () => { _db = null; _dbPromise = null; };
      resolve(_db);
    };

    req.onerror = () => {
      _dbPromise = null; // Allow retry on next call
      reject(req.error);
    };
  });

  return _dbPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read a feed snapshot from IDB.
 * Returns null if not found or older than TTL.
 * Never throws — IDB errors are silent.
 */
export async function getFeedFromIDB(key: string): Promise<FeedSnapshot | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);

      req.onsuccess = () => {
        const record = req.result as FeedSnapshot | undefined;
        if (!record || Date.now() - record.ts > TTL_MS) {
          resolve(null);
        } else {
          resolve(record);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null; // Private browsing, quota exceeded, etc.
  }
}

/**
 * Save a feed snapshot to IDB.
 * Called after a successful network fetch to populate the cache.
 * Fire-and-forget — never blocks the UI.
 */
export async function saveFeedToIDB(snapshot: FeedSnapshot): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror   = () => resolve(); // Silent — IDB write failure is non-critical
    });
  } catch {
    // IDB unavailable (private browsing, quota exceeded) — fail silently
  }
}

/**
 * Delete feed entries older than TTL.
 * Call on startup (via requestIdleCallback) to prevent storage bloat.
 */
export async function pruneStaleFeeds(): Promise<void> {
  try {
    const db = await openDB();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    store.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      if (Date.now() - (cursor.value as FeedSnapshot).ts > TTL_MS) {
        cursor.delete();
      }
      cursor.continue();
    };
  } catch {
    // Silent
  }
}
