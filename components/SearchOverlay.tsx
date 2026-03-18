import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Product, SearchFilters, User } from '../types';
import { searchProducts, searchSellers } from '../services/firebase';
import { algoliaSearchProducts, algoliaSearchSellers } from '../services/algolia';
import { getCachedProducts, setCachedProducts, getCachedSellers, setCachedSellers } from '../services/search-cache';
import { getLocalSuggestions, addToSearchHistory, getSearchHistory, removeFromSearchHistory, getPopularSearches } from '../services/popular-searches';
import { CURRENCY, THEME } from '../constants';

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

const DEBOUNCE_MS = 350;

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose, onProductClick, onShopClick }) => {
  const [query, setQuery] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [shopResults, setShopResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

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

      // Layer 2: Browser cache check (instant)
      const cachedProducts = getCachedProducts(query, filters);
      const cachedSellers = getCachedSellers(query);
      if (cachedProducts !== undefined) {
        setProductResults(cachedProducts);
        setShopResults(cachedSellers || []);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setShowSuggestions(false);

      const searchShops = filters.minPrice === undefined && filters.maxPrice === undefined;

      // Layer 3: Try backend cached search proxy first
      const proxyResult = await tryBackendProxy(query, filters, searchShops);
      if (!cancelled && proxyResult) {
        setProductResults(proxyResult.products);
        setShopResults(proxyResult.sellers);
        setCachedProducts(query, filters, proxyResult.products);
        if (proxyResult.sellers.length > 0) setCachedSellers(query, proxyResult.sellers);
        setIsSearching(false);
        return;
      }

      // Layer 4: Direct Algolia (returns null if not configured or on error)
      const [algoliaProducts, algoliaShops] = await Promise.all([
        algoliaSearchProducts(query, filters),
        searchShops ? algoliaSearchSellers(query) : Promise.resolve([]),
      ]);

      if (cancelled) return;

      if (algoliaProducts !== null) {
        setProductResults(algoliaProducts);
        setShopResults(algoliaShops || []);
        setCachedProducts(query, filters, algoliaProducts);
        if (algoliaShops && algoliaShops.length > 0) setCachedSellers(query, algoliaShops);
        setIsSearching(false);
        return;
      }

      // Layer 5: Firestore fallback
      const [products, shops] = await Promise.all([
        searchProducts(query, filters),
        searchShops ? searchSellers(query) : Promise.resolve([]),
      ]);

      if (cancelled) return;
      setProductResults(products);
      setShopResults(shops);
      setCachedProducts(query, filters, products);
      if (shops.length > 0) setCachedSellers(query, shops);
      setIsSearching(false);
    };

    const debounce = setTimeout(doSearch, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [query, filters, showFilters]);

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
                   onKeyDown={(e) => e.key === 'Enter' && handleSubmitSearch()}
                   placeholder="Rechercher produits ou boutiques..."
                   className="w-full bg-gray-800/50 border border-gray-700/50 rounded-2xl pl-12 pr-12 py-3.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-gray-800 transition-all outline-none"
                 />
                 {query && (
                   <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1 rounded-full hover:bg-gray-700">
                     <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                 )}

                 {/* --- SUGGESTIONS DROPDOWN --- */}
                 {showSuggestions && suggestions.length > 0 && (
                   <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-30">
                     {suggestions.map((s, i) => (
                       <button
                         key={i}
                         onClick={() => handleSelectSuggestion(s)}
                         className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-3 transition-colors"
                       >
                         <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-600 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                         <span>{s}</span>
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
                 <span className="hidden md:inline text-sm font-bold">Filtres</span>
               </button>
           </div>

           {/* --- FILTER PANEL --- */}
           <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="bg-gray-900 border border-gray-700 rounded-3xl p-5 shadow-inner shadow-black/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Trier</label>
                    <div className="flex flex-wrap gap-2">
                       {[{ id: 'price_asc', label: 'Prix -' }, { id: 'price_desc', label: 'Prix +' }, { id: 'newest', label: 'Nouveautés' }].map(opt => (
                         <button key={opt.id} onClick={() => toggleFilter('sort', opt.id)} className={`px-3 py-1.5 rounded-lg text-xs border ${filters.sort === opt.id ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>{opt.label}</button>
                       ))}
                    </div>
                 </div>
                 <div>
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Prix (FBu)</label>
                     <div className="flex gap-2"><input type="number" placeholder="Min" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white" onChange={e => toggleFilter('minPrice', e.target.value ? Number(e.target.value) : undefined)} /><input type="number" placeholder="Max" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white" onChange={e => toggleFilter('maxPrice', e.target.value ? Number(e.target.value) : undefined)} /></div>
                 </div>
                 <div className="flex justify-end items-end"><button onClick={clearFilters} className="text-xs text-red-400 underline">Reset</button></div>
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
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Recherches récentes</h3>
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
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Recherches populaires</h3>
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
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Produits ({productResults.length})</h3>
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
                                <img src={product.images[0]} className="w-full h-full object-cover" alt="" />
                                <div className={`absolute bottom-0 w-full h-1 bg-gradient-to-r ${THEME.gradient}`}></div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-white font-medium truncate text-lg group-hover:text-blue-400 transition-colors">{product.title}</h4>
                                <p className="text-gray-400 text-sm truncate">{product.seller.name}</p>
                            </div>

                            <div className="text-right">
                                <span className="block font-bold text-white whitespace-nowrap">{product.price.toLocaleString()} <span className="text-xs text-gray-500">{CURRENCY}</span></span>
                            </div>
                        </div>
                    ))}
                  </div>
              </div>
          )}

          {/* SHOPS RESULTS (après les produits) */}
          {shopResults.length > 0 && (
            <div className="animate-fade-in">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Boutiques ({shopResults.length})</h3>
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
                                <p className="text-xs text-gray-500">Boutique Officielle</p>
                            </div>
                            <button className="px-4 py-1.5 rounded-full bg-blue-600/10 text-blue-400 text-xs font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">Visiter</button>
                        </div>
                    ))}
                </div>
            </div>
          )}

          {showNoResults && (
             <div className="text-center mt-10 text-gray-500">
               <p>Aucun résultat trouvé.</p>
             </div>
          )}

        </div>
      </div>

      <div className="hidden md:block text-center py-3 text-[10px] text-gray-600 border-t border-gray-800 bg-gray-900">
        <span className="mx-2">ESC pour fermer</span>
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
      marketplace: p.marketplace || undefined,
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
