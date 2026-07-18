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

const AUTOPLAY_MS = 5000;
const RESUME_AFTER_TOUCH_MS = 4000;

interface BannerCarouselProps {
  banners?: Banner[];
}

/**
 * Carrousel scroll-snap natif (P7) : glissement au doigt avec inertie,
 * autoplay 5s avec barre de progression, pause au toucher.
 * Zéro lib, fonctionne offline, même moteur que la galerie produit.
 */
export const BannerCarousel: React.FC<BannerCarouselProps> = ({
  banners: propBanners,
}) => {
  const navigate = useNavigate();
  const activeBanners = (propBanners || DEFAULT_BANNERS)
    .filter(b => b.isActive)
    .sort((a, b) => a.order - b.order);

  const count = activeBanners.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const rafId = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const scrollToIndex = useCallback((i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0 || count === 0) return;
    const idx = ((i % count) + count) % count;
    el.scrollTo({ left: idx * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, [count]);

  // Autoplay — l'intervalle repart à chaque changement de slide, la barre
  // de progression (keyed sur `current`) est donc toujours synchrone.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      scrollToIndex(current + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [current, paused, count, scrollToIndex]);

  // Sync scroll → slide courante (throttlé rAF)
  const onScroll = () => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== current && i >= 0 && i < count) setCurrent(i);
    });
  };

  // Pause au toucher, reprise après inactivité
  const pauseAutoplay = () => {
    setPaused(true);
    clearTimeout(resumeTimer.current);
  };
  const scheduleResume = () => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_AFTER_TOUCH_MS);
  };

  useEffect(() => () => {
    cancelAnimationFrame(rafId.current);
    clearTimeout(resumeTimer.current);
  }, []);

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
        navigate(`/product/${target}`, { viewTransition: true });
        break;
      case 'page':
        navigate(target);
        break;
    }
  };

  if (count === 0) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Track scroll-snap */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={pauseAutoplay}
        onPointerUp={scheduleResume}
        onPointerCancel={scheduleResume}
        className="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {activeBanners.map((banner, bannerIdx) => {
          const hasAction = banner.ctaActionType && banner.ctaActionType !== 'none' && banner.ctaAction?.trim();
          const isFirst = bannerIdx === 0; // LCP image — highest priority
          return (
            <div
              key={banner.id}
              className={`w-full flex-shrink-0 snap-center relative h-44 sm:h-56 md:h-64 ${hasAction ? 'cursor-pointer' : ''}`}
              onClick={() => handleBannerClick(banner)}
            >
              {/* Background image */}
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
                  draggable={false}
                />
              </div>
              {/* Subtle left-to-right gradient — keeps image vivid (paid ad space)
                  while ensuring text legibility on the left side. Tuned to 50/25/0
                  vs the previous 90/60/0 which was killing visual appeal. */}
              <div className="absolute inset-0 z-[1] bg-gradient-to-r from-black/50 via-black/25 to-transparent" />

              {/* Content — z-10 ensures text is ALWAYS above image + gradient */}
              <div className="relative z-10 h-full flex flex-col justify-center px-6 md:px-10 max-w-lg">
                {banner.title && (
                  <h2
                    className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-tight mb-1"
                    style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                  >
                    {banner.title}
                  </h2>
                )}
                {banner.subtitle && (
                  <p
                    className="text-white/90 text-xs sm:text-sm mb-3 line-clamp-2"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
                  >
                    {banner.subtitle}
                  </p>
                )}
                {banner.ctaText && (
                  <div>
                    <span className={`inline-flex items-center gap-1 px-4 py-1.5 text-[12px] sm:text-[13px] font-black rounded-full transition-all ${
                      hasAction
                        ? 'bg-gold-400 text-[#111318] hover:bg-goldHov'
                        : 'bg-white/90 text-[#111318]'
                    }`}
                    style={hasAction ? { boxShadow: '0 4px 12px rgba(245,200,66,0.45)' } : undefined}>
                      {banner.ctaText}
                      {hasAction && banner.ctaActionType === 'external' && (
                        <span className="ml-1.5 text-[10px] opacity-70">&#x2197;</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barre de progression de l'autoplay — fine ligne or, resynchronisée
          à chaque slide (key), figée quand l'utilisateur touche le carrousel */}
      {count > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-[3px]" style={{ background: 'rgba(255,255,255,0.25)' }}>
          <div
            key={`${current}-${paused}`}
            className="h-full"
            style={{
              background: '#F5C842',
              transformOrigin: 'left',
              animation: paused ? 'none' : `nuBannerProgress ${AUTOPLAY_MS}ms linear forwards`,
              transform: paused ? 'scaleX(0)' : undefined,
            }}
          />
        </div>
      )}

      {/* Dots indicator — bottom-center, gold expanding pill */}
      {count > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
          {activeBanners.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); pauseAutoplay(); scrollToIndex(i); scheduleResume(); }}
              aria-label={`Slide ${i + 1}`}
              className="border-none cursor-pointer p-0 transition-all duration-200"
              style={{
                width: i === current ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === current ? '#F5C842' : 'rgba(255,255,255,0.55)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
