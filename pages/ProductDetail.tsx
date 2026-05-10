import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Share2, Heart, MapPin, Clock, Shield,
  ShieldCheck, Star, ChevronRight, Package, MessageCircle, Eye,
} from 'lucide-react';
import { Product, User } from '../types';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { ReviewSection } from '../components/ReviewSection';
import { ProductSection } from '../components/ProductSection';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { UnverifiedSellerNotice } from '../components/UnverifiedSellerNotice';
import { StockUrgency } from '../components/StockUrgency';
import { CountdownTimer } from '../components/CountdownTimer';
import { CURRENCY } from '../constants';
import {
  toggleLikeProduct, reportProduct, checkIsLiked,
  incrementProductViews, getProductBySlugOrId,
} from '../services/firebase';
import { getOptimizedUrl } from '../services/cloudinary';
import { useAppContext } from '../contexts/AppContext';
import { updateMetaTags } from '../utils/meta';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';
import { trackProductView, getSimilarProducts, getCustomersAlsoViewed } from '../services/recommendations';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

function discountPct(price: number, original?: number | null): number | null {
  if (!original || original <= price) return null;
  return Math.round(((original - price) / original) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FloatingBtn({
  children, onClick, ariaLabel, topPx, side,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  topPx: number;
  side: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute z-[4] w-9 h-9 rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform duration-150"
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${topPx}px)`,
        [side]: 14,
        boxShadow: '0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      {children}
    </button>
  );
}

function DotIndicators({ count, active }: { count: number; active: number }) {
  return (
    <div className="absolute z-[4] bottom-3.5 left-1/2 -translate-x-1/2 flex gap-1.5 items-center">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-200"
          style={
            i === active
              ? { width: 8, height: 8, background: '#F5C842', boxShadow: '0 0 0 2px rgba(245,200,66,0.25)' }
              : { width: 4, height: 4, background: 'rgba(255,255,255,0.7)', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }
          }
        />
      ))}
    </div>
  );
}

function TrustPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[10.5px] font-semibold whitespace-nowrap shrink-0"
      style={{ background: '#F2F4F7', color: '#5C6370' }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

  const [product, setProduct] = useState<Product | null>(location.state?.product || null);
  const [loading, setLoading] = useState(!product);
  const [notFound, setNotFound] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [alsoViewed, setAlsoViewed] = useState<Product[]>([]);

  useEffect(() => { window.scrollTo(0, 0); }, [slugOrId]);

  useEffect(() => {
    if (product) { setLikeCount(product.likesCount || 0); return; }
    if (!slugOrId) return;
    const load = async () => {
      setLoading(true);
      const p = await getProductBySlugOrId(slugOrId);
      if (p) { setProduct(p); setLikeCount(p.likesCount || 0); }
      else setNotFound(true);
      setLoading(false);
    };
    load();
  }, [slugOrId]);

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
    if (currentUser) checkIsLiked(product.id, currentUser.id).then(setLiked);
  }, [product?.id, currentUser]);

  useEffect(() => {
    if (!product) return;
    getSimilarProducts(product, 8).then(setSimilarProducts).catch(() => {});
    getCustomersAlsoViewed(product.id, 8).then(setAlsoViewed).catch(() => {});
  }, [product?.id]);

  useEffect(() => { setActiveImage(0); }, [product?.id]);

  const onProductClick = (p: Product) => {
    navigate(`/product/${p.slug || p.id}`, { state: { product: p } });
    setProduct(p);
    setLikeCount(p.likesCount || 0);
    setLiked(false);
    setSimilarProducts([]);
    setAlsoViewed([]);
    window.scrollTo(0, 0);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-[#F5C842]/30 border-t-[#F5C842] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-6xl">😕</div>
        <h1 className="text-xl font-bold text-[#111318]">{t('productDetail.notFound')}</h1>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl text-[14px] font-bold text-[#111318]"
          style={{ background: '#F5C842', boxShadow: '0 4px 14px rgba(245,200,66,0.4)' }}
        >
          {t('productDetail.backToHome')}
        </button>
      </div>
    );
  }

  // ── Promotion logic ──
  const now = Date.now();
  const isOnPromotion = product.discountPrice != null
    && product.promotionEnd != null
    && product.promotionEnd > now
    && (!product.promotionStart || product.promotionStart <= now);
  const displayPrice = isOnPromotion ? product.discountPrice! : product.price;
  const originalPrice = isOnPromotion ? product.price : null;
  const cur = product.currency || CURRENCY;
  const pct = discountPct(displayPrice, originalPrice ?? undefined);

  const handleWhatsApp = () => {
    if (product.seller.whatsapp) {
      const productUrl = `${window.location.origin}/product/${product.slug || product.id}`;
      const message = t('productDetail.whatsappMessage', { title: product.title, url: productUrl });
      window.open(`https://wa.me/${product.seller.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
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
        await navigator.share({ title: product.title, text: t('productDetail.shareText', { title: product.title }), url: shareUrl });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast(t('productDetail.linkCopied'), 'success');
      } catch {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast(t('productDetail.linkCopied'), 'success');
      }
    }
  };

  const handleBack = () => {
    if (window.history.length <= 1) navigate('/');
    else navigate(-1);
  };

  const onVisitShop = (seller: User) => {
    navigate(`/shop/${seller.slug || seller.id}`, { state: { seller } });
  };

  // Badge type
  const badgeType = (product as any).isBoosted || (product as any).isSponsored
    ? 'sponsored'
    : product.stockQuantity != null && product.stockQuantity <= 5 && product.stockQuantity > 0
      ? 'lowStock'
      : null;

  const BADGE_CFG = {
    sponsored: { label: 'SPONSORISÉ', bg: 'linear-gradient(135deg,#F5C842,#E8A920)', color: '#3D2800', shadow: '0 4px 12px rgba(245,200,66,0.45)' },
    lowStock:  { label: 'STOCK LIMITÉ', bg: '#EF4444', color: '#fff', shadow: '0 4px 12px rgba(239,68,68,0.4)' },
  } as const;

  // Product characteristic details
  const productDetails = [
    { label: t('product.category', 'Catégorie'), value: getCategoryName(product.category) },
    product.subCategory ? { label: 'Sous-catégorie', value: product.subCategory } : null,
    product.isWholesale ? { label: 'Type', value: 'B2B / Grossiste' } : null,
    product.stockQuantity != null ? { label: 'Stock', value: `${product.stockQuantity}` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  // Seller stats (defensive access)
  const seller = product.seller as any;
  const sellerSales = seller.totalSales ?? seller.salesCount ?? null;
  const sellerRating = product.rating || seller.rating || null;
  const sellerInitials = product.seller.name?.slice(0, 2).toUpperCase() || '??';
  const postedAt = (product as any).createdAt;

  return (
    <div className="relative min-h-screen bg-[#F7F8FA]" style={{ paddingBottom: 88 }}>

      {/* ── 1. GALERIE ── */}
      <div
        className="relative w-full"
        style={{ height: '52vw', minHeight: 240, maxHeight: 320 }}
        onTouchStart={e => { (e.currentTarget as any)._tx = e.touches[0].clientX; }}
        onTouchEnd={e => {
          const sx = (e.currentTarget as any)._tx;
          if (sx == null || product.images.length <= 1) return;
          const diff = sx - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 60) {
            setActiveImage(prev =>
              diff > 0
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
          className="w-full h-full object-cover"
          loading="eager"
        />

        {/* Floating buttons */}
        <FloatingBtn ariaLabel={t('productDetail.backToHome')} onClick={handleBack} topPx={12} side="left">
          <ArrowLeft size={17} strokeWidth={2.2} className="text-[#111318]" />
        </FloatingBtn>
        <FloatingBtn ariaLabel="Partager" onClick={handleShare} topPx={12} side="right">
          <Share2 size={14} strokeWidth={2} className="text-[#111318]" />
        </FloatingBtn>
        <FloatingBtn
          ariaLabel={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={handleLike}
          topPx={56}
          side="right"
        >
          <Heart
            size={14}
            strokeWidth={2}
            className={liked ? 'text-[#EF4444] fill-[#EF4444]' : 'text-[#111318]'}
          />
        </FloatingBtn>

        {/* Badge */}
        {badgeType && (
          <div
            className="absolute z-[3] left-3.5 inline-flex items-center px-[11px] py-[6px] rounded-full text-[10px] font-extrabold tracking-[0.06em] leading-none"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 72px)',
              background: BADGE_CFG[badgeType].bg,
              color: BADGE_CFG[badgeType].color,
              boxShadow: BADGE_CFG[badgeType].shadow,
            }}
          >
            {BADGE_CFG[badgeType].label}
          </div>
        )}

        {/* Counter */}
        {product.images.length > 1 && (
          <div className="absolute z-[4] bottom-3.5 right-3.5 px-2.5 py-1 rounded-full text-white text-[10px] font-bold tracking-[0.03em]"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            {activeImage + 1} / {product.images.length}
          </div>
        )}

        {/* Dots */}
        {product.images.length > 1 && <DotIndicators count={product.images.length} active={activeImage} />}
      </div>

      {/* ── 2. CARTE INFO PRINCIPALE ── */}
      <div
        className="relative z-[2] -mt-4 bg-white rounded-t-[20px] px-[18px] pt-5 pb-4"
        style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.04)' }}
      >
        {/* Prix */}
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="text-[28px] font-black text-[#111318] tracking-[-0.035em] leading-none">
            {displayPrice.toLocaleString('fr-FR')}{' '}
            <span className="text-[18px] font-extrabold text-[#5C6370] tracking-[-0.02em]">{cur}</span>
          </span>
          {originalPrice && (
            <span className="text-[13px] text-[#9EA5B0] font-medium line-through">
              {originalPrice.toLocaleString('fr-FR')} {cur}
            </span>
          )}
          {pct !== null && (
            <div className="px-2 py-0.5 rounded-md text-red-600 text-[11px] font-extrabold"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              −{pct}%
            </div>
          )}
        </div>

        {/* Titre */}
        <p className="mt-2.5 text-[18px] font-bold text-[#111318] leading-[1.32] tracking-[-0.015em] line-clamp-2">
          {product.title}
        </p>

        {/* Lieu + heure + vues */}
        <div className="mt-2 flex items-center gap-2.5 text-[#9EA5B0] flex-wrap">
          {(product.seller.sellerDetails?.commune || product.seller.sellerDetails?.countryId) && (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
              <MapPin size={11} strokeWidth={2} />
              {product.seller.sellerDetails?.commune || product.seller.sellerDetails?.countryId}
            </span>
          )}
          {postedAt && (
            <>
              {(product.seller.sellerDetails?.commune || product.seller.sellerDetails?.countryId) && <span className="w-[3px] h-[3px] rounded-full bg-[#D0D2D8]" />}
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
                <Clock size={11} strokeWidth={2} />
                {timeAgo(postedAt)}
              </span>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold">
            <Eye size={11} strokeWidth={2} />
            {product.views}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px my-3.5" style={{ background: 'rgba(0,0,0,0.06)' }} />

        {/* Vendeur */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full p-0.5 shrink-0"
            style={{
              background: 'linear-gradient(135deg, #F5C842 0%, #C47E00 100%)',
              boxShadow: '0 2px 8px rgba(245,200,66,0.35)',
            }}
          >
            <div className="w-full h-full rounded-full border-2 border-white overflow-hidden">
              {product.seller.avatar ? (
                <img
                  src={getOptimizedUrl(product.seller.avatar, 48)}
                  alt={product.seller.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#4F5159] to-[#2A2C32] flex items-center justify-center text-[#F5C842] text-[15px] font-black">
                  {sellerInitials}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[14px] font-extrabold text-[#111318] tracking-[-0.01em] truncate">
                {product.seller.name}
              </span>
              {product.seller.isVerified && (
                <div className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <ShieldCheck size={11} strokeWidth={2.4} className="text-emerald-700" />
                  <span className="text-[9.5px] font-extrabold text-emerald-700 tracking-[0.02em]">VÉRIFIÉE</span>
                </div>
              )}
            </div>
            {sellerRating && (
              <div className="mt-0.5 flex items-center gap-1">
                <Star size={11} strokeWidth={2} className="text-[#F5C842] fill-[#F5C842]" />
                <span className="text-[12px] font-bold text-[#111318]">{sellerRating.toFixed(1)}</span>
                {product.reviews > 0 && (
                  <span className="text-[11px] font-medium text-[#9EA5B0]">({product.reviews} avis)</span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onVisitShop(product.seller)}
            className="inline-flex items-center gap-0.5 text-[12px] font-extrabold py-1.5"
            style={{ color: '#C47E00' }}
          >
            Boutique
            <ChevronRight size={11} strokeWidth={2.4} />
          </button>
        </div>

        {/* Trust pills */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {sellerSales && (
            <TrustPill icon={<Shield size={11} strokeWidth={2} />}>
              {sellerSales} ventes
            </TrustPill>
          )}
          <TrustPill icon={<Package size={11} strokeWidth={2} />}>
            {t('productDetail.shipsIn24h', 'Expédie en 24h')}
          </TrustPill>
          <TrustPill icon={<MessageCircle size={11} strokeWidth={2} />}>
            {t('productDetail.respondsFast', 'Répond vite')}
          </TrustPill>
        </div>
      </div>

      {/* ── Promotion countdown ── */}
      {isOnPromotion && product.promotionEnd && (
        <div className="mx-3 mt-2.5">
          <CountdownTimer
            promotionEnd={product.promotionEnd}
            discountPrice={product.discountPrice!}
            originalPrice={product.price}
            currency={cur}
          />
        </div>
      )}

      {/* ── Stock urgency ── */}
      <div className="mx-3 mt-2">
        <StockUrgency stockQuantity={product.stockQuantity} />
      </div>

      {/* ── B2B Wholesale ── */}
      {product.isWholesale && (
        <div className="mx-3 mt-2.5 rounded-2xl p-4"
          style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full">B2B</span>
            <span className="text-indigo-700 font-semibold text-sm">{t('product.wholesaleAvailable')}</span>
          </div>
          {product.minOrderQuantity && (
            <p className="text-[#5C6370] text-sm">{t('product.minOrder', { count: product.minOrderQuantity })}</p>
          )}
          {product.wholesalePrice && (
            <p className="text-indigo-700 font-black text-[18px] mt-1">
              {product.wholesalePrice.toLocaleString('fr-FR')}{' '}
              <span className="text-xs font-normal text-[#5C6370]">{cur} / {t('product.perUnit')}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Unverified seller notice ── */}
      <div className="mx-3 mt-2">
        <UnverifiedSellerNotice tier={product.seller.verificationTier} variant="banner" />
      </div>

      {/* ── Edit button (owner / admin) ── */}
      {currentUser && (currentUser.id === product.seller.id || currentUser.role === 'admin') && (
        <div className="mx-3 mt-2.5">
          <button
            onClick={() => navigate('/dashboard', { state: { editProduct: product } })}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-medium text-[#5C6370] bg-white"
            style={{ border: '1px solid rgba(0,0,0,0.10)' }}
          >
            ✏️ {t('dashboard.editProduct')}
          </button>
        </div>
      )}

      {/* ── 3. DESCRIPTION ── */}
      <div className="mx-3 mt-2.5 bg-white rounded-2xl px-4 pt-4 pb-3.5"
        style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="text-[14px] font-bold text-[#111318] mb-2 tracking-[-0.01em]">
          {t('product.description', 'Description')}
        </div>
        <p
          className={`text-[13.5px] font-medium leading-[1.55] text-[#5C6370] ${descExpanded ? '' : 'line-clamp-4'}`}
        >
          {product.description}
        </p>
        <button
          type="button"
          onClick={() => setDescExpanded(v => !v)}
          className="mt-1.5 inline-flex items-center gap-0.5 text-[12.5px] font-extrabold tracking-[-0.01em]"
          style={{ color: '#C47E00' }}
        >
          {descExpanded ? 'Voir moins' : 'Voir plus'}
          <ChevronRight
            size={11}
            strokeWidth={2.4}
            className={`transition-transform duration-200 ${descExpanded ? '-rotate-90' : 'rotate-90'}`}
          />
        </button>
      </div>

      {/* ── 4. CARACTÉRISTIQUES ── */}
      {productDetails.length > 0 && (
        <div className="mx-3 mt-2.5 bg-white rounded-2xl px-4 pt-4 pb-3.5"
          style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="text-[14px] font-bold text-[#111318] mb-3 tracking-[-0.01em]">
            Caractéristiques
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
            {productDetails.map(d => (
              <div key={d.label} className="flex flex-col gap-0.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#9EA5B0]">{d.label}</span>
                <span className="text-[13.5px] font-bold text-[#111318]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. SAFETY TIP ── */}
      <div className="mx-3 mt-2.5 rounded-2xl px-4 py-3.5"
        style={{ background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.32)' }}>
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#F5C842,#E8A920)', boxShadow: '0 2px 6px rgba(245,200,66,0.4)' }}
          >
            <Shield size={16} strokeWidth={2} className="text-[#3D2800]" />
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-extrabold text-[#3D2800] tracking-[-0.01em]">
              Achetez en toute sécurité
            </div>
            <p className="mt-0.5 text-[12px] font-medium leading-[1.5] text-[#6B5318]">
              {t('productDetail.trustNotice')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/securite')}
              className="mt-2 inline-flex items-center gap-0.5 text-[11.5px] font-extrabold tracking-[-0.01em]"
              style={{ color: '#C47E00' }}
            >
              Voir les conseils de sécurité
              <ChevronRight size={11} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 6. REVIEWS ── */}
      <div className="mx-3 mt-2.5">
        <ReviewSection
          productId={product.id}
          currentUserId={currentUser?.id}
          productRating={product.rating || 0}
          reviewCount={product.reviews || 0}
        />
      </div>

      {/* ── 7. SIMILAIRES ── */}
      {similarProducts.length > 0 && (
        <div className="mt-5 px-3">
          <ProductSection
            title={t('product.similar')}
            icon="🏷️"
            products={similarProducts}
            currentUserId={currentUser?.id}
            onProductClick={onProductClick}
          />
        </div>
      )}

      {/* ── 8. AUSSI VUS ── */}
      {alsoViewed.length > 0 && (
        <div className="mt-4 px-3">
          <ProductSection
            title={t('productDetail.customersAlsoViewed')}
            icon="👀"
            products={alsoViewed}
            currentUserId={currentUser?.id}
            onProductClick={onProductClick}
          />
        </div>
      )}

      {/* ── Report ── */}
      <div className="text-center mx-3 mt-4 pb-4">
        <button
          onClick={handleReport}
          className="text-xs text-[#9EA5B0] hover:text-red-500 underline transition-colors"
        >
          {t('productDetail.reportFraudulent')}
        </button>
      </div>

      {/* ── 9. CTA FIXE BOTTOM ── */}
      <div
        className="fixed left-0 right-0 bottom-0 z-40 bg-white flex items-center gap-2.5"
        style={{
          padding: '12px 14px calc(env(safe-area-inset-bottom, 0px) + 12px)',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Favori */}
        <button
          type="button"
          onClick={handleLike}
          aria-label={liked ? 'Retirer des favoris' : 'Sauvegarder'}
          className="w-[52px] h-[52px] rounded-2xl bg-white flex items-center justify-center shrink-0 transition-all duration-200 active:scale-95"
          style={{ border: liked ? '1.5px solid #EF4444' : '1.5px solid #F5C842' }}
        >
          <Heart
            size={20}
            strokeWidth={2}
            className={liked ? 'text-[#EF4444] fill-[#EF4444]' : 'text-[#C47E00]'}
          />
        </button>

        {/* WhatsApp */}
        <button
          type="button"
          onClick={handleWhatsApp}
          className="flex-1 h-[52px] rounded-2xl flex items-center justify-center gap-2.5 active:translate-y-px transition-transform"
          style={{
            background: '#25D366',
            boxShadow: '0 6px 16px rgba(37,211,102,0.40), 0 2px 4px rgba(37,211,102,0.20)',
          }}
        >
          <MessageCircle size={19} strokeWidth={2.2} className="text-white" />
          <span className="text-[15px] font-extrabold text-white tracking-[-0.01em]">
            {t('productDetail.contactWhatsApp', 'Contacter sur WhatsApp')}
          </span>
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;
