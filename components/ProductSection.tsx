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
      <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
        {icon && <span>{icon}</span>}
        {title}
      </h3>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-gray-800 rounded-2xl h-72 w-64 flex-shrink-0 animate-pulse" />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
          {products.map(product => (
            <div key={product.id} className="w-64 flex-shrink-0 snap-start">
              <ProductCard
                product={product}
                onClick={() => onProductClick(product)}
                currentUserId={currentUserId}
                initialLiked={likedMap[product.id]}
              />
            </div>
          ))}
        </div>
      ) : emptyMessage ? (
        <p className="text-gray-500 text-sm py-4">{emptyMessage}</p>
      ) : null}
    </section>
  );
};
