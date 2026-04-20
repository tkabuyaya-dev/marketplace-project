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
import { INITIAL_COUNTRIES } from '../constants';
import { CITIES_BY_COUNTRY } from '../data/locations';
import { Product } from '../types';
import { addToSearchHistory, getSearchHistory, getPopularSearches, removeFromSearchHistory, getLocalSuggestions } from '../services/popular-searches';
import { algoliaSearchProductsFull, algoliaAutocompleteProducts } from '../services/algolia';
import { trackSearchClick } from '../services/algolia-insights';
import { useAppContext } from '../contexts/AppContext';
import { JeChercheBlock } from '../components/JeCherche/JeChercheBlock';

// ── Skeleton Card — matches AliExpress two-zone layout ──
const SkeletonCard = () => (
  <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800/60 animate-pulse">
    {/* Image zone */}
    <div className="aspect-square bg-gray-800 relative overflow-hidden">
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.04) 50%, transparent 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.8s infinite linear',
      }} />
    </div>
    {/* Info zone */}
    <div className="p-2.5 space-y-2">
      <div className="h-3 bg-gray-800 rounded-full w-full" />
      <div className="h-3 bg-gray-800 rounded-full w-3/5" />
      <div className="h-3 bg-gray-700/60 rounded-full w-2/5 mt-1" />
      <div className="h-2 bg-gray-800/60 rounded-full w-1/2" />
    </div>
  </div>
);

// ── Safe Algolia highlight renderer ──
// Algolia wraps matched segments in <em>...</em>; everything else is HTML-entity-
// escaped. We split on <em> tags and render each segment as text (React escapes
// it automatically), promoting matches to <mark>. No dangerouslySetInnerHTML.
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'",
};
const decodeEntities = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, m => HTML_ENTITIES[m] ?? m);

function renderHighlight(html: string): React.ReactNode {
  const parts = html.split(/(<em>[\s\S]*?<\/em>)/g);
  return parts.map((part, i) => {
    if (part.startsWith('<em>') && part.endsWith('</em>')) {
      return <mark key={i}>{decodeEntities(part.slice(4, -5))}</mark>;
    }
    return <React.Fragment key={i}>{decodeEntities(part)}</React.Fragment>;
  });
}

// ── Country flag helper ──
function getCountryFlag(countryId?: string): string {
  if (!countryId) return '';
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.flag || '';
}

function getCountryCurrency(countryId?: string): string {
  if (!countryId) return '';
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.currency || '';
}

