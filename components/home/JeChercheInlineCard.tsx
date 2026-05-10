import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Inline card inserted into the main product grid (col-span-full) prompting
 * buyers to post a demand via the "Je Cherche" flow. Clicks open the global
 * JeChercheForm — mounted in Navbar — via a window CustomEvent.
 */
export const JeChercheInlineCard: React.FC = () => {
  const { t } = useTranslation();

  const open = () => {
    window.dispatchEvent(new CustomEvent('open-je-cherche'));
  };

  return (
    <div
      className="col-span-full"
      style={{ padding: '4px 0' }}
    >
      <div
        className="flex items-center gap-3.5 p-4 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg,#FFF8E7 0%,#FFF3D0 100%)',
          border: '1px solid rgba(245,200,66,0.3)',
          boxShadow: '0 2px 12px rgba(245,200,66,0.15)',
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(245,200,66,0.25)' }}
        >
          🔍
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-black text-[#111318] tracking-tight leading-tight m-0">
            {t('home.jeCherche.title', 'Vous cherchez quelque chose ?')}
          </h3>
          <p className="text-[11px] text-[#5C6370] leading-snug mt-0.5">
            {t('home.jeCherche.subtitle', 'Postez votre demande, les vendeurs vous contactent')}
          </p>
        </div>
        <button
          type="button"
          onClick={open}
          className="flex-shrink-0 px-3.5 py-2.5 rounded-full text-[11px] font-black
                     text-[#111318] cursor-pointer border-none active:scale-95 transition-transform"
          style={{
            background: '#F5C842',
            boxShadow: '0 2px 8px rgba(245,200,66,0.4)',
          }}
        >
          {t('home.jeCherche.cta', 'Poster')}
        </button>
      </div>
    </div>
  );
};
