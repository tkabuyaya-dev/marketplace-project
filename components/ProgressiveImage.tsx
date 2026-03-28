/**
 * NUNULIA — ProgressiveImage
 *
 * Facebook/WhatsApp-grade progressive image loading:
 *
 *  1. BlurHash decoded instantly (no network, < 1ms from cache)
 *  2. Cloudinary micro-thumbnail (20px blurred, ~200 bytes, cached by SW)
 *  3. Animated skeleton pulse (fallback when neither is available)
 *  4. Full HD image fades in smoothly when loaded
 *
 * The user ALWAYS sees something immediately — never a blank rectangle.
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { decodeBlurhash } from '../utils/blurhash';
import { getThumbnailUrl } from '../services/cloudinary';

interface ProgressiveImageProps {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  blurhash?: string;
  originalUrl?: string; // Raw Cloudinary URL for micro-thumbnail generation
  className?: string;
  imgClassName?: string;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = memo(({
  src,
  srcSet,
  sizes,
  alt,
  blurhash,
  originalUrl,
  className = '',
  imgClassName = '',
  loading = 'lazy',
  onLoad,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [lqipSrc, setLqipSrc] = useState<string>('');
  const imgRef = useRef<HTMLImageElement>(null);

  // Compute LQIP (Low Quality Image Placeholder) — runs once
  useEffect(() => {
    // Priority 1: BlurHash (instant, no network)
    if (blurhash) {
      const decoded = decodeBlurhash(blurhash);
      if (decoded) {
        setLqipSrc(decoded);
        return;
      }
    }

    // Priority 2: Cloudinary micro-thumbnail (20px blur, ~200 bytes, SW-cached)
    const rawUrl = originalUrl || src;
    if (rawUrl?.includes('cloudinary.com')) {
      setLqipSrc(getThumbnailUrl(rawUrl));
      return;
    }

    // Priority 3: No LQIP available — skeleton will show
    setLqipSrc('');
  }, [blurhash, originalUrl, src]);

  // If image is already cached by browser, onLoad fires synchronously
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
      onLoad?.();
    }
  }, [src]);

  const handleLoad = () => {
    setLoaded(true);
    onLoad?.();
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Layer 1: Placeholder (always rendered until HD loads) */}
      {!loaded && (
        lqipSrc ? (
          // BlurHash or Cloudinary micro-thumbnail
          <img
            src={lqipSrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm"
            draggable={false}
          />
        ) : (
          // Animated skeleton fallback
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-700 animate-pulse" />
        )
      )}

      {/* Layer 2: Full quality image (fades in over placeholder) */}
      <img
        ref={imgRef}
        src={src}
        srcSet={srcSet || undefined}
        sizes={sizes || undefined}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={handleLoad}
        draggable={false}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName}`}
      />
    </div>
  );
});
