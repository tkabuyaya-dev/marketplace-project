import React, { useEffect, useState, Suspense, lazy } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Product } from '../types';
import { getSellerProducts, getUserBySlugOrId, subscribeToUserProfile } from '../services/firebase';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ShareSheet } from '../components/ShareSheet';
import { ProductCard } from '../components/ProductCard';
import { Button } from '../components/Button';
import { useAppContext } from '../contexts/AppContext';
import { updateMetaTags } from '../utils/meta';
import { getOptimizedUrl } from '../services/cloudinary';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { TrustScore } from '../components/TrustScore';
import { UnverifiedSellerNotice } from '../components/UnverifiedSellerNotice';

const ShopMap = lazy(() => import('../components/ShopMap'));
const ShopSearch = lazy(() => import('../components/ShopSearch'));

const ShopProfile: React.FC = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { handleContactSeller } = useAppContext();
  const { t } = useTranslation();

  const [seller, setSeller] = useState<User | null>(location.state?.seller || null);
  const [loading, setLoading] = useState(!seller);
  const [notFound, setNotFound] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [copied, setCopied] = useState(false);

  // Load full seller from Firestore, then subscribe for real-time updates
  useEffect(() => {
    if (!slugOrId) return;
    let unsubSnapshot: (() => void) | null = null;

    const load = async () => {
      if (!seller) setLoading(true);
      const u = await getUserBySlugOrId(slugOrId);
      if (u) {
        setSeller(u);
        // Subscribe to real-time updates on this seller's profile
        unsubSnapshot = subscribeToUserProfile(u.id, (updated) => setSeller(updated));
      } else if (!seller) {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();

    return () => { if (unsubSnapshot) unsubSnapshot(); };
  }, [slugOrId]);

  // Load products once seller is available
  useEffect(() => {
    if (!seller) return;
    updateMetaTags({
      title: seller.sellerDetails?.shopName || seller.name,
      description: seller.bio || t('shopProfile.shopOnNunulia'),
      image: seller.avatar,
      url: window.location.href,
    });
    const loadProducts = async () => {
      setLoadingProducts(true);
      const data = await getSellerProducts(seller.id);
      setProducts(data);
      setLoadingProducts(false);
    };
    loadProducts();
  }, [seller?.id]);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: shopName,
          text: t('shopProfile.shareText', { name: shopName }),
          url: shareUrl,
        });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shopName = seller?.sellerDetails?.shopName || seller?.name || '';

  const handleBack = () => {
    if (window.history.length <= 1) {
      navigate('/');
    } else {
      navigate(-1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-gold-500 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !seller) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">😕</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('shopProfile.notFound')}</h1>
        <Button onClick={() => navigate('/')}>{t('shopProfile.backToHome')}</Button>
      </div>
    );
  }

  const bannerUrl = seller.banner || seller.sellerDetails?.shopImage || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80';

  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 pb-20 font-sans animate-fade-in">
      {/* HERO / BANNER */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <div className="absolute top-4 right-4 z-20">
          <LanguageSwitcher compact />
        </div>
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 z-20 bg-black/40 hover:bg-black/60 backdrop-blur-md p-2 rounded-full text-white transition-all border border-white/10"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div className="absolute inset-0 bg-gradient-to-t from-[#F7F7F5] dark:from-gray-950 via-transparent to-transparent z-10"></div>
        <img src={getOptimizedUrl(bannerUrl, 1200)} className="w-full h-full object-cover" alt="Shop Banner" />
      </div>

      {/* SHOP INFO HEADER */}
      <div className="max-w-7xl mx-auto px-4 -mt-16 relative z-20 mb-10">
        <div className="bg-white/95 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xl dark:shadow-2xl flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
          <div className="relative -mt-16 md:-mt-20 shrink-0">
            <TrustScore user={seller} productCount={products.length}>
              <img src={getOptimizedUrl(seller.avatar, 160)} className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white dark:border-gray-950 object-cover shadow-2xl" alt={seller.name} />
            </TrustScore>
            {seller.isVerified && (
              <div className={`absolute bottom-2 right-2 p-1.5 rounded-full border-4 border-white dark:border-gray-900 shadow-lg ${
                seller.verificationTier === 'shop'
                  ? 'bg-gradient-to-br from-amber-400 to-yellow-600 shadow-amber-500/40'
                  : 'bg-blue-600 shadow-blue-500/30'
              }`} title={t('shop.verified')}>
                <svg className={`w-4 h-4 ${seller.verificationTier === 'shop' ? 'text-gray-900' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{seller.sellerDetails?.shopName || seller.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm max-w-lg mx-auto md:mx-0">
              {seller.bio || t('shopProfile.defaultBio')}
            </p>
            <div className="flex items-center justify-center md:justify-start gap-4 text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-widest mt-2">
              <span>★ 4.9 {t('shopProfile.sellerRating')}</span>
              <span>•</span>
              <span>{products.length} {t('shop.products')}</span>
              <span>•</span>
              <span>{t('shopProfile.since', { year: new Date(seller.joinDate || Date.now()).getFullYear() })}</span>
            </div>
            <UnverifiedSellerNotice tier={seller.verificationTier} variant="banner" className="mt-3" />
          </div>

          <div className="flex flex-col gap-3 w-full md:w-auto min-w-[180px]">
            <Button className="bg-green-600 hover:bg-green-500 border-transparent text-white" onClick={() => handleContactSeller(seller)} icon={<span>📱</span>}>WhatsApp</Button>
            <ShareSheet url={window.location.href} title={shopName} text={t('shopProfile.shareText', { name: shopName })} />
          </div>
        </div>
      </div>

      {/* Grace phase notice (phase 2 = some products hidden) */}
      {seller.sellerDetails?.downgradePhase === 2 && (
        <div className="max-w-7xl mx-auto px-4 mb-4">
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
            <span>⏳</span>
            <span>{t('shop.gracePh2Notice', 'Certains produits sont temporairement masqués. La boutique sera pleinement disponible après renouvellement.')}</span>
          </div>
        </div>
      )}

      {/* Google Maps */}
      {seller.sellerDetails?.gps?.lat && seller.sellerDetails?.gps?.lng && (
        <div className="max-w-7xl mx-auto px-4 mb-10">
          <Suspense fallback={<div className="h-48 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />}>
            <ShopMap coordinates={seller.sellerDetails.gps} shopName={seller.sellerDetails.shopName || seller.name} />
          </Suspense>
        </div>
      )}

      {/* SHOP SEARCH — intra-boutique search with filters */}
      {!loadingProducts && products.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 mb-8">
          <Suspense fallback={null}>
            <ShopSearch
              products={products}
              sellerId={seller.id}
              sellerName={seller.sellerDetails?.shopName || seller.name}
              allLoaded={products.length < 50}
            />
          </Suspense>
        </div>
      )}

      {/* PRODUCTS SECTIONS */}
      <div className="max-w-7xl mx-auto px-4 space-y-12">
        {loadingProducts ? (
          <div>
            <div className="flex items-center gap-4 mb-8">
              <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(n => <div key={n} className="h-80 bg-gray-100 dark:bg-gray-900 rounded-2xl animate-pulse" />)}
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-500">
            {t('shopProfile.noProductsYet')}
          </div>
        ) : (
          <>
            {/* Populaires (top by views, min 2 views, max 4) */}
            {(() => {
              const popular = [...products].filter(p => p.views >= 2).sort((a, b) => b.views - a.views).slice(0, 4);
              if (popular.length === 0) return null;
              return (
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('shopProfile.popular')}</h2>
                    <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {popular.map(p => <ProductCard key={p.id} product={p} onClick={() => onProductClick(p)} />)}
                  </div>
                </div>
              );
            })()}

            {/* Nouveautés (< 7 jours) */}
            {(() => {
              const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const recent = products.filter(p => p.createdAt > sevenDaysAgo).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
              if (recent.length === 0) return null;
              return (
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('shopProfile.newArrivals')}</h2>
                    <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {recent.map(p => <ProductCard key={p.id} product={p} onClick={() => onProductClick(p)} />)}
                  </div>
                </div>
              );
            })()}

            {/* Tous les produits */}
            <div>
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('shop.allProducts')}</h2>
                <span className="text-sm text-gray-500 dark:text-gray-500">({products.length})</span>
                <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map(p => <ProductCard key={p.id} product={p} onClick={() => onProductClick(p)} />)}
              </div>
            </div>

            {/* Avis clients */}
            <div>
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('shopProfile.customerReviews')}</h2>
                <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
              </div>
              <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none rounded-2xl p-8 text-center">
                <p className="text-3xl mb-3">💬</p>
                <p className="text-gray-700 dark:text-gray-400 text-sm">{t('shopProfile.noReviews')}</p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">{t('shopProfile.reviewsComingSoon')}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShopProfile;
