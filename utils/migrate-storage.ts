/**
 * NUNULIA — One-time localStorage migration (AuraBuja → Nunulia)
 *
 * Migrates existing user data from old "aurabuja_*" keys to new "nunulia_*" keys.
 * Safe to call multiple times — only runs once per browser.
 */

const MIGRATION_FLAG = 'nunulia_storage_migrated';

const KEY_MAP: Record<string, string> = {
  aurabuja_search_history: 'nunulia_search_history',
  aurabuja_popular_searches: 'nunulia_popular_searches',
  aurabuja_algolia_token: 'nunulia_algolia_token',
  aurabuja_cached_user: 'nunulia_cached_user',
  aurabuja_pwa_dismissed: 'nunulia_pwa_dismissed',
  aurabuja_offline_queue: 'nunulia_offline_queue',
  aurabuja_active_countries: 'nunulia_active_countries',
  aurabuja_lang: 'nunulia_lang',
  aurabuja_recently_viewed: 'nunulia_recently_viewed',
  aurabuja_active_country: 'nunulia_active_country',
};

export function migrateLocalStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;

    for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
      const value = localStorage.getItem(oldKey);
      if (value !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value);
        localStorage.removeItem(oldKey);
      }
    }

    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}
