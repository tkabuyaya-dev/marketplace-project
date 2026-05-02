/**
 * NUNULIA — Service Cloudinary (Production-Grade)
 *
 * Sécurité:
 * - Upload preset "unsigned" acceptable pour images produits publics
 * - Validation type/taille AVANT upload (évite abus bandwidth)
 * - Transformation automatique: WebP, compression adaptative, dimensions limitées
 *
 * Optimisation coût:
 * - Toutes les images passent par le CDN Cloudinary (pas de bande passante Firebase Storage)
 * - Transformations à la volée: une seule image stockée, plusieurs formats servis
 * - Format WebP auto: 30-50% plus léger que JPEG pour même qualité visuelle
 */

const CLOUD_NAME   = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;
const FOLDER       = import.meta.env.VITE_CLOUDINARY_FOLDER as string || 'aurabuja-app-2026';

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Categories of upload failure. Callers branch on this to decide retry strategy
 * — `network` and `timeout` mean "we never reached Cloudinary, the draft is
 * safe to queue offline"; `server` and `validation` are not network-recoverable.
 */
export type UploadErrorKind = 'network' | 'timeout' | 'server' | 'validation' | 'unknown';

export class UploadError extends Error {
  readonly kind: UploadErrorKind;
  constructor(message: string, kind: UploadErrorKind = 'unknown') {
    super(message);
    this.name = 'UploadError';
    this.kind = kind;
  }
}

function validateFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError(`Format non supporté. Utilisez: JPG, PNG, WebP. (reçu: ${file.type})`, 'validation');
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new UploadError(`Image trop lourde (max ${MAX_SIZE_MB}MB). Taille actuelle: ${(file.size / 1024 / 1024).toFixed(1)}MB`, 'validation');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

interface UploadOptions {
  folder?: string;
  /** Largeur maximale de l'image après upload (Cloudinary la redimensionne) */
  maxWidth?: number;
  /** Qualité (1-100, auto par défaut) */
  quality?: number;
  /** Transformation eager: génère les variantes immédiatement */
  eager?: string;
}

interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSION — réduit la taille avant upload pour les réseaux 2G/3G
// ─────────────────────────────────────────────────────────────────────────────

const COMPRESS_THRESHOLD_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const COMPRESS_MAX_DIMENSION   = 1600;               // px — côté le plus long
const COMPRESS_QUALITY         = 0.82;               // JPEG quality

/**
 * Compresse une image via Canvas si elle dépasse le seuil.
 * Retourne le File original si déjà sous le seuil ou si Canvas non disponible.
 */
async function compressIfNeeded(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const ratio = Math.min(COMPRESS_MAX_DIMENSION / width, COMPRESS_MAX_DIMENSION / height, 1);
    const targetW = Math.round(width * ratio);
    const targetH = Math.round(height * ratio);

    // Prefer OffscreenCanvas (no DOM, works in workers), fall back to <canvas>
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(targetW, targetH);
      ctx = (canvas as OffscreenCanvas).getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      (canvas as HTMLCanvasElement).width  = targetW;
      (canvas as HTMLCanvasElement).height = targetH;
      ctx = (canvas as HTMLCanvasElement).getContext('2d');
    }

    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    let blob: Blob | null = null;
    if (canvas instanceof OffscreenCanvas) {
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: COMPRESS_QUALITY });
    } else {
      blob = await new Promise<Blob | null>(resolve =>
        (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', COMPRESS_QUALITY)
      );
    }

    if (!blob) return file;

    // Only use compressed version if it's actually smaller
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    // Canvas error — use original
    return file;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD — avec timeout, retry et compression automatique
// ─────────────────────────────────────────────────────────────────────────────

const UPLOAD_TIMEOUT_MS = 60_000; // 60s — suffisant même en 2G lent
const MAX_RETRIES       = 3;
const RETRY_DELAYS_MS   = [2_000, 4_000, 8_000]; // backoff exponentiel

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('the internet connection appears to be offline')
  );
}

/**
 * Upload une image vers Cloudinary avec :
 * - Compression automatique si >1.5 MB (canvas resize, sans perte de qualité visible)
 * - Timeout 60s via AbortController (évite le blocage indéfini sur 2G/3G)
 * - Retry x3 avec backoff exponentiel (2s → 4s → 8s) pour les erreurs réseau
 */
