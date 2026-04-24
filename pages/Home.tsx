import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { THEME, TC } from '../constants';
import { Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductSection } from '../components/ProductSection';
import { BannerCarousel, Banner } from '../components/BannerCarousel';
import { getProducts, getProductsFromCache, getBanners, checkIsLikedBatch, getTrendingProducts, getPopularProducts, getBoostedProducts } from '../services/firebase';
import { getRecentlyViewedIds, getPersonalizedRecommendations } from '../services/recommendations';
import { getProductsByIds } from '../services/firebase';
import { getFeedFromIDB, saveFeedToIDB, pruneStaleFeeds } from '../services/idb';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { prefetchProductImages } from '../utils/prefetch';
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
  boostedProducts: Product[];
  ts: number; // timestamp for staleness check
}
interface SectionsCache {
  userId: string | undefined;
  countryId: string | undefined;
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
  const cachedSections = _sectionsCache?.userId === currentUser?.id && _sectionsCache?.countryId === activeCountry ? _sectionsCache : null;

  const [products, setProducts] = useState<Product[]>(cached?.products || anyCached?.products || []);
  const { categories } = useCategories();
  const networkQuality = useNetworkQuality();
  const [loading, setLoading] = useState(!(cached || anyCached?.products?.length));
  // Sections (trending/popular/recs) ne démarrent qu'après le grid principal.
  // Priorité bande passante sur 2G/3G : banners + produits d'abord.
  const [mainReady, setMainReady] = useState(!!(cached || anyCached?.products?.length));
  const [lastDoc, setLastDoc] = useState<any>(cached?.lastDoc || null);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [banners, setBanners] = useState<Banner[]>(cached?.banners || anyCached?.banners || []);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(cached?.likedMap || anyCached?.likedMap || {});

  // Country state — loaded dynamically via Firestore listener
  const { countries } = useActiveCountries();

  // Boosted products
  const [boostedProducts, setBoostedProducts] = useState<Product[]>([]);

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

