/**
 * NUNULIA — Client-side Image Compression (Canvas API)
 *
 * Zero dependencies. Compresses images BEFORE upload to save bandwidth.
 * Critical for African mobile users on slow connections.
 *
 * Typical savings: 4MB phone photo → ~150-250KB after compression.
 */

const MAX_DIMENSION = 1200; // Max width/height in pixels
const JPEG_QUALITY = 0.82; // Good balance quality/size
const WEBP_QUALITY = 0.80;

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  savings: number; // percentage saved
}

/**
 * Compress a single image file using Canvas API.
 * Resizes to max 1200px and converts to JPEG/WebP.
 */
export async function compressImage(file: File): Promise<CompressResult> {
  const bitmap = await createImageBitmap(file);
  const { width: origW, height: origH } = bitmap;

  // Calculate target dimensions (maintain aspect ratio)
  let targetW = origW;
  let targetH = origH;

  if (origW > MAX_DIMENSION || origH > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / origW, MAX_DIMENSION / origH);
    targetW = Math.round(origW * ratio);
    targetH = Math.round(origH * ratio);
  }

  // Use OffscreenCanvas if available (non-blocking), fallback to regular Canvas
  let blob: Blob;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    // Try WebP first (smaller), fallback to JPEG
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
      .catch(() => canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY }));
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b!),
        'image/jpeg',
        JPEG_QUALITY
      );
    });
  }

  bitmap.close();

  const savings = Math.round((1 - blob.size / file.size) * 100);

  return {
    blob,
    width: targetW,
    height: targetH,
    originalSize: file.size,
    compressedSize: blob.size,
    savings: Math.max(0, savings),
  };
}

/**
 * Compress multiple images. Returns File objects ready for upload.
 * Skips compression if the image is already small enough.
 */
export async function compressImages(
  files: File[],
  onProgress?: (index: number, total: number) => void,
): Promise<File[]> {
  const SKIP_THRESHOLD = 300 * 1024; // Don't compress images under 300KB
  const results: File[] = [];

  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);

    if (files[i].size <= SKIP_THRESHOLD) {
      // Already small enough — skip compression
      results.push(files[i]);
      continue;
    }

    try {
      const result = await compressImage(files[i]);
      // Only use compressed version if it's actually smaller
      if (result.compressedSize < files[i].size) {
        const ext = result.blob.type === 'image/webp' ? 'webp' : 'jpg';
        const compressedFile = new File(
          [result.blob],
          files[i].name.replace(/\.[^.]+$/, `.${ext}`),
          { type: result.blob.type }
        );
        results.push(compressedFile);
      } else {
        results.push(files[i]);
      }
    } catch {
      // On compression error, use original
      results.push(files[i]);
    }
  }

  onProgress?.(files.length, files.length);
  return results;
}
