import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Product, User } from '../types';
import { Button } from '../components/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ShareSheet } from '../components/ShareSheet';
import { Badge } from '../components/Badge';
import { CURRENCY, THEME, TC } from '../constants';
import { toggleLikeProduct, reportProduct, checkIsLiked, incrementProductViews, getProductBySlugOrId, placeBid } from '../services/firebase';
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
import { trackProductView, getSimilarProducts, getCustomersAlsoViewed } from '../services/recommendations';

const ProductDetail: React.FC = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, handleContactSeller } = useAppContext();
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

  // Auction state
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [auctionTimeLeft, setAuctionTimeLeft] = useState('');

  // Recommendation sections
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [alsoViewed, setAlsoViewed] = useState<Product[]>([]);

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

  // Auction countdown (must be before any early returns to respect hook rules)
  useEffect(() => {
    if (!product?.isAuction || !product.auctionEndTime) return;
    const tick = () => {
      const diff = product.auctionEndTime! - Date.now();
      if (diff <= 0) { setAuctionTimeLeft(t('product.auctionEnded')); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setAuctionTimeLeft(d > 0 ? `${d}j ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [product?.auctionEndTime, t]);

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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">😕</div>
        <h1 className="text-xl font-bold text-white">{t('productDetail.notFound')}</h1>
        <Button onClick={() => navigate('/')}>{t('productDetail.backToHome')}</Button>
      </div>
    );
  }

  const tc = TC;

  // Promotion logic
  const now = Date.now();
  const isOnPromotion = product.discountPrice != null
    && product.promotionEnd != null
    && product.promotionEnd > now
    && (!product.promotionStart || product.promotionStart <= now);
  const displayPrice = isOnPromotion ? product.discountPrice! : product.price;

  const handlePlaceBid = async () => {
    if (!product || !currentUser || bidding) return;
    const amount = Number(bidAmount);
    const minBid = (product.currentBid || product.startingBid || 0) + 1;
    if (!amount || amount < minBid) {
      toast(t('product.bidTooLow', { min: minBid.toLocaleString('fr-FR') }), 'error');
      return;
    }
    setBidding(true);
    try {
      await placeBid(product.id, amount);
      setProduct({ ...product, currentBid: amount, currentBidderId: currentUser.id, bidCount: (product.bidCount || 0) + 1 });
      setBidAmount('');
      toast(t('product.bidPlaced'), 'success');
    } catch (err: any) {
      toast(err.message || t('product.bidError'), 'error');
    } finally {
      setBidding(false);
    }
  };

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
      } catch (error) { console.log('Share error', error); }
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
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header bar */}
      <div className="sticky top-0 z-30 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/50 flex items-center justify-between px-4 py-3">
        <button onClick={handleBack} className="p-3 -m-1 text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ShareSheet url={window.location.href} title={product?.title || 'Nunulia'} text={product ? t('productDetail.shareText', { title: product.title }) : ''} />
          <button onClick={handleLike} className={`p-3 rounded-full transition-colors ${liked ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-white hover:bg-gray-700'}`}>❤️</button>
        </div>
      </div>

      {/* Main image */}
      <div
        className="relative w-full bg-black select-none"
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
        <div className="flex gap-2 px-4 py-3 bg-gray-900 overflow-x-auto no-scrollbar">
          {product.images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImage(i)}
              className={`w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                i === activeImage ? 'border-blue-500 scale-105' : 'border-gray-700 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={getOptimizedUrl(img, 80)} alt={t('productDetail.photo', { number: i + 1 })} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Product info */}
      <div className="px-4 pt-4 space-y-4">
        {/* Title + price + stats */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="info">{getCategoryName(product.category)}</Badge>
            {product.subCategory && (
              <>
                <span className="text-gray-600 text-xs">/</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10">
                  {product.subCategory}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 font-sans">{product.title}</h1>

          {/* Price with promotion support */}
          {(() => { const cur = product.currency || CURRENCY; return (
          <div className="mb-2">
            {isOnPromotion ? (
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-bold text-red-400">
                  {displayPrice.toLocaleString()} <span className="text-lg text-red-400/70">{cur}</span>
                </p>
                <p className="text-lg text-gray-500 line-through">
                  {product.price.toLocaleString()} {cur}
                </p>
              </div>
            ) : (
              <p className={`text-3xl font-bold ${tc.text400}`}>
                {product.price.toLocaleString()} <span className={`text-lg ${tc.text400_70}`}>{cur}</span>
              </p>
            )}
          </div>
          ); })()}

          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1"><span className="text-yellow-400">★</span> {product.rating || 0}</span>
            <span className="flex items-center gap-1">👁 {product.views}</span>
            <span className="flex items-center gap-1">❤️ {likeCount}</span>
            {product.reviews > 0 && (
              <span className="flex items-center gap-1">💬 {product.reviews} {t('product.reviews')}</span>
            )}
          </div>

          {/* Social proof badges */}
          <div className="flex flex-wrap gap-2 mt-3">
            {product.views > 10 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gold-400/10 text-gold-400 text-xs font-bold rounded-full">
                👀 {Math.max(2, Math.floor(product.views / 50) + Math.floor(Math.random() * 3))} {t('productDetail.peopleViewing')}
              </span>
            )}
            {product.seller.isVerified && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full">
                🛡️ {t('productDetail.verifiedSeller', { year: new Date(product.seller.joinDate || Date.now()).getFullYear() })}
              </span>
            )}
            {product.views > 50 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 text-orange-400 text-xs font-bold rounded-full">
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
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full">B2B</span>
              <span className="text-indigo-300 font-semibold text-sm">{t('product.wholesaleAvailable')}</span>
            </div>
            {product.minOrderQuantity && (
              <p className="text-gray-400 text-sm">{t('product.minOrder', { count: product.minOrderQuantity })}</p>
            )}
            {product.wholesalePrice && (
              <p className="text-indigo-400 font-bold text-lg">
                {product.wholesalePrice.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-400">{product.currency || CURRENCY}</span>
                <span className="text-xs text-gray-500 ml-2">/ {t('product.perUnit')}</span>
              </p>
            )}
          </div>
        )}

        {/* Auction section */}
        {product.isAuction && product.auctionEndTime && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔨</span>
                <span className="text-red-400 font-bold text-sm">{t('product.auctionLabel')}</span>
              </div>
              <div className="text-right">
                <p className="text-white font-mono font-bold text-lg">{auctionTimeLeft}</p>
                <p className="text-gray-500 text-[10px]">{t('product.timeRemaining')}</p>
              </div>
            </div>
            <div className="flex items-center justify-between bg-black/20 rounded-xl p-3">
              <div>
                <p className="text-gray-500 text-xs">{t('product.currentBid')}</p>
                <p className="text-white font-bold text-xl">
                  {(product.currentBid || product.startingBid || 0).toLocaleString('fr-FR')} <span className="text-sm text-gray-400">{product.currency || CURRENCY}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs">{t('product.bidders')}</p>
                <p className="text-white font-bold">{product.bidCount || 0}</p>
              </div>
            </div>
            {product.auctionEndTime > Date.now() && currentUser && currentUser.id !== product.seller.id && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  placeholder={`${((product.currentBid || product.startingBid || 0) + 1).toLocaleString('fr-FR')}+`}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl p-3 text-white font-mono focus:ring-1 focus:ring-red-500 outline-none"
                />
                <Button
                  variant="primary"
                  className="bg-red-600 hover:bg-red-500 border-transparent"
                  onClick={handlePlaceBid}
                  isLoading={bidding}
                >
                  {t('product.placeBid')}
                </Button>
              </div>
            )}
            {product.auctionEndTime <= Date.now() && (
              <p className="text-center text-gray-500 text-sm font-medium">{t('product.auctionEnded')}</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Button variant="primary" className="flex-1 bg-green-600 hover:bg-green-500 border-transparent text-white" onClick={() => handleContactSeller(product.seller, product.id)} icon={<span className="text-lg">📱</span>}>WhatsApp</Button>
          </div>
        </div>

        {/* Seller Info */}
        <div
          onClick={() => onVisitShop(product.seller)}
          className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-2xl border border-gray-700/50 cursor-pointer hover:bg-gray-800 transition-colors group"
        >
          <img src={product.seller.avatar} alt={product.seller.name} className="w-12 h-12 rounded-full border border-gray-600 group-hover:border-gold-400" />
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <h4 className="text-white font-medium group-hover:text-gold-400 transition-colors">{product.seller.name}</h4>
              {product.seller.isVerified && <span className={tc.text500}>✓</span>}
            </div>
            <p className="text-xs text-gray-400">{t('productDetail.memberSince', { year: new Date(product.seller.joinDate || Date.now()).getFullYear() })}</p>
          </div>
          <div className="text-xs font-bold text-gray-400 group-hover:text-white flex items-center gap-1 bg-gray-800 px-3 py-1.5 rounded-full">
            {t('productDetail.shopButton')} <span>→</span>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-3 pb-4">
          <h3 className="text-lg font-bold text-white">{t('product.description')}</h3>
          <p className="text-gray-300 leading-relaxed text-sm">{product.description}</p>
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

        <button onClick={handleReport} className="text-xs text-gray-500 hover:text-red-400 underline text-center w-full pb-2">
          {t('productDetail.reportFraudulent')}
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;
