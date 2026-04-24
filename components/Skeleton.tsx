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

export const ProductCardSkeleton: React.FC = () => {
  const bar = 'bg-gray-200 dark:bg-gray-800/60 rounded-lg animate-pulse';
  return (
    <div
      className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800/60 rounded-xl overflow-hidden"
      aria-hidden="true"
    >
      <div className={`${bar} aspect-square w-full rounded-none rounded-t-xl`} />
      <div className="p-2 space-y-1">
        <div className={`${bar} h-5 w-1/2`} />
        <div className={`${bar} h-4 w-full`} />
        <div className={`${bar} h-4 w-3/4`} />
        <div className={`${bar} h-3 w-2/3`} />
      </div>
      <div className="relative h-8 bg-green-200 dark:bg-green-900/40 rounded-b-xl overflow-hidden">
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
            willChange: 'transform',
          }}
        />
      </div>
    </div>
  );
};

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