// ── Product Card — AliExpress-style marketplace card ──
const ProductCard: React.FC<{
  product: Product;
  highlight?: Record<string, string>;
  onClick: () => void;
  index?: number;
}> = ({ product, highlight, onClick, index = 0 }) => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isNew = product.createdAt > thirtyDaysAgo;
  const currency = product.currency || getCountryCurrency(product.countryId);
  const flag = getCountryFlag(product.countryId);
  const discount = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;
  const animDelay = Math.min((index % 20) * 45, 450);
  const stars = Math.min(5, Math.max(0, Math.round(product.rating || 0)));
  const reviewCount = product.reviews || 0;

  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${animDelay}ms` }}
      className={[
        'group w-full text-left overflow-hidden rounded-xl',
        'animate-card-in bg-gray-900 border border-gray-800/60',
        'hover:border-gray-600/80 hover:shadow-xl hover:-translate-y-px',
        'transition-[border-color,box-shadow,transform] duration-300 ease-out',
        product.isSponsored ? 'ring-1 ring-amber-400/20 hover:ring-amber-400/40' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Image zone ── */}
      <div className="relative aspect-square overflow-hidden bg-gray-800">
        {product.images?.[0] ? (
          <img
            src={getOptimizedUrl(product.images[0], 320)}
            alt={product.title}
            loading={index < 6 ? 'eager' : 'lazy'}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-4xl">📦</div>
        )}

        {/* Discount badge — top-left */}
        {discount && (
          <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10 shadow-sm">
            -{discount}%
          </span>
        )}

        {/* Sponsored — top-right */}
        {product.isSponsored && (
          <span className="absolute top-1.5 right-1.5 bg-amber-400/90 backdrop-blur-sm text-gray-900 text-[8px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10 tracking-widest">
            AD
          </span>
        )}

        {/* New badge — top-right (when not sponsored) */}
        {isNew && !product.isSponsored && (
          <span className="absolute top-1.5 right-1.5 bg-emerald-500/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10">
            NEW
          </span>
        )}
      </div>

      {/* ── Info zone ── */}
      <div className="p-2.5 space-y-1">
        {/* Title */}
        {highlight?.title ? (
          <p className="text-[12px] text-gray-200 leading-snug line-clamp-2 [&>mark]:bg-amber-400/30 [&>mark]:text-amber-200 [&>mark]:rounded-sm">
            {renderHighlight(highlight.title)}
          </p>
        ) : (
          <p className="text-[12px] text-gray-200 leading-snug line-clamp-2">{product.title}</p>
        )}

        {/* Stars + review count */}
        {reviewCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-px">
              {[1, 2, 3, 4, 5].map(n => (
                <svg key={n} width="9" height="9" viewBox="0 0 24 24"
                  fill={n <= stars ? '#f59e0b' : 'none'}
                  stroke={n <= stars ? '#f59e0b' : '#4b5563'}
                  strokeWidth="2"
                >
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              ))}
            </div>
            <span className="text-[10px] text-gray-500 leading-none">
              {reviewCount >= 1000 ? `${(reviewCount / 1000).toFixed(1)}K` : reviewCount}
            </span>
          </div>
        )}

        {/* Price row */}
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-[14px] font-bold text-white leading-none">
            {product.price?.toLocaleString()}
          </span>
          <span className="text-[10px] text-gray-500 font-medium">{currency}</span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[10px] text-gray-600 line-through ml-auto">
              {product.originalPrice.toLocaleString()}
            </span>
          )}
        </div>

        {/* Seller + flag */}
        <p className="text-[10px] text-gray-600 truncate leading-none">
          {product.seller?.name || '—'}{flag && <span className="ml-1">{flag}</span>}
        </p>
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
  const [gridDensity, setGridDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const openJeChercheForm = () => window.dispatchEvent(new CustomEvent('open-je-cherche'));

  const {
    query, filters, results, isLoading, hasMore,
    totalCount, error, highlightResults, queryID,
    setQuery, setFilter, resetFilters, loadMore,
  } = useSearch();

  // Local input state — decoupled from useSearch to prevent per-keystroke Algolia calls.
  // Algolia only fires when user presses Enter or selects a suggestion.
  const [inputValue, setInputValue] = useState(query);

  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ── Suggestions state ──
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getSearchHistory().slice(0, 5));
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [autoProducts, setAutoProducts] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const autocompleteAbort = useRef(0);
  const activeCountryRef = useRef(activeCountry);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { activeCountryRef.current = activeCountry; }, [activeCountry]);

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

  // ── Autocomplete: local suggestions only (lightweight, no Algolia per-keystroke) ──
  useEffect(() => {
    const requestId = ++autocompleteAbort.current;
    if (inputValue.length < 1) {
      setSuggestions([]);
      setAutoProducts([]);
      setShowSuggestions(false);
      return;
    }
    // Layer 1: Instant local suggestions (free — no Algolia call)
    const local = getLocalSuggestions(inputValue);
    setSuggestions(local);
    setShowSuggestions(local.length > 0);
    setSelectedSuggestionIdx(-1);

    // Layer 2: Lightweight Algolia autocomplete (2+ chars, 800ms debounce for slow typists)
    if (inputValue.length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const products = await algoliaAutocompleteProducts(inputValue, activeCountryRef.current || undefined);
          if (autocompleteAbort.current !== requestId) return;
          setAutoProducts(products);
          if (products.length > 0 || local.length > 0) setShowSuggestions(true);
        } catch { /* silent */ }
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setAutoProducts([]);
    }
  }, [inputValue]);

  const handleSelectSuggestion = useCallback((term: string) => {
    setInputValue(term);
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
    const term = inputValue.trim();
    if (term) {
      addToSearchHistory(term);
      setRecentSearches(getSearchHistory().slice(0, 5));
      setQuery(term);
    }
    setShowSuggestions(false);
  }, [inputValue, setQuery]);

  const activeFilterCount = [
    filters.country,
    filters.province,
    filters.isNew,
    filters.category,
    filters.minPrice !== null,
    filters.maxPrice !== null,
  ].filter(Boolean).length;

  // ── Filter Sidebar Content (shared desktop/mobile) ──
  const renderFilters = () => (
    <div className="space-y-6">
      {/* Pays — dropdown, défaut = Tous */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('search.countryLabel')}</h4>
        <select
          value={filters.country ?? ''}
          onChange={e => {
            const val = e.target.value || null;
            setFilter('country', val);
            setFilter('province', null); // reset city when country changes
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer focus:border-gold-400/50"
        >
          <option value="">{t('search.allCountries')}</option>
          {countries.map(c => (
            <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
          ))}
        </select>
      </div>

      {/* Ville — dropdown cascadant, visible uniquement quand un pays est sélectionné */}
      {filters.country && CITIES_BY_COUNTRY[filters.country] && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ville</h4>
          <select
            value={filters.province ?? ''}
            onChange={e => setFilter('province', e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer focus:border-gold-400/50"
          >
            <option value="">Toutes les villes</option>
            {CITIES_BY_COUNTRY[filters.country].map(city => (
              <option key={city} value={city}>{city}</option>
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
    <div className="min-h-screen bg-gray-950 pt-safe-header md:pt-24 pb-24 md:pb-8 px-4 md:px-8">
      {/* Toolbar: results count + sort + actions */}
      <div className="max-w-7xl mx-auto mb-4 space-y-2">
        {/* Row 1: count (left) + Je Cherche desktop + sort (right) */}
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-400 flex-1 min-w-0 truncate">
            {isLoading && results.length === 0
              ? t('search.searching')
              : totalCount > 0
              ? `${totalCount.toLocaleString()} ${t('search.results')}${query.trim() ? ` ${t('search.forQuery')} "${query.trim()}"` : ''}`
              : query.trim()
              ? `${t('search.noResults')} "${query.trim()}"`
              : t('search.recentProducts')
            }
          </p>

          {/* Sort Dropdown */}
          <select
            value={filters.sortBy}
            onChange={e => setFilter('sortBy', e.target.value as SearchFiltersState['sortBy'])}
            className="shrink-0 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300 outline-none cursor-pointer"
          >
            <option value="relevance">{t('search.sortRelevance')}</option>
            <option value="newest">{t('search.sortNewest')}</option>
            <option value="price_asc">{t('search.sortPriceAsc')}</option>
            <option value="price_desc">{t('search.sortPriceDesc')}</option>
          </select>

          {/* Grid density toggle — desktop only */}
          <div className="hidden md:flex items-center bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shrink-0">
            <button
              onClick={() => setGridDensity('comfortable')}
              title="Vue confortable"
              className={`p-2 transition-colors ${gridDensity === 'comfortable' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {/* 2×2 grid icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="0.5" y="0.5" width="6.5" height="6.5" rx="1.5"/>
                <rect x="9" y="0.5" width="6.5" height="6.5" rx="1.5"/>
                <rect x="0.5" y="9" width="6.5" height="6.5" rx="1.5"/>
                <rect x="9" y="9" width="6.5" height="6.5" rx="1.5"/>
              </svg>
            </button>
            <button
              onClick={() => setGridDensity('compact')}
              title="Vue compacte"
              className={`p-2 transition-colors ${gridDensity === 'compact' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {/* 3×3 grid icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="0" y="0" width="4.2" height="4.2" rx="1"/>
                <rect x="5.9" y="0" width="4.2" height="4.2" rx="1"/>
                <rect x="11.8" y="0" width="4.2" height="4.2" rx="1"/>
                <rect x="0" y="5.9" width="4.2" height="4.2" rx="1"/>
                <rect x="5.9" y="5.9" width="4.2" height="4.2" rx="1"/>
                <rect x="11.8" y="5.9" width="4.2" height="4.2" rx="1"/>
                <rect x="0" y="11.8" width="4.2" height="4.2" rx="1"/>
                <rect x="5.9" y="11.8" width="4.2" height="4.2" rx="1"/>
                <rect x="11.8" y="11.8" width="4.2" height="4.2" rx="1"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Row 2: mobile only — Filtres */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setShowMobileFilters(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300"
          >
            <span>&#9776;</span> {t('search.filters')}
            {activeFilterCount > 0 && (
              <span className="bg-gold-400 text-gray-900 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
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
            <div className={`grid gap-2 ${
              gridDensity === 'comfortable'
                ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
            }`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className={`grid gap-2 ${
              gridDensity === 'comfortable'
                ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
            }`}>
              {results.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  highlight={highlightResults.get(product.id)}
                  onClick={() => handleProductClick(product, index)}
                  index={index}
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
                      <div key={i} className="flex items-center min-h-[44px] gap-1 bg-gray-800/60 border border-gray-700/50 rounded-full">
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

          {/* Je Cherche — 0 results */}
          {!isLoading && results.length === 0 && !error && query.trim() && (
            <JeChercheBlock
              query={query.trim()}
              mode="no_results"
              onOpen={openJeChercheForm}
            />
          )}

          {/* Je Cherche — few results (1–3) */}
          {!isLoading && results.length > 0 && results.length < 4 && query.trim() && (
            <JeChercheBlock
              query={query.trim()}
              mode="few_results"
              onOpen={openJeChercheForm}
            />
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
