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
import { getProducts, getProductsFromCache, getBanners, checkIsLikedBatch, getBoostedProducts, getProductsByIds, getSellerAllProducts } from '../services/firebase';
import { getRecentlyViewedIds, getPopular, getPersonalizedRecommendations } from '../services/recommendations';
import { getFeedFromIDB, saveFeedToIDB, pruneStaleFeeds } from '../services/idb';
import { pruneStaleSearches } from '../services/searchIdb';
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

// Cache séparé pour les rails secondaires (indépendants des filtres catégorie/pays).
// Invalidé sur changement d'utilisateur. Survit aux navigations Home → Detail → Home.
interface RailsCache {
  userId: string | null;
  recentlyViewed: Product[];
  popularProducts: Product[];
  recommended: Product[];
  /** Seller's own products (pending + approved), shown only on a seller's home view. */
  sellerLatest: Product[];
  ts: number;
}
let _railsCache: RailsCache | null = null;
const RAILS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — rails moins volatils que le feed

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

  // Hydratation initiale des rails depuis le cache module-level si même userId.
  const railsHydrate = _railsCache && _railsCache.userId === (currentUser?.id ?? null) ? _railsCache : null;
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(railsHydrate?.recentlyViewed ?? []);
  const [popularProducts, setPopularProducts] = useState<Product[]>(railsHydrate?.popularProducts ?? []);
  const [recommended, setRecommended] = useState<Product[]>(railsHydrate?.recommended ?? []);
  const [sellerLatest, setSellerLatest] = useState<Product[]>(railsHydrate?.sellerLatest ?? []);

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
      requestIdleCallback(() => { pruneStaleFeeds(); pruneStaleSearches(); }, { timeout: 10000 });
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

  // Helper: met à jour le cache module-level pour un rail donné. Préserve les autres rails.
  const updateRailsCache = useCallback((patch: Partial<Omit<RailsCache, 'userId' | 'ts'>>) => {
    const uid = currentUser?.id ?? null;
    const base: RailsCache = _railsCache && _railsCache.userId === uid
      ? _railsCache
      : { userId: uid, recentlyViewed: [], popularProducts: [], recommended: [], sellerLatest: [], ts: Date.now() };
    _railsCache = { ...base, ...patch, userId: uid, ts: Date.now() };
  }, [currentUser?.id]);

  // Rails secondaires (Vus récemment, Populaires, Recommandés) — chargés en parallèle,
  // n'attendent PAS le feed principal pour ne pas bloquer le LCP.
  // Skip si cache frais (< RAILS_CACHE_TTL) pour éviter requêtes redondantes au mount.
  useEffect(() => {
    if (!isCountryReady) return;
    const isFresh = _railsCache
      && _railsCache.userId === (currentUser?.id ?? null)
      && Date.now() - _railsCache.ts < RAILS_CACHE_TTL
      && _railsCache.recentlyViewed.length > 0;
    if (isFresh) return;

    let cancelled = false;
    (async () => {
      try {
        const ids = await getRecentlyViewedIds(currentUser?.id ?? null, 12);
        if (cancelled || ids.length === 0) return;
        const products = await getProductsByIds(ids);
        if (cancelled) return;
        // Préserver l'ordre des IDs (le plus récent en premier)
        const indexById = new Map(ids.map((id, i) => [id, i]));
        const ordered = [...products].sort((a, b) => (indexById.get(a.id) ?? 99) - (indexById.get(b.id) ?? 99));
        setRecentlyViewed(ordered);
        updateRailsCache({ recentlyViewed: ordered });
      } catch {
        /* silencieux — rail caché si erreur */
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, isCountryReady, updateRailsCache]);

  useEffect(() => {
    if (!isCountryReady) return;
    const isFresh = _railsCache
      && Date.now() - _railsCache.ts < RAILS_CACHE_TTL
      && _railsCache.popularProducts.length > 0;
    if (isFresh) return;

    let cancelled = false;
    (async () => {
      try {
        const products = await getPopular(12);
        if (cancelled) return;
        setPopularProducts(products);
        updateRailsCache({ popularProducts: products });
      } catch {
        /* silencieux — rail caché si erreur */
      }
    })();
    return () => { cancelled = true; };
  }, [isCountryReady, updateRailsCache]);

  // Rail "Vos derniers produits" — uniquement vendeur connecté. Donne au vendeur un retour
  // visuel immédiat sur SA vue d'accueil (statut pending inclus pour qu'il voie son produit
  // fraîchement publié sans attendre l'approbation admin). Aucun acheteur n'est impacté.
  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'seller') {
      setSellerLatest([]);
      return;
    }
    const isFresh = _railsCache
      && _railsCache.userId === currentUser.id
      && Date.now() - _railsCache.ts < RAILS_CACHE_TTL
      && _railsCache.sellerLatest.length > 0;
    if (isFresh) return;

    let cancelled = false;
    (async () => {
      try {
        const all = await getSellerAllProducts(currentUser.id);
        if (cancelled) return;
        const visible = all
          .filter(p => p.status === 'pending' || p.status === 'approved')
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 6);
        setSellerLatest(visible);
        updateRailsCache({ sellerLatest: visible });
      } catch {
        /* silencieux — rail caché si erreur */
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.role, updateRailsCache]);

  // Recommandations personnalisées — uniquement utilisateur connecté.
  // Exclut les produits déjà dans "Vus récemment" pour éviter la redondance visuelle.
  useEffect(() => {
    if (!isCountryReady || !currentUser?.id) {
      setRecommended([]);
      return;
    }
    const isFresh = _railsCache
      && _railsCache.userId === currentUser.id
      && Date.now() - _railsCache.ts < RAILS_CACHE_TTL
      && _railsCache.recommended.length > 0;
    if (isFresh) return;

    let cancelled = false;
    (async () => {
      try {
        const excludeIds = recentlyViewed.map(p => p.id);
        const products = await getPersonalizedRecommendations(currentUser.id, excludeIds, 12);
        if (cancelled) return;
        setRecommended(products);
        updateRailsCache({ recommended: products });
      } catch {
        /* silencieux — rail caché si erreur */
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, isCountryReady, recentlyViewed, updateRailsCache]);

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
    <div className="pb-24 pt-safe-header md:pt-24 px-3 max-w-7xl mx-auto space-y-5 bg-[#F7F8FA] min-h-full">
      {/* Banner Carousel */}
      <BannerCarousel
        banners={banners.length > 0 ? banners : undefined}
      />

      {/* Vos derniers produits — visible uniquement aux vendeurs connectés.
           Inclut les produits en `pending` pour donner au vendeur un retour immédiat
           après publication, sans attendre l'approbation admin. */}
      {currentUser?.role === 'seller' && sellerLatest.length > 0 && (
        <ProductSection
          title={t('home.sections.yourLatest')}
          icon="🏪"
          products={sellerLatest}
          loading={false}
          currentUserId={currentUser.id}
          likedMap={likedMap}
          onProductClick={onProductClick}
        />
      )}

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
      <div className="overflow-x-auto pb-1 -mx-3 px-3" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-2">
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
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold"
            style={{
              background: nearbyMode ? '#10B981' : '#FFFFFF',
              color: nearbyMode ? '#FFFFFF' : '#5C6370',
              border: nearbyMode ? 'none' : '1px solid rgba(0,0,0,0.08)',
              boxShadow: nearbyMode ? '0 2px 8px rgba(16,185,129,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            {geoLoading ? (
              <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
            ) : (
              <span className="text-[13px]">📍</span>
            )}
            {t('home.nearMe')}
          </button>

          {/* Bouton "Grossiste B2B" */}
          <button
            onClick={() => {
              setWholesaleMode(!wholesaleMode);
              if (!wholesaleMode) setActiveCategory('all');
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold"
            style={{
              background: wholesaleMode ? '#6366F1' : '#FFFFFF',
              color: wholesaleMode ? '#FFFFFF' : '#5C6370',
              border: wholesaleMode ? 'none' : '1px solid rgba(0,0,0,0.08)',
              boxShadow: wholesaleMode ? '0 2px 8px rgba(99,102,241,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <span className="text-[13px]">🏭</span>
            {t('home.wholesale')}
          </button>

          {/* Bouton "Tout" */}
          <button
            onClick={() => { setActiveCategory('all'); setNearbyMode(false); }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold"
            style={{
              background: activeCategory === 'all' && !nearbyMode ? '#F5C842' : '#FFFFFF',
              color: activeCategory === 'all' && !nearbyMode ? '#111318' : '#5C6370',
              border: activeCategory === 'all' && !nearbyMode ? 'none' : '1px solid rgba(0,0,0,0.08)',
              boxShadow: activeCategory === 'all' && !nearbyMode ? '0 2px 8px rgba(245,200,66,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <span className="text-[13px]">🔍</span>
            {t('home.all')}
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setNearbyMode(false); }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold"
              style={{
                background: activeCategory === cat.id ? '#F5C842' : '#FFFFFF',
                color: activeCategory === cat.id ? '#111318' : '#5C6370',
                border: activeCategory === cat.id ? 'none' : '1px solid rgba(0,0,0,0.08)',
                boxShadow: activeCategory === cat.id ? '0 2px 8px rgba(245,200,66,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {cat.icon && <span className="text-[13px]">{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* B2B wholesale banner */}
      {wholesaleMode && (
        <div
          className="rounded-xl p-3 flex items-center gap-2"
          style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <span className="text-base">🏭</span>
          <div className="flex-1 min-w-0">
            <p className="text-indigo-700 font-semibold text-xs leading-tight">{t('home.wholesaleActive')}</p>
            <p className="text-indigo-600/70 text-[10px] leading-tight">{t('home.wholesaleHint')}</p>
          </div>
          <button
            onClick={() => setWholesaleMode(false)}
            className="text-indigo-600/70 hover:text-indigo-700 text-[10px] px-2 py-0.5 border border-indigo-200 rounded-lg flex-shrink-0 bg-transparent"
          >
            {t('home.nearbyDisable')}
          </button>
        </div>
      )}

      {/* Nearby mode banner */}
      {nearbyMode && (
        <div
          className="rounded-xl p-3 flex items-center gap-2"
          style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}
        >
          <span className="text-base">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-green-700 font-semibold text-xs leading-tight">{t('home.nearbyActive')}</p>
            <p className="text-green-600/70 text-[10px] leading-tight">{position ? t('home.nearbyHint') : t('home.nearbyWaiting')}</p>
          </div>
          <button
            onClick={() => setNearbyMode(false)}
            className="text-green-600/70 hover:text-green-700 text-[10px] px-2 py-0.5 border border-green-200 rounded-lg flex-shrink-0 bg-transparent"
          >
            {t('home.nearbyDisable')}
          </button>
        </div>
      )}

      {/* Rails de découverte — DO NOT REMOVE without UX review.
          Le pattern "feed unique" convient à TikTok (consommation passive) mais pas à
          une marketplace : l'acheteur en mode chasseur a besoin de plusieurs surfaces
          d'entrée (re-engagement, perso, preuve sociale). */}

      {/* Vus récemment — re-engagement (caché si vide, pas de skeleton) */}
      {recentlyViewed.length > 0 && (
        <ProductSection
          title={t('home.sections.recentlyViewed')}
          icon="🕐"
          products={recentlyViewed}
          loading={false}
          currentUserId={currentUser?.id}
          likedMap={likedMap}
          onProductClick={onProductClick}
        />
      )}

      {/* Recommandé pour vous — connecté + assez d'historique (>= 4 produits) */}
      {currentUser && recommended.length >= 4 && (
        <ProductSection
          title={t('home.sections.recommended')}
          icon="✨"
          products={recommended}
          loading={false}
          currentUserId={currentUser.id}
          likedMap={likedMap}
          onProductClick={onProductClick}
        />
      )}

      {/* Populaires — preuve sociale, toujours visible si données disponibles */}
      {popularProducts.length > 0 && (
        <ProductSection
          title={t('home.sections.popular')}
          icon="🔥"
          products={popularProducts}
          loading={false}
          currentUserId={currentUser?.id}
          likedMap={likedMap}
          onProductClick={onProductClick}
        />
      )}

      {/* Product Grid — Dernieres annonces */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-[17px] font-black text-[#111318] tracking-tight"
            style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
          >
            <span className="mr-1.5">{wholesaleMode ? '🏭' : nearbyMode ? '📍' : '🛒'}</span>
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
        <div className="text-center pt-1">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-white rounded-xl text-[13px] font-semibold text-[#5C6370] transition-colors disabled:opacity-50"
            style={{ border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            {loadingMore ? t('home.loading') : t('home.loadMore')}
          </button>
        </div>
      )}

      {/* Footer legal */}
      <div className="text-center py-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-center gap-2 text-xs text-[#9EA5B0]">
          <Link to="/cgu" className="hover:text-[#C47E00] hover:underline transition-colors">
            Conditions d'utilisation
          </Link>
          <span className="text-[#BCC1CA]">&middot;</span>
          <Link to="/politique-confidentialite" className="hover:text-[#C47E00] hover:underline transition-colors">
            Politique de confidentialité
          </Link>
        </div>
        <p className="text-[10px] text-[#BCC1CA] mt-1.5">&copy; 2026 NUNULIA</p>
      </div>
    </div>
  );
};

export default Home;
