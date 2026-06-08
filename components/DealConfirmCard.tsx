/**
 * NUNULIA — Deal Loop : carte de confirmation de vente
 *
 * Affichée dans le dashboard vendeur quand l'URL contient `?deal=<eventId>`
 * (lien du push envoyé par dealLoopSweep à 48h). Le vendeur répond Oui/Non →
 * confirmDeal enregistre la réponse, puis la carte se retire et nettoie l'URL.
 *
 * Autonome : lit ses propres query params, n'a besoin d'aucune prop. À monter
 * une fois dans SellerDashboard.
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Loader2 } from 'lucide-react';
import { confirmDeal } from '../services/firebase/deal-loop';

export const DealConfirmCard: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState<'yes' | 'no' | null>(null);
  const [done, setDone] = useState(false);

  const eventId = searchParams.get('deal') || '';
  const productTitle = searchParams.get('pt') || '';

  if (!eventId) return null;

  const clearParams = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('deal');
    next.delete('pt');
    setSearchParams(next, { replace: true });
  };

  const answer = async (value: 'yes' | 'no') => {
    if (submitting) return;
    setSubmitting(value);
    await confirmDeal(eventId, value);
    setSubmitting(null);
    setDone(true);
    // Laisse le message de remerciement visible un instant, puis nettoie l'URL.
    setTimeout(clearParams, 1600);
  };

  return (
    <div className="mb-4 rounded-2xl border border-gold-400/40 bg-gold-50 dark:bg-gray-800/60 dark:border-gold-400/20 p-4 animate-fade-in">
      {done ? (
        <p className="text-sm font-semibold text-ink dark:text-white text-center">
          {t('dealLoop.thanks')}
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink dark:text-white mb-1">
            {t('dealLoop.question')}
          </p>
          {productTitle && (
            <p className="text-[13px] text-ink2 dark:text-gray-400 mb-3 truncate">
              « {productTitle} »
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => answer('yes')}
              disabled={submitting !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-input bg-emerald-600 text-white text-sm font-bold py-2.5 active:scale-[0.98] transition disabled:opacity-60"
            >
              {submitting === 'yes' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {t('dealLoop.yes')}
            </button>
            <button
              type="button"
              onClick={() => answer('no')}
              disabled={submitting !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-input bg-white dark:bg-gray-700 text-ink dark:text-white border border-black/10 dark:border-white/10 text-sm font-bold py-2.5 active:scale-[0.98] transition disabled:opacity-60"
            >
              {submitting === 'no' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
              {t('dealLoop.no')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
