/**
 * NUNULIA — Récapitulatif d'upgrade (Lot C, décision D1)
 *
 * Affiché à l'étape paiement de PlansPage quand le vendeur upgrade en cours
 * de cycle : le temps restant de son plan actuel est converti en jours
 * offerts sur le nouveau plan (prorata de valeur, calculé côté serveur à
 * l'approbation — ici une ESTIMATION d'affichage avec la même formule).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Gift } from 'lucide-react';

interface UpgradeRecapProps {
  /** Label du plan actuellement actif (ex. "Vendeur"). */
  currentLabel: string;
  /** Label du plan cible (ex. "Pro"). */
  newLabel: string;
  /** Jours restants sur le plan actuel. */
  remainingDays: number;
  /** Jours offerts estimés sur le nouveau plan (formule serveur, plafond 90). */
  creditDays: number;
  /** Timestamp ms estimé de la nouvelle expiration (durée choisie + crédit). */
  estimatedUntil: number;
}

export const UpgradeRecap: React.FC<UpgradeRecapProps> = ({
  currentLabel, newLabel, remainingDays, creditDays, estimatedUntil,
}) => {
  const { t } = useTranslation();

  const untilStr = new Date(estimatedUntil).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{ background: 'rgba(16,185,129,0.06)', border: '1.5px solid rgba(16,185,129,0.25)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(16,185,129,0.12)' }}
          aria-hidden
        >
          <Gift size={14} color="#059669" />
        </div>
        <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
          {t('plans.upgradeRecapTitle', 'Votre temps restant est converti')}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-bold text-gray-700">
          {t('plans.upgradeRecapFrom', '{{days}} j restants de {{plan}}', {
            days: remainingDays, plan: currentLabel,
          })}
        </span>
        <ArrowRight size={13} color="#059669" aria-hidden />
        <span
          className="text-[12px] font-black px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(16,185,129,0.12)', color: '#047857' }}
        >
          {creditDays > 0
            ? t('plans.upgradeRecapTo', '≈ {{days}} j de {{plan}} offerts', {
                days: creditDays, plan: newLabel,
              })
            : t('plans.upgradeRecapNone', 'Crédit calculé à la validation')}
        </span>
      </div>

      <p className="text-[10px] text-gray-500 mt-2 leading-snug">
        {t('plans.upgradeRecapUntil',
          'Nouveau plan actif jusqu\'au {{date}} (estimation — le crédit exact est appliqué à la validation du paiement et figure sur votre reçu).',
          { date: untilStr })}
      </p>
    </div>
  );
};

export default UpgradeRecap;
