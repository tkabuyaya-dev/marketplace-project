import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div
    className={`bg-gray-800/60 rounded-lg animate-pulse ${className}`}
    aria-hidden="true"
  />
);

export const ProductCardSkeleton: React.FC = () => (
  <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden" aria-hidden="true">
    <Skeleton className="aspect-[4/3] w-full rounded-none" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <div className="flex items-end justify-between">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-3 w-8" />
      </div>
      <div className="flex items-center gap-2 pt-1.5 border-t border-gray-700/50">
        <Skeleton className="w-5 h-5 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  </div>
);

export const ProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export const BannerSkeleton: React.FC = () => (
  <Skeleton className="w-full aspect-[21/9] rounded-2xl" />
);
