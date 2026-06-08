/**
 * NUNULIA — Admin : Intelligence commerciale (Deal Loop)
 *
 * Panneau lecture seule alimenté par la CF admin getDealLoopStats. Transforme
 * les contactEvents bruts en signaux actionnables :
 *   - KPIs : contacts, ventes confirmées, taux de conversion, GMV estimé
 *   - Funnel Contacts → Mûrs → Répondu → Vendu
 *   - 🚩 Vendeurs à surveiller (beaucoup de contacts mûrs, 0 vente)
 *   - ⭐ Champions  ·  📈 Demande non convertie
 *   - Sparkline 14 jours
 *
 * Auto-suffisant : récupère ses données seul, se masque proprement si la CF
 * est indisponible. Textes en français (outil interne admin).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, ShoppingBag, Percent, Coins, RefreshCw,
  AlertTriangle, Trophy, Flame, Loader2,
} from 'lucide-react';
import { getDealLoopStats, type DealLoopStats } from '../../services/firebase/deal-loop';

const nf = new Intl.NumberFormat('fr-FR');
const pct = (x: number) => `${Math.round(x * 100)}%`;

function formatGmv(gmv: Record<string, number>): string {
  const parts = Object.entries(gmv)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cur, v]) => `${nf.format(Math.round(v))} ${cur}`);
  return parts.length ? parts.join(' · ') : '—';
}

const KpiCard: React.FC<{
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}> = ({ icon, label, value, sub, accent }) => (
  <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
      <span className={accent}>{icon}</span>
      <h4 className="text-[11px] font-bold uppercase tracking-wide">{label}</h4>
    </div>
    <p className={`text-2xl font-black ${accent}`}>{value}</p>
    {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

export const DealLoopInsights: React.FC = () => {
  const [stats, setStats] = useState<DealLoopStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const data = await getDealLoopStats();
    if (data) setStats(data);
    else setFailed(true);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-400" size={22} />
      </div>
    );
  }
  if (failed || !stats) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-gray-300 font-bold">💼 Intelligence commerciale</h3>
          <button onClick={load} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
            <RefreshCw size={12} /> Réessayer
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Indisponible pour le moment.</p>
      </div>
    );
  }

  const k = stats.kpis;
  const hasData = k.contacts > 0;
  const maxFunnel = Math.max(...stats.funnel.map(f => f.count), 1);
  const maxDay = Math.max(...stats.series14d.map(d => d.contacts), 1);
  const funnelLabels: Record<string, string> = {
    contacts: 'Contacts', matured: 'Mûrs (>48h)', responded: 'Ont répondu', sold: 'Vendu ✅',
  };

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-black text-lg flex items-center gap-2">
            💼 Intelligence commerciale
          </h3>
          <p className="text-[11px] text-gray-500">
            Deal Loop · {stats.periodDays} derniers jours{stats.capped ? ' (échantillon plafonné)' : ''}
          </p>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors" aria-label="Rafraîchir">
          <RefreshCw size={15} />
        </button>
      </div>

      {!hasData ? (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm font-semibold">Aucun contact enregistré pour l'instant.</p>
          <p className="text-gray-600 text-xs mt-1">
            La capture démarre dès qu'un acheteur clique « Contacter sur WhatsApp ».
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={<TrendingUp size={13} />} accent="text-blue-400"
              label="Contacts" value={nf.format(k.contacts)} sub={`${nf.format(k.clicks)} clics`} />
            <KpiCard icon={<ShoppingBag size={13} />} accent="text-green-400"
              label="Ventes confirmées" value={nf.format(k.sold)} sub={`${nf.format(k.awaiting)} en attente`} />
            <KpiCard icon={<Percent size={13} />} accent="text-gold-400"
              label="Conversion" value={pct(k.conversionResponded)}
              sub={`sur ${nf.format(k.responded)} réponses`} />
            <KpiCard icon={<Coins size={13} />} accent="text-emerald-400"
              label="GMV estimé" value={formatGmv(stats.gmvByCurrency)} sub="ventes confirmées" />
          </div>

          {/* Funnel */}
          <div className="bg-gray-950/50 rounded-xl border border-gray-800 p-4">
            <h4 className="text-[11px] font-bold uppercase text-gray-500 mb-3">Funnel de conversion</h4>
            <div className="space-y-2">
              {stats.funnel.map(f => (
                <div key={f.stage} className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-400 w-24 shrink-0">{funnelLabels[f.stage] || f.stage}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${f.stage === 'sold' ? 'bg-green-500' : 'bg-blue-500/70'}`}
                      style={{ width: `${Math.max((f.count / maxFunnel) * 100, f.count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-bold text-white w-12 text-right shrink-0">{nf.format(f.count)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sparkline 14j */}
          <div className="bg-gray-950/50 rounded-xl border border-gray-800 p-4">
            <h4 className="text-[11px] font-bold uppercase text-gray-500 mb-3">Contacts · 14 jours</h4>
            <div className="flex items-end gap-1 h-16">
              {stats.series14d.map(d => (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.day} : ${d.contacts}`}>
                  <div
                    className="w-full bg-gold-400/80 rounded-sm"
                    style={{ height: `${Math.max((d.contacts / maxDay) * 100, d.contacts > 0 ? 8 : 2)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Watch + Champions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 🚩 À surveiller */}
            <div className="bg-red-500/5 rounded-xl border border-red-500/20 p-4">
              <h4 className="text-[12px] font-bold text-red-400 flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} /> Vendeurs à surveiller
              </h4>
              <p className="text-[10.5px] text-gray-500 mb-3">Contacts répétés (&gt;48h), aucune vente confirmée.</p>
              {stats.watchSellers.length === 0 ? (
                <p className="text-[12px] text-gray-600">Aucun signal. 👍</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.watchSellers.map(s => (
                    <li key={s.sellerUid} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-gray-200 truncate pr-2">{s.name}</span>
                      <span className="text-red-400 font-bold shrink-0">{s.matured} contacts · 0 vente</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ⭐ Champions */}
            <div className="bg-green-500/5 rounded-xl border border-green-500/20 p-4">
              <h4 className="text-[12px] font-bold text-green-400 flex items-center gap-1.5 mb-2">
                <Trophy size={13} /> Champions
              </h4>
              <p className="text-[10.5px] text-gray-500 mb-3">Meilleurs vendeurs par ventes confirmées.</p>
              {stats.champions.length === 0 ? (
                <p className="text-[12px] text-gray-600">Pas encore de vente confirmée.</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.champions.map((s, i) => (
                    <li key={s.sellerUid} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-gray-200 truncate pr-2">{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{s.name}</span>
                      <span className="text-green-400 font-bold shrink-0">{s.sold} {s.sold > 1 ? 'ventes' : 'vente'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 📈 Demande non convertie */}
          {stats.unmetDemand.length > 0 && (
            <div className="bg-gray-950/50 rounded-xl border border-gray-800 p-4">
              <h4 className="text-[12px] font-bold text-gold-400 flex items-center gap-1.5 mb-2">
                <Flame size={13} /> Demande non convertie
              </h4>
              <p className="text-[10.5px] text-gray-500 mb-3">Produits très demandés, sans vente confirmée — prix ? stock ? vendeur ?</p>
              <ul className="space-y-1.5">
                {stats.unmetDemand.map(p => (
                  <li key={p.productId} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-gray-200 truncate pr-2">{p.title}</span>
                    <span className="text-gold-400 font-bold shrink-0">{p.contacts} contacts</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};
