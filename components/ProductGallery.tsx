/**
 * NUNULIA — ProductGallery
 *
 * Galerie produit "vitrine" (page détail) :
 *
 *  1. Cadre PORTRAIT immersif (≈4:5, capé à 62vh) — les photos produits sont
 *     quasi toujours verticales : le produit est visible EN ENTIER.
 *  2. object-contain sur fond flou ambiant (micro-thumbnail Cloudinary ~200o,
 *     déjà en cache SW) → zéro bande vide, aucune photo rognée.
 *  3. Carrousel natif scroll-snap : swipe fluide avec inertie, zéro lib,
 *     fonctionne offline. Les slides voisines se préchargent naturellement.
 *  4. Plein écran au tap : pinch-zoom, double-tap zoom, pan, swipe entre
 *     photos, swipe vers le bas pour fermer. Pointer Events, transform via
 *     ref (pas de re-render pendant le geste → 60fps même sur entrée de gamme).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';
import { getOptimizedUrl, getThumbnailUrl } from '../services/cloudinary';
import { HERO_VT_NAME } from '../utils/viewTransition';

// ── Lightbox plein écran (pinch-zoom / double-tap / pan / swipe) ─────────────

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.2;
const DOUBLE_TAP_MS = 300;
const SWIPE_NEXT_PX = 60;
const SWIPE_CLOSE_PX = 90;

function Lightbox({
  images, title, index, onIndexChange, onClose,
}: {
  images: string[];
  title: string;
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Transform courant + point de départ du geste — refs pour ne jamais
  // re-render pendant un pinch/pan (fluidité sur appareils modestes).
  const t = useRef({ s: 1, x: 0, y: 0 });
  const gesture = useRef({
    s: 1, x: 0, y: 0,          // transform au début du geste
    dist: 0,                    // écart initial des 2 doigts (pinch)
    px: 0, py: 0,               // position initiale du doigt (pan/swipe)
    moved: false,
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef(0);

  const apply = useCallback((animate = false) => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1)' : 'none';
    el.style.transform = `translate3d(${t.current.x}px, ${t.current.y}px, 0) scale(${t.current.s})`;
  }, []);

  const clampPan = () => {
    const maxX = ((t.current.s - 1) * window.innerWidth) / 2;
    const maxY = ((t.current.s - 1) * window.innerHeight) / 2;
    t.current.x = Math.min(maxX, Math.max(-maxX, t.current.x));
    t.current.y = Math.min(maxY, Math.max(-maxY, t.current.y));
  };

  const reset = useCallback((animate = true) => {
    t.current = { s: 1, x: 0, y: 0 };
    apply(animate);
  }, [apply]);

  // Nouveau visuel → transform identité
  useEffect(() => { reset(false); }, [index, reset]);

  // Scroll de la page verrouillé tant que le plein écran est ouvert
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Clavier (desktop) : Échap ferme, flèches naviguent
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onIndexChange]);

  // Préchargement des voisines pour un swipe instantané
  useEffect(() => {
    [index - 1, index + 1].forEach(i => {
      if (i >= 0 && i < images.length) {
        const img = new Image();
        img.src = getOptimizedUrl(images[i], 1600);
      }
    });
  }, [index, images]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length === 2) {
      // Départ pinch
      gesture.current.dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current.s = t.current.s;
      gesture.current.x = t.current.x;
      gesture.current.y = t.current.y;
    } else if (pts.length === 1) {
      gesture.current = { ...gesture.current, s: t.current.s, x: t.current.x, y: t.current.y, px: e.clientX, py: e.clientY, moved: false };

      // Double-tap : zoom centré sur le point tapé, ou retour à 1
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        if (t.current.s > 1) {
          reset();
        } else {
          const s = DOUBLE_TAP_SCALE;
          t.current.s = s;
          t.current.x = (window.innerWidth / 2 - e.clientX) * (s - 1);
          t.current.y = (window.innerHeight / 2 - e.clientY) * (s - 1);
          clampPan();
          apply(true);
        }
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length === 2 && gesture.current.dist > 0) {
      // Pinch-zoom
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      t.current.s = Math.min(MAX_SCALE, Math.max(1, (gesture.current.s * dist) / gesture.current.dist));
      clampPan();
      apply();
      gesture.current.moved = true;
    } else if (pts.length === 1) {
      const dx = e.clientX - gesture.current.px;
      const dy = e.clientY - gesture.current.py;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) gesture.current.moved = true;

      if (t.current.s > 1) {
        // Pan de l'image zoomée
        t.current.x = gesture.current.x + dx;
        t.current.y = gesture.current.y + dy;
        clampPan();
        apply();
      } else {
        // Non zoomé : l'image suit le doigt (feedback swipe / fermeture)
        t.current.x = dx;
        t.current.y = dy > 0 ? dy : 0;
        apply();
      }
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return; // il reste un doigt (fin de pinch)
    gesture.current.dist = 0;

    if (t.current.s <= 1.05 && gesture.current.moved) {
      const dx = t.current.x;
      const dy = t.current.y;
      if (dy > SWIPE_CLOSE_PX && dy > Math.abs(dx)) { onClose(); return; }
      if (dx < -SWIPE_NEXT_PX && index < images.length - 1) { onIndexChange(index + 1); return; }
      if (dx > SWIPE_NEXT_PX && index > 0) { onIndexChange(index - 1); return; }
      reset(); // pas de seuil atteint → retour élastique
    } else if (t.current.s < 1.05 && t.current.s !== 1) {
      reset();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.96)', touchAction: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Barre haute : compteur + fermer */}
      <div
        className="absolute left-0 right-0 z-[102] flex items-center justify-between px-4"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
      >
        <span className="px-2.5 py-1 rounded-full text-white text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.14)' }}>
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'rgba(255,255,255,0.14)' }}
        >
          <X size={20} strokeWidth={2.2} className="text-white" />
        </button>
      </div>

      {/* Image zoomable */}
      <div
        className="flex-1 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <div ref={wrapRef} className="w-full h-full" style={{ willChange: 'transform' }}>
          <ProgressiveImage
            key={images[index]}
            src={getOptimizedUrl(images[index], 1600)}
            alt={title}
            originalUrl={images[index]}
            fit="contain"
            className="w-full h-full"
            loading="eager"
          />
        </div>
      </div>

      {/* Flèches (desktop) */}
      {index > 0 && (
        <button
          type="button"
          onClick={() => onIndexChange(index - 1)}
          aria-label="Photo précédente"
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-[102] w-11 h-11 rounded-full items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.14)' }}
        >
          <ChevronLeft size={22} className="text-white" />
        </button>
      )}
      {index < images.length - 1 && (
        <button
          type="button"
          onClick={() => onIndexChange(index + 1)}
          aria-label="Photo suivante"
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-[102] w-11 h-11 rounded-full items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.14)' }}
        >
          <ChevronRight size={22} className="text-white" />
        </button>
      )}
    </div>
  );
}

