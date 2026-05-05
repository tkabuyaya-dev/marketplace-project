/**
 * NUNULIA — useSearch Hook (Search Page Brain)
 *
 * Manages search state, Algolia queries with debounce, pagination,
 * URL sync, caching, and filter composition.
 *
 * Architecture: URL params → state → Algolia query → results
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  QUOTA GUARDS — DO NOT WEAKEN WITHOUT CHECKING DASHBOARD    ║
 * ║  • Minimum debounce: 400ms (line ~234). Below = per-         ║
 * ║    keystroke Algolia calls. African mobile users type slow.  ║
 * ║  • Minimum query length: 2 chars (line ~227).               ║
 * ║  • searchCache (module-level Map) survives navigation.       ║
 * ║    Cache hit = 0 Algolia requests for repeated searches.     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Product } from '../types';
import { algoliaSearchProductsFull, backendSearchProducts, ExtendedSearchFilters } from '../services/algolia';
import { searchProducts } from '../services/firebase';
import { readCache, writeCache } from '../services/sessionCache';
import { getSearchResultsFromIDB, saveSearchResultsToIDB } from '../services/searchIdb';
import { useAppContext } from '../contexts/AppContext';
import { useAdaptiveDebounce } from './useAdaptiveDebounce';

// ── Types ──

export interface SearchFiltersState {
  country: string | null;
  /** City selected by the user (stored as sellerProvince in Algolia). */
  province: string | null;
  isNew: boolean;
  category: string | null;
  sortBy: 'relevance' | 'newest' | 'price_asc' | 'price_desc';
  minPrice: number | null;
  maxPrice: number | null;
}

export interface SearchState {
  query: string;
  filters: SearchFiltersState;
  results: Product[];
  isLoading: boolean;
  hasMore: boolean;
  totalCount: number;
  page: number;
  error: string | null;
  highlightResults: Map<string, Record<string, string>>;
  queryID?: string;
}

const DEFAULT_FILTERS: SearchFiltersState = {
  country: null,
  province: null,
  isNew: false,
  category: null,
  sortBy: 'relevance',
  minPrice: null,
  maxPrice: null,
};

const HITS_PER_PAGE = 20;

// ── Three-tier search cache ──
// L1 = in-memory Map  (0ms,    dies on full page reload)
// L2 = sessionStorage (1-5ms,  survives reload, dies on tab close)
// L3 = IndexedDB      (5-15ms, survives tab close, TTL 6h — services/searchIdb.ts)
//
// Map<string,...> is not JSON-serializable. The L2 / L3 representation stores
// highlights as an array of [key, value] pairs and rehydrates to a Map on read.
interface CacheValue {
  results: Product[];
  total: number;
  pages: number;
  highlights: Map<string, Record<string, string>>;
}
interface CacheValueSerial {
  results: Product[];
  total: number;
  pages: number;
  highlightsArr: [string, Record<string, string>][];
}
const searchCache = new Map<string, CacheValue>();
const SS_PREFIX_SR = 'nun_sr_';

function cacheKey(query: string, filters: SearchFiltersState, page: number): string {
  return JSON.stringify({ q: query.trim().toLowerCase(), ...filters, page });
}

function deserializeCache(serial: CacheValueSerial): CacheValue {
  return {
    results: serial.results,
    total: serial.total,
    pages: serial.pages,
    highlights: new Map(serial.highlightsArr),
  };
}

async function readSearchCache(key: string): Promise<CacheValue | undefined> {
  const l1 = searchCache.get(key);
  if (l1) return l1;

  const l2 = readCache<CacheValueSerial>(SS_PREFIX_SR, key);
  if (l2) {
    const value = deserializeCache(l2);
    searchCache.set(key, value);
    return value;
  }

  const l3 = await getSearchResultsFromIDB(key);
  if (l3) {
    const value = deserializeCache(l3);
    searchCache.set(key, value);
    // Promote to L2 so the next reload doesn't pay the IDB hop
    writeCache<CacheValueSerial>(SS_PREFIX_SR, key, {
      results: l3.results,
      total: l3.total,
      pages: l3.pages,
      highlightsArr: l3.highlightsArr,
    });
    return value;
  }

  return undefined;
}

function writeSearchCache(key: string, value: CacheValue): void {
  searchCache.set(key, value);
  const serial: CacheValueSerial = {
    results: value.results,
    total: value.total,
    pages: value.pages,
    highlightsArr: Array.from(value.highlights.entries()),
  };
  writeCache<CacheValueSerial>(SS_PREFIX_SR, key, serial);
  void saveSearchResultsToIDB(key, serial); // fire-and-forget L3 write
}

