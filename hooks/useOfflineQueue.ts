/**
 * NUNULIA — Offline Queue Hook
 *
 * Queues product drafts when the seller publishes without working connectivity,
 * then auto-syncs when connectivity is real (not just `navigator.onLine === true`).
 *
 * Storage: drafts live in IndexedDB (services/draftsIdb.ts), scoped by userId
 * via a `byUserId` index. The hook keeps an in-memory mirror as React state
 * and writes through to IDB on every mutation. localStorage is no longer used
 * for the queue — it cannot hold the image Blobs that drafts require.
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
import { getDraftsByUser, putDraft, deleteDraft, type DraftRecord, type DraftProgress } from '../services/draftsIdb';
import { probeConnectivity } from '../utils/connectivity';

const POLL_INTERVAL_MS = 30_000;
const BACKOFF_SECONDS = [30, 60, 120, 240, 480, 900];
/** Defensive cap to keep IDB usage bounded if a seller chains many offline submits. */
const MAX_DRAFTS_PER_USER = 20;

export type OfflineDraft = DraftRecord;
export type { DraftProgress };

export interface SyncResult {
  synced: number;
  failed: number;
  /** Map of draftId → error message for everything that failed this run. */
  errors: Record<string, string>;
}

/**
 * Reports a stage change for the currently-syncing draft.
 * The hook persists the new progress to IDB and updates React state so the
 * dashboard's per-draft row re-renders with the live status.
 */
export type ProgressReporter = (progress: DraftProgress) => void | Promise<void>;

export interface UseOfflineQueueOptions {
  /**
   * Owner of the queue. Required for load/persist — without it the hook is a
   * no-op (no load, no persist, no sync). Switching userId reloads the queue
   * for the new account.
   */
  userId?: string;
  /**
   * Callback invoked once per due draft. Should throw on failure (the hook
   * will record the error and schedule a retry); success removes the draft.
   * Receives a `report` helper to emit stage updates that surface in the UI.
   * If unset, the hook stores drafts but never auto-syncs (manual mode).
   */
  syncFn?: (draft: OfflineDraft, report: ProgressReporter) => Promise<void>;
  /** Notified after each sync sweep — even if nothing was due. */
  onSyncComplete?: (result: SyncResult) => void;
}

export function useOfflineQueue(options?: UseOfflineQueueOptions) {
  const userId = options?.userId;
  const [queue, setQueue] = useState<OfflineDraft[]>([]);
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

  // Load drafts from IDB whenever userId changes (login, account switch).
  useEffect(() => {
    if (!userId) {
      setQueue([]);
      return;
    }
    let cancelled = false;
    getDraftsByUser(userId).then(drafts => {
      if (!cancelled) setQueue(drafts);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const addToQueue = useCallback(async (
    data: Partial<Product>,
    imageFiles: File[],
  ): Promise<string | null> => {
    if (!userId) return null;
    if (queueRef.current.length >= MAX_DRAFTS_PER_USER) return null;
    const draft: OfflineDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      data,
      images: imageFiles,
      createdAt: Date.now(),
    };
    await putDraft(draft);
    setQueue(prev => [...prev, draft]);
    return draft.id;
  }, [userId]);

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

      // Per-draft progress reporter: persists each stage so a tab reload
      // mid-sync surfaces the right "uploading 2/3" text instead of a stale
      // "queued". `latest` carries the live draft so the next call sees the
      // freshest state without re-reading IDB.
      let latest: OfflineDraft = draft;
      const report: ProgressReporter = async (progress) => {
        latest = { ...latest, progress };
        await putDraft(latest);
        setQueue(prev => prev.map(d => d.id === draft.id ? latest : d));
      };

      try {
        await fn(draft, report);
        await deleteDraft(draft.id);
        setQueue(prev => prev.filter(d => d.id !== draft.id));
        synced++;
      } catch (err: any) {
        const attempt = (latest.attempts ?? 0) + 1;
        const delaySec = BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)];
        const message = err?.message ? String(err.message) : String(err);
        errors[draft.id] = message;
        failed++;
        const updated: OfflineDraft = {
          ...latest,
          attempts: attempt,
          lastError: message,
          nextAttemptAt: Date.now() + delaySec * 1000,
          // Clear in-progress stage on failure — the row will render the error,
          // not a stale "uploading" indicator.
          progress: undefined,
        };
        await putDraft(updated);
        setQueue(prev => prev.map(d => d.id === draft.id ? updated : d));
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
    /** Manual trigger for the "Réessayer" button. */
    sync,
  };
}