// ── Galerie principale ───────────────────────────────────────────────────────

interface ProductGalleryProps {
  images: string[];
  title: string;
  blurhash?: string;
  active: number;
  onActiveChange: (i: number) => void;
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
  images, title, blurhash, active, onActiveChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const rafId = useRef(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Sync scroll → état actif (throttlé via rAF)
  const onScroll = () => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== active && i >= 0 && i < images.length) onActiveChange(i);
    });
  };

  // Sync état actif → scroll (tap sur une miniature)
  useEffect(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const current = Math.round(el.scrollLeft / el.clientWidth);
    if (current !== active) el.scrollTo({ left: active * el.clientWidth, behavior: 'smooth' });
  }, [active]);

  // Changement de produit → retour à la première photo, sans animation
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 });
  }, [images[0]]);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  return (
    <>
      {/* Cadre portrait : le produit entier est TOUJOURS visible */}
      <div className="relative w-full bg-[#EDEFF3]" style={{ height: 'min(118vw, 62vh)', minHeight: 300 }}>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex w-full h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {images.map((img, i) => (
            <div
              key={img || i}
              className="relative w-full h-full shrink-0 snap-center overflow-hidden cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
              // P1 — cible du morphing carte→galerie (un seul héros par page)
              data-vt-hero={i === active ? '1' : undefined}
              style={i === active ? ({ viewTransitionName: HERO_VT_NAME } as React.CSSProperties) : undefined}
            >
              {/* Fond ambiant : micro-thumbnail Cloudinary flou étiré (aucune bande vide) */}
              <img
                src={getThumbnailUrl(img)}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(26px) saturate(1.15)', transform: 'scale(1.2)', opacity: 0.6 }}
              />
              {/* Photo entière, jamais rognée */}
              <div className="absolute inset-0">
                <ProgressiveImage
                  src={getOptimizedUrl(img, 900)}
                  alt={`${title} — photo ${i + 1}`}
                  blurhash={i === 0 ? blurhash : undefined}
                  originalUrl={img}
                  fit="contain"
                  className="w-full h-full"
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Bouton plein écran */}
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Voir en plein écran"
          className="absolute z-[4] left-3.5 bottom-6 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        >
          <Maximize2 size={14} strokeWidth={2.2} className="text-white" />
        </button>

        {/* Compteur */}
        {images.length > 1 && (
          <div
            className="absolute z-[4] bottom-6 right-3.5 px-2.5 py-1 rounded-full text-white text-[10px] font-bold tracking-[0.03em]"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          >
            {active + 1} / {images.length}
          </div>
        )}

        {/* Dots */}
        {images.length > 1 && (
          <div className="absolute z-[4] bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 items-center">
            {images.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-200"
                style={
                  i === active
                    ? { width: 8, height: 8, background: '#F5C842', boxShadow: '0 0 0 2px rgba(245,200,66,0.25)' }
                    : { width: 4, height: 4, background: 'rgba(255,255,255,0.85)', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }
                }
              />
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && (
        <Lightbox
          images={images}
          title={title}
          index={active}
          onIndexChange={onActiveChange}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
};
