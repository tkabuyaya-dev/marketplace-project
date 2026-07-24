/**
 * NUNULIA - Vitrine Vidéo : façade → lecteur intégré.
 *
 * Pattern « facade » strict pour le moat offline-first 2G/3G :
 * - Au rendu : AUCUN script/iframe tiers. Juste une miniature (image statique
 *   YouTube ou carte brandée) + bouton play doré. Coût réseau ≈ 0.
 * - Au tap : l'iframe d'embed officiel se charge en place - la vidéo se joue
 *   DANS Nunulia, hébergée et servie par TikTok/YouTube (coût Nunulia = 0).
 * - Plateformes non-embeddables (FB/Insta, liens courts TikTok) : la façade
 *   ouvre la vidéo sur la plateforme dans un nouvel onglet (fallback assumé).
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, X } from 'lucide-react';
import { getProductVideoInfo } from '../utils/productVideo';
import type { SocialPlatform } from '../utils/socialLinks';

/** Pastilles plateforme - couleurs officielles pour la reconnaissance immédiate. */
const PLATFORM_PILL: Record<SocialPlatform, { bg: string; label: string }> = {
  tiktok:    { bg: '#010101', label: 'TikTok' },
  youtube:   { bg: '#FF0000', label: 'YouTube' },
  facebook:  { bg: '#1877F2', label: 'Facebook' },
  instagram: { bg: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)', label: 'Instagram' },
};

interface ProductVideoProps {
  videoUrl?: string | null;
  productTitle: string;
}

export const ProductVideo: React.FC<ProductVideoProps> = ({ videoUrl, productTitle }) => {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);

  const info = getProductVideoInfo(videoUrl);

  const handleActivate = useCallback(() => {
    if (!info) return;
    if (info.embedUrl) {
      setPlaying(true);
    } else {
      // Fallback externe - jamais de bouton mort.
      window.open(videoUrl!, '_blank', 'noopener,noreferrer');
    }
  }, [info, videoUrl]);

  if (!info) return null;

  const pill = PLATFORM_PILL[info.platform];
  // TikTok = vertical 9:16 (hauteur plafonnée), YouTube = 16:9 pleine largeur.
  const isVertical = info.platform === 'tiktok';

  return (
    <div className="mt-1 mb-4">
      {/* En-tête de section - même grammaire que les autres sections détail */}
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <span className="text-[14px] font-extrabold text-[#111318]">
          🎥 {t('productVideo.sectionTitle', 'Voir en vidéo')}
        </span>
        <span
          className="inline-flex items-center px-2 py-[3px] rounded-full text-[10px] font-extrabold text-white leading-none"
          style={{ background: pill.bg }}
        >
          {pill.label}
        </span>
        {playing && (
          <button
            type="button"
            onClick={() => setPlaying(false)}
            aria-label={t('productVideo.close', 'Fermer la vidéo')}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-full bg-black/[0.06] text-[#5C6370] active:scale-90 transition-transform"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {!playing ? (
        /* ── FAÇADE - zéro ressource tierce chargée ── */
        <button
          type="button"
          onClick={handleActivate}
          aria-label={
            info.embedUrl
              ? t('productVideo.playAria', 'Lire la vidéo du produit')
              : t('productVideo.openAria', 'Ouvrir la vidéo sur {{platform}}', { platform: pill.label })
          }
          className="group relative w-full overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          style={{ aspectRatio: '16 / 9', maxHeight: 300 }}
        >
          {/* Fond : vraie miniature YouTube, sinon carte brandée sombre */}
          {info.thumbnailUrl ? (
            <>
              <img
                src={info.thumbnailUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Voile pour le contraste du play */}
              <div className="absolute inset-0 bg-black/25" />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 30% 35%, rgba(245,200,66,0.25), transparent 55%),' +
                  'radial-gradient(circle at 75% 70%, rgba(232,169,32,0.15), transparent 50%),' +
                  'linear-gradient(160deg,#1a1c22,#2c2f38)',
              }}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[52px] opacity-40 select-none" aria-hidden>
                {info.emoji}
              </span>
            </div>
          )}

          {/* Bouton play doré - pulse ring déjà défini dans tailwind.config */}
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="w-14 h-14 rounded-full bg-gold-400 animate-pulse-ring flex items-center justify-center shadow-gold transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
            >
              {info.embedUrl ? (
                <span
                  aria-hidden
                  className="ml-1 block"
                  style={{
                    width: 0, height: 0,
                    borderLeft: '18px solid #111318',
                    borderTop: '11px solid transparent',
                    borderBottom: '11px solid transparent',
                  }}
                />
              ) : (
                <ExternalLink size={20} strokeWidth={2.4} className="text-[#111318]" aria-hidden />
              )}
            </span>
          </span>

          {/* Légende bas de façade */}
          <span className="absolute bottom-2.5 left-0 right-0 text-center text-white/90 text-[11px] font-semibold px-4 pointer-events-none">
            {info.embedUrl
              ? t('productVideo.tapToPlay', 'Touchez pour lire - la vidéo se joue ici')
              : t('productVideo.tapToOpen', 'Touchez pour ouvrir sur {{platform}}', { platform: pill.label })}
          </span>
        </button>
      ) : (
        /* ── LECTEUR - iframe officiel, chargé uniquement après le tap ── */
        <div
          className={`relative overflow-hidden rounded-2xl bg-black ${isVertical ? 'mx-auto' : 'w-full'}`}
          style={isVertical
            ? { aspectRatio: '9 / 15', maxWidth: 320, maxHeight: 540 }
            : { aspectRatio: '16 / 9' }}
        >
          <iframe
            src={info.embedUrl!}
            title={`${t('productVideo.iframeTitle', 'Vidéo du produit')} - ${productTitle}`}
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </div>
  );
};
