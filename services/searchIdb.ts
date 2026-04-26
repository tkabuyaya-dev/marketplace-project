/**
 * NUNULIA — IndexedDB Search Cache (L3)
 *
 * Persists Algolia search results across full page reloads AND tab close,
 * up to 6 hours. Sits behind the in-memory Map (L1) and sessionStorage (L2)
 * caches in services/algolia.ts and hooks/useSearch.ts.
 *
 * Why this layer:
 *   - L1 dies on page reload, L2 dies on tab close.
 *   - User who searches "iPhone" at 14h and comes back at 19h same day still
 *     gets results without an Algolia call → keeps free quota healthy and
 *     improves UX on slow African networks (2G/3G).
 *
 * TTL: 6h — long enough to cover a typical browsing session across the day,
 *      short enough that price/stock changes propagate within the same day.
 *
 * All public functions are silent (never throw). IDB unavailable = cache miss,
 * caller falls back to Algolia network.
 */
import type { Product } from '../types';

const DB_NAME    = 'nunulia-search-v1';
const DB_VERSION = 1;
const STORE_AC   = 'autocomplete';
const STORE_SR   = 'searchResults';
const TTL_MS     = 6 * 60 * 60 * 1000;

interface AutocompleteRecord {
  key: string;
  products: Product[];
  ts: number;
}

export interface SearchResultsRecord {
  key: string;
  results: Product[];
  total: number;
  pages: number;
  /** Map serialized as [k, v] pairs because IDB structured-clone supports
   *  Map but our consumer (useSearch.ts) prefers a JSON-compatible shape
   *  shared with the L2 sessionStorage layer. */
  highlightsArr: [string, Record<string, string>][];
  ts: number;
}

// ─── Singleton DB connection ────────────────────────────────────────────────
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
      if (!db.objectStoreNames.contains(STORE_AC)) {
        db.createObjectStore(STORE_AC, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_SR)) {
        db.createObjectStore(STORE_SR, { keyPath: 'key' });
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

// ─── Generic get/put helpers ────────────────────────────────────────────────

function getRecord<T extends { ts: number }>(store: string, key: string): Promise<T | null> {
  return openDB().then(db => new Promise<T | null>((resolve) => {
    try {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => {
        const r = req.result as T | undefined;
        if (!r || Date.now() - r.ts > TTL_MS) {
          resolve(null);
        } else {
          resolve(r);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  })).catch(() => null);
}

function putRecord<T>(store: string, value: T): Promise<void> {
  return openDB().then(db => new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve(); // Silent — write failure non-critical
    } catch {
      resolve();
    }
  })).catch(() => undefined);
}

// ─── Public API: Autocomplete ───────────────────────────────────────────────

export async function getAutocompleteFromIDB(key: string): Promise<Product[] | null> {
  const r = await getRecord<AutocompleteRecord>(STORE_AC, key);
  return r ? r.products : null;
}

export async function saveAutocompleteToIDB(key: string, products: Product[]): Promise<void> {
  await putRecord<AutocompleteRecord>(STORE_AC, { key, products, ts: Date.now() });
}

// ─── Public API: Search results ─────────────────────────────────────────────

export async function getSearchResultsFromIDB(key: string): Promise<SearchResultsRecord | null> {
  return getRecord<SearchResultsRecord>(STORE_SR, key);
}

export async function saveSearchResultsToIDB(
  key: string,
  value: Omit<SearchResultsRecord, 'key' | 'ts'>
): Promise<void> {
  await putRecord<SearchResultsRecord>(STORE_SR, { key, ...value, ts: Date.now() });
}

// ─── Pruning (called from app startup via requestIdleCallback) ──────────────

export async function pruneStaleSearches(): Promise<void> {
  try {
    const db = await openDB();
    for (const store of [STORE_AC, STORE_SR]) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        const ts = (cursor.value as { ts?: number }).ts ?? 0;
        if (Date.now() - ts > TTL_MS) cursor.delete();
        cursor.continue();
      };
    }
  } catch {
    // Silent
  }
}
