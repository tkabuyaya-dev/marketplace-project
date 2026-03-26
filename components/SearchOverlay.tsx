import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Product, SearchFilters, User } from '../types';
import { searchProducts, searchSellers } from '../services/firebase';
import { algoliaSearchProducts, algoliaSearchSellers } from '../services/algolia';
import { getCachedProducts, setCachedProducts, getCachedSellers, setCachedSellers } from '../services/search-cache';
import { getLocalSuggestions, addToSearchHistory, getSearchHistory, removeFromSearchHistory, getPopularSearches } from '../services/popular-searches';
import { THEME, INITIAL_COUNTRIES } from '../constants';
import { getOptimizedUrl } from '../services/cloudinary';
import { useActiveCountries } from '../hooks/useActiveCountries';
import { useAppContext } from '../contexts/AppContext';
import { useAdaptiveDebounce } from '../hooks/useAdaptiveDebounce';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onProductClick: (product: Product) => void;
  onShopClick?: (seller: User) => void;
}

const DEFAULT_FILTERS: SearchFilters = {
  sort: 'relevance',
  minRating: 0,
};

const DEBOUNCE_MS_FALLBACK = 200;

/** Resolve currency symbol from countryId — fast lookup, no async */
function getCurrencyForCountry(countryId?: string): string {
  if (!countryId) return '';
  const c = INITIAL_COUNTRIES.find(c => c.id === countryId);
  return c?.currency || '';
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose, onProductClick, onShopClick }) => {
  const { t } = useTranslation();
  const { activeCountry, setActiveCountry } = useAppContext();
  const { countries } = useActiveCountries();
  const adaptiveDebounceMs = useAdaptiveDebounce();
  const [query, setQuery] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [shopResults, setShopResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
      setRecentSearches(getSearchHistory().slice(0, 5));
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // --- Layer 1: Local autocomplete suggestions ---
  useEffect(() => {
    if (query.length >= 1 && query.length <= 3) {
      const local = getLocalSuggestions(query);
      setSuggestions(local);
      setShowSuggestions(local.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query]);

  // --- Main Search Pipeline: Browser Cache → Backend Proxy → Algolia Direct → Firestore ---
  useEffect(() => {
    let cancelled = false;

    const doSearch = async () => {
      if (query.length < 2 && !showFilters) {
        setProductResults([]);
        setShopResults([]);
        return;
      }

      // Layer 2: Browser cache check (instant) — include countryId in cache key
      const cacheFilters: SearchFilters = { ...filters, countryId: activeCountry || undefined };
      const cachedProducts = getCachedProducts(query, cacheFilters);
      const cachedSellers = getCachedSellers(query);
      if (cachedProducts !== undefined) {
        setProductResults(cachedProducts);
        setShopResults(cachedSellers || []);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setShowSuggestions(false);

      // Inject active country into filters for all search layers
      const searchFilters: SearchFilters = { ...filters, countryId: activeCountry || undefined };

      // Race: proxy + Algolia + Firestore in parallel — first valid result wins
      const proxyPromise = tryBackendProxy(query, searchFilters, true);
      const algoliaPromise = Promise.all([
        algoliaSearchProducts(query, searchFilters),
        algoliaSearchSellers(query),
      ]);
      const firestorePromise = Promise.all([
        searchProducts(query, searchFilters),
        searchSellers(query),
      ]);

      // Try proxy first (fastest if available), with 1.5s timeout
      const proxyResult = await Promise.race([
        proxyPromise,
        new Promise<null>(r => setTimeout(() => r(null), 1500)),
      ]);
      if (cancelled) return;

      // Client-side country filter — keep products from active country + products without country assigned
      const filterByCountry = (products: Product[]): Product[] => {
        if (!activeCountry) return products;
        return products.filter(p => !p.countryId || p.countryId === activeCountry);
      };

      if (proxyResult) {
        setProductResults(filterByCountry(proxyResult.products));
        setShopResults(proxyResult.sellers);
        setCachedProducts(query, searchFilters, proxyResult.products);
        if (proxyResult.sellers.length > 0) setCachedSellers(query, proxyResult.sellers);
        setIsSearching(false);
        return;
      }

      // Algolia and Firestore are already in-flight — race them
      const [raceProducts, raceShops] = await Promise.race([
        algoliaPromise,
        firestorePromise,
      ]);

      if (cancelled) return;

      const products = raceProducts || [];
      const shops = raceShops || [];
      setProductResults(filterByCountry(products));
      setShopResults(shops);
      setCachedProducts(query, searchFilters, products);
      if (shops.length > 0) setCachedSellers(query, shops);
      setIsSearching(false);
    };

    const debounceMs = adaptiveDebounceMs === Infinity ? DEBOUNCE_MS_FALLBACK : adaptiveDebounceMs;
    const debounce = setTimeout(doSearch, debounceMs);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [query, filters, showFilters, activeCountry, adaptiveDebounceMs]);

  const handleSelectSuggestion = useCallback((term: string) => {
    setQuery(term);
    setShowSuggestions(false);
    addToSearchHistory(term);
  }, []);

  const handleSubmitSearch = useCallback(() => {
    if (query.trim().length >= 2) {
      addToSearchHistory(query.trim());
      setShowSuggestions(false);
      setRecentSearches(getSearchHistory().slice(0, 5));
    }
  }, [query]);

  const handleRemoveRecent = useCallback((term: string) => {
    removeFromSearchHistory(term);
    setRecentSearches(prev => prev.filter(t => t !== term));
  }, []);

  // Reset suggestion index when suggestions change
  useEffect(() => { setSelectedSuggestionIdx(-1); }, [suggestions]);

  // Keyboard navigation for suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedSuggestionIdx >= 0 && suggestions[selectedSuggestionIdx]) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedSuggestionIdx]);
      } else {
        handleSubmitSearch();
      }
      return;
    }
    if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setSelectedSuggestionIdx(prev => Math.min(prev + 1, suggestions.length - 1));
    }
    if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setSelectedSuggestionIdx(prev => Math.max(prev - 1, -1));
    }
    if (e.key === 'Escape') {
      if (showSuggestions) { setShowSuggestions(false); }
      else { onClose(); }
    }
  }, [showSuggestions, suggestions, selectedSuggestionIdx, handleSelectSuggestion, handleSubmitSearch, onClose]);

  // Voice search (Web Speech API)
  const startVoiceSearch = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = document.documentElement.lang || 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopVoiceSearch = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const hasVoiceSupport = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

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

  const toggleFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery('');
  };

  if (!isOpen) return null;

  const showEmptyState = !isSearching && productResults.length === 0 && shopResults.length === 0 && query.length === 0;
  const showNoResults = !isSearching && productResults.length === 0 && shopResults.length === 0 && query.length > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/95 backdrop-blur-2xl animate-fade-in flex flex-col font-sans">

      {/* --- HEADER --- */}
      <div className="pt-safe px-4 pb-4 border-b border-gray-800 bg-gray-900/80 shadow-2xl z-20">
        <div className="max-w-4xl mx-auto w-full pt-4 space-y-4">
           <div className="flex items-center gap-3">
               <button
                 onClick={onClose}
                 className="md:hidden p-3 text-gray-400 hover:text-white transition-colors"
               >
                 <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
               </button>

               <div className="relative flex-1 group">
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                 </span>
                 <input
                   ref={inputRef}
                   type="text"
                   value={query}
                   onChange={(e) => setQuery(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder={t('search.searchPlaceholder')}
                   className="w-full bg-gray-800/50 border border-gray-700/50 rounded-2xl pl-12 pr-20 py-3.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-gray-800 transition-all outline-none"
                   role="combobox"
                   aria-expanded={showSuggestions}
                   aria-autocomplete="list"
                 />
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                   {query && (
                     <button onClick={() => setQuery('')} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-white rounded-full hover:bg-gray-700">
                       <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                   )}
                   {hasVoiceSupport && !query && (
                     <button
                       onClick={isListening ? stopVoiceSearch : startVoiceSearch}
                       className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors ${isListening ? 'text-red-400 bg-red-400/10 animate-pulse' : 'text-gray-500 hover:text-white hover:bg-gray-700'}`}
                       title={t('search.voiceSearch')}
                     >
                       <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" /></svg>
                     </button>
                   )}
                 </div>

                 {/* --- SUGGESTIONS DROPDOWN --- */}
                 {showSuggestions && suggestions.length > 0 && (
                   <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-30" role="listbox">
                     {suggestions.map((s, i) => (
                       <button
                         key={i}
                         onClick={() => handleSelectSuggestion(s)}
                         className={`w-full text-left px-4 min-h-[44px] py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-3 transition-colors ${selectedSuggestionIdx === i ? 'bg-gray-800 text-white' : ''}`}
                         role="option"
                         aria-selected={selectedSuggestionIdx === i}
                       >
                         <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-600 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                         <span>{highlightMatch(s, query)}</span>
                       </button>
                     ))}
                   </div>
                 )}
               </div>

               <button
                 onClick={() => setShowFilters(!showFilters)}
                 className={`p-3.5 rounded-2xl border transition-all duration-300 flex items-center gap-2 ${showFilters ? 'bg-white text-gray-950 border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white'}`}
               >
                 <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                 <span className="hidden md:inline text-sm font-bold">{t('search.filters')}</span>
               </button>
           </div>

           {/* --- FILTER PANEL --- */}
           <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="bg-gray-900 border border-gray-700 rounded-3xl p-5 shadow-inner shadow-black/50 grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Country filter */}
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{t('search.countryLabel')}</label>
                    <div className="flex flex-wrap gap-1.5">
                       {countries.map(c => (
                         <button
                           key={c.id}
                           onClick={() => setActiveCountry(c.id)}
                           className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                             activeCountry === c.id
                               ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                               : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                           }`}
                         >
                           <span>{c.flag}</span>
                           <span>{c.name}</span>
                         </button>
                       ))}
                    </div>
                 </div>
                 {/* Sort: newest */}
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{t('search.sortLabel')}</label>
                    <button
                      onClick={() => toggleFilter('sort', filters.sort === 'newest' ? 'relevance' : 'newest')}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${filters.sort === 'newest' ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                    >
                      {t('search.newest')}
                    </button>
                 </div>
                 <div className="flex justify-end items-end"><button onClick={clearFilters} className="text-xs text-red-400 underline">{t('search.reset')}</button></div>
              </div>
           </div>
        </div>
      </div>

      {/* --- RESULTS AREA --- */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Empty State with Recent & Popular */}
          {showEmptyState && (
            <div className="mt-8 space-y-8">
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="animate-fade-in">
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
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular searches */}
              <div className="animate-fade-in">
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

          {/* Loading */}
          {isSearching && <div className="text-center mt-10"><div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}

          {/* PRODUCTS RESULTS (priorité) */}
          {productResults.length > 0 && (
              <div className="animate-fade-in">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t('search.productsCount', { count: productResults.length })}</h3>
                  <div className="space-y-2">
                    {productResults.map((product) => (
                        <div
                            key={product.id}
                            onClick={() => {
                            onProductClick(product);
                            addToSearchHistory(query.trim());
                            onClose();
                            }}
                            className="group flex items-center gap-4 p-3 rounded-2xl bg-gray-900/40 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 transition-all cursor-pointer"
                        >
                            <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0">
                                <img src={getOptimizedUrl(product.images[0], 80)} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" />
                                <div className={`absolute bottom-0 w-full h-1 bg-gradient-to-r ${THEME.gradient}`}></div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-white font-medium truncate text-lg group-hover:text-blue-400 transition-colors">{product.title}</h4>
                                <p className="text-gray-400 text-sm truncate">{product.seller.name}</p>
                            </div>

                            <div className="text-right">
                                <span className="block font-bold text-white whitespace-nowrap">{product.price.toLocaleString()} <span className="text-xs text-gray-500">{product.currency || getCurrencyForCountry(product.countryId)}</span></span>
                            </div>
                        </div>
                    ))}
                  </div>
              </div>
          )}

          {/* SHOPS RESULTS (après les produits) */}
          {shopResults.length > 0 && (
            <div className="animate-fade-in">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t('search.shopsCount', { count: shopResults.length })}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {shopResults.map((shop) => (
                        <div
                            key={shop.id}
                            onClick={() => {
                                if (onShopClick) {
                                    onShopClick(shop);
                                    onClose();
                                }
                            }}
                            className="flex items-center gap-4 p-4 rounded-2xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-blue-500/50 transition-all cursor-pointer group"
                        >
                            <img src={shop.avatar} className="w-14 h-14 rounded-full border-2 border-gray-600 group-hover:border-blue-500 transition-colors object-cover" />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-white font-bold group-hover:text-blue-400 transition-colors">{shop.name}</h4>
                                    {shop.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                                </div>
                                <p className="text-xs text-gray-500">{t('search.officialShop')}</p>
                            </div>
                            <button className="px-4 py-1.5 rounded-full bg-blue-600/10 text-blue-400 text-xs font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">{t('search.visit')}</button>
                        </div>
                    ))}
                </div>
            </div>
          )}

          {showNoResults && (
             <div className="text-center mt-10 text-gray-500">
               <p>{t('search.noResultsFound')}</p>
             </div>
          )}

        </div>
      </div>

      <div className="hidden md:block text-center py-3 text-[10px] text-gray-600 border-t border-gray-800 bg-gray-900">
        <span className="mx-2">{t('search.escToClose')}</span>
      </div>
    </div>
  );
};

