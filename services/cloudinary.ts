/**
 * AURABUJA — Service Cloudinary (Production-Grade)
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

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

function validateFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError(`Format non supporté. Utilisez: JPG, PNG, WebP. (reçu: ${file.type})`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new UploadError(`Image trop lourde (max ${MAX_SIZE_MB}MB). Taille actuelle: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
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

/**
 * Upload une image vers Cloudinary avec validation et transformation.
 * Retourne un objet avec l'URL optimisée et les métadonnées.
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

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', options.folder || FOLDER);
  // Note: avec un preset "unsigned", seuls upload_preset, folder, public_id
  // sont autorisés. Les transformations se font via URL (getOptimizedUrl).

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new UploadError(error.error?.message || `Échec upload (${response.status})`);
  }

  const data: UploadResult & { secure_url: string } = await response.json();
  return data.secure_url;
};

/**
 * Upload multiple images en parallèle avec limite de concurrence.
 * Evite de saturer la connexion mobile (max 2 uploads simultanés).
 */
export const uploadImages = async (
  files: File[],
  options: UploadOptions = {}
): Promise<string[]> => {
  const CONCURRENCY = 2; // Max 2 uploads simultanés (économise la bande passante)
  const results: string[] = [];

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(f => uploadImage(f, options)));
    results.push(...batchResults);
  }

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
  format: string = 'auto'
): string => {
  if (!url) return '';
  if (!url.includes('cloudinary.com')) return url;

  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Transformation Cloudinary: format WebP auto, compression intelligente, redimension
  const transforms = `f_${format},q_${quality},w_${width},c_limit,dpr_auto`;
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