  // Validate active country when countries list changes.
  // '' means "Tous les pays" — valid, do NOT reset to first country.
  const countryIds = countries.map(c => c.id).join(',');
  useEffect(() => {
    if (countries.length > 0 && activeCountry && !countries.find(c => c.id === activeCountry)) {
      // Unknown/stale country code → reset to Tous
      setActiveCountry('');
    }
  }, [countryIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ready as soon as: country is '' (Tous) OR is a known active country
  const isCountryReady = activeCountry === '' || (countries.length > 0 && !!countries.find(c => c.id === activeCountry));

  // ── Prune stale IDB entries once per session (low-priority) ──────────────
  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => pruneStaleFeeds(), { timeout: 10000 });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Three-phase loading: IDB → Firestore cache → Network ─────────────────
  //
  // Phase 1 (0–10ms):  Module-level _homeCache (in-memory, survives unmount)
  // Phase 2 (10–50ms): IDB snapshot (persists across page reloads)
  // Phase 3 (50ms+):   Firestore SDK cache (IndexedDB, instant when offline)
  // Phase 4 (1–30s):   Network fetch (background — never blocks the UI)
  //
  // Rule: setLoading(false) is called as soon as ANY phase returns data.
  // The network fetch always runs in background to keep data fresh.
  useEffect(() => {
    if (!isCountryReady) return;
    const key = cacheKey(activeCategory, activeCountry, wholesaleMode);
    const hit  = _homeCache?.key === key ? _homeCache : null;
    const isStale = hit && (Date.now() - hit.ts > CACHE_TTL);

    // ── Phase 1: Module-level cache (in-memory) ──────────────────────────
    if (hit && !isStale) {
      setProducts(hit.products);
      setLastDoc(hit.lastDoc);
      setHasMore(hit.hasMore);
      setBanners(hit.banners);
      setLikedMap(hit.likedMap);
      setBoostedProducts(hit.boostedProducts || []);
      setLoading(false);
      setMainReady(true);
      return; // Fresh — no network needed
    }

    // Show stale module cache immediately, then fall through to refresh
    if (hit && isStale) {
      setProducts(hit.products);
      setLastDoc(hit.lastDoc);
      setHasMore(hit.hasMore);
      setBanners(hit.banners);
      setLikedMap(hit.likedMap);
      setBoostedProducts(hit.boostedProducts || []);
      setLoading(false);
      // Fall through — background refresh below
    } else {
      setLoading(true); // Will be cancelled quickly by Phase 2 or 3
    }

    const loadData = async () => {
      // ── Phase 2: IDB snapshot (survives page reload, has full feed) ───
      if (!hit) {
        const idbSnap = await getFeedFromIDB(key);
        if (idbSnap && mountedRef.current) {
          setProducts(idbSnap.products);
          setBanners(idbSnap.banners);
          setBoostedProducts(idbSnap.boostedProducts || []);
          setLoading(false);
          setMainReady(true);
          // Prefetch below-fold images from IDB data immediately
          prefetchProductImages(
            idbSnap.products.slice(6).flatMap(p => p.images?.slice(0, 1) ?? []),
            networkQuality === 'slow'
          );
          // Continue to Phase 4 (network) in background — don't return
        }

        // ── Phase 3: Firestore SDK cache (near-instant, even on slow 2G) ─
        if (!idbSnap) {
          try {
            const cachedProds = await getProductsFromCache(
              activeCategory, activeCountry || undefined, wholesaleMode || undefined
            );
            if (cachedProds.length > 0 && mountedRef.current) {
              setProducts(cachedProds);
              setLoading(false);
              setMainReady(true);
            }
          } catch {
            // Firestore cache empty (first visit) — skeleton stays, Phase 4 will load
          }
        }
      }

      // ── Phase 4: Network fetch (always runs; updates data silently) ────
      // On slow networks, we already show cached content — this is background only.
      // Strict 8-second timeout: if exceeded, we keep the cached data shown.
      const NETWORK_TIMEOUT_MS = 8000;
      const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
        Promise.race([p, new Promise<never>((_, r) =>
          setTimeout(() => r(new Error('network-timeout')), NETWORK_TIMEOUT_MS)
        )]);

      try {
        const [{ products: fetchedProducts, lastDoc: newLastDoc }, fetchedBanners, fetchedBoosted] =
          await Promise.all([
            withTimeout(getProducts(activeCategory, undefined, undefined, undefined, activeCountry, wholesaleMode || undefined)),
            withTimeout(getBanners()),
            withTimeout(getBoostedProducts(activeCountry || undefined)),
          ]);

        if (!mountedRef.current) return;

        // Liked map (non-blocking — don't block render on this)
        let newLikedMap: Record<string, boolean> = {};
        if (currentUser && fetchedProducts.length > 0) {
          try {
            newLikedMap = await checkIsLikedBatch(fetchedProducts.map(p => p.id), currentUser.id);
          } catch {}
        }
        if (!mountedRef.current) return;

        // Update module-level cache
        _homeCache = {
          key,
          products: fetchedProducts,
          lastDoc: newLastDoc,
          hasMore: newLastDoc !== null,
          banners: fetchedBanners as Banner[],
          likedMap: newLikedMap,
          boostedProducts: fetchedBoosted,
          ts: Date.now(),
        };

        // Persist to IDB for next page reload (fire-and-forget)
        saveFeedToIDB({
          key,
          products: fetchedProducts,
          banners: fetchedBanners as Banner[],
          boostedProducts: fetchedBoosted,
          ts: Date.now(),
        });

        setBoostedProducts(fetchedBoosted);
        setProducts(fetchedProducts);
        setBanners(fetchedBanners as Banner[]);
        setLastDoc(newLastDoc);
        setHasMore(newLastDoc !== null);
        setLikedMap(newLikedMap);
        setLoading(false);
        setMainReady(true);

        // Prefetch below-fold images after network data lands
        prefetchProductImages(
          fetchedProducts.slice(6).flatMap(p => p.images?.slice(0, 1) ?? []),
          networkQuality === 'slow'
        );

      } catch {
        // Network failed or timed out — cached data is already visible, just unblock
        if (mountedRef.current) {
          setLoading(false);
          setMainReady(true);
        }
      }
    };

    loadData();
  }, [activeCategory, activeCountry, wholesaleMode, isCountryReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load recommendation sections (with cache)
  // Ne démarre qu'après que le grid principal est visible (mainReady).
  // Sur 2G/3G : banners + produits reçoivent toute la bande passante en premier.
  useEffect(() => {
    if (!mainReady) return;

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
      // On 2G/saveData, skip trending & popular to save bandwidth.
      // Recently viewed + personalized recs are cheaper (IDs only).
      if (networkQuality === 'slow') {
        setSectionsLoading(false);
        return;
      }
      try {
        const [trending, popular] = await Promise.all([
          getTrendingProducts(8, activeCountry || undefined),
          getPopularProducts(8, activeCountry || undefined),
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
          countryId: activeCountry || undefined,
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
  }, [currentUser?.id, activeCountry, mainReady]); // activeCountry : trending/popular sont filtrés par pays

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
    <div className="pb-24 pt-safe-header md:pt-24 px-3 max-w-7xl mx-auto space-y-3">
      {/* Banner Carousel */}
      <BannerCarousel
        banners={banners.length > 0 ? banners : undefined}
      />

      {/* Sponsored / Boosted Products */}
      {boostedProducts.length > 0 && (
        <ProductSection
          title={t('home.sections.sponsored')}
          icon="⚡"
          products={boostedProducts}
          loading={false}
          currentUserId={currentUser?.id}
          likedMap={likedMap}
          onProductClick={onProductClick}
        />
      )}

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
      <div className="overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
        <div className="flex gap-1.5">
          {/* Bouton "Près de moi" */}
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
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full whitespace-nowrap transition-all border text-xs font-medium ${
              nearbyMode
                ? 'bg-green-600 border-green-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {geoLoading ? (
              <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="text-xs">📍</span>
            )}
            {t('home.nearMe')}
          </button>

          {/* Bouton "Grossiste B2B" */}
          <button
            onClick={() => {
              setWholesaleMode(!wholesaleMode);
              if (!wholesaleMode) setActiveCategory('all');
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full whitespace-nowrap transition-all border text-xs font-medium ${
              wholesaleMode
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-xs">🏭</span>
            {t('home.wholesale')}
          </button>

          {/* Bouton "Tout" */}
          <button
            onClick={() => { setActiveCategory('all'); setNearbyMode(false); }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full whitespace-nowrap transition-all border text-xs font-medium ${
              activeCategory === 'all' && !nearbyMode
                ? `${tc.bg400} ${tc.border400} text-white`
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-xs">🔍</span>
            {t('home.all')}
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setNearbyMode(false); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full whitespace-nowrap transition-all border text-xs font-medium ${
                activeCategory === cat.id
                  ? `${tc.bg400} ${tc.border400} text-white`
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-xs">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* B2B wholesale banner */}
      {wholesaleMode && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-2 flex items-center gap-2">
          <span className="text-base">🏭</span>
          <div className="flex-1 min-w-0">
            <p className="text-indigo-400 font-semibold text-xs leading-tight">{t('home.wholesaleActive')}</p>
            <p className="text-indigo-400/60 text-[10px] leading-tight">{t('home.wholesaleHint')}</p>
          </div>
          <button onClick={() => setWholesaleMode(false)} className="text-indigo-400/60 hover:text-white text-[10px] px-2 py-0.5 border border-indigo-500/30 rounded-lg flex-shrink-0">
            {t('home.nearbyDisable')}
          </button>
        </div>
      )}

      {/* Nearby mode banner */}
      {nearbyMode && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-2 flex items-center gap-2">
          <span className="text-base">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-green-400 font-semibold text-xs leading-tight">{t('home.nearbyActive')}</p>
            <p className="text-green-400/60 text-[10px] leading-tight">{position ? t('home.nearbyHint') : t('home.nearbyWaiting')}</p>
          </div>
          <button onClick={() => setNearbyMode(false)} className="text-green-400/60 hover:text-white text-[10px] px-2 py-0.5 border border-green-500/30 rounded-lg flex-shrink-0">
            {t('home.nearbyDisable')}
          </button>
        </div>
      )}

      {/* Product Grid — Dernieres annonces */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm">{wholesaleMode ? '🏭' : nearbyMode ? '📍' : '🛒'}</span>
          <h3 className="text-sm font-bold text-white">
            {wholesaleMode ? t('home.wholesale') : nearbyMode ? t('home.nearMe') : t('home.latestListings')}
          </h3>
        </div>

        {loading ? (
          // Shimmer skeleton — matches grid card layout (square image + info zone)
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div key={n} className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800/60 animate-pulse">
                <div className="aspect-square bg-gray-800 relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.055) 50%, transparent 75%)',
                      backgroundSize: '200% 100%',
                      animation: `shimmer 1.8s ${n * 0.12}s infinite linear`,
                    }}
                  />
                </div>
                <div className="p-2 space-y-1.5">
                  <div className="h-3 bg-gray-800 rounded-full w-full" />
                  <div className="h-3 bg-gray-800 rounded-full w-3/5" />
                  <div className="h-3.5 bg-gray-700/60 rounded-full w-2/5 mt-0.5" />
                  <div className="h-2.5 bg-gray-800/60 rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {displayProducts.map((product: any, idx: number) => (
              <div key={product.id} className="relative">
                <ProductCard
                  product={product}
                  onClick={() => onProductClick(product)}
                  currentUserId={currentUser?.id || null}
                  initialLiked={likedMap[product.id]}
                  index={idx}
                  distanceLabel={nearbyMode && position && product._distance < 9999
                    ? `📍 ${formatDistance(product._distance)}`
                    : undefined}
                />
              </div>
            ))}
            {displayProducts.length === 0 && (
              <div className="col-span-full text-center py-10 text-gray-500">
                {t('home.noProductsInCategory')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bouton Charger plus (pagination) */}
      {hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 bg-gray-800 border border-gray-700 text-gray-400 rounded-full text-xs hover:bg-gray-700 transition-colors disabled:opacity-50"
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
      <div className="text-center py-4 border-t border-gray-800/50">
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