export const uploadImage = async (
  file: File,
  options: UploadOptions = {}
): Promise<string> => {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.warn('⚠️ Cloudinary non configuré');
    return `https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=800&q=80&t=${Date.now()}`;
  }

  validateFile(file);

  // Compression automatique — réduit drastiquement les échecs 2G/3G
  const compressed = await compressIfNeeded(file);

  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', options.folder || FOLDER);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  let lastError: Error = new UploadError('Upload échoué');

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Wait before retrying (not before first attempt)
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // Server-side error (4xx/5xx) — no point retrying
        throw new UploadError(error.error?.message || `Échec upload (${response.status})`, 'server');
      }

      const data: UploadResult & { secure_url: string } = await response.json();
      return data.secure_url;

    } catch (err: any) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        lastError = new UploadError(
          `Connexion trop lente (timeout après 60s). Vérifiez votre réseau et réessayez.`,
          'timeout'
        );
      } else if (err instanceof UploadError) {
        // Server error — propagate immediately, no retry
        throw err;
      } else if (isNetworkError(err)) {
        lastError = new UploadError(
          `Réseau indisponible. Vérifiez votre connexion internet.`,
          'network'
        );
      } else {
        lastError = new UploadError(err.message || 'Erreur inattendue lors de l\'upload.', 'unknown');
        throw lastError; // Unknown error — don't retry
      }

      // Last attempt failed — give up
      if (attempt === MAX_RETRIES - 1) throw lastError;
      // Otherwise loop → retry
    }
  }

  throw lastError;
};

/**
 * Upload multiple images séquentiellement (1 à la fois sur mobile 2G/3G).
 * Le mode séquentiel évite de saturer la bande passante et réduit les timeouts.
 *
 * `onProgress(uploaded, total)` is called BEFORE each attempt and once after
 * the final upload — gives the UI a live "photo X/N" indicator. Optional;
 * existing callers don't need to change.
 */
export const uploadImages = async (
  files: File[],
  options: UploadOptions = {},
  onProgress?: (uploaded: number, total: number) => void
): Promise<string[]> => {
  const results: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const url = await uploadImage(files[i], options);
    results.push(url);
  }
  onProgress?.(files.length, files.length);
  return results;
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFORMATIONS URL — Zero extra cost (Cloudinary CDN)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère une URL optimisée depuis une URL Cloudinary existante.
 * La transformation se fait côté CDN — pas de nouvelle image stockée.
 *
 * @param url - URL Cloudinary originale
 * @param width - Largeur cible en pixels
 * @param quality - Qualité (1-100 ou 'auto')
 * @param format - Format ('auto' = WebP si supporté, meilleur pour mobile)
 */
export const getOptimizedUrl = (
  url: string,
  width: number = 800,
  quality: number | 'auto' = 'auto',
  format: string = 'auto',
  /** Set true only for single images without srcset (product thumbnails).
   *  For srcset usage, the browser already selects the right density — dpr_auto
   *  would double-count and serve 2x images to every retina device. */
  useDpr: boolean = false
): string => {
  if (!url) return '';
  if (!url.includes('cloudinary.com')) return url;

  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Transformation Cloudinary: format WebP auto, compression intelligente, redimension
  const transforms = `f_${format},q_${quality},w_${width},c_limit${useDpr ? ',dpr_auto' : ''}`;
  return `${parts[0]}/upload/${transforms}/${parts[1]}`;
};

/**
 * Variantes d'URL pour srcset responsive — charge l'image à la bonne taille
 * selon la résolution de l'écran (économise ~60% bande passante mobile)
 */
export const getResponsiveSrcSet = (url: string): string => {
  if (!url?.includes('cloudinary.com')) return '';

  const widths = [400, 600, 800, 1200];
  return widths
    .map(w => `${getOptimizedUrl(url, w)} ${w}w`)
    .join(', ');
};

/**
 * URL pour thumbnail ultra-léger (chargement liste/grille)
 * Format: 20px flou (blur-up effect), puis image réelle
 */
export const getThumbnailUrl = (url: string): string => {
  if (!url?.includes('cloudinary.com')) return url;
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;
  return `${parts[0]}/upload/f_auto,q_1,w_20,e_blur:200/${parts[1]}`;
};

/**
 * URL avatar optimisé (petit, carré, centré sur le visage)
 */
export const getAvatarUrl = (url: string, size: number = 80): string => {
  if (!url?.includes('cloudinary.com')) return url;
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;
  return `${parts[0]}/upload/f_auto,q_auto,w_${size},h_${size},c_fill,g_face/${parts[1]}`;
};
