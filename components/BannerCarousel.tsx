import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOptimizedUrl, getResponsiveSrcSet } from '../services/cloudinary';
import type { BannerActionType } from '../services/firebase';

export interface Banner {
  id: string;
  imageUrl: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaActionType?: BannerActionType;
  ctaAction?: string;
  isActive: boolean;
  order: number;
}

// Default banners (used until admin sets custom ones in Firestore)
const DEFAULT_BANNERS: Banner[] = [
  {
    id: 'default-1',
    imageUrl: 'https://images.unsplash.com/photo-1616075193899-760777555365?auto=format&fit=crop&w=800&q=60',
    title: 'Bienvenue sur Nunulia',
    subtitle: 'Le marketplace — Électronique, Mode, Beauté, Services et plus',
    ctaText: 'Explorer',
    ctaActionType: 'none',
    isActive: true,
    order: 0,
  },
  {
    id: 'default-2',
    imageUrl: 'https://images.unsplash.com/photo-1576670393454-5d513aa67362?auto=format&fit=crop&w=800&q=60',
    title: 'Vendez sur Nunulia',
    subtitle: 'Créez votre boutique en ligne et touchez des milliers de clients',
    ctaText: 'Commencer',
    ctaActionType: 'page',
    ctaAction: '/register-seller',
    isActive: true,
    order: 1,
  },
];

interface BannerCarouselProps {
  banners?: Banner[];
}

export const BannerCarousel: React.FC<BannerCarouselProps> = ({
  banners: propBanners,
}) => {
  const navigate = useNavigate();
  const activeBanners = (propBanners || DEFAULT_BANNERS)
    .filter(b => b.isActive)
    .sort((a, b) => a.order - b.order);

  const [current, setCurrent] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = activeBanners.length;

  const goTo = useCallback((index: number) => {
    setCurrent(((index % count) + count) % count);
  }, [count]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);

  // Auto-advance every 5s
  useEffect(() => {
    if (count <= 1) return;
    intervalRef.current = setInterval(next, 5000);
    return () => clearInterval(intervalRef.current);
  }, [next, count]);

  // Reset interval on user interaction
  const resetInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(next, 5000);
  };

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setTouchDelta(e.touches[0].clientX - touchStart);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(touchDelta) > 80) {
      if (touchDelta > 0) goTo(current - 1);
      else goTo(current + 1);
      resetInterval();
    }
    setTouchDelta(0);
  };

  const handleBannerClick = (banner: Banner) => {
    const actionType = banner.ctaActionType || 'none';
    const target = banner.ctaAction?.trim();
    if (actionType === 'none' || !target) return;

    switch (actionType) {
      case 'external':
        window.open(target, '_blank', 'noopener,noreferrer');
        break;
      case 'category':
        // Navigate to home with category filter via query param
        navigate(`/?category=${encodeURIComponent(target)}`);
        break;
      case 'product':
        navigate(`/product/${target}`);
        break;
      case 'page':
        navigate(target);
        break;
    }
  };

  if (count === 0) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden" ref={containerRef}>
      {/* Slides container */}
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{
          transform: `translateX(calc(-${current * 100}% + ${isDragging ? touchDelta : 0}px))`,
          transitionDuration: isDragging ? '0ms' : '500ms',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {activeBanners.map((banner, bannerIdx) => {
          const hasAction = banner.ctaActionType && banner.ctaActionType !== 'none' && banner.ctaAction?.trim();
          const isFirst = bannerIdx === 0; // LCP image — highest priority
          return (
            <div
              key={banner.id}
              className={`w-full flex-shrink-0 relative h-44 sm:h-56 md:h-64 ${hasAction ? 'cursor-pointer' : ''}`}
              onClick={() => handleBannerClick(banner)}
            >
              {/* Background image — 100% visible, no darkening overlay (this is a paid ad space) */}
              <div className="absolute inset-0 z-0 overflow-hidden">
                <img
                  src={getOptimizedUrl(banner.imageUrl, 700, 'auto')}
                  srcSet={banner.imageUrl.includes('cloudinary.com') ? getResponsiveSrcSet(banner.imageUrl) : undefined}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1200px"
                  alt={banner.title || 'Banner'}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding={isFirst ? 'sync' : 'async'}
                  fetchPriority={isFirst ? 'high' : 'low'}
                />
              </div>

              {/* Commercial card overlay — bottom-left, white translucent
                  Image stays vivid (premium ad placement style à la AliExpress/Etsy).
                  WCAG AAA contrast guaranteed by white card + dark ink text. */}
              {(banner.title || banner.subtitle || banner.ctaText) && (
                <div
                  className="absolute z-10 left-3 right-3 bottom-3 sm:right-auto sm:max-w-sm md:max-w-md
                             bg-white/95 backdrop-blur-md rounded-2xl
                             p-3.5 sm:p-4
                             border border-black/[0.06]"
                  style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)' }}
                >
                  {banner.title && (
                    <h2 className="text-[15px] sm:text-base md:text-lg font-black text-[#111318] leading-tight tracking-tight">
                      {banner.title}
                    </h2>
                  )}
                  {banner.subtitle && (
                    <p className="text-[12px] sm:text-[13px] text-[#5C6370] mt-1 leading-snug line-clamp-2">
                      {banner.subtitle}
                    </p>
                  )}
                  {banner.ctaText && (
                    <div className="mt-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-3.5 py-1.5 text-[12px] sm:text-[13px] font-black rounded-full transition-all ${
                          hasAction
                            ? 'bg-gold-400 text-[#111318] hover:bg-goldHov'
                            : 'bg-[#F0F1F4] text-[#5C6370] border border-black/[0.08]'
                        }`}
                        style={hasAction ? { boxShadow: '0 4px 12px rgba(245,200,66,0.45)' } : undefined}
                      >
                        {banner.ctaText}
                        {hasAction && banner.ctaActionType === 'external' && (
                          <span className="ml-0.5 text-[10px] opacity-70">&#x2197;</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dots indicator — top-right, doesn't conflict with the bottom card.
          Pill background ensures legibility regardless of image content. */}
      {count > 1 && (
        <div
          className="absolute top-3 right-3 flex gap-1.5 z-20 px-2 py-1 rounded-full backdrop-blur-md"
          style={{ background: 'rgba(0,0,0,0.30)' }}
        >
          {activeBanners.map((_, i) => (
            <button
              key={i}
              onClick={() => { goTo(i); resetInterval(); }}
              aria-label={`Slide ${i + 1}`}
              className="border-none cursor-pointer p-0 transition-all duration-200"
              style={{
                width: i === current ? 16 : 5,
                height: 5,
                borderRadius: 2.5,
                background: i === current ? '#F5C842' : 'rgba(255,255,255,0.65)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
