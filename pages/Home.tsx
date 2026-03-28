import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { THEME, TC } from '../constants';
import { Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductSection } from '../components/ProductSection';
import { BannerCarousel, Banner } from '../components/BannerCarousel';
import { getProducts, getBanners, checkIsLikedBatch, getTrendingProducts, getPopularProducts } from '../services/firebase';
import { getRecentlyViewedIds, getPersonalizedRecommendations } from '../services/recommendations';
import { getProductsByIds } from '../services/firebase';
import { trackCountrySwitch } from '../services/analytics';
import { useAppContext } from '../contexts/AppContext';
import { useCategories } from '../hooks/useCategories';
import { useGeolocation, haversineDistance, formatDistance } from '../hooks/useGeolocation';
import { useActiveCountries } from '../hooks/useActiveCountries';

// ── Module-level cache ──────────────────────────────────────────────────────
// Persists between navigations (React unmount/remount).
// Prevents re-fetching 5+ Firestore queries every time user returns to Home.
// Automatically invalidated when category/country/wholesale changes.
interface HomeCache {
  key: string; // "category|country|wholesale" — invalidation key
  products: Product[];
  lastDoc: any;
  hasMore: boolean;
  banners: Banner[];
  likedMap: Record<string, boolean>;
  ts: number; // timestamp for staleness check
}
interface SectionsCache {
  userId: string | undefined;
  trending: Product[];
  popular: Product[];
  recentlyViewed: Product[];
  recommended: Product[];
  ts: number;
}
let _homeCache: HomeCache | null = null;
let _sectionsCache: SectionsCache | null = null;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes — then refresh in background
// Persist UI state across navigations (so returning to Home doesn't reset category)
let _lastCategory = 'all';
let _lastWholesale = false;
// ─────────────────────────────────────────────────────────────────────────────

