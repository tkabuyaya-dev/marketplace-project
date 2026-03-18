import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEME, TC } from '../constants';
import { Product, MarketplaceId, Country, Marketplace } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductSection } from '../components/ProductSection';
import { BannerCarousel, Banner } from '../components/BannerCarousel';
import { getProducts, getBanners, checkIsLikedBatch, getTrendingProducts, getPopularProducts, getCountries, getMarketplacesByCountry } from '../services/firebase';
import { getRecentlyViewedIds, getPersonalizedRecommendations } from '../services/recommendations';
import { getProductsByIds } from '../services/firebase';
import { useAppContext } from '../contexts/AppContext';
import { useCategories } from '../hooks/useCategories';

export const Home: React.FC = () => {
  const { currentUser, activeCountry, setActiveCountry, activeMarketplace, setActiveMarketplace } = useAppContext();
  const navigate = useNavigate();
  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };
  const [products, setProducts] = useState<Product[]>([]);
  const { categories } = useCategories();
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  // Country & marketplace state
  const [countries, setCountries] = useState<Country[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);

  // Recommendation sections state
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  const tc = TC;

  // Load active countries once
  useEffect(() => {
    getCountries().then(all => {
      const active = all.filter(c => c.isActive);
      setCountries(active);
      // If current country isn't active, switch to first active
      if (active.length > 0 && !active.find(c => c.id === activeCountry)) {
        setActiveCountry(active[0].id);
      }
    });
  }, []);

  // Load marketplaces when country changes
  useEffect(() => {
    setActiveMarketplace(null);
    getMarketplacesByCountry(activeCountry).then(setMarketplaces);
  }, [activeCountry]);

  // Chargement initial avec pagination (cout Firebase maitrise)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setLastDoc(null);
      setHasMore(true);
      const [{ products: fetchedProducts, lastDoc: newLastDoc }, fetchedBanners] = await Promise.all([
        getProducts(activeCategory, undefined, undefined, activeMarketplace || undefined, activeCountry),
        getBanners(),
      ]);
      setBanners(fetchedBanners as Banner[]);
      setProducts(fetchedProducts);
      setLastDoc(newLastDoc);
      setHasMore(newLastDoc !== null);
      setLoading(false);
      // Batch like check (1 requete au lieu de 12)
      if (currentUser && fetchedProducts.length > 0) {
        checkIsLikedBatch(fetchedProducts.map(p => p.id), currentUser.id).then(setLikedMap);
      }
    };
    loadData();
  }, [activeCategory, activeMarketplace, activeCountry]);

  // Load recommendation sections (once, non-blocking)
  useEffect(() => {
    const loadSections = async () => {
      setSectionsLoading(true);
      try {
        const [trending, popular] = await Promise.all([
          getTrendingProducts(8),
          getPopularProducts(8),
        ]);
        setTrendingProducts(trending);
        setPopularProducts(popular);

        // Recently viewed + personalized (may depend on user)
        const recentIds = await getRecentlyViewedIds(currentUser?.id, 8);
        if (recentIds.length > 0) {
          const recentProducts = await getProductsByIds(recentIds);
          setRecentlyViewed(recentProducts);
        }

        const recs = await getPersonalizedRecommendations(currentUser?.id, recentIds, 8);
        setRecommended(recs);
      } catch (e) {
        console.warn('[Home] Recommendation sections load error:', e);
      }
      setSectionsLoading(false);
    };
    loadSections();
  }, [currentUser?.id]);

  // Chargement de la page suivante (scroll infini)
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc) return;
    setLoadingMore(true);
    const { products: moreProducts, lastDoc: newLastDoc } = await getProducts(activeCategory, lastDoc, undefined, activeMarketplace || undefined, activeCountry);
    setProducts(prev => [...prev, ...moreProducts]);
    setLastDoc(newLastDoc);
    setHasMore(newLastDoc !== null);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastDoc, activeCategory, activeMarketplace, activeCountry]);

  const activeCountryInfo = countries.find(c => c.id === activeCountry);

  return (
    <div className="pb-24 pt-[68px] md:pt-24 px-4 max-w-7xl mx-auto space-y-8">
      {/* Location Filter — Country → Marketplace hierarchy */}
      <div className="space-y-2">
        {/* Country selector row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <span>🌍</span>
            <span>Pays</span>
          </div>
          <div className="overflow-x-auto scrollbar-hide -mr-4 pr-4">
            <div className="flex gap-1.5">
              {countries.map((country) => (
                <button
                  key={country.id}
                  onClick={() => setActiveCountry(country.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                    activeCountry === country.id
                      ? 'bg-white text-gray-900 border-white shadow-md'
                      : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <span>{country.flag}</span>
                  <span>{country.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Marketplace pills — only shown for countries that have marketplaces */}
        {marketplaces.length > 0 && (
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveMarketplace(null)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  activeMarketplace === null
                    ? 'bg-white text-gray-900 border-white shadow-md'
                    : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:bg-gray-700 hover:text-white'
                }`}
              >
                🏪 Tous les marchés
              </button>
              {marketplaces.map((mp) => (
                <button
                  key={mp.id}
                  onClick={() => setActiveMarketplace(mp.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                    activeMarketplace === mp.id
                      ? `${mp.color} text-white border-transparent shadow-md`
                      : `bg-gray-800/60 ${mp.textColor} ${mp.borderColor}/30 border hover:bg-gray-700`
                  }`}
                >
                  <span>{mp.icon}</span>
                  <span>{mp.name.replace('Marché de ', '').replace('Marché du ', '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hint when no marketplaces for selected country */}
        {marketplaces.length === 0 && activeCountryInfo && (
          <p className="text-xs text-gray-500 pl-1">
            {activeCountryInfo.flag} Tous les produits de {activeCountryInfo.name}
          </p>
        )}
      </div>

      {/* Banner Carousel */}
      <BannerCarousel
        banners={banners.length > 0 ? banners : undefined}
      />

      {/* Trending Products */}
      <ProductSection
        title="Tendances du moment"
        icon="🔥"
        products={trendingProducts}
        loading={sectionsLoading}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />

      {/* Categories */}
      <div className="overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
        <div className="flex gap-3">
            {/* Bouton "Tout" (Statique) */}
            <button
              onClick={() => setActiveCategory('all')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full whitespace-nowrap transition-all border ${
                activeCategory === 'all'
                  ? `${tc.bg600} ${tc.border500} text-white ${tc.shadowLg}`
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
            >
              <span className="text-lg">🔍</span>
              <span className="text-sm font-medium">Tout</span>
            </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full whitespace-nowrap transition-all border ${
                activeCategory === cat.id
                  ? `${tc.bg600} ${tc.border500} text-white ${tc.shadowLg}`
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
            >
              <span className="text-lg">{cat.icon}</span>
              <span className="text-sm font-medium">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid — Dernieres annonces */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            🛒 Dernières annonces
          </h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-gray-800 rounded-2xl h-80 animate-pulse"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => onProductClick(product)}
                currentUserId={currentUser?.id || null}
                initialLiked={likedMap[product.id]}
              />
            ))}
            {products.length === 0 && !loading && (
              <div className="col-span-full text-center py-10 text-gray-500">Aucun produit dans cette catégorie.</div>
            )}
          </div>
        )}
      </div>

      {/* Bouton Charger plus (pagination) */}
      {hasMore && !loading && (
        <div className="text-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-8 py-3 bg-gray-800 border border-gray-700 text-gray-300 rounded-full text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Chargement...' : 'Voir plus'}
          </button>
        </div>
      )}

      {/* Recommended for you */}
      <ProductSection
        title="Recommandé pour vous"
        icon="✨"
        products={recommended}
        loading={sectionsLoading}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />

      {/* Popular Products */}
      <ProductSection
        title="Les plus populaires"
        icon="⭐"
        products={popularProducts}
        loading={sectionsLoading}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />

      {/* Recently Viewed */}
      <ProductSection
        title="Vus récemment"
        icon="👁"
        products={recentlyViewed}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />
    </div>
  );
};
