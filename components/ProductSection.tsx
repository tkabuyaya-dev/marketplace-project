import React from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';

interface ProductSectionProps {
  title: string;
  icon?: string;
  products: Product[];
  loading?: boolean;
  currentUserId?: string | null;
  likedMap?: Record<string, boolean>;
  onProductClick: (product: Product) => void;
  emptyMessage?: string;
}

export const ProductSection: React.FC<ProductSectionProps> = ({
  title,
  icon,
  products,
  loading = false,
  currentUserId,
  likedMap = {},
  onProductClick,
  emptyMessage,
}) => {
  if (!loading && products.length === 0 && !emptyMessage) return null;

  return (
    <section>
      {/* Compact AliExpress-style section header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-sm leading-none">{icon}</span>}
          <h3 className="text-sm font-bold text-white leading-none">{title}</h3>
        </div>
        {!loading && products.length > 0 && (
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5 leading-none">
            Voir tout <span className="ml-0.5">›</span>
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              className="w-[130px] flex-shrink-0 aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
          {products.map(product => (
            <div key={product.id} className="w-[130px] flex-shrink-0 snap-start">
              <ProductCard
                product={product}
                onClick={() => onProductClick(product)}
                currentUserId={currentUserId}
                initialLiked={likedMap[product.id]}
                variant="dense"
              />
            </div>
          ))}
        </div>
      ) : emptyMessage ? (
        <p className="text-gray-500 text-xs py-2">{emptyMessage}</p>
      ) : null}
    </section>
  );
};
