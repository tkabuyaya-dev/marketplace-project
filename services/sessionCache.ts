/**
 * NUNULIA — Session-scoped search cache (L2)
 *
 * Survives full page reloads within the same browser tab/session, but NOT
 * across tabs or after tab close. This is intentional:
 *   - localStorage would persist for days → stale results, manual TTL pain
 *   - IndexedDB is async → can't be read synchronously inside a render path
 *   - sessionStorage is sync (~1-5ms), per-tab, and auto-clears on tab close
 *
 * Used as L2 behind in-memory Map caches in:
 *   - services/algolia.ts (autocomplete suggestions)
 *   - hooks/useSearch.ts (full search results page)
 *
 * Quota strategy: on QuotaExceededError we evict the oldest 25% of entries
 * sharing the same prefix and retry once. Failure after retry is silent —
 * caching is a best-effort optimization, never a correctness requirement.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes — fresh enough for marketplace pricing

interface Entry<T> {
  v: T;
  t: number;
}

function hasSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined';
  } catch {
    // Some privacy modes throw when accessing sessionStorage
    return false;
  }
}

export function readCache<T>(prefix: string, key: string): T | undefined {
  if (!hasSessionStorage()) return undefined;
  try {
    const raw = sessionStorage.getItem(prefix + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.t !== 'number') return undefined;
    if (Date.now() - entry.t > TTL_MS) {
      sessionStorage.removeItem(prefix + key);
      return undefined;
    }
    return entry.v;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(prefix: string, key: string, value: T): void {
  if (!hasSessionStorage()) return;
  const payload = JSON.stringify({ v: value, t: Date.now() } as Entry<T>);
  try {
    sessionStorage.setItem(prefix + key, payload);
  } catch (err) {
    if (isQuotaError(err)) {
      pruneByPrefix(prefix);
      try {
        sessionStorage.setItem(prefix + key, payload);
      } catch {
        // Still failing after eviction — give up silently
      }
    }
  }
}

export function clearByPrefix(prefix: string): void {
  if (!hasSessionStorage()) return;
  const toRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(prefix)) toRemove.push(k);
  }
  for (const k of toRemove) sessionStorage.removeItem(k);
}

function pruneByPrefix(prefix: string): void {
  const entries: { key: string; ts: number }[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    try {
      const e = JSON.parse(sessionStorage.getItem(k) || '{}') as Entry<unknown>;
      entries.push({ key: k, ts: typeof e.t === 'number' ? e.t : 0 });
    } catch {
      sessionStorage.removeItem(k);
    }
  }
  entries.sort((a, b) => a.ts - b.ts);
  const removeCount = Math.max(1, Math.floor(entries.length / 4));
  for (let i = 0; i < removeCount; i++) sessionStorage.removeItem(entries[i].key);
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  // Different browsers use different error codes/names for quota issues
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}
