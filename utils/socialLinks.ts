/**
 * NUNULIA — Validation & détection des liens vidéo / réseaux sociaux.
 *
 * Whitelist STRICTE : seuls TikTok, Facebook, Instagram et YouTube sont
 * autorisés. Objectif sécurité : empêcher qu'un champ « lien » devienne un
 * canal de contournement du masquage WhatsApp (ex. wa.me/…, t.me/…, ou une
 * page contenant un numéro en clair servie aux non-abonnés).
 *
 * La même whitelist est rejouée côté Firestore rules (`validSocialUrl`, create
 * b2b_posts). Toute évolution ici doit être répliquée là-bas.
 */

export type SocialPlatform = 'tiktok' | 'facebook' | 'instagram' | 'youtube';

/** Hostnames autorisés par plateforme (sous-domaines inclus : vm., www., m.…). */
const PLATFORM_HOSTS: Record<SocialPlatform, RegExp> = {
  tiktok:    /(^|\.)tiktok\.com$/,
  facebook:  /(^|\.)(facebook\.com|fb\.watch)$/,
  instagram: /(^|\.)instagram\.com$/,
  youtube:   /(^|\.)(youtube\.com|youtu\.be)$/,
};

/** Métadonnées d'affichage — label + emoji par plateforme. */
export const SOCIAL_PLATFORM_META: Record<SocialPlatform, { label: string; emoji: string }> = {
  tiktok:    { label: 'TikTok',    emoji: '🎵' },
  facebook:  { label: 'Facebook',  emoji: '📘' },
  instagram: { label: 'Instagram', emoji: '📸' },
  youtube:   { label: 'YouTube',   emoji: '▶️' },
};

const MAX_URL_LEN = 300;

function parseHttpsUrl(raw: string): URL | null {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.length > MAX_URL_LEN) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Retourne la plateforme détectée, ou null si l'URL n'est pas dans la whitelist. */
export function detectSocialPlatform(raw: string): SocialPlatform | null {
  const url = parseHttpsUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  return (Object.keys(PLATFORM_HOSTS) as SocialPlatform[])
    .find((p) => PLATFORM_HOSTS[p].test(host)) ?? null;
}

/** True si l'URL est un lien social/vidéo accepté (https + domaine whitelisté). */
export function isAllowedSocialUrl(raw: string): boolean {
  return detectSocialPlatform(raw) !== null;
}

/** Normalise pour stockage : retourne l'URL trimmée si valide, sinon ''. */
export function normalizeSocialUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  return isAllowedSocialUrl(trimmed) ? trimmed : '';
}
