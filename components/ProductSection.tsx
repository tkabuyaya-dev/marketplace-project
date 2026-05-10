import React from 'react';
import { ChevronRight } from 'lucide-react';
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
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-[17px] font-black text-[#111318] tracking-tight leading-none"
          style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
        >
          {icon && <span className="mr-1.5">{icon}</span>}
          {title}
        </h3>
        {!loading && products.length > 0 && (
          <button
            type="button"
            className="flex items-center gap-0.5 bg-transparent border-none cursor-pointer p-1"
          >
            <span className="text-[12px] font-bold" style={{ color: '#C47E00' }}>
              Voir tout
            </span>
            <ChevronRight size={14} color="#C47E00" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              className="w-[160px] flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100 animate-pulse"
              style={{ paddingTop: '75%', position: 'relative' }}
            />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div
          className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none' }}
        >
          {products.map(product => (
            <div key={product.id} className="w-[160px] flex-shrink-0 snap-start">
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
        <p className="text-[#9EA5B0] text-xs py-2">{emptyMessage}</p>
      ) : null}
    </section>
  );
};
