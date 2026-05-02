/**
 * NUNULIA — Real connectivity probe
 *
 * `navigator.onLine` is unreliable on Burundian networks (2G/3G with intermittent
 * drops, public Wi-Fi behind captive portals): it tracks whether a network
 * interface exists, not whether packets reach the public Internet. Chrome
 * DevTools' "Offline" preset is also inconsistent in some setups (active
 * service worker, page already loaded online) and may leave `navigator.onLine`
 * reporting `true` while DNS resolution fails for every request.
 *
 * This probe HEADs a tiny same-origin asset that the service worker can serve
 * from cache when truly offline. If the request succeeds, real connectivity
 * exists; otherwise we treat the user as offline and queue work for later.
 */

const PROBE_URL = '/manifest.json';
const PROBE_TIMEOUT_MS = 5000;

export async function probeConnectivity(): Promise<boolean> {
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
