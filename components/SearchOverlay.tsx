import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Product, User } from '../types';
import { algoliaAutocompleteProducts } from '../services/algolia';
import { getLocalSuggestions, addToSearchHistory, getSearchHistory, removeFromSearchHistory, getPopularSearches } from '../services/popular-searches';
import { INITIAL_COUNTRIES } from '../constants';
import { getOptimizedUrl } from '../services/cloudinary';
import { useAppContext } from '../contexts/AppContext';
import { useAdaptiveDebounce } from '../hooks/useAdaptiveDebounce';
import { getTrendingProducts } from '../services/firebase';
import { CURRENCY } from '../constants';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onProductClick: (product: Product) => void;
  onShopClick?: (seller: User) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose, onProductClick }) => {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { activeCountry } = useAppContext();
  const adaptiveDebounceMs = useAdaptiveDebounce();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [autoProducts, setAutoProducts] = useState<Product[]>([]);
  const [discoverProducts, setDiscoverProducts] = useState<Product[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteAbort = useRef(0);
  const activeCountryRef = useRef(activeCountry);
  useEffect(() => { activeCountryRef.current = activeCountry; }, [activeCountry]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
      setRecentSearches(getSearchHistory().slice(0, 10));
      // Fetch "Discover more" products once on open (only if not already loaded)
      if (discoverProducts.length === 0) {
        getTrendingProducts(6, activeCountry || undefined).then(setDiscoverProducts).catch(() => {});
      }
    } else {
      document.body.style.overflow = 'unset';
      setQuery('');
      setSuggestions([]);
      setAutoProducts([]);
      setShowSuggestions(false);
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // --- Autocomplete: local suggestions + Algolia (suggestion-first model)
  // Triggers only at 3+ chars — reduces Algolia calls vs previous 2-char threshold.
  // Debounce follows network quality (adaptive: 150ms WiFi → 500ms 2G).
  useEffect(() => {
    // Never fire when overlay is closed — prevents ghost requests after navigation
    if (!isOpen) return;

    const requestId = ++autocompleteAbort.current;

    if (query.length < 1) {
      setSuggestions([]);
      setAutoProducts([]);
      setShowSuggestions(false);
      return;
    }

    // Layer 1: Instant local suggestions (history + popular)
    const local = getLocalSuggestions(query);
    setSuggestions(local);
    setShowSuggestions(local.length > 0);

    // Layer 2: Algolia product suggestions (2+ chars, 800ms debounce for slow typists)
    // QUOTA GUARD: keep debounce >= 800ms. Lower values = per-keystroke Algolia calls,
    // which can exhaust the 10K monthly quota in hours with multiple users.
    // activeCountry is read via ref (not dep) to prevent double-fire on async load.
    if (query.length >= 2) {
      const debounceMs = adaptiveDebounceMs === Infinity ? 800 : Math.max(adaptiveDebounceMs, 800);
      const timer = setTimeout(async () => {
        const products = await algoliaAutocompleteProducts(query, activeCountryRef.current || undefined);
        if (autocompleteAbort.current !== requestId) return;
        setAutoProducts(products);
        if (products.length > 0 || local.length > 0) setShowSuggestions(true);
      }, debounceMs);
      return () => clearTimeout(timer);
    } else {
      setAutoProducts([]);
    }
  }, [query, adaptiveDebounceMs, isOpen]);

  const handleSelectSuggestion = useCallback((term: string) => {
    setQuery(term);
    setShowSuggestions(false);
    addToSearchHistory(term);
    const params = new URLSearchParams();
    params.set('q', term);
    if (activeCountry) params.set('country', activeCountry);
    onClose();
    nav(`/search?${params.toString()}`);
  }, [activeCountry, onClose, nav]);

  const handleSubmitSearch = useCallback(() => {
    if (query.trim().length >= 2) {
      addToSearchHistory(query.trim());
      setShowSuggestions(false);
      setRecentSearches(getSearchHistory().slice(0, 5));
      const params = new URLSearchParams();
      params.set('q', query.trim());
      if (activeCountry) params.set('country', activeCountry);
      onClose();
      nav(`/search?${params.toString()}`);
    }
  }, [query, activeCountry, onClose, nav]);

  const handleRemoveRecent = useCallback((term: string) => {
    removeFromSearchHistory(term);
    setRecentSearches(prev => prev.filter(t => t !== term));
  }, []);

  useEffect(() => { setSelectedSuggestionIdx(-1); }, [suggestions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showSuggestions && selectedSuggestionIdx >= 0 && suggestions[selectedSuggestionIdx]) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedSuggestionIdx]);
      } else {
        handleSubmitSearch();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showSuggestions) setSelectedSuggestionIdx(prev => Math.min(prev + 1, suggestions.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showSuggestions) setSelectedSuggestionIdx(prev => Math.max(prev - 1, -1));
    }
    if (e.key === 'Escape') {
      if (showSuggestions) setShowSuggestions(false);
      else onClose();
    }
  }, [showSuggestions, suggestions, selectedSuggestionIdx, handleSelectSuggestion, handleSubmitSearch, onClose]);

  const highlightMatch = useCallback((text: string, matchQuery: string) => {
    if (!matchQuery) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(matchQuery.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <span className="text-gray-900 dark:text-white font-bold">{text.slice(idx, idx + matchQuery.length)}</span>
        <span>{text.slice(idx + matchQuery.length)}</span>
      </>
    );
  }, []);

  if (!isOpen) return null;

  const showEmptyState = query.length === 0;

  return (
    <div className="fixed inset-0 z-[100] bg-[#F7F7F5]/95 dark:bg-gray-950/95 backdrop-blur-2xl animate-fade-in flex flex-col font-sans">

      {/* --- HEADER --- */}
      <div className="pt-safe px-4 pb-4 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/80 shadow-md dark:shadow-2xl z-20">
        <div className="max-w-4xl mx-auto w-full pt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              aria-label={t('common.back')}
              className="md:hidden p-3 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div className="relative flex-1 group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-gold-600 dark:group-focus-within:text-blue-400 transition-colors">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('search.searchPlaceholder')}
                className="w-full bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400 focus:bg-white dark:bg-gray-800/50 dark:border-gray-700/50 dark:text-white dark:placeholder-gray-500 dark:focus:ring-blue-500/50 dark:focus:border-blue-500/50 dark:focus:bg-gray-800 rounded-2xl pl-12 pr-20 py-3.5 transition-all outline-none"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
                aria-controls="search-suggestions-listbox"
                aria-activedescendant={selectedSuggestionIdx >= 0 ? `suggestion-${selectedSuggestionIdx}` : undefined}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {query && (
                  <button onClick={() => setQuery('')} aria-label={t('search.clear')} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              {/* --- SUGGESTIONS DROPDOWN (suggestion-first: texte → produits) --- */}
              {showSuggestions && (suggestions.length > 0 || autoProducts.length > 0) && (
                <div
                  id="search-suggestions-listbox"
                  className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden z-30 max-h-[70vh] overflow-y-auto"
                  role="listbox"
                >
                  {/* Section 1 — Suggestions textuelles (cliquable → page résultats) */}
                  {suggestions.map((s, i) => (
                    <button
                      key={`s-${i}`}
                      id={`suggestion-${i}`}
                      onClick={() => handleSelectSuggestion(s)}
                      className={`w-full text-left px-4 min-h-[44px] py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white flex items-center gap-3 transition-colors ${selectedSuggestionIdx === i ? 'bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-white' : ''}`}
                      role="option"
                      aria-selected={selectedSuggestionIdx === i}
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 dark:text-gray-600 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <span>{highlightMatch(s, query)}</span>
                    </button>
                  ))}

                  {/* Section 2 — Keyword suggestions derived from products (click → search results, not product) */}
                  {autoProducts.length > 0 && (
                    <>
                      {suggestions.length > 0 && <div className="border-t border-gray-200 dark:border-gray-800 my-1" />}
                      {autoProducts
                        .filter(p => !suggestions.some(s => s.toLowerCase() === p.title.toLowerCase()))
                        .slice(0, 5)
                        .map((p) => (
                          <button
                            key={`p-${p.id}`}
                            onClick={() => handleSelectSuggestion(p.title)}
                            className="w-full text-left px-4 min-h-[44px] py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white flex items-center gap-3 transition-colors"
                            role="option"
                            aria-selected={false}
                          >
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 dark:text-gray-600 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <span className="truncate flex-1 text-left">{highlightMatch(p.title, query)}</span>
                            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-gray-400 dark:text-gray-700 shrink-0 -rotate-45"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSubmitSearch}
              className="p-3.5 rounded-2xl border bg-gold-600 text-white border-gold-600 hover:bg-gold-700 dark:bg-blue-600 dark:border-blue-500 dark:hover:bg-blue-500 transition-all flex items-center"
              aria-label={t('search.searchPlaceholder')}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* --- RESULTS AREA — empty state only (recent + popular) --- */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {showEmptyState && (
            <div className="space-y-6 animate-fade-in">

              {/* ── Search history ── */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('search.recentSearches')}
                    </h3>
                    <button
                      onClick={() => {
                        recentSearches.forEach(term => removeFromSearchHistory(term));
                        setRecentSearches([]);
                      }}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400 transition-colors p-1"
                      aria-label="Effacer l'historique"
                    >
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectSuggestion(term)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:text-gray-900 hover:border-gray-300 dark:bg-gray-800/70 dark:border-gray-700/50 dark:text-gray-300 dark:hover:text-white dark:hover:border-gray-600 rounded-full text-sm transition-all"
                      >
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 dark:text-gray-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Discover more — product grid like AliExpress ── */}
              {discoverProducts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                    Discover more
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {discoverProducts.map((p) => {
                      const cur = p.currency || CURRENCY;
                      const isPromo = p.discountPrice != null && p.promotionEnd != null && p.promotionEnd > Date.now();
                      const displayPrice = isPromo ? p.discountPrice! : p.price;
                      const discountPct = isPromo
                        ? Math.round(((p.price - p.discountPrice!) / p.price) * 100)
                        : p.originalPrice && p.originalPrice > p.price
                          ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
                          : null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => { onProductClick(p); addToSearchHistory(p.title); }}
                          className="flex items-center gap-2.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-gray-800/60 dark:border-gray-700/40 dark:hover:bg-gray-800 dark:hover:border-gray-600 rounded-xl p-2.5 transition-all text-left"
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                            {p.images?.[0] && (
                              <img
                                src={getOptimizedUrl(p.images[0], 96)}
                                alt={p.title}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-900 dark:text-white font-medium leading-snug line-clamp-2 mb-1">
                              {p.title}
                            </p>
                            {discountPct && discountPct > 0 && (
                              <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold leading-none mb-0.5">
                                Sale -{discountPct}% now
                              </p>
                            )}
                            <p className="text-[11px] text-gold-600 dark:text-amber-400 font-bold leading-none">
                              {displayPrice.toLocaleString('fr-FR')} <span className="text-[9px] font-normal text-gold-600/70 dark:text-amber-400/70">{cur}</span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Popular searches (fallback when no history) ── */}
              {recentSearches.length === 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                    {t('search.popularSearches')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {getPopularSearches().map((term, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectSuggestion(term)}
                        className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 dark:text-gray-400 dark:bg-gray-800/40 dark:border-gray-700/50 dark:hover:bg-gray-800 dark:hover:text-white dark:hover:border-gray-600 rounded-full transition-all"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hint when typing — invites the user to submit */}
          {query.length > 0 && query.length < 3 && (
            <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-600 animate-fade-in">
              {t('search.continueTyping', { defaultValue: 'Continue de taper pour voir les suggestions…' })}
            </div>
          )}

          {query.length >= 3 && !showSuggestions && (
            <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-600 animate-fade-in">
              {t('search.pressEnterToSearch', { defaultValue: 'Appuie sur Entrée pour rechercher «\u00a0{{query}}\u00a0»', query })}
            </div>
          )}
        </div>
      </div>

      <div className="hidden md:flex items-center justify-center gap-4 py-2.5 text-[10px] text-gray-500 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <span><kbd className="bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded px-1.5 py-0.5 font-mono">↑</kbd> <kbd className="bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded px-1.5 py-0.5 font-mono">↓</kbd> {t('search.kbNavigate')}</span>
        <span><kbd className="bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded px-1.5 py-0.5 font-mono">↵</kbd> {t('search.kbSelect')}</span>
        <span><kbd className="bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded px-1.5 py-0.5 font-mono">Esc</kbd> {t('search.escToClose')}</span>
      </div>
    </div>
  );
};
