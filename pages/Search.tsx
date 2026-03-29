/**
 * NUNULIA — Search Page
 *
 * Full-featured search with Algolia: filters sidebar, responsive grid,
 * URL-synced state, infinite scroll, skeleton loading.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSearch, SearchFiltersState } from '../hooks/useSearch';
import { useActiveCountries } from '../hooks/useActiveCountries';
import { useCategories } from '../hooks/useCategories';
import { getOptimizedUrl } from '../services/cloudinary';
import { INITIAL_COUNTRIES, PROVINCES_BY_COUNTRY } from '../constants';
import { COMMUNES_BY_PROVINCE } from '../data/locations';
import { Product } from '../types';
import { addToSearchHistory, getSearchHistory, getPopularSearches, removeFromSearchHistory, getLocalSuggestions } from '../services/popular-searches';
import { algoliaSearchProductsFull } from '../services/algolia';
import { trackSearchClick } from '../services/algolia-insights';
import { useAppContext } from '../contexts/AppContext';

// ── Skeleton Card ──
const SkeletonCard = () => (
  <div className="bg-gray-800/50 rounded-2xl overflow-hidden animate-pulse">
    <div className="aspect-square bg-gray-700/50" />
    <div className="p-3 space-y-2">
      <div className="h-4 bg-gray-700/50 rounded w-3/4" />
      <div className="h-3 bg-gray-700/50 rounded w-1/2" />
      <div className="h-4 bg-gray-700/50 rounded w-1/3" />
    </div>
  </div>
);

// ── Country flag helper ──
function getCountryFlag(countryId?: string): string {
  if (!countryId) return '';
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.flag || '';
}

function getCountryCurrency(countryId?: string): string {
  if (!countryId) return '';
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.currency || '';
}

// ── Product Card ──
const ProductCard: React.FC<{
  product: Product;
  highlight?: Record<string, string>;
  onClick: () => void;
}> = ({ product, highlight, onClick }) => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isNew = product.createdAt > thirtyDaysAgo;
  const currency = product.currency || getCountryCurrency(product.countryId);
  const flag = getCountryFlag(product.countryId);

  return (
    <button
      onClick={onClick}
      className={`bg-gray-800/50 hover:bg-gray-800 border rounded-2xl overflow-hidden transition-all duration-200 text-left group w-full ${
        product.isSponsored ? 'border-gold-400/30 hover:border-gold-400/50' : 'border-gray-700/50 hover:border-gray-600'
      }`}
    >
      {/* Image */}
      <div className="aspect-square relative overflow-hidden bg-gray-900">
        {product.images?.[0] ? (
          <img
            src={getOptimizedUrl(product.images[0], 300)}
            alt={product.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-4xl">📦</div>
        )}
        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.isSponsored && (
            <span className="bg-gold-400/90 text-gray-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              SPONSORED
            </span>
          )}
          {isNew && (
            <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              NEW
            </span>
          )}
        </div>
        {/* Country flag badge */}
        {flag && (
          <span className="absolute bottom-2 left-2 text-lg drop-shadow-lg" title={product.countryId}>
            {flag}
          </span>
        )}
        {product.originalPrice && product.originalPrice > product.price && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        {/* Title with highlight */}
        {highlight?.title ? (
          <p
            className="text-sm text-white font-medium line-clamp-2 [&>mark]:bg-gold-400/30 [&>mark]:text-gold-400 [&>mark]:rounded"
            dangerouslySetInnerHTML={{ __html: highlight.title }}
          />
        ) : (
          <p className="text-sm text-white font-medium line-clamp-2">{product.title}</p>
        )}

        {/* Seller + country */}
        <p className="text-xs text-gray-500 truncate">
          {product.seller?.name || 'Vendeur'} {flag && <span className="ml-0.5">{flag}</span>}
        </p>

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">
            {product.price?.toLocaleString()} {currency}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-xs text-gray-500 line-through">
              {product.originalPrice.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

// ── Main Search Page ──
const SearchPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { countries } = useActiveCountries();
  const { categories } = useCategories();
  const { activeCountry } = useAppContext();
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const {
    query, filters, results, isLoading, hasMore,
    totalCount, error, highlightResults, queryID,
    setQuery, setFilter, resetFilters, loadMore,
  } = useSearch();

  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ── Suggestions state ──
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getSearchHistory().slice(0, 5));
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [autoProducts, setAutoProducts] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const autocompleteAbort = useRef(0);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Autocomplete: local suggestions + Algolia product previews ──
  useEffect(() => {
    const requestId = ++autocompleteAbort.current;
    if (query.length < 1) {
      setSuggestions([]);
      setAutoProducts([]);
      setShowSuggestions(false);
      return;
    }
    // Layer 1: Instant local suggestions
    const local = getLocalSuggestions(query);
    setSuggestions(local);
    setShowSuggestions(local.length > 0);
    setSelectedSuggestionIdx(-1);

    // Layer 2: Algolia product previews (2+ chars, debounced)
    if (query.length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const result = await algoliaSearchProductsFull(query, {
            sort: 'relevance',
            userCountry: activeCountry || undefined,
          }, 0, 5);
          if (autocompleteAbort.current !== requestId) return;
          setAutoProducts(result.products);
          if (result.products.length > 0 || local.length > 0) setShowSuggestions(true);
        } catch { /* silent */ }
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setAutoProducts([]);
    }
  }, [query, activeCountry]);

  const handleSelectSuggestion = useCallback((term: string) => {
    setQuery(term);
    setShowSuggestions(false);
    addToSearchHistory(term);
    setRecentSearches(getSearchHistory().slice(0, 5));
  }, [setQuery]);

  const handleRemoveRecent = useCallback((term: string) => {
    removeFromSearchHistory(term);
    setRecentSearches(prev => prev.filter(t => t !== term));
  }, []);

  // Highlight matching text in suggestions
  const highlightMatch = useCallback((text: string, matchQuery: string) => {
    if (!matchQuery) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(matchQuery.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <span className="text-white font-bold">{text.slice(idx, idx + matchQuery.length)}</span>
        <span>{text.slice(idx + matchQuery.length)}</span>
      </>
    );
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isLoading) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const handleProductClick = useCallback((product: Product, position: number) => {
    if (query.trim()) addToSearchHistory(query.trim());
    // Track click for Algolia analytics
    trackSearchClick(product.id, queryID, position);
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  }, [navigate, query, queryID]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addToSearchHistory(query.trim());
      setRecentSearches(getSearchHistory().slice(0, 5));
    }
    setShowSuggestions(false);
  }, [query]);

  const activeFilterCount = [
    filters.country,
    filters.province,
    filters.commune,
    filters.isNew,
    filters.category,
    filters.minPrice !== null,
    filters.maxPrice !== null,
  ].filter(Boolean).length;

  // ── Filter Sidebar Content (shared desktop/mobile) ──
  const renderFilters = () => (
    <div className="space-y-6">
      {/* Country */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('search.countryLabel')}</h4>
        <div className="space-y-1">
          <button
            onClick={() => { setFilter('country', null); setFilter('province', null); setFilter('commune', null); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !filters.country ? 'bg-gold-400/10 text-gold-400 font-bold' : 'text-gray-400 hover:bg-gray-800'
            }`}
          >
            {t('search.allCountries')}
          </button>
          {countries.map(c => (
            <button
              key={c.id}
              onClick={() => { setFilter('country', filters.country === c.id ? null : c.id); setFilter('province', null); setFilter('commune', null); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                filters.country === c.id ? 'bg-gold-400/10 text-gold-400 font-bold' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              <span>{c.flag}</span> {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Province/Region — visible when a country is selected */}
      {filters.country && PROVINCES_BY_COUNTRY[filters.country] && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('search.provinceLabel')}</h4>
          <select
            value={filters.province || ''}
            onChange={e => {
              setFilter('province', e.target.value || null);
              setFilter('commune', null);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer"
          >
            <option value="">{t('search.allProvinces')}</option>
            {PROVINCES_BY_COUNTRY[filters.country].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* Commune/City — visible when a province is selected and communes data exists */}
      {filters.country && filters.province && COMMUNES_BY_PROVINCE[filters.country]?.[filters.province] && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('search.communeLabel')}</h4>
          <select
            value={filters.commune || ''}
            onChange={e => setFilter('commune', e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer"
          >
            <option value="">{t('search.allCommunes')}</option>
            {COMMUNES_BY_PROVINCE[filters.country][filters.province].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {/* Novelty */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('search.newest')}</h4>
        <button
          onClick={() => setFilter('isNew', !filters.isNew)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left ${
            filters.isNew ? 'bg-green-500/10 text-green-400 font-bold' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
            filters.isNew ? 'bg-green-500 border-green-500' : 'border-gray-600'
          }`}>
            {filters.isNew && <span className="text-white text-[10px]">&#10003;</span>}
          </span>
          {t('search.newOnly')}
        </button>
      </div>

      {/* Category */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('search.category')}</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <button
            onClick={() => setFilter('category', null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !filters.category ? 'bg-gold-400/10 text-gold-400 font-bold' : 'text-gray-400 hover:bg-gray-800'
            }`}
          >
            {t('search.allCategories')}
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilter('category', filters.category === cat.id ? null : cat.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                filters.category === cat.id ? 'bg-gold-400/10 text-gold-400 font-bold' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {cat.icon && <span className="mr-1">{cat.icon}</span>}
              {cat.name || cat.id}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('search.priceRange')}</h4>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder={t('search.min')}
            value={filters.minPrice ?? ''}
            onChange={e => setFilter('minPrice', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold-400/50 outline-none"
          />
          <input
            type="number"
            placeholder={t('search.max')}
            value={filters.maxPrice ?? ''}
            onChange={e => setFilter('maxPrice', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold-400/50 outline-none"
          />
        </div>
      </div>

      {/* Reset */}
      {activeFilterCount > 0 && (
        <button
          onClick={resetFilters}
          className="w-full py-2 text-sm text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg hover:bg-red-500/5 transition-colors"
        >
          {t('search.resetFilters')}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 pt-20 md:pt-24 pb-24 md:pb-8 px-4 md:px-8">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="max-w-3xl mx-auto mb-6">
        <div className="relative" ref={suggestionsRef}>
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">&#128269;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => { if (query.length >= 1 && (suggestions.length > 0 || autoProducts.length > 0)) setShowSuggestions(true); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && showSuggestions) {
                e.preventDefault();
                setSelectedSuggestionIdx(prev => Math.min(prev + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp' && showSuggestions) {
                e.preventDefault();
                setSelectedSuggestionIdx(prev => Math.max(prev - 1, -1));
              } else if (e.key === 'Enter' && selectedSuggestionIdx >= 0 && suggestions[selectedSuggestionIdx]) {
                e.preventDefault();
                handleSelectSuggestion(suggestions[selectedSuggestionIdx]);
              } else if (e.key === 'Escape') {
                setShowSuggestions(false);
              }
            }}
            placeholder={t('search.searchPlaceholder')}
            className="w-full bg-gray-800/80 border border-gray-700 rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/20 outline-none text-sm"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            aria-label={t('search.searchPlaceholder')}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setShowSuggestions(false); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm"
            >
              &#10005;
            </button>
          )}

          {/* Suggestions Dropdown */}
          {showSuggestions && (suggestions.length > 0 || autoProducts.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-30 max-h-[60vh] overflow-y-auto" role="listbox">
              {/* Text suggestions */}
              {suggestions.map((s, i) => (
                <button
                  key={`s-${i}`}
                  onClick={() => handleSelectSuggestion(s)}
                  className={`w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-3 transition-colors ${selectedSuggestionIdx === i ? 'bg-gray-800 text-white' : ''}`}
                  role="option"
                  aria-selected={selectedSuggestionIdx === i}
                >
                  <span className="text-gray-600">&#128269;</span>
                  <span>{highlightMatch(s, query)}</span>
                </button>
              ))}
              {/* Algolia product previews */}
              {autoProducts.length > 0 && (
                <>
                  {suggestions.length > 0 && <div className="border-t border-gray-800 my-1" />}
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-wider">{t('search.productsCount', { count: autoProducts.length })}</div>
                  {autoProducts.map((p) => {
                    const flag = INITIAL_COUNTRIES.find(c => c.id === p.countryId)?.flag || '';
                    const currency = p.currency || INITIAL_COUNTRIES.find(c => c.id === p.countryId)?.currency || '';
                    return (
                      <button
                        key={`p-${p.id}`}
                        onClick={() => {
                          addToSearchHistory(query.trim());
                          setShowSuggestions(false);
                          navigate(`/product/${p.slug || p.id}`, { state: { product: p } });
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-800 flex items-center gap-3 transition-colors"
                      >
                        <img src={getOptimizedUrl(p.images?.[0], 48)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-800" loading="lazy" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 truncate">{p.seller?.name} {flag}</p>
                        </div>
                        <span className="text-sm font-bold text-white whitespace-nowrap">
                          {p.price?.toLocaleString()} <span className="text-[10px] text-gray-500">{currency}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Results count + mobile filter/sort buttons */}
      <div className="max-w-7xl mx-auto mb-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-400">
          {isLoading && results.length === 0
            ? t('search.searching')
            : totalCount > 0
            ? `${totalCount.toLocaleString()} ${t('search.results')}${query.trim() ? ` ${t('search.forQuery')} "${query.trim()}"` : ''}`
            : query.trim()
            ? `${t('search.noResults')} "${query.trim()}"`
            : t('search.recentProducts')
          }
        </p>

        <div className="flex gap-2">
          {/* Mobile Filters Button */}
          <button
            onClick={() => setShowMobileFilters(true)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300"
          >
            <span>&#9776;</span> {t('search.filters')}
            {activeFilterCount > 0 && (
              <span className="bg-gold-400 text-gray-900 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sort Dropdown */}
          <select
            value={filters.sortBy}
            onChange={e => setFilter('sortBy', e.target.value as SearchFiltersState['sortBy'])}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300 outline-none cursor-pointer"
          >
            <option value="relevance">{t('search.sortRelevance')}</option>
            <option value="newest">{t('search.sortNewest')}</option>
            <option value="price_asc">{t('search.sortPriceAsc')}</option>
            <option value="price_desc">{t('search.sortPriceDesc')}</option>
          </select>
        </div>
      </div>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto flex gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24 bg-gray-800/30 border border-gray-700/50 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white mb-4">{t('search.filters')}</h3>
            {renderFilters()}
          </div>
        </aside>

        {/* Results Grid */}
        <div className="flex-1 min-w-0">
          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-4 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setQuery(query)}
                className="mt-2 text-xs text-red-300 underline"
              >
                {t('search.retry')}
              </button>
            </div>
          )}

          {/* Loading Skeletons */}
          {isLoading && results.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {results.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  highlight={highlightResults.get(product.id)}
                  onClick={() => handleProductClick(product, index)}
                />
              ))}
            </div>
          )}

          {/* Recent & Popular Searches (empty query state) */}
          {!isLoading && !query.trim() && results.length === 0 && (
            <div className="space-y-8 py-4">
              {recentSearches.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('search.recentSearches')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term, i) => (
                      <div key={i} className="flex items-center gap-1 bg-gray-800/60 border border-gray-700/50 rounded-full">
                        <button
                          onClick={() => handleSelectSuggestion(term)}
                          className="pl-3 pr-1 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                        >
                          {term}
                        </button>
                        <button
                          onClick={() => handleRemoveRecent(term)}
                          className="pr-2 py-1.5 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          &#10005;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('search.popularSearches')}</h3>
                <div className="flex flex-wrap gap-2">
                  {getPopularSearches().map((term, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectSuggestion(term)}
                      className="px-3 py-1.5 text-sm text-gray-400 bg-gray-800/40 border border-gray-700/50 rounded-full hover:bg-gray-800 hover:text-white hover:border-gray-600 transition-all"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && results.length === 0 && !error && query.trim() && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">&#128270;</div>
              <p className="text-lg text-gray-300 font-bold mb-2">
                {t('search.noResults')} &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="text-sm text-gray-500 mb-4">{t('search.tryDifferent')}</p>
              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-gold-400/10 border border-gold-400/30 text-gold-400 rounded-xl text-sm font-bold hover:bg-gold-400/20 transition-colors"
                >
                  {t('search.clearAllFilters')}
                </button>
              )}
            </div>
          )}

          {/* Load More / Infinite scroll sentinel */}
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-8">
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <button
                  onClick={loadMore}
                  className="px-6 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {t('search.loadMore')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Bottom Sheet */}
      {showMobileFilters && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileFilters(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">{t('search.filters')}</h3>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400"
              >
                &#10005;
              </button>
            </div>
            {renderFilters()}
            <button
              onClick={() => setShowMobileFilters(false)}
              className="w-full mt-6 py-3 bg-gold-400 text-gray-900 font-bold rounded-xl"
            >
              {t('search.applyFilters')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
