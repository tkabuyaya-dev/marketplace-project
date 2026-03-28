/**
 * NUNULIA — Offline Queue Hook
 * Queues product drafts when offline, syncs when back online.
 */

import { useState, useEffect, useCallback } from 'react';
import { Product } from '../types';

const STORAGE_KEY = 'nunulia_offline_queue';

export interface OfflineDraft {
  id: string;
  data: Partial<Product>;
  images: string[]; // base64 data URLs for offline storage
  createdAt: number;
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

export function useOfflineQueue() {
  const [queue, setQueue] = useState<OfflineDraft[]>(loadQueue);
  const [syncing, setSyncing] = useState(false);

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

  return {
    queue,
    queueCount: queue.length,
    syncing,
    setSyncing,
    addToQueue,
    removeFromQueue,
    clearQueue,
  };
}
