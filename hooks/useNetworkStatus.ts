import { useState, useEffect, useCallback, useRef } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  /** True once: was offline, now back online (resets after 5s) */
  justReconnected: boolean;
}

/**
 * Tracks browser online/offline state with reconnection detection.
 * Fires a callback when network comes back — retries with exponential backoff.
 */
export function useNetworkStatus(onReconnect?: () => void): NetworkStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(!navigator.onLine);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const retryWithBackoff = useCallback(async () => {
    const delays = [1000, 2000, 4000];
    for (let i = 0; i < delays.length; i++) {
      try {
        await onReconnectRef.current?.();
        return true;
      } catch {
        if (i < delays.length - 1) {
          await new Promise(r => setTimeout(r, delays[i]));
        }
      }
    }
    return false;
  }, []);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    if (wasOfflineRef.current) {
      setJustReconnected(true);
      retryWithBackoff();
      setTimeout(() => setJustReconnected(false), 5000);
    }
    wasOfflineRef.current = false;
  }, [retryWithBackoff]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    wasOfflineRef.current = true;
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, justReconnected };
}
