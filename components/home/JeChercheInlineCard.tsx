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
    <button
      type="button"
      onClick={open}
      className="col-span-full w-full text-left rounded-xl overflow-hidden bg-gradient-to-r from-gold-500 to-gold-400 text-gray-950 px-4 py-4 flex items-center gap-3 shadow-sm hover:shadow-lg hover:-translate-y-[1px] transition-all"
    >
      <span
        aria-hidden="true"
        className="flex-shrink-0 w-11 h-11 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <circle cx="11" cy="11" r="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-snug">
          {t('home.jeCherche.title', 'Vous ne trouvez pas ce que vous cherchez ?')}
        </p>
        <p className="text-xs leading-snug opacity-90 mt-0.5">
          {t('home.jeCherche.subtitle', 'Postez votre demande — les vendeurs vous répondent')}
        </p>
      </div>
      <span className="flex-shrink-0 bg-gray-950 text-gold-400 text-xs font-semibold px-3 py-1.5 rounded-full">
        {t('home.jeCherche.cta', 'Publier ma demande')}
      </span>
    </button>
  );
};
