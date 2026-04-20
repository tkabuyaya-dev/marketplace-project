import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Product } from '../types';
import { CURRENCY, TC, INITIAL_COUNTRIES } from '../constants';
import { toggleLikeProduct, checkIsLiked } from '../services/firebase';
import { getOptimizedUrl, getResponsiveSrcSet } from '../services/cloudinary';
import { ProgressiveImage } from './ProgressiveImage';
import { VerifiedBadge } from './VerifiedBadge';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  currentUserId?: string | null;
  initialLiked?: boolean;
  /** 'default'   = existing card style (used in ProductSection horizontal scroll)
   *  'dense'     = full-bleed image, info overlay, swipeable images
   *  'editorial' = same as dense but landscape on mobile (col-span-2 editorial slot)
   *  'grid'      = AliExpress-style: square image + always-visible info below (Home main grid) */
  variant?: 'default' | 'dense' | 'editorial' | 'grid';
  /** Card index in the grid — used to stagger entry animations */
  index?: number;
}

export const ProductCard: React.FC<ProductCardProps> = memo(({
  product,
  onClick,
  currentUserId = null,
  initialLiked,
  variant = 'default',
  index = 0,
}) => {
  const { t } = useTranslation();
  const tc = TC;

  // ── Shared state ──────────────────────────────────────────────────────────
  const [liked, setLiked] = useState(initialLiked || false);
  const [likeCount, setLikeCount] = useState(product.likesCount || 0);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Reveal animation state (dense / editorial only) ──────────────────────
  // Image is fully visible at rest. Info panel slides up 600ms after card enters viewport.
  const [infoRevealed, setInfoRevealed] = useState(false);

  // ── Swipe state (dense / editorial only) ─────────────────────────────────
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isHorizontalSwipeRef = useRef(false);
  const didSwipeRef = useRef(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const isDense = variant === 'dense' || variant === 'editorial';
  const isGrid = variant === 'grid';
  const imageUrls = (isDense || isGrid) ? (product.images || []).slice(0, 3) : [];

  // "NEW" badge: product listed in the last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isNew = product.createdAt > thirtyDaysAgo;

  // Country flag for seller's country
  const countryFlag = INITIAL_COUNTRIES.find(c => c.id === product.countryId)?.flag || '';

  // Animation delay for staggered grid entry (cap at 400ms)
  const animDelay = Math.min((index % 20) * 40, 400);

  // ── Derived values ────────────────────────────────────────────────────────
  const optimizedImage = product.images?.[0] ? getOptimizedUrl(product.images[0], 400) : '';
  const srcSet = product.images?.[0] ? getResponsiveSrcSet(product.images[0]) : '';
  const currency = product.currency || CURRENCY;

  const now = Date.now();
  const isOnPromotion = product.discountPrice != null
    && product.promotionEnd != null
    && product.promotionEnd > now
    && (!product.promotionStart || product.promotionStart <= now);
  const promoDiscount = isOnPromotion
    ? Math.round(((product.price - product.discountPrice!) / product.price) * 100)
    : null;
  const discount = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;
  const discountPct = promoDiscount || (discount && discount > 5 ? discount : null);

  const displayPrice = isOnPromotion ? product.discountPrice! : product.price;
  const displayOriginalPrice = isOnPromotion
    ? product.price
    : (product.originalPrice && product.originalPrice > product.price ? product.originalPrice : null);

  // Heat: product has significant traction
  const isHot = (product.views || 0) > 200 && !product.isBoosted && !product.isPromoted;

  // ── Intersection Observer — lazy load + reveal reset ─────────────────────
  // isVisible: one-way (image stays loaded once visible, never unloaded)
  // infoRevealed: resets to false each time card leaves viewport →
  //   every scroll-back shows the full image again before the panel slides up.
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else if (isDense) {
          // Card left viewport — reset so the reveal animation replays on return
          setInfoRevealed(false);
        }
      },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [isDense]);

  // ── Reveal timer: 2500ms after card enters viewport → slide info up ────────
  // 2.5s gives enough time to appreciate the full image before info appears.
  useEffect(() => {
    if (!isVisible || !isDense) return;
    const t = setTimeout(() => setInfoRevealed(true), 2500);
    return () => clearTimeout(t);
  }, [isVisible, isDense]);

  // ── Like check ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialLiked !== undefined || !currentUserId) return;
    checkIsLiked(product.id, currentUserId).then(setLiked);
  }, [product.id, currentUserId, initialLiked]);

  // ── Like handler ──────────────────────────────────────────────────────────
  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : c - 1);
    try {
      await toggleLikeProduct(product.id, currentUserId);
    } catch {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  }, [liked, currentUserId, product.id]);

  // ── Touch handlers (image swipe) ─────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (imageUrls.length <= 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = false;
    didSwipeRef.current = false;
  }, [imageUrls.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = e.touches[0].clientY - touchStartYRef.current;

    if (!isHorizontalSwipeRef.current) {
      // Detect axis: need clear horizontal intent
      if (Math.abs(dx) > Math.abs(dy) + 4 && Math.abs(dx) > 8) {
        isHorizontalSwipeRef.current = true;
      } else if (Math.abs(dy) > 8) {
        // Vertical — let page scroll take over
        touchStartXRef.current = null;
        return;
      } else {
        return;
      }
    }

    // Confirmed horizontal swipe
    setDragOffset(dx);
    if (!isDragging) setIsDragging(true);
    didSwipeRef.current = true;
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isHorizontalSwipeRef.current || touchStartXRef.current === null) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    const cardWidth = imageContainerRef.current?.offsetWidth || 200;
    const threshold = cardWidth * 0.25; // 25% of card width to trigger image change

    if (dragOffset < -threshold && currentImageIdx < imageUrls.length - 1) {
      setCurrentImageIdx(prev => prev + 1);
    } else if (dragOffset > threshold && currentImageIdx > 0) {
      setCurrentImageIdx(prev => prev - 1);
    }

    setDragOffset(0);
    setIsDragging(false);
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    isHorizontalSwipeRef.current = false;
  }, [dragOffset, currentImageIdx, imageUrls.length]);

  // Suppress onClick after a swipe
  const handleDenseClick = useCallback(() => {
    if (didSwipeRef.current) { didSwipeRef.current = false; return; }
    onClick();
  }, [onClick]);

  // Strip transform: each image is 1/N of the strip width
  // translateX(-n/N * 100%) + dragOffset px
  const n = Math.max(imageUrls.length, 1);
  const stripTransform = `calc(-${(currentImageIdx / n) * 100}% + ${dragOffset}px)`;

  // ── GRID VARIANT — AliExpress-style (Home main grid) ─────────────────────
  // Square image (always visible) + clean info panel below.
  // Swipeable images, staggered entry animation, amber price, flag, stars.
  if (isGrid) {
    return (
      <div
        ref={cardRef}
        onClick={handleDenseClick}
        className={[
          'group relative overflow-hidden cursor-pointer select-none',
          'rounded-xl bg-gray-900 border border-gray-800/60',
          'hover:border-gray-600/70 hover:shadow-lg hover:-translate-y-[2px]',
          'transition-[transform,box-shadow,border-color] duration-300 ease-out',
          'animate-card-in',
          product.isBoosted ? 'ring-1 ring-amber-400/20 hover:ring-amber-400/45' : '',
        ].filter(Boolean).join(' ')}
        style={{ animationDelay: `${animDelay}ms` }}
      >
        {/* ── Image zone ── */}
        <div
          ref={imageContainerRef}
          className="relative aspect-square overflow-hidden bg-gray-800"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Shimmer skeleton — GPU composited (transform, not background-position) */}
          {!isVisible && (
            <div className="absolute inset-0 bg-gray-800 overflow-hidden">
              <div
                className="absolute inset-0 animate-shimmer"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.055) 50%, transparent 100%)',
                  willChange: 'transform',
                }}
              />
            </div>
          )}

          {/* Swipeable image strip */}
          {isVisible && (
            imageUrls.length > 0 ? (
              <div
                className="flex h-full"
                style={{
                  width: `${n * 100}%`,
                  transform: `translateX(${stripTransform})`,
                  transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
                  willChange: 'transform',
                }}
              >
                {imageUrls.map((img, idx) => (
                  <div key={idx} className="h-full flex-shrink-0" style={{ width: `${100 / n}%` }}>
                    <img
                      src={getOptimizedUrl(img, 320)}
                      alt={idx === 0 ? product.title : ''}
                      loading={index < 6 ? 'eager' : 'lazy'}
                      draggable={false}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-4xl">📦</div>
            )
          )}

          {/* Image progress dots */}
          {imageUrls.length > 1 && (
            <div className="absolute top-1.5 left-0 right-0 flex justify-center gap-[3px] pointer-events-none z-10">
              {imageUrls.map((_, i) => (
                <div
                  key={i}
                  className="h-[2px] rounded-full transition-all duration-300"
                  style={{
                    width: i === currentImageIdx ? 12 : 5,
                    backgroundColor: i === currentImageIdx ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Discount badge — top-left */}
          {discountPct && (
            <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10 shadow-sm">
              -{discountPct}%
            </span>
          )}

          {/* Status badge — top-right (priority: boosted > new > wholesale) */}
          {product.isBoosted ? (
            <span className="absolute top-1.5 right-1.5 bg-amber-400/90 backdrop-blur-sm text-gray-900 text-[8px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10 tracking-widest">
              ⚡AD
            </span>
          ) : isNew ? (
            <span className="absolute top-1.5 right-1.5 bg-emerald-500/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10">
              NEW
            </span>
          ) : product.isWholesale ? (
            <span className="absolute top-1.5 right-1.5 bg-indigo-600/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10">
              B2B
            </span>
          ) : isHot ? (
            <span className="absolute top-1.5 right-1.5 bg-rose-600/85 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-sm leading-tight z-10">
              🔥
            </span>
          ) : null}

          {/* Like button — bottom-right of image */}
          <button
            onClick={handleLike}
            aria-label={liked ? t('product.removeFromFavorites') : t('product.addToFavorites')}
            className={`absolute bottom-1.5 right-1.5 z-10 p-1 rounded-full backdrop-blur-md transition-all duration-200 ${
              liked
                ? 'bg-red-500/35 text-red-400'
                : 'bg-black/30 text-white/80 hover:bg-black/50 hover:text-white'
            }`}
          >
            <svg width="11" height="11" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>

        {/* ── Info zone — always visible ── */}
        <div className="p-2 space-y-0.5">
          {/* Title */}
          <p className="text-[12px] text-gray-200 font-medium leading-snug line-clamp-2">{product.title}</p>

          {/* Stars + review count */}
          {(product.reviews || 0) > 0 && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map(n => (
                <svg key={n} width="8" height="8" viewBox="0 0 24 24"
                  fill={n <= Math.min(5, Math.max(0, Math.round(product.rating || 0))) ? '#f59e0b' : 'none'}
                  stroke={n <= Math.min(5, Math.max(0, Math.round(product.rating || 0))) ? '#f59e0b' : '#4b5563'}
                  strokeWidth="2"
                >
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              ))}
              <span className="text-[9px] text-gray-500 ml-0.5 leading-none">
                {(product.reviews || 0) >= 1000
                  ? `${((product.reviews || 0) / 1000).toFixed(1)}K`
                  : product.reviews}
              </span>
            </div>
          )}

          {/* Price row */}
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-[14px] font-bold text-amber-400 leading-none">
              {displayPrice.toLocaleString('fr-FR')}
            </span>
            <span className="text-[10px] text-gray-500 font-medium">{currency}</span>
            {displayOriginalPrice && (
              <span className="text-[10px] text-gray-600 line-through ml-auto">
                {displayOriginalPrice.toLocaleString('fr-FR')}
              </span>
            )}
          </div>

          {/* Seller + flag */}
          <div className="flex items-center gap-1 pt-0.5">
            {product.seller?.avatar && (
              <img
                src={getOptimizedUrl(product.seller.avatar, 20)}
                alt=""
                className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 opacity-80"
              />
            )}
            <p className="text-[10px] text-gray-600 truncate leading-none flex-1">
              {product.seller?.name || '—'}
              {product.seller?.isVerified && (
                <VerifiedBadge tier={product.seller.verificationTier} size="xs" className="ml-0.5" />
              )}
            </p>
            {countryFlag && (
              <span className="text-[11px] flex-shrink-0">{countryFlag}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── DENSE / EDITORIAL VARIANT ─────────────────────────────────────────────
  if (isDense) {
    return (
      <div
        ref={cardRef}
        onClick={handleDenseClick}
        className={[
          'group relative overflow-hidden cursor-pointer select-none',
          'rounded-xl bg-gray-900',
          // editorial: landscape on mobile, portrait on sm+
          variant === 'editorial' ? 'aspect-[16/9] sm:aspect-[3/4]' : 'aspect-[3/4]',
          'shadow-sm hover:shadow-xl hover:-translate-y-[2px]',
          'transition-[transform,box-shadow] duration-300 ease-out',
          product.isBoosted ? 'ring-1 ring-amber-400/20 hover:ring-amber-400/45' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* ── Shimmer skeleton while not in viewport ── */}
        {!isVisible && (
          <div className="absolute inset-0 bg-gray-800 overflow-hidden">
            <div
              className="absolute inset-0 animate-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.055) 50%, transparent 100%)',
                willChange: 'transform',
              }}
            />
          </div>
        )}

        {/* ── Full-bleed swipeable image strip ── */}
        {isVisible && (
          <div
            ref={imageContainerRef}
            className="absolute inset-0 overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {imageUrls.length > 0 ? (
              <div
                className="flex h-full"
                style={{
                  width: `${n * 100}%`,
                  transform: `translateX(${stripTransform})`,
                  transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
                  willChange: 'transform',
                }}
              >
                {imageUrls.map((img, idx) => (
                  <div
                    key={idx}
                    className="h-full flex-shrink-0"
                    style={{ width: `${100 / n}%` }}
                  >
                    <img
                      src={getOptimizedUrl(img, variant === 'editorial' ? 600 : 400)}
                      alt={idx === 0 ? product.title : ''}
                      loading={idx === 0 ? 'eager' : 'lazy'}
                      draggable={false}
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-out"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-700 text-4xl">
                📦
              </div>
            )}
          </div>
        )}

        {/* ── Top gradient — darkens just enough for badges to stay readable ── */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent pointer-events-none" />
        {/* Hover depth vignette */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/10 transition-opacity duration-300 pointer-events-none" />

        {/* ── Image progress dots ── */}
        {imageUrls.length > 1 && (
          <div className="absolute top-2.5 left-0 right-0 flex justify-center gap-[3px] pointer-events-none z-10">
            {imageUrls.map((_, i) => (
              <div
                key={i}
                className="h-[2px] rounded-full transition-all duration-300"
                style={{
                  width: i === currentImageIdx ? 16 : 7,
                  backgroundColor: i === currentImageIdx
                    ? 'rgba(255,255,255,0.95)'
                    : 'rgba(255,255,255,0.32)',
                }}
              />
            ))}
          </div>
        )}

        {/* ── Top-left badges ── */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
          {product.isBoosted && (
            <span className="inline-flex items-center gap-0.5 bg-amber-500/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-full tracking-widest uppercase shadow">
              ⚡ AD
            </span>
          )}
          {product.isPromoted && !product.isBoosted && (
            <span className={`${tc.bg600} backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-full tracking-widest uppercase shadow`}>
              Promo
            </span>
          )}
          {product.isWholesale && (
            <span className="bg-indigo-600/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-full uppercase tracking-wider shadow">
              B2B
            </span>
          )}
          {isHot && (
            <span className="bg-rose-600/85 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-full shadow">
              🔥
            </span>
          )}
        </div>

        {/* ── Discount badge — top right (leaves room for like button) ── */}
        {discountPct && (
          <span className="absolute top-2.5 right-9 z-10 pointer-events-none bg-red-500/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-[3px] rounded-full shadow">
            -{discountPct}%
          </span>
        )}

        {/* ── Like button ── */}
        <button
          onClick={handleLike}
          aria-label={liked ? t('product.removeFromFavorites') : t('product.addToFavorites')}
          className={`absolute top-2 right-2 z-10 p-1.5 rounded-full backdrop-blur-md transition-all duration-200 ${
            liked
              ? 'bg-red-500/35 text-red-400 scale-110'
              : 'bg-black/28 text-white/80 hover:bg-black/50 hover:text-white'
          }`}
        >
          <svg width="13" height="13" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>

        {/* ── Low stock — floats above the slide-up panel ── */}
        {product.stockQuantity !== undefined && product.stockQuantity > 0 && product.stockQuantity <= 5 && (
          <div className="absolute bottom-[5.5rem] left-2.5 z-20 pointer-events-none bg-amber-500/90 backdrop-blur-sm text-white text-[8px] font-bold px-1.5 py-[3px] rounded-full">
            {t('product.onlyLeft', { count: product.stockQuantity })}
          </div>
        )}

        {/* ── Price pill — visible at rest, fades out when panel reveals ── */}
        {/* Always shows the critical info (price) before the full reveal */}
        <div
          className={`absolute bottom-2.5 left-2.5 z-20 pointer-events-none transition-opacity duration-200 ${
            infoRevealed ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
          }`}
        >
          <div className="flex items-baseline gap-1 bg-black/65 backdrop-blur-md rounded-full px-2 py-[5px]">
            <span className={`font-bold text-amber-400 ${variant === 'editorial' ? 'text-sm' : 'text-xs'}`}>
              {displayPrice.toLocaleString('fr-FR')}
            </span>
            <span className="text-white/55 text-[9px] font-medium">{currency}</span>
          </div>
        </div>

        {/* ── Slide-up info panel — image-first reveal ── */}
        {/* At rest: hidden below card (translate-y-full).                   */}
        {/* After 600ms in viewport OR on desktop hover → slides up smoothly. */}
        <div
          className={`absolute bottom-0 left-0 right-0 backdrop-blur-md bg-black/70 border-t border-white/[0.08] px-2.5 pb-2.5 pt-2 z-10 pointer-events-none transition-transform duration-300 ease-out group-hover:translate-y-0 ${
            infoRevealed ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          {/* Price row */}
          <div className="flex items-baseline gap-1.5 mb-[3px]">
            <span className={`font-bold text-white ${variant === 'editorial' ? 'text-lg' : 'text-sm'}`}>
              {displayPrice.toLocaleString('fr-FR')}
            </span>
            <span className="text-white/65 text-[10px] font-medium">{currency}</span>
            {displayOriginalPrice && (
              <span className="text-white/45 text-[9px] line-through">
                {displayOriginalPrice.toLocaleString('fr-FR')}
              </span>
            )}
          </div>

          {/* Title */}
          <p className={`font-medium text-white leading-snug line-clamp-2 ${
            variant === 'editorial' ? 'text-sm' : 'text-[11px]'
          }`}>
            {product.title}
          </p>

          {/* Seller row */}
          <div className="flex items-center gap-1.5 mt-[5px]">
            {product.seller?.avatar && (
              <img
                src={getOptimizedUrl(product.seller.avatar, 24)}
                alt=""
                className="w-3.5 h-3.5 rounded-full object-cover opacity-80 flex-shrink-0"
              />
            )}
            <span className="text-white/70 text-[10px] truncate flex-1 leading-none">
              {product.seller?.name}
              {product.seller?.isVerified && (
                <VerifiedBadge tier={product.seller.verificationTier} size="xs" className="ml-0.5" />
              )}
            </span>
            <span className="text-white/50 text-[9px] flex-shrink-0 leading-none">
              {(product.views || 0) > 999
                ? `${((product.views || 0) / 1000).toFixed(1)}k`
                : (product.views || 0)}&nbsp;👁
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── DEFAULT VARIANT (existing design — used by ProductSection) ────────────
  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`group relative bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden ${tc.hoverBorder} transition-all duration-300 cursor-pointer shadow-lg ${tc.hoverShadow} active:scale-[0.98]`}
    >
      {/* Image with progressive loading (BlurHash → micro-thumb → HD) */}
      <div className="aspect-[3/4] w-full overflow-hidden relative bg-gray-800">
        {isVisible && optimizedImage ? (
          <ProgressiveImage
            src={optimizedImage}
            srcSet={srcSet || undefined}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            alt={product.title}
            blurhash={product.blurhash}
            originalUrl={product.images[0]}
            className="absolute inset-0"
            imgClassName="group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-gray-800">
            <div
              className="absolute inset-0 animate-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                willChange: 'transform',
              }}
            />
          </div>
        )}

        {/* Badge Boost */}
        {product.isBoosted && (
          <div className="absolute top-2 left-2 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider shadow-lg shadow-amber-500/20 flex items-center gap-1">
            <span>⚡</span><span>AD</span>
          </div>
        )}

        {/* Badge Promu */}
        {product.isPromoted && !product.isBoosted && (
          <div className={`absolute top-2 left-2 ${tc.bg600} text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-lg`}>
            {t('product.sponsored')}
          </div>
        )}

        {/* Badge réduction */}
        {(promoDiscount && promoDiscount > 0) ? (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse shadow-lg shadow-red-500/30">
            -{promoDiscount}%
          </div>
        ) : discount && discount > 5 ? (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            -{discount}%
          </div>
        ) : null}

        {/* B2B badge */}
        {product.isWholesale && (
          <div className="absolute top-2 right-12 bg-indigo-600/90 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-lg">
            B2B
          </div>
        )}

        {/* Low stock badge */}
        {product.stockQuantity !== undefined && product.stockQuantity > 0 && product.stockQuantity <= 5 && (
          <div className="absolute bottom-2 left-2 bg-amber-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            {t('product.onlyLeft', { count: product.stockQuantity })}
          </div>
        )}

        {/* Like button */}
        <button
          onClick={handleLike}
          aria-label={liked ? t('product.removeFromFavorites') : t('product.addToFavorites')}
          className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all duration-200 ${
            liked
              ? 'bg-red-500/30 text-red-400 scale-110'
              : 'bg-black/30 text-white hover:bg-black/50'
          }`}
        >
          <svg width="16" height="16" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* Infos produit */}
      <div className="p-3 space-y-2">
        <h3 className="text-gray-100 font-semibold truncate text-sm leading-tight">
          {product.title}
        </h3>

        <div className="flex items-end justify-between">
          <div>
            {(() => {
              const cur = currency;
              return isOnPromotion ? (
                <>
                  <p className="text-red-400 font-bold text-base">
                    {product.discountPrice!.toLocaleString('fr-FR')}{' '}
                    <span className="text-xs font-normal text-red-400/70">{cur}</span>
                  </p>
                  <p className="text-gray-500 text-xs line-through">
                    {product.price.toLocaleString('fr-FR')} {cur}
                  </p>
                </>
              ) : (
                <>
                  <p className={`${tc.text400} font-bold text-base`}>
                    {product.price.toLocaleString('fr-FR')}{' '}
                    <span className="text-xs font-normal text-gray-400">{cur}</span>
                  </p>
                  {product.originalPrice && product.originalPrice > product.price && (
                    <p className="text-gray-500 text-xs line-through">
                      {product.originalPrice.toLocaleString('fr-FR')} {cur}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-yellow-400 text-xs">★</span>
            <span className="text-gray-400 text-xs">{product.rating || '-'}</span>
          </div>
        </div>

        {/* Footer: vendeur + stats */}
        <div className="flex items-center gap-2 pt-1.5 border-t border-gray-700/50">
          {product.seller?.avatar ? (
            <img
              src={getOptimizedUrl(product.seller.avatar, 40)}
              alt={product.seller.name}
              loading="lazy"
              className="w-5 h-5 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-gray-600 flex-shrink-0" />
          )}
          <span className="text-gray-400 text-xs truncate flex-1">
            {product.seller?.name}
            {product.seller?.isVerified && (
              <VerifiedBadge tier={product.seller.verificationTier} size="sm" className="ml-0.5" />
            )}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-0.5 flex-shrink-0">
            <span aria-hidden>👁</span>
            <span>{(product.views || 0) > 999 ? `${((product.views || 0) / 1000).toFixed(1)}k` : (product.views || 0)}</span>
          </span>
          {likeCount > 0 && (
            <span className="text-xs text-gray-500 flex items-center gap-0.5 flex-shrink-0">
              <span aria-hidden>♥</span>
              <span>{likeCount}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.product.id === next.product.id &&
  prev.product.likesCount === next.product.likesCount &&
  prev.product.views === next.product.views &&
  prev.currentUserId === next.currentUserId &&
  prev.initialLiked === next.initialLiked &&
  prev.variant === next.variant &&
  prev.index === next.index
);
