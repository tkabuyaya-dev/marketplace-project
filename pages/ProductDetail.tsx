import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Product, User } from '../types';
import { Button } from '../components/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ShareSheet } from '../components/ShareSheet';
import { Badge } from '../components/Badge';
import { CURRENCY } from '../constants';
import { toggleLikeProduct, reportProduct, checkIsLiked, incrementProductViews, getProductBySlugOrId } from '../services/firebase';
import { getOptimizedUrl } from '../services/cloudinary';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { useAppContext } from '../contexts/AppContext';
import { updateMetaTags } from '../utils/meta';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';
import { StockUrgency } from '../components/StockUrgency';
import { CountdownTimer } from '../components/CountdownTimer';
import { ReviewSection } from '../components/ReviewSection';
import { ProductSection } from '../components/ProductSection';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { UnverifiedSellerNotice } from '../components/UnverifiedSellerNotice';
import { trackProductView, getSimilarProducts, getCustomersAlsoViewed } from '../services/recommendations';

const ProductDetail: React.FC = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { categories } = useCategories();

  const getCategoryName = (catId: string) => {
    const found = categories.find(c => c.id === catId || c.slug === catId);
    return found ? `${found.icon} ${found.name}` : catId;
  };

  // Try to get product from navigation state first (avoid re-fetch)
  const [product, setProduct] = useState<Product | null>(location.state?.product || null);
  const [loading, setLoading] = useState(!product);
  const [notFound, setNotFound] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [activeImage, setActiveImage] = useState(0);

  // Recommendation sections
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [alsoViewed, setAlsoViewed] = useState<Product[]>([]);

  // Scroll to top on every product navigation (React Router preserves scroll position)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slugOrId]);

  // Load product from slug/ID if not passed via state
  useEffect(() => {
    if (product) {
      setLikeCount(product.likesCount || 0);
      return;
    }
    if (!slugOrId) return;

    const load = async () => {
      setLoading(true);
      const p = await getProductBySlugOrId(slugOrId);
      if (p) {
        setProduct(p);
        setLikeCount(p.likesCount || 0);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [slugOrId]);

  // Update meta tags + increment views + track activity
  useEffect(() => {
    if (!product) return;
    incrementProductViews(product.id).catch(() => {});
    trackProductView(product, currentUser?.id).catch(() => {});
    updateMetaTags({
      title: product.title,
      description: product.description?.substring(0, 160),
      image: product.images[0],
      url: window.location.href,
    });
    if (currentUser) {
      checkIsLiked(product.id, currentUser.id).then(setLiked);
    }
  }, [product?.id, currentUser]);

  // Load similar products + "also viewed" (non-blocking)
  useEffect(() => {
    if (!product) return;
    getSimilarProducts(product, 8).then(setSimilarProducts).catch(() => {});
    getCustomersAlsoViewed(product.id, 8).then(setAlsoViewed).catch(() => {});
  }, [product?.id]);

  // Reset image index when product changes
  useEffect(() => { setActiveImage(0); }, [product?.id]);

  const onProductClick = (p: Product) => {
    navigate(`/product/${p.slug || p.id}`, { state: { product: p } });
    // Reset state for new product
    setProduct(p);
    setLikeCount(p.likesCount || 0);
    setLiked(false);
    setSimilarProducts([]);
    setAlsoViewed([]);
    window.scrollTo(0, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-gold-500 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">😕</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('productDetail.notFound')}</h1>
        <Button onClick={() => navigate('/')}>{t('productDetail.backToHome')}</Button>
      </div>
    );
  }

  // Promotion logic
  const now = Date.now();
  const isOnPromotion = product.discountPrice != null
    && product.promotionEnd != null
    && product.promotionEnd > now
    && (!product.promotionStart || product.promotionStart <= now);
  const displayPrice = isOnPromotion ? product.discountPrice! : product.price;

  const handleWhatsApp = () => {
    if (product.seller.whatsapp) {
      const productUrl = `${window.location.origin}/product/${product.slug || product.id}`;
      const message = t('productDetail.whatsappMessage', { title: product.title, url: productUrl });
      const url = `https://wa.me/${product.seller.whatsapp}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
    } else {
      toast(t('productDetail.noWhatsapp'), 'info');
    }
  };

  const handleLike = async () => {
    if (!currentUser) return toast(t('productDetail.loginToLike'), 'info');
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : c - 1);
    try {
      await toggleLikeProduct(product.id, currentUser.id);
    } catch {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  };

  const handleReport = () => {
    if (window.confirm(t('productDetail.confirmReport'))) {
      reportProduct(product.id, 'inappropriate');
      toast(t('productDetail.reportSent'), 'success');
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.title,
          text: t('productDetail.shareText', { title: product.title }),
          url: shareUrl,
        });
      } catch (error) { console.error('[Share] Web Share API failed:', error); }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast(t('productDetail.linkCopied'), 'success');
      } catch {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast(t('productDetail.linkCopied'), 'success');
      }
    }
  };

  const onVisitShop = (seller: User) => {
    navigate(`/shop/${seller.slug || seller.id}`, { state: { seller } });
  };

  const handleBack = () => {
    if (window.history.length <= 1) {
      navigate('/');
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 pb-40 md:pb-24">
      {/* Header bar — 56px to match reference */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800/50 flex items-center justify-between px-3.5 h-14">
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          aria-label={t('productDetail.backToHome')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="flex-1 mx-3 text-sm font-semibold text-gray-900 dark:text-white truncate">{product.title}</p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <LanguageSwitcher compact />
          <ShareSheet url={window.location.href} title={product?.title || 'Nunulia'} text={product ? t('productDetail.shareText', { title: product.title }) : ''} />
          <button
            onClick={handleLike}
            aria-label={liked ? 'Unlike' : 'Like'}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${liked ? 'bg-red-100 text-red-500 dark:bg-red-500/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white'}`}
          >
            <span className="text-base leading-none">❤️</span>
          </button>
        </div>
      </div>

      {/* Main image */}
      <div
        className="relative w-full bg-gray-100 dark:bg-black select-none"
        onTouchStart={e => { (e.currentTarget as any)._touchX = e.touches[0].clientX; }}
        onTouchEnd={e => {
          const startX = (e.currentTarget as any)._touchX;
          if (startX == null) return;
          const diff = startX - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 80 && product.images.length > 1) {
            setActiveImage(prev => diff > 0
              ? Math.min(prev + 1, product.images.length - 1)
              : Math.max(prev - 1, 0)
            );
          }
        }}
      >
        <ProgressiveImage
          src={getOptimizedUrl(product.images[activeImage] || product.images[0], 800)}
          alt={product.title}
          blurhash={product.blurhash}
          originalUrl={product.images[activeImage] || product.images[0]}
          className="w-full aspect-square"
          loading="eager"
        />

        {product.images.length > 1 && (
          <>
            <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {activeImage + 1}/{product.images.length}
            </div>

            {/* Arrow buttons (desktop) */}
            {activeImage > 0 && (
              <button
                onClick={() => setActiveImage(i => i - 1)}
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 backdrop-blur-md p-2.5 rounded-full text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            {activeImage < product.images.length - 1 && (
              <button
                onClick={() => setActiveImage(i => i + 1)}
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 backdrop-blur-md p-2.5 rounded-full text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Thumbnails strip */}
      {product.images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 bg-white dark:bg-gray-900 overflow-x-auto no-scrollbar">
          {product.images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImage(i)}
              className={`w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                i === activeImage ? 'border-gold-500 dark:border-blue-500 scale-105' : 'border-gray-200 dark:border-gray-700 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={getOptimizedUrl(img, 80)} alt={t('productDetail.photo', { number: i + 1 })} loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Product info — overlay rounded card on image (-16px), matches reference */}
      <div className="relative -mt-4 bg-white dark:bg-gray-900 rounded-t-[20px] px-4 pt-5 pb-4 space-y-4 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] dark:shadow-none">
        {/* Title + price + stats */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="info">{getCategoryName(product.category)}</Badge>
            {product.subCategory && (
              <>
                <span className="text-gray-400 dark:text-gray-600 text-xs">/</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10">
                  {product.subCategory}
                </span>
              </>
            )}
          </div>
          <h1 className="text-lg leading-tight font-bold text-gray-900 dark:text-white mb-2 font-sans">{product.title}</h1>

          {/* Price with promotion support — 26px / 900 weight per reference */}
          {(() => { const cur = product.currency || CURRENCY; return (
          <div className="mb-2">
            {isOnPromotion ? (
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-[26px] leading-none font-black text-red-600 dark:text-red-400">
                  {displayPrice.toLocaleString()} <span className="text-sm font-semibold text-red-600/70 dark:text-red-400/70">{cur}</span>
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 line-through">
                  {product.price.toLocaleString()} {cur}
                </p>
              </div>
            ) : (
              <p className="text-[26px] leading-none font-black text-gold-600 dark:text-gold-400">
                {product.price.toLocaleString()} <span className="text-sm font-semibold text-gold-600/70 dark:text-gold-400/70">{cur}</span>
              </p>
            )}
          </div>
          ); })()}

          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="text-yellow-500 dark:text-yellow-400">★</span> {product.rating || 0}</span>
            <span className="flex items-center gap-1">👁 {product.views}</span>
            <span className="flex items-center gap-1">❤️ {likeCount}</span>
            {product.reviews > 0 && (
              <span className="flex items-center gap-1">💬 {product.reviews} {t('product.reviews')}</span>
            )}
          </div>

          {/* Social proof badges */}
          <div className="flex flex-wrap gap-2 mt-3">
            {product.views > 10 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gold-400/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400 text-xs font-bold rounded-full">
                👀 {Math.max(2, Math.floor(product.views / 50) + Math.floor(Math.random() * 3))} {t('productDetail.peopleViewing')}
              </span>
            )}
            {product.seller.isVerified && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 text-xs font-bold rounded-full">
                🛡️ {t('productDetail.verifiedSeller', { year: new Date(product.seller.joinDate || Date.now()).getFullYear() })}
              </span>
            )}
            {product.views > 50 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 text-xs font-bold rounded-full">
                🔥 {t('product.trending')}
              </span>
            )}
          </div>
        </div>

        {/* Promotion countdown */}
        {isOnPromotion && product.promotionEnd && (
          <CountdownTimer
            promotionEnd={product.promotionEnd}
            discountPrice={product.discountPrice!}
            originalPrice={product.price}
            currency={product.currency || CURRENCY}
          />
        )}

        {/* Stock urgency */}
        <StockUrgency stockQuantity={product.stockQuantity} />

        {/* B2B Wholesale info */}
        {product.isWholesale && (
          <div className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full">B2B</span>
              <span className="text-indigo-700 dark:text-indigo-300 font-semibold text-sm">{t('product.wholesaleAvailable')}</span>
            </div>
            {product.minOrderQuantity && (
              <p className="text-gray-600 dark:text-gray-400 text-sm">{t('product.minOrder', { count: product.minOrderQuantity })}</p>
            )}
            {product.wholesalePrice && (
              <p className="text-indigo-700 dark:text-indigo-400 font-bold text-lg">
                {product.wholesalePrice.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-600 dark:text-gray-400">{product.currency || CURRENCY}</span>
                <span className="text-xs text-gray-500 ml-2">/ {t('product.perUnit')}</span>
              </p>
            )}
          </div>
        )}

        {/* Action buttons — desktop only (mobile uses sticky bottom CTA) */}
        <div className="hidden md:flex flex-col gap-3">
          <button
            onClick={handleWhatsApp}
            className="w-full h-[52px] rounded-2xl bg-[#25D366] hover:bg-[#20bd5b] text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(37,211,102,0.3)] hover:shadow-[0_6px_20px_rgba(37,211,102,0.4)] transition-all active:scale-[0.98]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            {t('productDetail.contactWhatsApp', 'Contacter via WhatsApp')}
          </button>
          {/* Edit button — visible to product owner or admin */}
          {currentUser && (currentUser.id === product.seller.id || currentUser.role === 'admin') && (
            <button
              onClick={() => navigate('/dashboard', { state: { editProduct: product } })}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:text-white dark:hover:border-gray-400 dark:hover:bg-gray-800/50 transition-all text-sm font-medium"
            >
              ✏️ {t('dashboard.editProduct')}
            </button>
          )}
        </div>

        {/* Edit button — mobile (in-flow, sticky CTA handles WhatsApp) */}
        {currentUser && (currentUser.id === product.seller.id || currentUser.role === 'admin') && (
          <button
            onClick={() => navigate('/dashboard', { state: { editProduct: product } })}
            className="md:hidden flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:text-white dark:hover:border-gray-400 dark:hover:bg-gray-800/50 transition-all text-sm font-medium"
          >
            ✏️ {t('dashboard.editProduct')}
          </button>
        )}

        {/* Seller Info */}
        <div className="space-y-2">
          <div
            onClick={() => onVisitShop(product.seller)}
            className="flex items-center gap-4 p-4 bg-white border border-gray-200 hover:bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700/50 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors group shadow-sm dark:shadow-none"
          >
            <img src={getOptimizedUrl(product.seller.avatar, 48)} alt={product.seller.name} loading="lazy" className="w-12 h-12 rounded-full border border-gray-200 dark:border-gray-600 group-hover:border-gold-400" />
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <h4 className="text-gray-900 dark:text-white font-medium group-hover:text-gold-600 dark:group-hover:text-gold-400 transition-colors">{product.seller.name}</h4>
                {product.seller.isVerified && (
                  <VerifiedBadge tier={product.seller.verificationTier} size="sm" />
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t('productDetail.memberSince', { year: new Date(product.seller.joinDate || Date.now()).getFullYear() })}</p>
            </div>
            <div className="text-xs font-bold text-gray-700 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
              {t('productDetail.shopButton')} <span>→</span>
            </div>
          </div>
          <UnverifiedSellerNotice tier={product.seller.verificationTier} variant="banner" />
        </div>

        {/* Trust notice — WhatsApp-only transactions */}
        <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-700/30 rounded-xl px-4 py-3">
          <span aria-hidden="true" className="text-base leading-none mt-0.5">💬</span>
          <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">{t('productDetail.trustNotice')}</p>
        </div>

        {/* Description */}
        <div className="space-y-3 pb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('product.description')}</h3>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{product.description}</p>
        </div>

        {/* Reviews Section */}
        <ReviewSection
          productId={product.id}
          currentUserId={currentUser?.id}
          productRating={product.rating || 0}
          reviewCount={product.reviews || 0}
        />

        {/* Similar Products */}
        <ProductSection
          title={t('product.similar')}
          icon="🏷️"
          products={similarProducts}
          currentUserId={currentUser?.id}
          onProductClick={onProductClick}
        />

        {/* Customers Also Viewed */}
        <ProductSection
          title={t('productDetail.customersAlsoViewed')}
          icon="👀"
          products={alsoViewed}
          currentUserId={currentUser?.id}
          onProductClick={onProductClick}
        />

        <button onClick={handleReport} className="text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400 underline text-center w-full pb-2">
          {t('productDetail.reportFraudulent')}
        </button>
      </div>

      {/* Sticky bottom WhatsApp CTA — mobile only, sits above bottom nav */}
      <div className="md:hidden fixed left-0 right-0 bottom-16 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 pt-3 pb-3 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <button
          onClick={handleWhatsApp}
          className="w-full h-[52px] rounded-2xl bg-[#25D366] hover:bg-[#20bd5b] text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(37,211,102,0.3)] active:scale-[0.98] transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          {t('productDetail.contactWhatsApp', 'Contacter via WhatsApp')}
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;
