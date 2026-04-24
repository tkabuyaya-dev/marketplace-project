import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Product, User } from '../../types';
import { getOptimizedUrl } from '../../services/cloudinary';
import { VerifiedBadge } from '../VerifiedBadge';

interface FeaturedVendorCardProps {
  seller: User;
  products: Product[];
}

/**
 * Inline "Featured Vendor" card inserted into the main grid (col-span-full).
 * Shows vendor avatar + name + location + CTA and 3 product thumbnails.
 * Clicking a thumbnail navigates to the product; "Voir la boutique" → /shop/:slug.
 */
export const FeaturedVendorCard: React.FC<FeaturedVendorCardProps> = ({ seller, products }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const city = seller.sellerDetails?.commune || '';
  const thumbs = products.slice(0, 3);

  const goToShop = () => {
    if (seller.slug) navigate(`/shop/${seller.slug}`);
  };

  const goToProduct = (p: Product) => {
    navigate(`/product/${p.slug || p.id}`, { state: { product: p } });
  };

  return (
    <div className="col-span-full rounded-xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800/60 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400 bg-gold-500/10 px-2 py-0.5 rounded-full">
          {t('home.featuredShop', 'Boutique mise en avant')}
        </span>
      </div>

      <div className="px-3 pb-3 flex items-start gap-3">
        {/* Avatar */}
        <button
          type="button"
          onClick={goToShop}
          className="flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
          aria-label={seller.name}
        >
          {seller.avatar ? (
            <img
              src={getOptimizedUrl(seller.avatar, 112)}
              alt={seller.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-500">
              {seller.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </button>

        {/* Name / location / CTA */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToShop}
              className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate hover:underline"
            >
              {seller.name}
            </button>
            {seller.isVerified && (
              <VerifiedBadge tier={seller.verificationTier} size="xs" />
            )}
          </div>
          {city && (
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">{city}</p>
          )}
          <button
            type="button"
            onClick={goToShop}
            className="mt-1.5 text-xs font-semibold text-gold-600 dark:text-gold-400 hover:underline"
          >
            {t('home.viewShop', 'Voir la boutique')} ›
          </button>
        </div>
      </div>

      {/* Product thumbnails */}
      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-0.5 px-0.5 pb-0.5">
          {thumbs.map(p => {
            const img = p.images?.[0];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => goToProduct(p)}
                className="relative aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden"
                aria-label={p.title}
              >
                {img && (
                  <img
                    src={getOptimizedUrl(img, 200)}
                    alt={p.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
