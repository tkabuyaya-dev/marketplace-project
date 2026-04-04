/**
 * NUNULIA — "Je Cherche" Block
 *
 * Displayed in Search page:
 * - Always when 0 results + active query
 * - After results when < 4 results
 * - As a scroll-triggered block when many results
 *
 * Non-intrusive, elegant, viral.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBuyerRequestStats } from '../../services/firebase/buyer-requests';

interface JeChercheBlockProps {
  query?: string;
  mode: 'no_results' | 'few_results' | 'scroll';
  onOpen: () => void;
}

export const JeChercheBlock: React.FC<JeChercheBlockProps> = ({ query, mode, onOpen }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ todayCount: number; fulfilledCount: number } | null>(null);

  useEffect(() => {
    getBuyerRequestStats().then(setStats).catch(() => {});
  }, []);

  if (mode === 'no_results') {
    return (
      <div className="mt-8 mb-4 rounded-2xl border border-gold-400/20 bg-gradient-to-br from-gray-800/80 to-gray-900/80 p-6 text-center animate-fade-in">
        <div className="text-3xl mb-3">😕</div>
        <p className="text-base font-bold text-white mb-1">
          {t('jeCherche.block.title')}
        </p>
        <p className="text-sm text-gray-400 mb-4">
          {t('jeCherche.block.subtitle')}
        </p>

        <button
          onClick={onOpen}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-400 hover:bg-gold-300 text-gray-900 font-bold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-gold-400/20 hover:shadow-gold-400/40 hover:scale-105 active:scale-95"
        >
          <span>🔍</span>
          {t('jeCherche.block.cta')}
        </button>

        {stats && (stats.todayCount > 0 || stats.fulfilledCount > 0) && (
          <div className="flex items-center justify-center gap-4 mt-4">
            {stats.todayCount > 0 && (
              <span className="text-xs text-gray-500">
                🔥 <span className="text-gold-400 font-bold">{stats.todayCount}</span> {t('jeCherche.block.todayCount')}
              </span>
            )}
            {stats.fulfilledCount > 0 && (
              <span className="text-xs text-gray-500">
                ✔️ <span className="text-green-400 font-bold">{stats.fulfilledCount}</span> {t('jeCherche.block.fulfilledCount')}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // few_results or scroll — compact inline version
  return (
    <div className="mt-6 rounded-xl border border-gray-700/60 bg-gray-800/40 px-4 py-4 flex items-center justify-between gap-4 animate-fade-in">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-tight">
          {t('jeCherche.block.compactTitle')}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{t('jeCherche.block.compactSubtitle')}</p>
      </div>
      <button
        onClick={onOpen}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-gold-400/10 border border-gold-400/30 hover:bg-gold-400/20 text-gold-400 font-bold rounded-xl text-xs transition-all duration-200 hover:scale-105 active:scale-95"
      >
        <span>🔍</span>
        {t('jeCherche.block.cta')}
      </button>
    </div>
  );
};