/**
 * Try the backend cached search proxy (Cloud Function).
 * Returns null if unavailable or times out.
 */
async function tryBackendProxy(
  query: string,
  filters: SearchFilters,
  searchShops: boolean
): Promise<{ products: Product[]; sellers: User[] } | null> {
  const baseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;
  if (!baseUrl) return null;

  try {
    const params = new URLSearchParams({ q: query, limit: '20' });
    if (filters.category) params.set('category', filters.category);
    if (filters.countryId) params.set('countryId', filters.countryId);
    if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
    if (filters.sort && filters.sort !== 'relevance') params.set('sort', filters.sort);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${baseUrl}/cachedSearch?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();

    // Convert proxy response to our types
    const products: Product[] = (data.products || []).map((p: any) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      price: p.price,
      originalPrice: p.originalPrice || undefined,
      description: '',
      images: p.images || [],
      category: p.category,
      subCategory: p.subCategory,
      tags: p.tags || [],
      rating: p.rating || 0,
      reviews: p.reviews || 0,
      seller: {
        id: p.sellerId,
        name: p.sellerName || 'Vendeur',
        email: '',
        avatar: '',
        isVerified: p.sellerIsVerified || false,
        role: 'seller' as const,
        joinDate: 0,
      },
      isPromoted: false,
      status: 'approved' as const,
      views: p.views || 0,
      likesCount: p.likesCount || 0,
      reports: 0,
      createdAt: p.createdAt || Date.now(),
      stockQuantity: p.stockQuantity ?? undefined,
      discountPrice: p.discountPrice ?? undefined,
      countryId: p.countryId || undefined,
      currency: p.currency || undefined,
    }));

    const sellers: User[] = searchShops
      ? (data.sellers || []).map((s: any) => ({
          id: s.id,
          slug: s.slug,
          name: s.name || 'Vendeur',
          email: '',
          avatar: s.avatar || '',
          isVerified: s.isVerified || false,
          role: 'seller' as const,
          joinDate: 0,
          productCount: s.productCount || 0,
        }))
      : [];

    return { products, sellers };
  } catch {
    return null; // Timeout or network error — fallback to direct Algolia
  }
}
