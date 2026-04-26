import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  getAutocompleteFromIDB,
  saveAutocompleteToIDB,
  getSearchResultsFromIDB,
  saveSearchResultsToIDB,
  pruneStaleSearches,
} from '../../services/searchIdb';
import type { Product } from '../../types';

// Reset the IDB between tests so the singleton DB connection is recreated.
// Note: the module's singleton _db is reset implicitly because each test gets
// a fresh IDBFactory; the next openDB() call hits onupgradeneeded again.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock Date.now() instead of using vi.useFakeTimers() — fake-indexeddb relies
// on real setTimeout/microtask scheduling internally, so faking timers makes
// IDB callbacks never fire.
function mockNow(iso: string): void {
  vi.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime());
}

const fakeProduct = (id: string, title = 'Sample'): Product => ({
  id,
  slug: id,
  title,
  price: 100,
  description: '',
  images: [],
  category: 'tech',
  tags: [],
  rating: 0,
  reviews: 0,
  seller: { id: 's1', name: 'Vendeur', email: '', avatar: '', isVerified: false, role: 'seller', joinDate: 0 } as any,
  isPromoted: false,
  isSponsored: false,
  status: 'approved',
  views: 0,
  likesCount: 0,
  reports: 0,
  createdAt: Date.now(),
} as Product);

describe('searchIdb — autocomplete', () => {
  it('returns null for missing key', async () => {
    expect(await getAutocompleteFromIDB('missing')).toBeNull();
  });

  it('round-trips products', async () => {
    const products = [fakeProduct('1', 'iPhone'), fakeProduct('2', 'Samsung')];
    await saveAutocompleteToIDB('iphone|bi', products);
    const read = await getAutocompleteFromIDB('iphone|bi');
    expect(read).not.toBeNull();
    expect(read).toHaveLength(2);
    expect(read![0].title).toBe('iPhone');
  });

  it('returns null past TTL (6h)', async () => {
    mockNow('2026-01-01T00:00:00Z');
    await saveAutocompleteToIDB('iphone|bi', [fakeProduct('1')]);
    mockNow('2026-01-01T06:01:00Z'); // +6h 1min
    expect(await getAutocompleteFromIDB('iphone|bi')).toBeNull();
  });
});

describe('searchIdb — search results', () => {
  it('returns null for missing key', async () => {
    expect(await getSearchResultsFromIDB('missing')).toBeNull();
  });

  it('round-trips a search result with serialized highlights', async () => {
    const value = {
      results: [fakeProduct('1', 'iPhone 15')],
      total: 1,
      pages: 1,
      highlightsArr: [['1', { title: '<mark>iPhone</mark> 15' }]] as [string, Record<string, string>][],
    };
    await saveSearchResultsToIDB('q1', value);
    const read = await getSearchResultsFromIDB('q1');
    expect(read).not.toBeNull();
    expect(read!.results).toHaveLength(1);
    expect(read!.highlightsArr[0][1].title).toContain('mark');
  });

  it('returns null past TTL', async () => {
    mockNow('2026-01-01T00:00:00Z');
    await saveSearchResultsToIDB('q1', { results: [], total: 0, pages: 0, highlightsArr: [] });
    mockNow('2026-01-01T06:01:00Z');
    expect(await getSearchResultsFromIDB('q1')).toBeNull();
  });
});

describe('searchIdb — pruning', () => {
  it('removes entries older than TTL across both stores', async () => {
    mockNow('2026-01-01T00:00:00Z');
    await saveAutocompleteToIDB('old', [fakeProduct('1')]);
    await saveSearchResultsToIDB('old-sr', { results: [], total: 0, pages: 0, highlightsArr: [] });

    mockNow('2026-01-01T05:00:00Z');
    await saveAutocompleteToIDB('fresh', [fakeProduct('2')]);

    // Jump beyond TTL for the "old" entries but not the "fresh" one.
    mockNow('2026-01-01T07:00:00Z');
    await pruneStaleSearches();
    // pruneStaleSearches walks cursors fire-and-forget — let the IDB event
    // loop flush before checking results.
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(await getAutocompleteFromIDB('old')).toBeNull();
    expect(await getSearchResultsFromIDB('old-sr')).toBeNull();
    expect(await getAutocompleteFromIDB('fresh')).not.toBeNull();
  });
});
