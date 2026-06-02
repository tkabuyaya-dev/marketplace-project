/**
 * NUNULIA — ProductPhotoProBadge
 *
 * Badge "📸 Photo Pro" affiché sur les fiches produit dont les photos ont
 * été retouchées via le parcours synchrone PhotoRoom (enhanced === true).
 *
 * Volontairement discret : petit, gris-doré, sans tooltip. Sert à
 * différencier visuellement les fiches enrichies sans crier au "premium".
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

interface Props {
  size?: 'sm' | 'md';
  className?: string;
}

export const ProductPhotoProBadge: React.FC<Props> = ({ size = 'sm', className = '' }) => {
  const { t } = useTranslation();
  const isMd = size === 'md';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 ${
        isMd ? 'text-sm' : 'text-xs'
      } font-semibold text-goldText ${className}`}
      aria-label={t('enhancement.badgeAria')}
    >
      <Sparkles className={isMd ? 'w-3.5 h-3.5' : 'w-3 h-3'} aria-hidden />
      <span>{t('enhancement.badge')}</span>
    </span>
  );
};
