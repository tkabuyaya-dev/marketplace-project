/**
 * AURABUJA — Adaptive Debounce Hook
 *
 * Adjusts debounce delay based on network quality using the Network Information API.
 *   WiFi/4G → 150ms
 *   3G      → 300ms
 *   2G      → 500ms
 *   Offline → Infinity (no network request, cache only)
 *
 * Falls back to 200ms when Network Information API is unavailable.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

type ConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

interface NetworkInfo {
  effectiveType: ConnectionType;
  rtt?: number; // Round-trip time in ms
  downlink?: number; // Mbps
}

function getNetworkInfo(): NetworkInfo {
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return { effectiveType: 'unknown' };
  return {
    effectiveType: conn.effectiveType || 'unknown',
    rtt: conn.rtt,
    downlink: conn.downlink,
  };
}

function getDebounceMs(info: NetworkInfo): number {
  if (!navigator.onLine) return Infinity; // Offline — no request

  switch (info.effectiveType) {
    case '4g': return 150;
    case '3g': return 300;
    case '2g':
    case 'slow-2g': return 500;
    default:
      // Use RTT as heuristic if available
      if (info.rtt !== undefined) {
        if (info.rtt < 100) return 150;
        if (info.rtt < 300) return 300;
        return 500;
      }
      return 200; // Fallback
  }
}

/**
 * Returns the current adaptive debounce delay in ms.
 * Re-renders when network type changes.
 */
export function useAdaptiveDebounce(): number {
  const [delayMs, setDelayMs] = useState<number>(() => getDebounceMs(getNetworkInfo()));

  useEffect(() => {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!conn) return;

    const handleChange = () => {
      setDelayMs(getDebounceMs(getNetworkInfo()));
    };

    conn.addEventListener('change', handleChange);
    return () => conn.removeEventListener('change', handleChange);
  }, []);

  // Also listen for online/offline
  useEffect(() => {
    const handleOnline = () => setDelayMs(getDebounceMs(getNetworkInfo()));
    const handleOffline = () => setDelayMs(Infinity);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return delayMs;
}

/**
 * Returns a debounced value that updates after the adaptive delay.
 */
export function useAdaptiveDebouncedValue<T>(value: T): T {
  const delayMs = useAdaptiveDebounce();
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (delayMs === Infinity) return; // Offline — don't update

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

export default useAdaptiveDebounce;
