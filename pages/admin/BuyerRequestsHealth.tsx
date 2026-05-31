/**
 * NUNULIA — Admin: Santé "Je Cherche"
 *
 * Dashboard opérationnel pour piloter la feature buyer requests.
 * 6 métriques V1 100% mesurables à partir des données existantes,
 * aucun index Firestore supplémentaire requis.
 *
 * Métriques :
 *  1. Volume (30j, par jour + cumul + croissance)
 *  2. Modération IA (legit / borderline / volume rejeté en log)
 *  3. Top sellers cliquants (par nombre de clics WhatsApp)
 *  4. Latence demande → 1er clic (médiane, p75, p90)
 *  5. Demandes sans aucun clic après 24h (catégories désertées)
 *  6. WhatsApp les plus actifs (abuseurs potentiels)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BuyerRequest, BuyerRequestContact, User } from '../../types';
import {
  getRecentRequestsForHealth,
  getRecentContactsForHealth,
} from '../../services/firebase/buyer-requests';
import { AdminSharedProps } from './types';

interface Props extends AdminSharedProps {
  users: User[];
}

const DAYS_BACK = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const BuyerRequestsHealth: React.FC<Props> = ({ users }) => {
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [contacts, setContacts] = useState<BuyerRequestContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const sellersById = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  const load = async () => {
    setLoading(true);
    try {
      const [reqs, cts] = await Promise.all([
        getRecentRequestsForHealth(DAYS_BACK),
        getRecentContactsForHealth(DAYS_BACK),
      ]);
      setRequests(reqs);
      setContacts(cts);
      setLastLoadedAt(Date.now());
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Métrique 1 : volume ──────────────────────────────────────────────
  const volumeStats = useMemo(() => {
    const now = Date.now();
    const today = requests.filter(r => now - r.createdAt < ONE_DAY_MS).length;
    const thisWeek = requests.filter(r => now - r.createdAt < 7 * ONE_DAY_MS).length;
    const previousWeek = requests.filter(r => {
      const age = now - r.createdAt;
      return age >= 7 * ONE_DAY_MS && age < 14 * ONE_DAY_MS;
    }).length;
    const growthWoW = previousWeek === 0
      ? (thisWeek > 0 ? Infinity : 0)
      : ((thisWeek - previousWeek) / previousWeek) * 100;

    // Histogramme par jour (J-29 → J)
    const byDay: { date: string; count: number }[] = [];
    for (let i = DAYS_BACK - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * ONE_DAY_MS;
      const dayEnd = now - i * ONE_DAY_MS;
      const count = requests.filter(r => r.createdAt >= dayStart && r.createdAt < dayEnd).length;
      const d = new Date(dayEnd);
      byDay.push({
        date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        count,
      });
    }
    const maxDayCount = Math.max(1, ...byDay.map(d => d.count));

    return {
      total: requests.length,
      today,
      thisWeek,
      previousWeek,
      growthWoW,
      byDay,
      maxDayCount,
    };
  }, [requests]);

  // ── Métrique 2 : modération ──────────────────────────────────────────
  const moderationStats = useMemo(() => {
    const total = requests.length;
    const borderline = requests.filter(r => r.moderationFlag === true).length;
    const legit = total - borderline;
    return {
      total,
      legit,
      borderline,
      legitPct: total === 0 ? 0 : (legit / total) * 100,
      borderlinePct: total === 0 ? 0 : (borderline / total) * 100,
    };
  }, [requests]);

  // ── Métrique 3 : top sellers cliquants ───────────────────────────────
  const topSellers = useMemo(() => {
    const bySeller = new Map<string, { count: number; uniqueRequests: Set<string> }>();
    contacts.forEach(c => {
      const entry = bySeller.get(c.sellerId) || { count: 0, uniqueRequests: new Set() };
      entry.count++;
      entry.uniqueRequests.add(c.requestId);
      bySeller.set(c.sellerId, entry);
    });
    return Array.from(bySeller.entries())
      .map(([sellerId, v]) => {
        const u = sellersById.get(sellerId);
        return {
          sellerId,
          name: u?.sellerDetails?.shopName || u?.name || 'Vendeur inconnu',
          count: v.count,
          uniqueRequests: v.uniqueRequests.size,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [contacts, sellersById]);

  // ── Métrique 4 : latence demande → 1er clic ──────────────────────────
  const latencyStats = useMemo(() => {
    const firstContactByRequest = new Map<string, number>();
    contacts.forEach(c => {
      const existing = firstContactByRequest.get(c.requestId);
      if (existing === undefined || c.timestamp < existing) {
        firstContactByRequest.set(c.requestId, c.timestamp);
      }
    });

    const latencies: number[] = [];
    requests.forEach(r => {
      const fc = firstContactByRequest.get(r.id);
      if (fc !== undefined && fc >= r.createdAt) {
        latencies.push(fc - r.createdAt);
      }
    });
    latencies.sort((a, b) => a - b);

    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return null;
      const idx = Math.floor((p / 100) * (arr.length - 1));
      return arr[idx];
    };

    return {
      count: latencies.length,
      median: percentile(latencies, 50),
      p75: percentile(latencies, 75),
      p90: percentile(latencies, 90),
    };
  }, [requests, contacts]);

  // ── Métrique 5 : demandes sans aucun clic après 24h ──────────────────
  const orphanRequests = useMemo(() => {
    const now = Date.now();
    const contactedRequestIds = new Set(contacts.map(c => c.requestId));
    const orphans = requests.filter(r =>
      r.contactCount === 0 &&
      !contactedRequestIds.has(r.id) &&
      now - r.createdAt > ONE_DAY_MS &&
      r.status === 'active'
    );

    const byCategory = new Map<string, number>();
    orphans.forEach(r => {
      const cat = r.category || '(sans catégorie)';
      byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
    });

    const byCategoryArr = Array.from(byCategory.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { total: orphans.length, byCategory: byCategoryArr };
  }, [requests, contacts]);

  // ── Métrique 6 : WhatsApp les plus actifs ────────────────────────────
  const topWhatsapp = useMemo(() => {
    const byWa = new Map<string, { count: number; titles: string[] }>();
    requests.forEach(r => {
      if (!r.whatsapp) return;
      const entry = byWa.get(r.whatsapp) || { count: 0, titles: [] };
      entry.count++;
      if (entry.titles.length < 3) entry.titles.push(r.title);
      byWa.set(r.whatsapp, entry);
    });
    return Array.from(byWa.entries())
      .map(([whatsapp, v]) => ({ whatsapp, count: v.count, titles: v.titles }))
      .filter(e => e.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [requests]);

  const formatLatency = (ms: number | null): string => {
    if (ms === null) return '—';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
    if (ms < 24 * 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
    return `${(ms / (24 * 3_600_000)).toFixed(1)}j`;
  };

  if (loading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white">📊 Santé "Je Cherche"</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {DAYS_BACK} derniers jours
            {lastLoadedAt && ` · MAJ ${new Date(lastLoadedAt).toLocaleTimeString('fr-FR')}`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-white border border-gray-700 rounded-lg disabled:opacity-50"
        >
          {loading ? '...' : '↻ Actualiser'}
        </button>
      </div>

      {/* Métrique 1 : Volume */}
      <section className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-4">📈 Volume des demandes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="Total 30j" value={volumeStats.total} />
          <Stat label="Aujourd'hui" value={volumeStats.today} accent="gold" />
          <Stat label="Cette semaine" value={volumeStats.thisWeek} />
          <Stat
            label="Croissance W/W"
            value={
              volumeStats.growthWoW === Infinity
                ? '+∞%'
                : `${volumeStats.growthWoW >= 0 ? '+' : ''}${volumeStats.growthWoW.toFixed(0)}%`
            }
            accent={volumeStats.growthWoW >= 0 ? 'green' : 'red'}
          />
        </div>
        {/* Mini histogramme */}
        <div className="flex items-end gap-0.5 h-20 bg-gray-900/40 rounded-lg p-2">
          {volumeStats.byDay.map((d, i) => (
            <div
              key={i}
              className="flex-1 bg-gold-400/60 hover:bg-gold-400 transition-colors rounded-sm relative group"
              style={{ height: `${(d.count / volumeStats.maxDayCount) * 100}%`, minHeight: d.count > 0 ? '4px' : '1px' }}
            >
              <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-950 text-[10px] text-white px-1.5 py-0.5 rounded whitespace-nowrap transition-opacity">
                {d.date} : {d.count}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1 px-1">
          <span>{volumeStats.byDay[0]?.date}</span>
          <span>{volumeStats.byDay[volumeStats.byDay.length - 1]?.date}</span>
        </div>
      </section>

      {/* Métrique 2 : Modération */}
      <section className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-4">🛡️ Modération IA Claude</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Legit" value={moderationStats.legit} sub={`${moderationStats.legitPct.toFixed(1)}%`} accent="green" />
          <Stat label="Borderline" value={moderationStats.borderline} sub={`${moderationStats.borderlinePct.toFixed(1)}%`} accent="orange" />
          <Stat label="Rejetées (logs Claude)" value="—" sub="cf. Cloud Logs" />
        </div>
        <p className="text-[11px] text-gray-500 mt-3 italic">
          Les demandes rejetées ne sont jamais persistées en Firestore.
          Pour les voir : Firebase Console → Functions → Logs → filtre <code className="bg-gray-900 px-1 rounded">[moderate] done</code>.
        </p>
      </section>

      {/* Métrique 3 : Top sellers cliquants */}
      <section className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-4">🏆 Top 10 sellers cliquants</h3>
        {topSellers.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Aucun clic WhatsApp enregistré sur la période.</p>
        ) : (
          <div className="space-y-2">
            {topSellers.map((s, i) => (
              <div key={s.sellerId} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-right text-gray-500 text-xs">{i + 1}.</span>
                <span className="flex-1 text-white truncate">{s.name}</span>
                <span className="text-xs text-gray-500 hidden sm:inline">
                  {s.uniqueRequests} demandes uniques
                </span>
                <span className="font-bold text-gold-400 text-xs px-2 py-0.5 bg-gold-500/10 rounded-full">
                  {s.count} clics
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Métrique 4 : Latence */}
      <section className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-4">⏱️ Latence demande → 1er clic seller</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Échantillon" value={latencyStats.count} sub="demandes contactées" />
          <Stat label="Médiane" value={formatLatency(latencyStats.median)} accent="green" />
          <Stat label="p75" value={formatLatency(latencyStats.p75)} />
          <Stat label="p90" value={formatLatency(latencyStats.p90)} accent={latencyStats.p90 && latencyStats.p90 > 4 * 3_600_000 ? 'orange' : 'green'} />
        </div>
        <p className="text-[11px] text-gray-500 mt-3 italic">
          Médiane &lt; 1h = excellent. p90 &gt; 4h = signal "trop de demandes lentes à servir".
        </p>
      </section>

      {/* Métrique 5 : Demandes orphelines */}
      <section className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-4">😶 Demandes sans aucun clic après 24h</h3>
        <div className="mb-4">
          <Stat label="Demandes orphelines actives" value={orphanRequests.total} accent={orphanRequests.total > 0 ? 'orange' : 'green'} />
        </div>
        {orphanRequests.byCategory.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2 font-bold uppercase">Catégories désertées</p>
            <div className="space-y-1.5">
              {orphanRequests.byCategory.map(c => (
                <div key={c.category} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-gray-300 truncate">{c.category}</span>
                  <span className="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded-full font-bold">
                    {c.count} orphelines
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-3 italic">
              Signal : il manque des sellers Pro actifs dans ces catégories.
            </p>
          </div>
        )}
      </section>

      {/* Métrique 6 : Top WhatsApp */}
      <section className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-4">📱 Top WhatsApp les plus actifs</h3>
        {topWhatsapp.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Aucun numéro avec plus d'une demande sur la période.</p>
        ) : (
          <div className="space-y-2">
            {topWhatsapp.map(w => (
              <div key={w.whatsapp} className="flex items-start gap-3 text-sm">
                <span
                  className={`font-bold text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    w.count >= 3
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-gray-700/50 text-gray-400'
                  }`}
                >
                  {w.count}
                </span>
                <div className="flex-1 min-w-0">
                  <code className="text-xs font-mono text-gray-300">{w.whatsapp}</code>
                  <p className="text-[11px] text-gray-500 truncate">{w.titles.join(' · ')}</p>
                </div>
                <a
                  href={`https://wa.me/${w.whatsapp.replace(/[^0-9+]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-green-400 border border-green-600/30 px-2 py-1 rounded-lg hover:bg-green-600/10 transition-colors shrink-0"
                >
                  WhatsApp
                </a>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-500 mt-3 italic">
          ⚠️ Plage rouge = numéro suspect de spam (≥3 demandes / période).
          Le rate limit bloque déjà ≥3/24h, donc ces cas ont étalé leurs demandes.
        </p>
      </section>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  accent = 'default',
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: 'default' | 'gold' | 'green' | 'orange' | 'red';
}) {
  const colors = {
    default: 'text-white',
    gold: 'text-gold-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  } as const;
  return (
    <div className="bg-gray-900/40 border border-gray-700/30 rounded-xl p-3 text-center">
      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{label}</p>
      <p className={`text-xl font-black ${colors[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