// ── Parse filters from URL search params ──
function parseFiltersFromParams(params: URLSearchParams): SearchFiltersState {
  return {
    country: params.get('country') || null,
    province: params.get('city') || params.get('province') || null,
    isNew: params.get('new') === 'true',
    category: params.get('category') || null,
    sortBy: (params.get('sort') as SearchFiltersState['sortBy']) || 'relevance',
    minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : null,
    maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : null,
  };
}

// ── Hook ──

export function useSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCountry } = useAppContext();
  const adaptiveDebounceMs = useAdaptiveDebounce();

  // Initialize state from URL params
  const initialQuery = searchParams.get('q') || '';
  const initialFilters = parseFiltersFromParams(searchParams);

  const [state, setState] = useState<SearchState>({
    query: initialQuery,
    filters: initialFilters,
    results: [],
    isLoading: false,
    hasMore: false,
    totalCount: 0,
    page: 0,
    error: null,
    highlightResults: new Map(),
    queryID: undefined,
  });

  const abortRef = useRef(0); // incremented to cancel stale requests
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the last query we pushed to the URL internally (to ignore our own URL updates)
  const internalQueryRef = useRef(initialQuery);

  // ── URL ↔ State sync ──
  const syncUrlFromState = useCallback((query: string, filters: SearchFiltersState) => {
    // Mark this URL update as internal so the external-change detector ignores it
    internalQueryRef.current = query.trim();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (filters.country) params.set('country', filters.country);
    if (filters.province) params.set('city', filters.province);
    if (filters.isNew) params.set('new', 'true');
    if (filters.category) params.set('category', filters.category);
    if (filters.sortBy !== 'relevance') params.set('sort', filters.sortBy);
    if (filters.minPrice !== null) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== null) params.set('maxPrice', String(filters.maxPrice));
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  // ── Core search function ──
  const executeSearch = useCallback(async (query: string, filters: SearchFiltersState, page: number, append: boolean) => {
    const requestId = ++abortRef.current;

    // Check cache (L1 in-memory → L2 sessionStorage → L3 IndexedDB)
    const key = cacheKey(query, filters, page);
    const cached = await readSearchCache(key);
    if (cached) {
      // A newer request may have fired during the IDB await — bail out
      if (abortRef.current !== requestId) return;
      setState(prev => ({
        ...prev,
        results: append ? [...prev.results, ...cached.results] : cached.results,
        totalCount: cached.total,
        hasMore: page + 1 < cached.pages,
        page,
        isLoading: false,
        error: null,
        highlightResults: append
          ? new Map([...prev.highlightResults, ...cached.highlights])
          : cached.highlights,
      }));
      return;
    }

    // A newer request may have fired during the IDB await — bail out before
    // flipping isLoading on a stale request
    if (abortRef.current !== requestId) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Build Algolia filters
      const algoliaFilters: ExtendedSearchFilters = {
        sort: filters.sortBy === 'relevance' ? 'relevance' :
              filters.sortBy === 'newest' ? 'newest' :
              filters.sortBy === 'price_asc' ? 'price_asc' : 'price_desc',
        countryId: filters.country || undefined,
        sellerProvince: filters.province || undefined,
        category: filters.category || undefined,
        isNew: filters.isNew || undefined,
        minPrice: filters.minPrice ?? undefined,
        maxPrice: filters.maxPrice ?? undefined,
        // Personalization: boost user's active country when no explicit country filter
        userCountry: !filters.country && activeCountry ? activeCountry : undefined,
      };

      // Backend-first: try the Redis-cached proxy (shared across all users).
      // A cache HIT = 0 Algolia operations consumed.
      // Returns null on timeout / unavailability → falls through to direct Algolia.
      const result =
        (await backendSearchProducts(query.trim(), algoliaFilters, page, HITS_PER_PAGE))
        ?? await algoliaSearchProductsFull(query.trim(), algoliaFilters, page, HITS_PER_PAGE);

      // Abort if a newer request was fired
      if (abortRef.current !== requestId) return;

      // Cache result (writes to both L1 and L2)
      writeSearchCache(key, {
        results: result.products,
        total: result.totalHits,
        pages: result.totalPages,
        highlights: result.highlightResults,
      });

      setState(prev => ({
        ...prev,
        results: append ? [...prev.results, ...result.products] : result.products,
        totalCount: result.totalHits,
        hasMore: page + 1 < result.totalPages,
        page,
        isLoading: false,
        error: null,
        highlightResults: append
          ? new Map([...prev.highlightResults, ...result.highlightResults])
          : result.highlightResults,
        queryID: result.queryID || prev.queryID,
      }));
    } catch (err: any) {
      if (abortRef.current !== requestId) return;

      // Fallback to Firestore for basic text search
      try {
        const fallback = await searchProducts(query.trim(), {
          sort: filters.sortBy === 'relevance' ? 'relevance' : filters.sortBy,
          countryId: filters.country || undefined,
          category: filters.category || undefined,
          minPrice: filters.minPrice ?? undefined,
          maxPrice: filters.maxPrice ?? undefined,
        });
        if (abortRef.current !== requestId) return;
        setState(prev => ({
          ...prev,
          results: fallback,
          totalCount: fallback.length,
          hasMore: false,
          page: 0,
          isLoading: false,
          error: null,
          highlightResults: new Map(),
        }));
      } catch {
        if (abortRef.current !== requestId) return;
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err?.message || 'Erreur de recherche',
        }));
      }
    }
  }, []);

  // ── Debounced search trigger ──
  const triggerSearch = useCallback((query: string, filters: SearchFiltersState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Skip Algolia for single-char queries — 2 chars minimum allows "TV", "PC", etc.
    if (query.trim().length < 2) {
      syncUrlFromState(query, filters);
      setState(prev => ({ ...prev, results: [], totalCount: 0, hasMore: false, isLoading: false, error: null }));
      return;
    }

    // Minimum 400ms debounce on search page — prevents per-keystroke Algolia calls
    const debounceMs = adaptiveDebounceMs === Infinity ? 500 : Math.max(adaptiveDebounceMs, 400);
    debounceRef.current = setTimeout(() => {
      syncUrlFromState(query, filters);
      executeSearch(query, filters, 0, false);
    }, debounceMs);
  }, [executeSearch, syncUrlFromState, adaptiveDebounceMs]);

  // ── Public setters ──
  const setQuery = useCallback((newQuery: string) => {
    setState(prev => ({ ...prev, query: newQuery }));
    triggerSearch(newQuery, state.filters);
  }, [triggerSearch, state.filters]);

  const setFilter = useCallback(<K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) => {
    setState(prev => {
      const newFilters = { ...prev.filters, [key]: value };
      triggerSearch(prev.query, newFilters);
      return { ...prev, filters: newFilters };
    });
  }, [triggerSearch]);

  const resetFilters = useCallback(() => {
    setState(prev => {
      triggerSearch(prev.query, DEFAULT_FILTERS);
      return { ...prev, filters: DEFAULT_FILTERS };
    });
  }, [triggerSearch]);

  const loadMore = useCallback(() => {
    if (state.isLoading || !state.hasMore) return;
    executeSearch(state.query, state.filters, state.page + 1, true);
  }, [state.isLoading, state.hasMore, state.query, state.filters, state.page, executeSearch]);

  const resetSearch = useCallback(() => {
    setState({
      query: '',
      filters: DEFAULT_FILTERS,
      results: [],
      isLoading: false,
      hasMore: false,
      totalCount: 0,
      page: 0,
      error: null,
      highlightResults: new Map(),
    });
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // ── Initial search on mount (from URL params) ──
  useEffect(() => {
    if (initialQuery.trim().length >= 2) {
      executeSearch(initialQuery, initialFilters, 0, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Detect external URL changes (e.g. SearchOverlay navigates to /search?q=X) ──
  // When the user is already on /search and the overlay navigates to a new query,
  // the component is NOT remounted — so we must react to searchParams changes here.
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';

    // Skip if this URL change came from our own syncUrlFromState
    if (urlQuery === internalQueryRef.current) return;

    // External navigation detected — sync state from URL and re-search
    internalQueryRef.current = urlQuery;
    const urlFilters = parseFiltersFromParams(searchParams);

    // Clear old results immediately so the user sees loading, not stale data
    setState(prev => ({
      ...prev,
      query: urlQuery,
      filters: urlFilters,
      results: [],
      totalCount: 0,
      page: 0,
      isLoading: urlQuery.trim().length >= 2,
      error: null,
      highlightResults: new Map(),
    }));

    if (urlQuery.trim().length >= 2) {
      executeSearch(urlQuery, urlFilters, 0, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return {
    ...state,
    setQuery,
    setFilter,
    resetFilters,
    loadMore,
    resetSearch,
  };
}
