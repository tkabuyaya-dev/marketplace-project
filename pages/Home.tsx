import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEME, TC, MARKETPLACES, getMarketplaceInfo } from '../constants';
import { Product, MarketplaceId } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductSection } from '../components/ProductSection';
import { BannerCarousel, Banner } from '../components/BannerCarousel';
import { getProducts, getBanners, checkIsLikedBatch, getTrendingProducts, getPopularProducts } from '../services/firebase';
import { getRecentlyViewedIds, getPersonalizedRecommendations } from '../services/recommendations';
import { getProductsByIds } from '../services/firebase';
import { useAppContext } from '../contexts/AppContext';
import { useCategories } from '../hooks/useCategories';

export const Home: React.FC = () => {
  const { currentUser, activeMarketplace, setActiveMarketplace } = useAppContext();
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

  // Recommendation sections state
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  const tc = TC;

  // Chargement initial avec pagination (cout Firebase maitrise)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setLastDoc(null);
      setHasMore(true);
      const [{ products: fetchedProducts, lastDoc: newLastDoc }, fetchedBanners] = await Promise.all([
        getProducts(activeCategory, undefined, undefined, activeMarketplace || undefined),
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
  }, [activeCategory, activeMarketplace]);

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
    const { products: moreProducts, lastDoc: newLastDoc } = await getProducts(activeCategory, lastDoc, undefined, activeMarketplace || undefined);
    setProducts(prev => [...prev, ...moreProducts]);
    setLastDoc(newLastDoc);
    setHasMore(newLastDoc !== null);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastDoc, activeCategory, activeMarketplace]);

  return (
    <div className="pb-24 pt-[68px] md:pt-24 px-4 max-w-7xl mx-auto space-y-8">
      {/* Filtres Marketplaces Physiques */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          📍 Marchés de Bujumbura
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Bouton "Tous" */}
          <button
            onClick={() => setActiveMarketplace(null)}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${
              activeMarketplace === null
                ? 'bg-white text-gray-900 border-white shadow-lg shadow-white/20'
                : 'bg-gray-800/80 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <span>🏪</span>
            <span>Tous</span>
          </button>
          {MARKETPLACES.map((mp) => (
            <button
              key={mp.id}
              onClick={() => setActiveMarketplace(mp.id)}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${
                activeMarketplace === mp.id
                  ? `${mp.color} text-white border-transparent shadow-lg`
                  : `bg-gray-800/80 ${mp.textColor} ${mp.borderColor}/30 border hover:${mp.borderColor}/60`
              }`}
            >
              <span>{mp.icon}</span>
              <span className="truncate">{mp.name.replace('Marché de ', '').replace('Marché du ', '')}</span>
            </button>
          ))}
        </div>
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
