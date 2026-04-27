/**
 * NUNULIA — Offline Queue Hook
 *
 * Queues product drafts when the seller publishes without working connectivity,
 * then auto-syncs when connectivity is real (not just `navigator.onLine === true`).
 *
 * Why a probe instead of `navigator.onLine`:
 *   On Burundian networks (2G/3G with intermittent drops, public Wi-Fi behind
 *   captive portals) `navigator.onLine` is `true` as soon as a network interface
 *   exists — even when packets never reach the public Internet. Polling a tiny
 *   same-origin asset over HEAD is the only way to know if Cloudinary/Firestore
 *   will be reachable.
 *
 * Why we don't rely on the `online` event alone:
 *   The browser fires `online` only on a `false → true` transition of
 *   `navigator.onLine`. If the page was opened with `navigator.onLine === true`
 *   while the real link was dead, the event will never fire when the link
 *   recovers. We layer `visibilitychange` + a 30 s interval so a sync attempt
 *   happens within at most 30 s of recovery.
 *
 * Per-draft backoff: failed drafts retry on a 30 s → 1 min → 2 min → 4 min →
 *   8 min → 15 min schedule. The user can also force a retry via the
 *   "Réessayer" button which calls `sync({ force: true })`.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Product } from '../types';

const STORAGE_KEY = 'nunulia_offline_queue';
const PROBE_URL = '/manifest.json';
const PROBE_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 30_000;
const BACKOFF_SECONDS = [30, 60, 120, 240, 480, 900];

export interface OfflineDraft {
  id: string;
  data: Partial<Product>;
  images: string[]; // base64 data URLs
  createdAt: number;
  /** Number of retry attempts so far; absent for fresh drafts. */
  attempts?: number;
  /** Last error message — surfaced in the dashboard banner. */
  lastError?: string;
  /** Earliest timestamp (ms) at which the next attempt is allowed. */
  nextAttemptAt?: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  /** Map of draftId → error message for everything that failed this run. */
  errors: Record<string, string>;
}

export interface UseOfflineQueueOptions {
  /**
   * Callback invoked once per due draft. Should throw on failure (the hook
   * will record the error and schedule a retry); success removes the draft.
   * If unset, the hook stores drafts but never auto-syncs (manual mode).
   */
  syncFn?: (draft: OfflineDraft) => Promise<void>;
  /** Notified after each sync sweep — even if nothing was due. */
  onSyncComplete?: (result: SyncResult) => void;
}

function loadQueue(): OfflineDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineDraft[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[OfflineQueue] Storage full:', e);
  }
}

/** HEAD ping a small same-origin asset to confirm real connectivity. */
async function probeConnectivity(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${PROBE_URL}?t=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOfflineQueue(options?: UseOfflineQueueOptions) {
  const [queue, setQueue] = useState<OfflineDraft[]>(loadQueue);
  const [syncing, setSyncing] = useState(false);

  // Refs so the scheduling effect always sees the freshest state without
  // re-subscribing event listeners on every render.
  const queueRef = useRef(queue);
  const syncingRef = useRef(syncing);
  const syncFnRef = useRef(options?.syncFn);
  const onCompleteRef = useRef(options?.onSyncComplete);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { syncingRef.current = syncing; }, [syncing]);
  useEffect(() => { syncFnRef.current = options?.syncFn; }, [options?.syncFn]);
  useEffect(() => { onCompleteRef.current = options?.onSyncComplete; }, [options?.onSyncComplete]);

  // Persist queue changes
  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

  const addToQueue = useCallback((data: Partial<Product>, images: string[]) => {
    const draft: OfflineDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      data,
      images,
      createdAt: Date.now(),
    };
    setQueue(prev => [...prev, draft]);
    return draft.id;
  }, []);

  const removeFromQueue = useCallback((draftId: string) => {
    setQueue(prev => prev.filter(d => d.id !== draftId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  /**
   * Attempt to sync due drafts.
   *   - `force: true` skips the connectivity probe AND the per-draft backoff
   *     window — used when the user explicitly clicks "Réessayer".
   */
  const sync = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    const fn = syncFnRef.current;
    if (!fn) return;
    if (syncingRef.current) return;
    if (queueRef.current.length === 0) return;

    if (!force) {
      const ok = await probeConnectivity();
      if (!ok) return;
    }

    setSyncing(true);
    syncingRef.current = true;
    const now = Date.now();
    const errors: Record<string, string> = {};
    let synced = 0;
    let failed = 0;

    // Snapshot to iterate safely while setQueue mutations queue up.
    const snapshot = [...queueRef.current];
    for (const draft of snapshot) {
      const next = draft.nextAttemptAt ?? 0;
      if (!force && next > now) continue;

      try {
        await fn(draft);
        setQueue(prev => prev.filter(d => d.id !== draft.id));
        synced++;
      } catch (err: any) {
        const attempt = (draft.attempts ?? 0) + 1;
        const delaySec = BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)];
        const message = err?.message ? String(err.message) : String(err);
        errors[draft.id] = message;
        failed++;
        setQueue(prev => prev.map(d => d.id === draft.id
          ? { ...d, attempts: attempt, lastError: message, nextAttemptAt: Date.now() + delaySec * 1000 }
          : d
        ));
      }
    }

    setSyncing(false);
    syncingRef.current = false;
    onCompleteRef.current?.({ synced, failed, errors });
  }, []);

  // Auto-trigger: online event, visibilitychange, periodic poll. All paths
  // funnel through `sync()` which itself probes real connectivity.
  useEffect(() => {
    if (queue.length === 0) return;

    const trigger = () => { sync(); };
    const onVis = () => { if (!document.hidden) trigger(); };

    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVis);
    const interval = window.setInterval(trigger, POLL_INTERVAL_MS);

    // Kick once immediately on mount / when a draft is added.
    trigger();

    return () => {
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(interval);
    };
  }, [queue.length, sync]);

  return {
    queue,
    queueCount: queue.length,
    syncing,
    addToQueue,
    removeFromQueue,
    clearQueue,
    /** Manual trigger for the "Réessayer" button. */
    sync,
  };
}
