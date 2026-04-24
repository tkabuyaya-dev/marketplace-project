import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TC } from '../constants';
import { Product, User } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductSection } from '../components/ProductSection';
import { ProductCardSkeleton } from '../components/Skeleton';
import { BannerCarousel, Banner } from '../components/BannerCarousel';
import { JeChercheInlineCard } from '../components/home/JeChercheInlineCard';
import { FeaturedVendorCard } from '../components/home/FeaturedVendorCard';
import { getProducts, getProductsFromCache, getBanners, checkIsLikedBatch, getBoostedProducts } from '../services/firebase';
import { getFeedFromIDB, saveFeedToIDB, pruneStaleFeeds } from '../services/idb';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { prefetchProductImages } from '../utils/prefetch';
import { useAppContext } from '../contexts/AppContext';
import { useCategories } from '../hooks/useCategories';
import { useGeolocation, haversineDistance, formatDistance } from '../hooks/useGeolocation';
import { useActiveCountries } from '../hooks/useActiveCountries';

// ── Module-level cache ──────────────────────────────────────────────────────
// Persists between navigations (React unmount/remount).
// Prevents re-fetching Firestore queries every time user returns to Home.
// Automatically invalidated when category/country/wholesale changes.
interface HomeCache {
  key: string; // "category|country|wholesale" — invalidation key
  products: Product[];
  lastDoc: any;
  hasMore: boolean;
  banners: Banner[];
  likedMap: Record<string, boolean>;
  boostedProducts: Product[];
  ts: number;
}
let _homeCache: HomeCache | null = null;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes — then refresh in background
let _lastCategory = 'all';
let _lastWholesale = false;

