/**
 * NUNULIA — BlurHash Utilities
 *
 * Encode: generates a ~20-30 char hash from an image (at upload time)
 * Decode: renders hash to a tiny canvas for instant placeholder (at display time)
 *
 * Zero network required for decode — the hash IS the placeholder.
 * Facebook/Instagram use the same principle (ThumbHash / BlurHash).
 */

import { encode, decode } from 'blurhash';

// ─── Encode (upload time) ────────────────────────────────────────────────────

/**
 * Generate a BlurHash string from an image file or URL.
 * Runs in-browser using a hidden canvas. ~5-15ms on mobile.
 *
 * @param source - File object or image URL (data: or https:)
 * @returns BlurHash string (~20-30 chars) or null if encoding fails
 */
export const generateBlurhash = async (source: File | string): Promise<string | null> => {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
    });

    if (source instanceof File) {
      img.src = URL.createObjectURL(source);
    } else {
      img.src = source;
    }

    const image = await loaded;

    // Downscale to 32x32 for fast encoding (hash doesn't need resolution)
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(image, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);

    // Clean up object URL if we created one
    if (source instanceof File) {
      URL.revokeObjectURL(img.src);
    }

    // 4 x 3 components = good balance of quality vs hash length
    return encode(imageData.data, imageData.width, imageData.height, 4, 3);
  } catch {
    return null;
  }
};

// ─── Decode (display time) ───────────────────────────────────────────────────

// In-memory cache: hash → dataURL (avoids re-decoding same hash)
const decodedCache = new Map<string, string>();

/**
 * Decode a BlurHash to a base64 data URL for use as CSS background or img src.
 * Cached in memory — second call for same hash is < 0.01ms.
 *
 * @param hash - BlurHash string
 * @param width - Output width (default 32 — tiny is fine, it's blurred)
 * @param height - Output height (default 32)
 * @returns data:image/png base64 URL, or empty string if decoding fails
 */
export const decodeBlurhash = (hash: string, width = 32, height = 32): string => {
  if (!hash) return '';

  const cacheKey = `${hash}_${width}_${height}`;
  const cached = decodedCache.get(cacheKey);
  if (cached) return cached;

  try {
    const pixels = decode(hash, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL();
    decodedCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return '';
  }
};