export const Home: React.FC = () => {
  const { currentUser, activeCountry, setActiveCountry } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };

  const cacheKey = (cat: string, country: string, wholesale: boolean) =>
    `${cat}|${country}|${wholesale}`;

  // Restore last selected category/wholesale from module state
  const [activeCategory, _setActiveCategory] = useState(_lastCategory);
  const [wholesaleMode, _setWholesaleMode] = useState(_lastWholesale);
  const setActiveCategory = (cat: string) => { _lastCategory = cat; _setActiveCategory(cat); };
  const setWholesaleMode = (v: boolean) => { _lastWholesale = v; _setWholesaleMode(v); };

  // Restore from cache instantly — always show last data, even if key doesn't match
  // (useEffect will refresh if key changed)
  const currentKey = cacheKey(activeCategory, activeCountry, wholesaleMode);
  const cached = _homeCache?.key === currentKey ? _homeCache : null;
  const anyCached = _homeCache; // Show ANY cached data to avoid blank page
  const cachedSections = _sectionsCache?.userId === currentUser?.id ? _sectionsCache : null;

  const [products, setProducts] = useState<Product[]>(cached?.products || anyCached?.products || []);
  const { categories } = useCategories();
  const [loading, setLoading] = useState(!(cached || anyCached?.products?.length));
  const [lastDoc, setLastDoc] = useState<any>(cached?.lastDoc || null);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [banners, setBanners] = useState<Banner[]>(cached?.banners || anyCached?.banners || []);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(cached?.likedMap || anyCached?.likedMap || {});

  // Country state — loaded dynamically via Firestore listener
  const { countries } = useActiveCountries();

  // Recommendation sections state
  const [trendingProducts, setTrendingProducts] = useState<Product[]>(cachedSections?.trending || []);
  const [popularProducts, setPopularProducts] = useState<Product[]>(cachedSections?.popular || []);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(cachedSections?.recentlyViewed || []);
  const [recommended, setRecommended] = useState<Product[]>(cachedSections?.recommended || []);
  const [sectionsLoading, setSectionsLoading] = useState(!cachedSections);
  const [nearbyMode, setNearbyMode] = useState(false);
  const { position, loading: geoLoading, requestLocation } = useGeolocation();

  const tc = TC;
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Validate active country when countries list changes
  // Use country IDs string as dep to avoid infinite loop (countries array is new each render)
  const countryIds = countries.map(c => c.id).join(',');
  useEffect(() => {
    if (countries.length > 0 && (!activeCountry || !countries.find(c => c.id === activeCountry))) {
      setActiveCountry(countries[0].id);
    }
  }, [countryIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't load products until we have a valid activeCountry
  const isCountryReady = !!activeCountry && countries.length > 0 && !!countries.find(c => c.id === activeCountry);

  // Chargement initial avec pagination + cache stale-while-revalidate
  useEffect(() => {
    if (!isCountryReady) return; // Wait for valid country before fetching
    const key = cacheKey(activeCategory, activeCountry, wholesaleMode);
    const hit = _homeCache?.key === key ? _homeCache : null;
    const isStale = hit && (Date.now() - hit.ts > CACHE_TTL);

    // Cache hit and fresh → skip fetch entirely
    if (hit && !isStale) {
      setProducts(hit.products);
      setLastDoc(hit.lastDoc);
      setHasMore(hit.hasMore);
      setBanners(hit.banners);
      setLikedMap(hit.likedMap);
      setLoading(false);
      return;
    }

    // Cache hit but stale → show cached data immediately, refresh in background
    if (hit && isStale) {
      setProducts(hit.products);
      setLastDoc(hit.lastDoc);
      setHasMore(hit.hasMore);
      setBanners(hit.banners);
      setLikedMap(hit.likedMap);
      setLoading(false);
      // Fall through to refresh below (no loading spinner)
    } else {
      // No cache → show loading
      setLoading(true);
    }

    const loadData = async () => {
      const [{ products: fetchedProducts, lastDoc: newLastDoc }, fetchedBanners] = await Promise.all([
        getProducts(activeCategory, undefined, undefined, undefined, activeCountry, wholesaleMode || undefined),
        getBanners(),
      ]);
      if (!mountedRef.current) return;

      let newLikedMap: Record<string, boolean> = {};
      if (currentUser && fetchedProducts.length > 0) {
        newLikedMap = await checkIsLikedBatch(fetchedProducts.map(p => p.id), currentUser.id);
      }
      if (!mountedRef.current) return;

      // Update cache
      _homeCache = {
        key,
        products: fetchedProducts,
        lastDoc: newLastDoc,
        hasMore: newLastDoc !== null,
        banners: fetchedBanners as Banner[],
        likedMap: newLikedMap,
        ts: Date.now(),
      };

      setProducts(fetchedProducts);
      setBanners(fetchedBanners as Banner[]);
      setLastDoc(newLastDoc);
      setHasMore(newLastDoc !== null);
      setLikedMap(newLikedMap);
      setLoading(false);
    };
    loadData();
  }, [activeCategory, activeCountry, wholesaleMode, isCountryReady]);

  // Load recommendation sections (with cache)
  useEffect(() => {
    const secHit = _sectionsCache?.userId === currentUser?.id ? _sectionsCache : null;
    const secStale = secHit && (Date.now() - secHit.ts > CACHE_TTL);

    if (secHit && !secStale) {
      setTrendingProducts(secHit.trending);
      setPopularProducts(secHit.popular);
      setRecentlyViewed(secHit.recentlyViewed);
      setRecommended(secHit.recommended);
      setSectionsLoading(false);
      return;
    }

    if (secHit && secStale) {
      // Show cached, refresh in background
      setSectionsLoading(false);
    } else {
      setSectionsLoading(true);
    }

    const loadSections = async () => {
      try {
        const [trending, popular] = await Promise.all([
          getTrendingProducts(8),
          getPopularProducts(8),
        ]);
        if (!mountedRef.current) return;
        setTrendingProducts(trending);
        setPopularProducts(popular);

        const recentIds = await getRecentlyViewedIds(currentUser?.id, 8);
        let recentProducts: Product[] = [];
        if (recentIds.length > 0) {
          recentProducts = await getProductsByIds(recentIds);
        }
        if (!mountedRef.current) return;
        setRecentlyViewed(recentProducts);

        const recs = await getPersonalizedRecommendations(currentUser?.id, recentIds, 8);
        if (!mountedRef.current) return;
        setRecommended(recs);

        // Update cache
        _sectionsCache = {
          userId: currentUser?.id,
          trending,
          popular,
          recentlyViewed: recentProducts,
          recommended: recs,
          ts: Date.now(),
        };
      } catch (e) {
        console.warn('[Home] Recommendation sections load error:', e);
      }
      if (mountedRef.current) setSectionsLoading(false);
    };
    loadSections();
  }, [currentUser?.id]);

  // Chargement de la page suivante (scroll infini)
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc) return;
    setLoadingMore(true);
    const { products: moreProducts, lastDoc: newLastDoc } = await getProducts(activeCategory, lastDoc, undefined, undefined, activeCountry, wholesaleMode || undefined);
    setProducts(prev => [...prev, ...moreProducts]);
    setLastDoc(newLastDoc);
    setHasMore(newLastDoc !== null);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastDoc, activeCategory, activeCountry]);

  const activeCountryInfo = countries.find(c => c.id === activeCountry);

  // Tri par distance quand le mode "Près de moi" est actif
  const displayProducts = React.useMemo(() => {
    if (nearbyMode && position) {
      return [...products]
        .map(p => {
          const sellerGps = p.seller?.sellerDetails?.gps;
          const dist = sellerGps
            ? haversineDistance(position.lat, position.lng, sellerGps.lat, sellerGps.lng)
            : 9999;
          return { ...p, _distance: dist };
        })
        .sort((a, b) => a._distance - b._distance);
    }
    return products;
  }, [products, nearbyMode, position]);

  return (
    <div className="pb-24 pt-[68px] md:pt-24 px-4 max-w-7xl mx-auto space-y-8">
      {/* Country context banner — compact, links to search country filter */}
      {activeCountryInfo && (
        <div className="flex items-center justify-between bg-gray-800/40 border border-gray-700/40 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{activeCountryInfo.flag}</span>
            <span className="text-gray-300">{t('home.browsingIn', { name: activeCountryInfo.name })}</span>
          </div>
          {countries.length > 1 && (
            <div className="flex items-center gap-1.5">
              {countries.filter(c => c.id !== activeCountry).slice(0, 4).map(c => (
                <button
                  key={c.id}
                  onClick={() => { trackCountrySwitch(activeCountry, c.id); setActiveCountry(c.id); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 hover:border-gray-500 transition-all text-sm"
                  title={c.name}
                >
                  {c.flag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Banner Carousel */}
      <BannerCarousel
        banners={banners.length > 0 ? banners : undefined}
      />

      {/* Trending Products */}
      <ProductSection
        title={t('home.sections.trending')}
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
            {/* Bouton "Près de moi" — géolocalisation */}
            <button
              onClick={() => {
                if (!nearbyMode) {
                  requestLocation();
                  setNearbyMode(true);
                  setActiveCategory('all');
                } else {
                  setNearbyMode(false);
                }
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full whitespace-nowrap transition-all border ${
                nearbyMode
                  ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-500/20'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
            >
              {geoLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-lg">📍</span>
              )}
              <span className="text-sm font-medium">{t('home.nearMe')}</span>
            </button>

            {/* Bouton "Grossiste B2B" */}
            <button
              onClick={() => {
                setWholesaleMode(!wholesaleMode);
                if (!wholesaleMode) setActiveCategory('all');
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full whitespace-nowrap transition-all border ${
                wholesaleMode
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
            >
              <span className="text-lg">🏭</span>
              <span className="text-sm font-medium">{t('home.wholesale')}</span>
            </button>

            {/* Bouton "Tout" (Statique) */}
            <button
              onClick={() => { setActiveCategory('all'); setNearbyMode(false); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full whitespace-nowrap transition-all border ${
                activeCategory === 'all' && !nearbyMode
                  ? `${tc.bg600} ${tc.border500} text-white ${tc.shadowLg}`
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
            >
              <span className="text-lg">🔍</span>
              <span className="text-sm font-medium">{t('home.all')}</span>
            </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setNearbyMode(false); }}
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

      {/* B2B wholesale banner */}
      {wholesaleMode && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">🏭</span>
          <div className="flex-1">
            <p className="text-indigo-400 font-semibold text-sm">{t('home.wholesaleActive')}</p>
            <p className="text-indigo-400/60 text-xs">{t('home.wholesaleHint')}</p>
          </div>
          <button onClick={() => setWholesaleMode(false)} className="text-indigo-400/60 hover:text-white text-xs px-3 py-1 border border-indigo-500/30 rounded-lg">
            {t('home.nearbyDisable')}
          </button>
        </div>
      )}

      {/* Nearby mode banner */}
      {nearbyMode && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div className="flex-1">
            <p className="text-green-400 font-semibold text-sm">{t('home.nearbyActive')}</p>
            <p className="text-green-400/60 text-xs">{position ? t('home.nearbyHint') : t('home.nearbyWaiting')}</p>
          </div>
          <button onClick={() => setNearbyMode(false)} className="text-green-400/60 hover:text-white text-xs px-3 py-1 border border-green-500/30 rounded-lg">
            {t('home.nearbyDisable')}
          </button>
        </div>
      )}

      {/* Product Grid — Dernieres annonces */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {wholesaleMode ? '🏭' : nearbyMode ? '📍' : '🛒'} {wholesaleMode ? t('home.wholesale') : nearbyMode ? t('home.nearMe') : t('home.latestListings')}
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
            {displayProducts.map((product: any) => (
              <div key={product.id} className="relative">
                <ProductCard
                  product={product}
                  onClick={() => onProductClick(product)}
                  currentUserId={currentUser?.id || null}
                  initialLiked={likedMap[product.id]}
                />
                {nearbyMode && position && product._distance < 9999 && (
                  <span className="absolute top-2 left-2 bg-green-600/90 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                    📍 {formatDistance(product._distance)}
                  </span>
                )}
              </div>
            ))}
            {displayProducts.length === 0 && !loading && (
              <div className="col-span-full text-center py-10 text-gray-500">{t('home.noProductsInCategory')}</div>
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
            {loadingMore ? t('home.loading') : t('home.loadMore')}
          </button>
        </div>
      )}

      {/* Recommended for you */}
      <ProductSection
        title={t('home.recommendedForYou')}
        icon="✨"
        products={recommended}
        loading={sectionsLoading}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />

      {/* Popular Products */}
      <ProductSection
        title={t('home.mostPopular')}
        icon="⭐"
        products={popularProducts}
        loading={sectionsLoading}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />

      {/* Recently Viewed */}
      <ProductSection
        title={t('home.recentlyViewed')}
        icon="👁"
        products={recentlyViewed}
        currentUserId={currentUser?.id}
        likedMap={likedMap}
        onProductClick={onProductClick}
      />
      {/* Footer legal */}
      <div className="text-center py-8 mt-4 border-t border-gray-800/50">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <Link to="/cgu" className="hover:text-amber-400 hover:underline transition-colors">
            Conditions d'utilisation
          </Link>
          <span className="text-gray-700">&middot;</span>
          <Link to="/politique-confidentialite" className="hover:text-amber-400 hover:underline transition-colors">
            Politique de confidentialité
          </Link>
        </div>
        <p className="text-[10px] text-gray-700 mt-1.5">&copy; 2026 NUNULIA</p>
      </div>
    </div>
  );
};

export default Home;
