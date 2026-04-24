import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Product } from '../types';
import { CURRENCY, INITIAL_COUNTRIES } from '../constants';
import { toggleLikeProduct, checkIsLiked } from '../services/firebase';
import { getOptimizedUrl, getResponsiveSrcSet } from '../services/cloudinary';
import { ProgressiveImage } from './ProgressiveImage';
import { VerifiedBadge } from './VerifiedBadge';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  currentUserId?: string | null;
  initialLiked?: boolean;
  index?: number;
  /** Optional overlay shown at the bottom-left of the image zone (e.g. "📍 2.3 km"). */
  distanceLabel?: string;
  /** Forwarded by Search.tsx; currently unused in card rendering. */
  highlight?: unknown;
}

type BadgeKey = 'sponsored' | 'lowStock' | 'b2b' | 'new';

export const ProductCard = memo<ProductCardProps>(({
  product,
  onClick,
  currentUserId = null,
  initialLiked,
  distanceLabel,
}) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(initialLiked ?? false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setIsVisible(true),
      { threshold: 0.1 }
    );
    if (cardRef.current) obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (initialLiked !== undefined || !currentUserId) return;
    checkIsLiked(product.id, currentUserId).then(setLiked);
  }, [product.id, currentUserId, initialLiked]);

  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;
    const next = !liked;
    setLiked(next);
    try { await toggleLikeProduct(product.id, currentUserId); }
    catch { setLiked(!next); }
  }, [liked, currentUserId, product.id]);

  const primaryImage  = product.images?.[0];
  const imageCount    = product.images?.length ?? 0;
  const optimizedUrl  = primaryImage ? getOptimizedUrl(primaryImage, 400) : '';
  const srcSet        = primaryImage ? getResponsiveSrcSet(primaryImage) : '';
  const currency      = product.currency || CURRENCY;
  const countryFlag   = INITIAL_COUNTRIES.find(c => c.id === product.countryId)?.flag || '';
  const city          = product.seller?.sellerDetails?.commune || '';

  const now = Date.now();
  const isOnPromotion = product.discountPrice != null
    && product.promotionEnd != null
    && product.promotionEnd > now
    && (!product.promotionStart || product.promotionStart <= now);
  const displayPrice = isOnPromotion ? product.discountPrice! : product.price;
  const displayOriginalPrice = isOnPromotion
    ? product.price
    : (product.originalPrice && product.originalPrice > product.price ? product.originalPrice : null);

  const isNew       = product.createdAt > now - 30 * 24 * 60 * 60 * 1000;
  const isSponsored = product.isBoosted || product.isPromoted || product.isSponsored;
  const isLowStock  = product.stockQuantity !== undefined
    && product.stockQuantity > 0
    && product.stockQuantity <= 5;

  // Priority: Sponsorisé > Stock limité > B2B > Nouveau. Max 2 shown.
  const ordered: BadgeKey[] = [];
  if (isSponsored)          ordered.push('sponsored');
  if (isLowStock)           ordered.push('lowStock');
  if (product.isWholesale)  ordered.push('b2b');
  if (isNew)                ordered.push('new');
  const shownBadges = ordered.slice(0, 2);

  const badgeStyle: Record<BadgeKey, { cls: string; label: string }> = {
    sponsored: { cls: 'bg-gray-600/90 text-white',    label: t('product.sponsored', 'Sponsorisé') },
    lowStock:  { cls: 'bg-orange-500/95 text-white',  label: t('product.lowStock',  'Stock limité') },
    b2b:       { cls: 'bg-purple-600/95 text-white',  label: 'B2B' },
    new:       { cls: 'bg-gold-500 text-gray-950',    label: t('product.new',       'Nouveau') },
  };

  const hasWhatsApp = !!product.seller?.whatsapp;
  const handleWhatsApp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = product.seller?.whatsapp;
    if (!phone) return;
    const msg = `Bonjour, je vous contacte depuis NUNULIA pour ${product.title}`;
    window.open(
      `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }, [product.seller?.whatsapp, product.title]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className="group relative bg-white shadow-sm border border-gray-100 dark:bg-gray-900 dark:border-gray-800/60 dark:shadow-none rounded-xl overflow-hidden cursor-pointer transition-[border-color,transform,box-shadow] duration-300 hover:border-gray-200 dark:hover:border-gray-700 hover:-translate-y-[2px] hover:shadow-lg"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800 rounded-t-xl">
        {isVisible && primaryImage ? (
          <ProgressiveImage
            src={optimizedUrl}
            srcSet={srcSet || undefined}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            alt={product.title}
            blurhash={product.blurhash}
            originalUrl={primaryImage}
            className="absolute inset-0"
            imgClassName="group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-gray-100 dark:bg-gray-800">
            <div
              className="absolute inset-0 animate-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                willChange: 'transform',
              }}
            />
          </div>
        )}

        {shownBadges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
            {shownBadges.map(key => (
              <span
                key={key}
                className={`${badgeStyle[key].cls} text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm shadow-sm`}
              >
                {badgeStyle[key].label}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={handleLike}
          aria-label={liked ? t('product.removeFromFavorites') : t('product.addToFavorites')}
          className={`absolute top-1 right-1 w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-200 ${
            liked ? 'bg-red-500/35 text-red-400' : 'bg-black/30 text-white hover:bg-black/50'
          }`}
        >
          <svg width="16" height="16" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>

        {imageCount > 1 && (
          <span className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full pointer-events-none">
            1/{imageCount}
          </span>
        )}

        {distanceLabel && (
          <span className="absolute bottom-2 left-2 bg-green-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none z-10">
            {distanceLabel}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2 space-y-1">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-lg font-bold text-gold-600 dark:text-gold-400 leading-tight">
            {displayPrice.toLocaleString('fr-FR')} {currency}
          </span>
          {displayOriginalPrice && (
            <span className="text-xs text-gray-400 dark:text-gray-500 line-through">
              {displayOriginalPrice.toLocaleString('fr-FR')} {currency}
            </span>
          )}
        </div>

        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">
          {product.title}
        </p>

        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <span className="truncate flex-1 min-w-0">
            {product.seller?.name || '—'}
            {product.seller?.isVerified && (
              <VerifiedBadge tier={product.seller.verificationTier} size="xs" className="ml-0.5" />
            )}
          </span>
          {countryFlag && <span className="flex-shrink-0">{countryFlag}</span>}
          {city && <span className="truncate flex-shrink-0 max-w-[6rem]">{city}</span>}
        </div>
      </div>

      {/* WhatsApp pill — hidden entirely when seller has no WhatsApp */}
      {hasWhatsApp && (
        <button
          onClick={handleWhatsApp}
          aria-label="Contacter sur WhatsApp"
          className="w-full h-8 flex items-center justify-center gap-1.5 rounded-b-xl transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#25D366' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span className="text-white text-[13px] font-medium">Contacter</span>
        </button>
      )}
    </div>
  );
}, (prev, next) =>
  prev.product.id === next.product.id &&
  prev.product.likesCount === next.product.likesCount &&
  prev.product.views === next.product.views &&
  prev.currentUserId === next.currentUserId &&
  prev.initialLiked === next.initialLiked &&
  prev.index === next.index
);
