import React from 'react';

/**
 * Skeletons — design system light NUNULIA.
 * Base #EAECF0 (canvas foncé d'un cran) + shimmer doré très subtil,
 * cohérent avec les placeholders ProgressiveImage.
 */

const Shimmer: React.FC = () => (
  <div
    className="absolute inset-0 animate-shimmer"
    style={{
      background:
        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 45%, rgba(245,200,66,0.08) 55%, transparent 100%)',
      willChange: 'transform',
    }}
  />
);

export const ProductCardSkeleton: React.FC = () => {
  const bar = 'rounded-lg';
  return (
    <div
      className="bg-white rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(0,0,0,0.06)' }}
      aria-hidden="true"
    >
      <div className="relative aspect-square w-full overflow-hidden" style={{ background: '#EAECF0' }}>
        <Shimmer />
      </div>
      <div className="p-2 space-y-1.5">
        <div className={`${bar} h-5 w-1/2`} style={{ background: '#EAECF0' }} />
        <div className={`${bar} h-4 w-full`} style={{ background: '#F0F1F4' }} />
        <div className={`${bar} h-4 w-3/4`} style={{ background: '#F0F1F4' }} />
        <div className={`${bar} h-3 w-2/3`} style={{ background: '#F0F1F4' }} />
      </div>
      <div className="relative h-8 overflow-hidden" style={{ background: '#EAECF0' }}>
        <Shimmer />
      </div>
    </div>
  );
};