// Interstitial cadence
const JE_CHERCHE_AT = 6;   // one-shot insertion after the 6th product
const VENDOR_EVERY = 10;   // featured-vendor card after every 10th product
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

  const [activeCategory, _setActiveCategory] = useState(_lastCategory);
  const [wholesaleMode, _setWholesaleMode] = useState(_lastWholesale);
  const setActiveCategory = (cat: string) => { _lastCategory = cat; _setActiveCategory(cat); };
  const setWholesaleMode = (v: boolean) => { _lastWholesale = v; _setWholesaleMode(v); };

  const currentKey = cacheKey(activeCategory, activeCountry, wholesaleMode);
  const cached = _homeCache?.key === currentKey ? _homeCache : null;
  const anyCached = _homeCache;

  const [products, setProducts] = useState<Product[]>(cached?.products || anyCached?.products || []);
  const { categories } = useCategories();
  const networkQuality = useNetworkQuality();
  const [loading, setLoading] = useState(!(cached || anyCached?.products?.length));
  const [lastDoc, setLastDoc] = useState<any>(cached?.lastDoc || null);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [banners, setBanners] = useState<Banner[]>(cached?.banners || anyCached?.banners || []);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(cached?.likedMap || anyCached?.likedMap || {});

  const { countries } = useActiveCountries();

  const [boostedProducts, setBoostedProducts] = useState<Product[]>([]);

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
      setActiveCountry('');
    }
  }, [countryIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCountryReady = activeCountry === '' || (countries.length > 0 && !!countries.find(c => c.id === activeCountry));

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
  useEffect(() => {
    if (!isCountryReady) return;
    const key = cacheKey(activeCategory, activeCountry, wholesaleMode);
    const hit  = _homeCache?.key === key ? _homeCache : null;
    const isStale = hit && (Date.now() - hit.ts > CACHE_TTL);

    if (hit && !isStale) {
      setProducts(hit.products);
      setLastDoc(hit.lastDoc);
      setHasMore(hit.hasMore);
      setBanners(hit.banners);
      setLikedMap(hit.likedMap);
      setBoostedProducts(hit.boostedProducts || []);
      setLoading(false);
      return;
    }

    if (hit && isStale) {
      setProducts(hit.products);
      setLastDoc(hit.lastDoc);
      setHasMore(hit.hasMore);
      setBanners(hit.banners);
      setLikedMap(hit.likedMap);
      setBoostedProducts(hit.boostedProducts || []);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const loadData = async () => {
      if (!hit) {
        const idbSnap = await getFeedFromIDB(key);
        if (idbSnap && mountedRef.current) {
          setProducts(idbSnap.products);
          setBanners(idbSnap.banners);
          setBoostedProducts(idbSnap.boostedProducts || []);
          setLoading(false);
          prefetchProductImages(
            idbSnap.products.slice(6).flatMap(p => p.images?.slice(0, 1) ?? []),
            networkQuality === 'slow'
          );
        }

        if (!idbSnap) {
          try {
            const cachedProds = await getProductsFromCache(
              activeCategory, activeCountry || undefined, wholesaleMode || undefined
            );
            if (cachedProds.length > 0 && mountedRef.current) {
              setProducts(cachedProds);
              setLoading(false);
            }
          } catch {
            // Firestore cache empty (first visit) — skeleton stays, Phase 4 will load
          }
        }
      }

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

        let newLikedMap: Record<string, boolean> = {};
        if (currentUser && fetchedProducts.length > 0) {
          try {
            newLikedMap = await checkIsLikedBatch(fetchedProducts.map(p => p.id), currentUser.id);
          } catch {}
        }
        if (!mountedRef.current) return;

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

        prefetchProductImages(
          fetchedProducts.slice(6).flatMap(p => p.images?.slice(0, 1) ?? []),
          networkQuality === 'slow'
        );

      } catch {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadData();
  }, [activeCategory, activeCountry, wholesaleMode, isCountryReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc) return;
    setLoadingMore(true);
    const { products: moreProducts, lastDoc: newLastDoc } = await getProducts(activeCategory, lastDoc, undefined, undefined, activeCountry, wholesaleMode || undefined);
    setProducts(prev => [...prev, ...moreProducts]);
    setLastDoc(newLastDoc);
    setHasMore(newLastDoc !== null);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastDoc, activeCategory, activeCountry, wholesaleMode]);

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

  // Featured vendors derived client-side from loaded products.
  // Eligibility: verified seller (tier 'identity' or 'shop'), has slug, ≥ 3 products in feed.
  // Sorted by product count desc.
  const featuredVendors = React.useMemo(() => {
    const groups = new Map<string, { seller: User; products: Product[] }>();
    for (const p of displayProducts) {
      const s = p.seller;
      if (!s || !s.id || !s.slug) continue;
      if (!s.isVerified) continue;
      const tier = s.verificationTier;
      if (tier !== 'identity' && tier !== 'shop') continue;
      const g = groups.get(s.id) || { seller: s, products: [] };
      g.products.push(p);
      groups.set(s.id, g);
    }
    return Array.from(groups.values())
      .filter(g => g.products.length >= 3)
      .sort((a, b) => b.products.length - a.products.length);
  }, [displayProducts]);

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {Array.from({ length: 20 }).map((_, n) => (
              <ProductCardSkeleton key={n} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {(() => {
              const items: React.ReactNode[] = [];
              let vendorCursor = 0; // index into featuredVendors for next slot
              const usedSellerIds = new Set<string>();

              displayProducts.forEach((product: any, idx: number) => {
                items.push(
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => onProductClick(product)}
                    currentUserId={currentUser?.id || null}
                    initialLiked={likedMap[product.id]}
                    index={idx}
                    distanceLabel={nearbyMode && position && product._distance < 9999
                      ? `📍 ${formatDistance(product._distance)}`
                      : undefined}
                  />
                );

                const positionInGrid = idx + 1; // 1-based count of products rendered

                // Je Cherche — once, after the 6th product
                if (positionInGrid === JE_CHERCHE_AT) {
                  items.push(<JeChercheInlineCard key="je-cherche-inline" />);
                }

                // Featured Vendor — after every 10th product, if a vendor is available
                if (positionInGrid % VENDOR_EVERY === 0) {
                  while (vendorCursor < featuredVendors.length && usedSellerIds.has(featuredVendors[vendorCursor].seller.id)) {
                    vendorCursor++;
                  }
                  if (vendorCursor < featuredVendors.length) {
                    const v = featuredVendors[vendorCursor];
                    usedSellerIds.add(v.seller.id);
                    vendorCursor++;
                    items.push(
                      <FeaturedVendorCard
                        key={`featured-vendor-${v.seller.id}-${positionInGrid}`}
                        seller={v.seller}
                        products={v.products}
                      />
                    );
                  }
                  // Otherwise: silently skip — grid continues uninterrupted
                }
              });

              return items;
            })()}

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
