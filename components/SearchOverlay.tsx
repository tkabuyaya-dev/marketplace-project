import React, { useState, useEffect, useRef } from 'react';
import { Product, SearchFilters, User } from '../types';
import { searchProducts, searchSellers } from '../services/firebase';
import { algoliaSearchProducts, algoliaSearchSellers } from '../services/algolia';
import { CURRENCY, THEME, TC } from '../constants';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onProductClick: (product: Product) => void;
  onShopClick?: (seller: User) => void; // New Prop
}

const DEFAULT_FILTERS: SearchFilters = {
  sort: 'relevance',
  minRating: 0,
};

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose, onProductClick, onShopClick }) => {
  const [query, setQuery] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [shopResults, setShopResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Main Search Effect — Algolia first, Firestore fallback
  useEffect(() => {
    let cancelled = false;

    const doSearch = async () => {
      if (query.length < 2 && !showFilters) {
        setProductResults([]);
        setShopResults([]);
        return;
      }

      setIsSearching(true);

      const searchShops = filters.minPrice === undefined && filters.maxPrice === undefined;

      // Try Algolia first (returns null if not configured or on error)
      const [algoliaProducts, algoliaShops] = await Promise.all([
        algoliaSearchProducts(query, filters),
        searchShops ? algoliaSearchSellers(query) : Promise.resolve([]),
      ]);

      if (cancelled) return;

      // If Algolia returned results, use them
      if (algoliaProducts !== null) {
        setProductResults(algoliaProducts);
        setShopResults(algoliaShops || []);
        setIsSearching(false);
        return;
      }

      // Fallback to Firestore prefix search
      const [products, shops] = await Promise.all([
        searchProducts(query, filters),
        searchShops ? searchSellers(query) : Promise.resolve([]),
      ]);

      if (cancelled) return;
      setProductResults(products);
      setShopResults(shops);
      setIsSearching(false);
    };

    const debounce = setTimeout(doSearch, 200); // Faster debounce with Algolia
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [query, filters, showFilters]);

  const toggleFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/95 backdrop-blur-2xl animate-fade-in flex flex-col font-sans">
      
      {/* --- HEADER --- */}
      <div className="pt-safe px-4 pb-4 border-b border-gray-800 bg-gray-900/80 shadow-2xl z-20">
        <div className="max-w-4xl mx-auto w-full pt-4 space-y-4">
           {/* Top Row: Search Input & Controls */}
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
                   placeholder="Rechercher produits ou boutiques..."
                   className="w-full bg-gray-800/50 border border-gray-700/50 rounded-2xl pl-12 pr-12 py-3.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-gray-800 transition-all outline-none"
                 />
                 {query && (
                   <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1 rounded-full hover:bg-gray-700">
                     <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
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

           {/* --- FILTER PANEL (Same as before) --- */}
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
          
          {/* Default / Empty State */}
          {!isSearching && productResults.length === 0 && shopResults.length === 0 && query.length === 0 && (
             <div className="text-center mt-20 opacity-70">
               <div className="text-6xl mb-4">🛍️</div>
               <p className="text-gray-400 text-lg">Recherchez des produits ou des vendeurs</p>
             </div>
          )}

          {/* Loading */}
          {isSearching && <div className="text-center mt-10"><div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}

          {/* SHOPS RESULTS */}
          {shopResults.length > 0 && (
            <div className="animate-fade-in">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Boutiques Trouvées ({shopResults.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {shopResults.map((shop, idx) => (
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

          {/* PRODUCTS RESULTS */}
          {productResults.length > 0 && (
              <div className="animate-fade-in">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Produits ({productResults.length})</h3>
                  <div className="space-y-2">
                    {productResults.map((product) => (
                        <div
                            key={product.id}
                            onClick={() => {
                            onProductClick(product);
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
          
          {!isSearching && productResults.length === 0 && shopResults.length === 0 && query.length > 0 && (
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
