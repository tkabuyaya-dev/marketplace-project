/**
 * NUNULIA — IndexedDB Draft Queue
 *
 * Persists offline product drafts (queued when seller publishes without working
 * connectivity) across page reloads, scoped per user.
 *
 * Why IDB instead of localStorage:
 *   - A draft holds raw image bytes (one product = up to ~10 MB of photos).
 *     localStorage caps at ~5-10 MB total per origin AND requires base64
 *     serialization (~33% overhead), so a single draft can blow the quota.
 *   - Storing Blobs natively in IDB skips the `fetch(dataUrl)` conversion
 *     that crashes on Chrome Android for large data URLs (>2 MB).
 *   - The `byUserId` index prevents drafts from one account leaking into
 *     another's dashboard on a shared device.
 *
 * All public functions resolve normally on IDB failure (private browsing,
 * quota exceeded). Callers treat a falsy return as "not persisted" and keep
 * working from the in-memory mirror — drafts may be lost on reload but the
 * session continues.
 */

import type { Product } from '../types';

const DB_NAME    = 'nunulia-drafts-v1';
const DB_VERSION = 1;
const STORE      = 'drafts';
const INDEX_USER = 'byUserId';

/**
 * Live status of a draft mid-sync. Persisted in IDB so a tab reload mid-sync
 * surfaces "uploading photo 2 of 3" instead of restarting from "queued".
 *
 * Cleared (set to undefined) on terminal outcomes — success deletes the
 * draft; failure replaces progress with `lastError`.
 */
export interface DraftProgress {
  stage: 'queued' | 'uploading-images' | 'saving-doc';
  /** Present during 'uploading-images'. 0 = not started; equals total when done. */
  imagesUploaded?: number;
  imagesTotal?: number;
}

export interface DraftRecord {
  id: string;
  userId: string;
  data: Partial<Product>;
  /** File extends Blob — stored as-is via IDB structured clone. */
  images: Blob[];
  createdAt: number;
  attempts?: number;
  lastError?: string;
  nextAttemptAt?: number;
  progress?: DraftProgress;
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
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(INDEX_USER, 'userId', { unique: false });
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

/** Load all drafts for a user, oldest first. Returns [] on IDB failure. */
export async function getDraftsByUser(userId: string): Promise<DraftRecord[]> {
  try {
    const db = await openDB();
    return await new Promise<DraftRecord[]>((resolve) => {
      const tx  = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index(INDEX_USER);
      const req = idx.getAll(userId);
      req.onsuccess = () => {
        const out = (req.result as DraftRecord[] | undefined) ?? [];
        out.sort((a, b) => a.createdAt - b.createdAt);
        resolve(out);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Persist a draft. Returns true on success, false on IDB failure. */
export async function putDraft(draft: DraftRecord): Promise<boolean> {
  try {
    const db = await openDB();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch {
    // Silent — caller already removed from in-memory queue.
  }
}
