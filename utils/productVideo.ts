/**
 * NUNULIA — Vitrine Vidéo : dérivation d'infos d'embed depuis une URL sociale.
 *
 * Principe de sécurité : on ne stocke JAMAIS de miniature ni d'ID fournis par
 * le client — tout est dérivé à l'affichage depuis `videoUrl`, qui est la
 * seule donnée persistée et qui passe la whitelist stricte de
 * utils/socialLinks.ts (rejouée dans firestore.rules). Zéro nouvelle surface
 * d'attaque, zéro appel réseau au rendu (offline-first intact).
 *
 * Embeds : la vidéo se joue DANS Nunulia via l'iframe officiel de la
 * plateforme — hébergement et bande passante payés par TikTok/YouTube.
 * - YouTube  : watch / youtu.be / shorts / live / embed → youtube-nocookie
 * - TikTok   : URL canonique /@user/video/<id> → tiktok.com/embed/v2/<id>
 * - Liens courts TikTok (vm./vt./tiktok.com/t/) : pas d'ID extractible côté
 *   client → fallback "ouvrir sur la plateforme" (carte brandée).
 * - Facebook / Instagram : embed verrouillé par Meta → même fallback.
 */

import { detectSocialPlatform, SOCIAL_PLATFORM_META, type SocialPlatform } from './socialLinks';

export interface ProductVideoInfo {
  platform: SocialPlatform;
  /** Libellé + emoji d'affichage (réutilise SOCIAL_PLATFORM_META). */
  label: string;
  emoji: string;
  /** URL d'iframe si la lecture intégrée est possible, sinon null. */
  embedUrl: string | null;
  /** Miniature réelle (YouTube uniquement — URL statique i.ytimg.com). */
  thumbnailUrl: string | null;
}

/** ID vidéo YouTube : 11 caractères [A-Za-z0-9_-] (tolérance 6-15). */
function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const ID = /^[A-Za-z0-9_-]{6,15}$/;

  if (/(^|\.)youtu\.be$/.test(host)) {
    const id = path.split('/')[1] || '';
    return ID.test(id) ? id : null;
  }
  // youtube.com/watch?v=<id>
  const v = url.searchParams.get('v');
  if (v && ID.test(v)) return v;
  // youtube.com/shorts/<id> | /embed/<id> | /live/<id>
  const m = path.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,15})(?:\/|$)/);
  return m ? m[1] : null;
}

/** ID vidéo TikTok : uniquement les URL canoniques /@user/video/<digits>. */
function extractTikTokId(url: URL): string | null {
  const m = url.pathname.match(/\/video\/(\d{6,25})(?:\/|$)/);
  return m ? m[1] : null;
}

/**
 * Analyse une URL vidéo whitelistée et retourne les infos d'affichage.
 * Retourne null si l'URL n'est pas dans la whitelist (ne devrait jamais
 * arriver pour un champ validé, mais défensif pour les données legacy).
 */
export function getProductVideoInfo(rawUrl: string | undefined | null): ProductVideoInfo | null {
  if (!rawUrl) return null;
  const platform = detectSocialPlatform(rawUrl);
  if (!platform) return null;

  const meta = SOCIAL_PLATFORM_META[platform];
  const base: ProductVideoInfo = {
    platform,
    label: meta.label,
    emoji: meta.emoji,
    embedUrl: null,
    thumbnailUrl: null,
  };

  let url: URL;
  try { url = new URL(rawUrl.trim()); } catch { return base; }

  if (platform === 'youtube') {
    const id = extractYouTubeId(url);
    if (id) {
      // nocookie = pas de cookies de tracking tant que la lecture n'a pas démarré
      base.embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
      base.thumbnailUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
  } else if (platform === 'tiktok') {
    const id = extractTikTokId(url);
    if (id) {
      base.embedUrl = `https://www.tiktok.com/embed/v2/${id}`;
    }
  }
  // facebook / instagram : embed non fiable sans app Meta approuvée → fallback externe.

  return base;
}

/** True si l'URL permet une lecture intégrée dans Nunulia (façade → iframe). */
export function canEmbedVideo(rawUrl: string | undefined | null): boolean {
  return !!getProductVideoInfo(rawUrl)?.embedUrl;
}
