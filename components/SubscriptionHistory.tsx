/**
 * NUNULIA — Historique des paiements d'abonnement (Lot D, audit A6)
 *
 * Liste les demandes passées (approuvées / refusées / annulées) du vendeur
 * avec montant, période, date et lien reçu PDF. Données déjà présentes dans
 * `subscriptionRequests` — aucun backend. Affiché sur PlansPage sous les
 * demandes en cours.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ChevronDown } from 'lucide-react';
import { SubscriptionRequest } from '../types';

const VISIBLE_DEFAULT = 5;

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  approved:  { label: 'Payé',    color: '#059669', bg: 'rgba(16,185,129,0.1)' },
  rejected:  { label: 'Refusé',  color: '#DC2626', bg: 'rgba(239,68,68,0.08)' },
  cancelled: { label: 'Annulé',  color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
};

function periodLabel(period?: string): string {
  if (period === '3m') return '3 mois';
  if (period === '12m') return '12 mois';
  return '30 jours';
}

export const SubscriptionHistory: React.FC<{ requests: SubscriptionRequest[] }> = ({ requests }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const past = useMemo(
    () => requests
      .filter(r => r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled')
      .sort((a, b) => b.createdAt - a.createdAt),
    [requests],
  );

  if (past.length === 0) return null;

  const visible = expanded ? past : past.slice(0, VISIBLE_DEFAULT);

  return (
    <div className="px-4 mt-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
        {t('plans.historyTitle', 'Mes paiements')}
      </p>
      <div className="rounded-2xl overflow-hidden bg-white border border-black/[0.07] shadow-sm">
        {visible.map((req, i) => {
          const style = STATUS_STYLE[req.status] ?? STATUS_STYLE.cancelled;
          const date = new Date(req.updatedAt || req.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit', month: 'short', year: 'numeric',
          });
          return (
            <React.Fragment key={req.id}>
              {i > 0 && <div className="h-px ml-3.5" style={{ background: 'rgba(0,0,0,0.05)' }} />}
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">
                    {req.planLabel}
                    <span className="text-gray-400 font-medium"> · {periodLabel(req.period)}</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{date}</p>
                </div>
                <p
                  className="text-xs font-black text-gray-800 flex-shrink-0"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {req.amount.toLocaleString('fr-FR')} <span className="text-[9px] text-gray-400 font-bold">{req.currency}</span>
                </p>
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color: style.color, background: style.bg }}
                >
                  {t(`plans.historyStatus_${req.status}`, style.label)}
                </span>
                {req.status === 'approved' && req.receiptUrl ? (
                  <a
                    href={req.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('plans.historyReceipt', 'Télécharger le reçu')}
                    className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                  >
                    <FileText size={13} color="#3B82F6" />
                  </a>
                ) : (
                  <span className="w-7 flex-shrink-0" aria-hidden />
                )}
              </div>
            </React.Fragment>
          );
        })}
        {past.length > VISIBLE_DEFAULT && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-400
                       border-t border-black/[0.05] active:bg-gray-50 transition-colors"
          >
            {expanded
              ? t('plans.historyLess', 'Voir moins')
              : t('plans.historyMore', 'Voir tout ({{count}})', { count: past.length })}
            <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
          </button>
        )}
      </div>
    </div>
  );
};

export default SubscriptionHistory;
