/**
 * NUNULIA — Popular Searches & Local Suggestions
 *
 * Stores popular/recent search terms in localStorage to provide
 * instant autocomplete suggestions without hitting Algolia.
 *
 * Architecture layer: User → [THIS] → Browser cache → Backend cache → Algolia
 */

const STORAGE_KEY = 'nunulia_search_history';
const POPULAR_KEY = 'nunulia_popular_searches';
const MAX_HISTORY = 20;
const MAX_POPULAR = 30;
const POPULAR_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Default popular searches for new users (Bujumbura marketplace context) */
const DEFAULT_SUGGESTIONS = [
  'iPhone', 'Samsung', 'laptop', 'écouteurs', 'chargeur',
  'chaussures', 'montre', 'sac', 'parfum', 'crème',
  'téléphone', 'tablette', 'accessoires',
];

interface SearchEntry {
  query: string;
  count: number;
  lastUsed: number;
}

interface PopularCache {
  terms: string[];
  timestamp: number;
}

/**
 * Get user's recent search history.
 */
export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Add a search term to history (deduplicates & limits size).
 */
export function addToSearchHistory(query: string): void {
  const term = query.trim();
  if (term.length < 2) return;
  try {
    const history = getSearchHistory().filter(h => h.toLowerCase() !== term.toLowerCase());
    history.unshift(term);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    trackPopularSearch(term);
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Remove a term from search history.
 */
export function removeFromSearchHistory(query: string): void {
  try {
    const history = getSearchHistory().filter(h => h.toLowerCase() !== query.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

/**
 * Clear entire search history.
 */
export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Track a search term for popularity scoring.
 */
function trackPopularSearch(query: string): void {
  try {
    const raw = localStorage.getItem(POPULAR_KEY);
    const entries: SearchEntry[] = raw ? JSON.parse(raw) : [];
    const normalized = query.toLowerCase();
    const existing = entries.find(e => e.query === normalized);
    if (existing) {
      existing.count++;
      existing.lastUsed = Date.now();
    } else {
      entries.push({ query: normalized, count: 1, lastUsed: Date.now() });
    }
    // Keep top entries by count
    entries.sort((a, b) => b.count - a.count);
    localStorage.setItem(POPULAR_KEY, JSON.stringify(entries.slice(0, MAX_POPULAR)));
  } catch {
    // ignore
  }
}

/**
 * Get popular search terms (mix of user data + defaults).
 */
export function getPopularSearches(): string[] {
  try {
    const raw = localStorage.getItem(POPULAR_KEY);
    const entries: SearchEntry[] = raw ? JSON.parse(raw) : [];
    const popular = entries
      .filter(e => e.count >= 2)
      .sort((a, b) => b.count - a.count)
      .map(e => e.query)
      .slice(0, 8);
    if (popular.length >= 5) return popular;
    // Fill with defaults (avoid duplicates)
    const used = new Set(popular.map(p => p.toLowerCase()));
    for (const d of DEFAULT_SUGGESTIONS) {
      if (!used.has(d.toLowerCase())) {
        popular.push(d);
        used.add(d.toLowerCase());
      }
      if (popular.length >= 8) break;
    }
    return popular;
  } catch {
    return DEFAULT_SUGGESTIONS.slice(0, 8);
  }
}

/**
 * Get autocomplete suggestions matching a prefix.
 * Returns suggestions from history + popular that match.
 */
export function getLocalSuggestions(prefix: string): string[] {
  if (prefix.length < 1) return [];
  const lower = prefix.toLowerCase();
  const seen = new Set<string>();
  const results: string[] = [];

  // Priority 1: user's own history
  for (const term of getSearchHistory()) {
    if (term.toLowerCase().startsWith(lower) && !seen.has(term.toLowerCase())) {
      results.push(term);
      seen.add(term.toLowerCase());
    }
    if (results.length >= 5) return results;
  }

  // Priority 2: popular searches
  for (const term of getPopularSearches()) {
    if (term.toLowerCase().startsWith(lower) && !seen.has(term.toLowerCase())) {
      results.push(term);
      seen.add(term.toLowerCase());
    }
    if (results.length >= 5) return results;
  }

  // Priority 3: defaults
  for (const term of DEFAULT_SUGGESTIONS) {
    if (term.toLowerCase().startsWith(lower) && !seen.has(term.toLowerCase())) {
      results.push(term);
      seen.add(term.toLowerCase());
    }
    if (results.length >= 5) return results;
  }

  return results;
}
