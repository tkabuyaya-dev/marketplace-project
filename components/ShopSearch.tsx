import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Product, SearchFilters } from '../types';
import { ProductCard } from './ProductCard';
import { algoliaSearchProducts } from '../services/algolia';
import { trackShopSearch } from '../services/analytics';
import { useNavigate } from 'react-router-dom';

interface ShopSearchProps {
  products: Product[];
  sellerId: string;
  sellerName: string;
  /** Whether all products are loaded (< limit) — enables pure client-side search */
  allLoaded: boolean;
}

const DEFAULT_FILTERS: SearchFilters = { sort: 'relevance' };

/**
 * Intra-shop search with filters.
 * - If allLoaded=true (≤50 products): instant client-side filtering (0 cost)
 * - If allLoaded=false (50+ products): Algolia search with sellerId facet
 */
const ShopSearch: React.FC<ShopSearchProps> = ({ products, sellerId, sellerName, allLoaded }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [algoliaResults, setAlgoliaResults] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Extract unique categories from seller's products
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  // Build autocomplete suggestions from product titles
  const allTitles = useMemo(() => products.map(p => p.title), [products]);

  // Update suggestions as user types
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const q = query.toLowerCase();
    const matches = allTitles
      .filter(t => t.toLowerCase().includes(q))
      .slice(0, 5);
    setSuggestions(matches);
  }, [query, allTitles]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Client-side filtering — instant, free
  const clientFilteredProducts = useMemo(() => {
    let result = [...products];
    const q = query.toLowerCase().trim();

    // Text search
    if (q) {
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(q))) ||
        (p.subCategory && p.subCategory.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (filters.category) {
      result = result.filter(p => p.category === filters.category);
    }

    // Price filters
    if (filters.minPrice !== undefined) {
      result = result.filter(p => p.price >= filters.minPrice!);
    }
    if (filters.maxPrice !== undefined) {
      result = result.filter(p => p.price <= filters.maxPrice!);
    }

    // Rating filter
    if (filters.minRating && filters.minRating > 0) {
      result = result.filter(p => p.rating >= filters.minRating!);
    }

    // In stock filter
    if (filters.inStock) {
      result = result.filter(p => p.stockQuantity === undefined || p.stockQuantity > 0);
    }

    // Sorting
    switch (filters.sort) {
      case 'price_asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
      default: // relevance — keep original order (or by views)
        if (q) {
          // When searching, prioritize exact title match
          result.sort((a, b) => {
            const aExact = a.title.toLowerCase().startsWith(q) ? 1 : 0;
            const bExact = b.title.toLowerCase().startsWith(q) ? 1 : 0;
            return bExact - aExact || b.views - a.views;
          });
        }
        break;
    }

    return result;
  }, [products, query, filters]);

  // Algolia search for large catalogs — debounced
  const searchAlgolia = useCallback(async (searchQuery: string, searchFilters: SearchFilters) => {
    if (!searchQuery.trim() || allLoaded) return;

    setIsSearching(true);
    try {
      const results = await algoliaSearchProducts(searchQuery, {
        ...searchFilters,
        sellerId,
      }, 50);
      setAlgoliaResults(results);

      // Track
      trackShopSearch(searchQuery, results?.length || 0, sellerId, sellerName, searchFilters);
    } catch (err) {
      console.error('[ShopSearch] Algolia error:', err);
      setAlgoliaResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [sellerId, sellerName, allLoaded]);

  // Handle query change with debounce for Algolia
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(value.length >= 2);

    // If all products loaded, client-side is instant — only track
    if (allLoaded) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (value.trim().length >= 2) {
          const count = clientFilteredProducts.length;
          trackShopSearch(value, count, sellerId, sellerName, filters);
        }
      }, 1000);
      return;
    }

    // For large catalogs, debounce Algolia search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 2) {
        searchAlgolia(value, filters);
      } else {
        setAlgoliaResults(null);
      }
    }, 300);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    if (!allLoaded) {
      searchAlgolia(suggestion, filters);
    }
  };

  const handleFilterChange = (newFilters: Partial<SearchFilters>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    if (!allLoaded && query.trim().length >= 2) {
      searchAlgolia(query, updated);
    }
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery('');
    setAlgoliaResults(null);
    setShowSuggestions(false);
  };

  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };

  // Determine which results to show
  const displayProducts = (!allLoaded && algoliaResults !== null) ? algoliaResults : clientFilteredProducts;
  const isActive = query.trim().length > 0 || filters.category || filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.inStock || filters.sort !== 'relevance';
  const hasActiveFilters = filters.category || filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.inStock || filters.minRating;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative" ref={suggestionsRef}>
        <div className="relative flex items-center">
          <svg className="absolute left-4 w-5 h-5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => query.length >= 2 && setSuggestions(s => s.length > 0 ? s : [])}
            placeholder="Rechercher dans cette boutique..."
            className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl pl-12 pr-24 py-3 text-white placeholder-gray-500 focus:border-gold-400/50 focus:bg-gray-800 outline-none transition-all text-sm"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {query && (
              <button
                onClick={() => { setQuery(''); setAlgoliaResults(null); setShowSuggestions(false); }}
                className="p-1.5 text-gray-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-all ${showFilters || hasActiveFilters ? 'bg-gold-400 text-gray-900' : 'text-gray-500 hover:text-white hover:bg-gray-700'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>
          {isSearching && (
            <div className="absolute right-20 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Autocomplete suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-30 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors flex items-center gap-3"
              >
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filtres</span>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-gold-400 hover:text-blue-300 transition-colors">
                Réinitialiser
              </button>
            )}
          </div>

          {/* Categories */}
          {categories.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">Catégorie</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleFilterChange({ category: undefined })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!filters.category ? 'bg-gold-400 text-gray-900' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}
                >
                  Toutes
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => handleFilterChange({ category: filters.category === cat ? undefined : cat })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filters.category === cat ? 'bg-gold-400 text-gray-900' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sort + Price + Stock — responsive grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Sort */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Trier par</label>
              <select
                value={filters.sort}
                onChange={(e) => handleFilterChange({ sort: e.target.value as SearchFilters['sort'] })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
              >
                <option value="relevance">Pertinence</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
                <option value="newest">Nouveautés</option>
              </select>
            </div>

            {/* Min price */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Prix min</label>
              <input
                type="number"
                min={0}
                value={filters.minPrice ?? ''}
                onChange={(e) => handleFilterChange({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
              />
            </div>

            {/* Max price */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Prix max</label>
              <input
                type="number"
                min={0}
                value={filters.maxPrice ?? ''}
                onChange={(e) => handleFilterChange({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="∞"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
              />
            </div>

            {/* In stock */}
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.inStock || false}
                  onChange={(e) => handleFilterChange({ inStock: e.target.checked || undefined })}
                  className="accent-blue-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-gray-400">En stock</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Results or active search indicator */}
      {isActive && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500">
              {displayProducts.length} résultat{displayProducts.length !== 1 ? 's' : ''}
              {query.trim() && <> pour <span className="text-gray-300">"{query}"</span></>}
            </p>
            {isActive && (
              <button
                onClick={resetFilters}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Effacer
              </button>
            )}
          </div>

          {displayProducts.length === 0 ? (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-gray-400 text-sm font-bold">Aucun produit trouvé</p>
              <p className="text-gray-500 text-xs mt-1">Essayez avec d'autres mots-clés ou modifiez les filtres.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {displayProducts.map(p => (
                <ProductCard key={p.id} product={p} onClick={() => onProductClick(p)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShopSearch;
