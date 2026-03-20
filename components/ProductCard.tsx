import React, { useState, useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Product } from '../types';
import { CURRENCY, TC } from '../constants';
import { toggleLikeProduct, checkIsLiked } from '../services/firebase';
import { getOptimizedUrl, getResponsiveSrcSet } from '../services/cloudinary';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  currentUserId?: string | null;
  initialLiked?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = memo(({
  product,
  onClick,
  currentUserId = null,
  initialLiked,
}) => {
  const { t } = useTranslation();
  const tc = TC;
  const [liked, setLiked] = useState(initialLiked || false);
  const [likeCount, setLikeCount] = useState(product.likesCount || 0);
  const [isVisible, setIsVisible] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Intersection Observer: lazy loading (charge uniquement si visible) ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1, rootMargin: '100px' } // Précharge 100px avant l'écran
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Vérifier si l'utilisateur a liké (skip si initialLiked fourni via batch) ──
  useEffect(() => {
    if (initialLiked !== undefined || !currentUserId) return;
    checkIsLiked(product.id, currentUserId).then(setLiked);
  }, [product.id, currentUserId, initialLiked]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;

    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : c - 1);

    try {
      await toggleLikeProduct(product.id, currentUserId);
    } catch {
      // Rollback optimiste si erreur
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  };

  // Image optimisée: WebP auto, 400px pour les cartes grille
  const optimizedImage = product.images[0]
    ? getOptimizedUrl(product.images[0], 400)
    : '';

  const srcSet = product.images[0]
    ? getResponsiveSrcSet(product.images[0])
    : '';

  const discount = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  // Active promotion check
  const now = Date.now();
  const isOnPromotion = product.discountPrice != null
    && product.promotionEnd != null
    && product.promotionEnd > now
    && (!product.promotionStart || product.promotionStart <= now);
  const promoDiscount = isOnPromotion
    ? Math.round(((product.price - product.discountPrice!) / product.price) * 100)
    : null;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`group relative bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden ${tc.hoverBorder} transition-all duration-300 cursor-pointer shadow-lg ${tc.hoverShadow} active:scale-[0.98]`}
    >
      {/* Image avec lazy loading natif + Observer */}
      <div className="aspect-[4/3] w-full overflow-hidden relative bg-gray-800">
        {/* Placeholder skeleton pendant le chargement */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-700 animate-pulse" />
        )}

        {/* Image: chargée seulement quand visible dans le viewport */}
        {isVisible && optimizedImage && (
          <img
            src={optimizedImage}
            srcSet={srcSet || undefined}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            alt={product.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Badge Promu / Tendance */}
        {product.isPromoted && (
          <div className={`absolute top-2 left-2 ${tc.bg600} text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-lg`}>
            {t('product.sponsored')}
          </div>
        )}

        {/* Badge réduction (promotion active ou originalPrice) */}
        {(promoDiscount && promoDiscount > 0) ? (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse shadow-lg shadow-red-500/30">
            -{promoDiscount}%
          </div>
        ) : discount && discount > 5 ? (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            -{discount}%
          </div>
        ) : null}

        {/* Low stock badge */}
        {product.stockQuantity !== undefined && product.stockQuantity > 0 && product.stockQuantity <= 5 && (
          <div className="absolute bottom-2 left-2 bg-amber-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            {t('product.onlyLeft', { count: product.stockQuantity })}
          </div>
        )}

        {/* Bouton Like (mise à jour optimiste) */}
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
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
            {(() => { const cur = product.currency || CURRENCY; return isOnPromotion ? (
              <>
                <p className="text-red-400 font-bold text-base">
                  {product.discountPrice!.toLocaleString('fr-FR')} <span className="text-xs font-normal text-red-400/70">{cur}</span>
                </p>
                <p className="text-gray-500 text-xs line-through">
                  {product.price.toLocaleString('fr-FR')} {cur}
                </p>
              </>
            ) : (
              <>
                <p className={`${tc.text400} font-bold text-base`}>
                  {product.price.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-400">{cur}</span>
                </p>
                {product.originalPrice && product.originalPrice > product.price && (
                  <p className="text-gray-500 text-xs line-through">
                    {product.originalPrice.toLocaleString('fr-FR')} {cur}
                  </p>
                )}
              </>
            ); })()}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-yellow-400 text-xs">★</span>
            <span className="text-gray-400 text-xs">{product.rating || '-'}</span>
          </div>
        </div>

        {/* Footer: vendeur + stats */}
        <div className="flex items-center gap-2 pt-1.5 border-t border-gray-700/50">
          {product.seller.avatar ? (
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
            {product.seller.name}
            {product.seller.isVerified && (
              <svg className="inline-block w-3.5 h-3.5 ml-0.5 text-blue-500 -mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
            )}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-0.5 flex-shrink-0">
            <span aria-hidden>👁</span>
            <span>{product.views > 999 ? `${(product.views/1000).toFixed(1)}k` : product.views}</span>
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
  prev.initialLiked === next.initialLiked
);
