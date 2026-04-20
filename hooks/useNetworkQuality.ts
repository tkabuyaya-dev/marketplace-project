/**
 * NUNULIA — Network Quality Detection
 *
 * Uses the Network Information API (Chrome Android, Samsung Internet) to
 * detect connection speed, with a safe fallback for unsupported browsers.
 *
 * Quality levels:
 *   'fast'    → 3G/4G/WiFi — full feature set
 *   'slow'    → 2G/slow-2g or saveData=true — skip heavy loads
 *   'offline' → navigator.onLine === false
 *
 * Use in components to skip non-critical network requests on slow connections:
 *   const quality = useNetworkQuality();
 *   if (quality === 'slow') skipHeavyFetch();
 */

import { useState, useEffect } from 'react';

export type NetworkQuality = 'fast' | 'slow' | 'offline';

function detect(): NetworkQuality {
  if (!navigator.onLine) return 'offline';

  // Network Information API — available on Chrome Android / Samsung Internet
  const conn = (navigator as any).connection
    ?? (navigator as any).mozConnection
    ?? (navigator as any).webkitConnection;

  if (!conn) return 'fast'; // Cannot detect — assume fast (desktop default)

  if (conn.saveData) return 'slow';           // User explicitly requested data saving
  if (conn.effectiveType === 'slow-2g') return 'slow';
  if (conn.effectiveType === '2g')      return 'slow';

  return 'fast';
}

export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>(detect);

  useEffect(() => {
    const update = () => setQuality(detect());
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);

    // Listen to connection change events (Chrome Android)
    const conn = (navigator as any).connection
      ?? (navigator as any).mozConnection
      ?? (navigator as any).webkitConnection;
    conn?.addEventListener('change', update);

    return () => {
      window.removeEventListener('online',  update);
      window.removeEventListener('offline', update);
      conn?.removeEventListener('change', update);
    };
  }, []);

  return quality;
}
