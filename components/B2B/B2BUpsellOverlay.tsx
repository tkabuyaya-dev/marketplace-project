/**
 * B2BUpsellOverlay — overlay de conversion pour les Gratuits / non-abonnés.
 *
 * Affiché par-dessus la card en mode "demi-flouté". Le CTA renvoie vers
 * /plans. Le bouton "Voir les offres" est intercepté par stopPropagation
 * pour ne pas déclencher le navigate du wrapper.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Props {
  variant?: 'overlay' | 'banner';
}

export const B2BUpsellOverlay: React.FC<Props> = ({ variant = 'overlay' }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (variant === 'banner') {
    return (
      <div
        className="rounded-2xl p-4 mb-3"
        style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))',
          border: '1px solid rgba(245,158,11,0.35)',
        }}
      >
        <p className="text-[14px] font-bold text-white mb-1">
          {t('b2b.upsell.title')}
        </p>
        <p className="text-[12.5px] text-white/80 mb-3">
          {t('b2b.upsell.subtitle')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/plans')}
          className="px-4 py-2 rounded-xl font-extrabold text-[13px] text-gray-900"
          style={{ background: '#F59E0B', boxShadow: '0 4px 14px rgba(245,158,11,0.4)' }}
        >
          {t('b2b.upsell.cta')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-end p-4 pointer-events-auto"
      style={{
        background: 'linear-gradient(180deg, transparent 0%, rgba(15,25,35,0.85) 60%, rgba(15,25,35,0.97) 100%)',
        borderRadius: 'inherit',
      }}
    >
      <p className="text-[13px] font-bold text-white text-center mb-2">
        🔒 {t('b2b.upsell.lockTitle')}
      </p>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigate('/plans'); }}
        className="px-4 py-2 rounded-xl font-extrabold text-[12.5px] text-gray-900 active:scale-95 transition-transform"
        style={{ background: '#F59E0B', boxShadow: '0 4px 14px rgba(245,158,11,0.45)' }}
      >
        {t('b2b.upsell.cta')} →
      </button>
    </div>
  );
};
