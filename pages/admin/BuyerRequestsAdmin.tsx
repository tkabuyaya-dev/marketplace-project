/**
 * NUNULIA — Admin: Demandes Clients
 *
 * Full moderation panel for buyer requests.
 * Stats, list, delete, status management.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BuyerRequest, BuyerRequestStatus, BuyerRequestFlag } from '../../types';
import {
  getAllBuyerRequestsForAdmin,
  adminDeleteBuyerRequest,
  markRequestFulfilled,
  getBuyerRequestStats,
  clearModerationFlag,
  getFlagsForRequest,
  restoreBuyerRequest,
} from '../../services/firebase/buyer-requests';
import { AdminSharedProps } from './types';
import { buildWaUrl } from '../../config/whatsapp.config';

type ModerationFilter = 'all' | 'borderline';
const FLAG_REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  illegal: 'Illégal',
  scam: 'Arnaque',
  fake_number: 'Faux WhatsApp',
  other: 'Autre',
};

const STATUS_COLORS: Record<BuyerRequestStatus, string> = {
  active:               'bg-green-500/20 text-green-400 border-green-500/30',
  fulfilled:            'bg-blue-500/20 text-blue-400 border-blue-500/30',
  expired:              'bg-gray-700/40 text-gray-500 border-gray-600/30',
  deleted:              'bg-red-500/20 text-red-400 border-red-500/30',
  suspended:            'bg-red-600/30 text-red-300 border-red-600/40',
  pending_confirmation: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const STATUS_LABELS: Record<BuyerRequestStatus, string> = {
  active:               'Active',
  fulfilled:            'Satisfaite',
  expired:              'Expirée',
  deleted:              'Supprimée',
  suspended:            '🚩 Signalée',
  pending_confirmation: '⏳ À confirmer',
};

export const BuyerRequestsAdmin: React.FC<AdminSharedProps> = ({ currentUser }) => {
  const { t } = useTranslation();

  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BuyerRequestStatus | 'all'>('all');
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>('all');
  const [stats, setStats] = useState<{ todayCount: number; fulfilledCount: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [clearingFlagId, setClearingFlagId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedFlagsId, setExpandedFlagsId] = useState<string | null>(null);
  const [flagsByRequest, setFlagsByRequest] = useState<Record<string, BuyerRequestFlag[]>>({});
  const [loadingFlags, setLoadingFlags] = useState<string | null>(null);
  const [spamPanelOpen, setSpamPanelOpen] = useState(true);

  // Spam detection: same WhatsApp > 5 requests in the last 24h across all loaded requests
  const spamAlerts = useMemo(() => {
    const now = Date.now();
    const window24h = 24 * 60 * 60 * 1000;
    const counts: Record<string, { count: number; requests: typeof requests }> = {};
    requests.forEach(r => {
      if (!r.whatsapp) return;
      if (now - r.createdAt > window24h) return;
      if (!counts[r.whatsapp]) counts[r.whatsapp] = { count: 0, requests: [] };
      counts[r.whatsapp].count++;
      counts[r.whatsapp].requests.push(r);
    });
    return Object.entries(counts)
      .filter(([, v]) => v.count > 5)
      .map(([whatsapp, v]) => ({ whatsapp, count: v.count, requests: v.requests }))
      .sort((a, b) => b.count - a.count);
  }, [requests]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { requests: data } = await getAllBuyerRequestsForAdmin(statusFilter);
      setRequests(data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const s = await getBuyerRequestStats();
      setStats(s);
    } catch { /* silent */ }
  };

  useEffect(() => {
    loadRequests();
    loadStats();
  }, [statusFilter]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await adminDeleteBuyerRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      /* silent */
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleFulfill = async (id: string) => {
    try {
      await markRequestFulfilled(id);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'fulfilled' as BuyerRequestStatus } : r));
    } catch { /* silent */ }
  };

  const handleClearFlag = async (id: string) => {
    setClearingFlagId(id);
    try {
      await clearModerationFlag(id);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, moderationFlag: undefined } : r));
    } catch {
      /* silent */
    } finally {
      setClearingFlagId(null);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await restoreBuyerRequest(id);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'active' as BuyerRequestStatus } : r));
    } catch {
      /* silent */
    } finally {
      setRestoringId(null);
    }
  };

  const toggleFlagsDetail = async (id: string) => {
    if (expandedFlagsId === id) {
      setExpandedFlagsId(null);
      return;
    }
    setExpandedFlagsId(id);
    if (!flagsByRequest[id]) {
      setLoadingFlags(id);
      try {
        const flags = await getFlagsForRequest(id);
        setFlagsByRequest(prev => ({ ...prev, [id]: flags }));
      } catch {
        /* silent */
      } finally {
        setLoadingFlags(null);
      }
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const visibleRequests = useMemo(() => (
    moderationFilter === 'borderline'
      ? requests.filter(r => r.moderationFlag === true)
      : requests
  ), [requests, moderationFilter]);

  const totalRequests = requests.length;
  const activeCount   = requests.filter(r => r.status === 'active').length;
  const fulfilledCount = requests.filter(r => r.status === 'fulfilled').length;
  const totalContacts = requests.reduce((s, r) => s + r.contactCount, 0);
  const borderlineCount = requests.filter(r => r.moderationFlag === true).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: totalRequests, color: 'gray' },
          { label: 'Actives', value: activeCount, color: 'green' },
          { label: 'Satisfaites', value: fulfilledCount, color: 'blue' },
          { label: 'Contacts WA', value: totalContacts, color: 'gold' },
        ].map(s => (
          <div key={s.label} className={`bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-center`}>
            <p className="text-xs text-gray-500 font-bold uppercase mb-1">{s.label}</p>
            <p className="text-2xl font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Today's live stats */}
      {stats && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>🔥 <span className="text-gold-400 font-bold">{stats.todayCount}</span> demandes aujourd'hui</span>
          <span>✔️ <span className="text-green-400 font-bold">{stats.fulfilledCount}</span> satisfaites au total</span>
        </div>
      )}

      {/* Spam alerts */}
      {spamAlerts.length > 0 && (
        <div className="bg-red-950/40 border border-red-700/40 rounded-2xl overflow-hidden">
          <button
            onClick={() => setSpamPanelOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-900/20 transition-colors"
          >
            <span className="text-lg">🚨</span>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-red-400">
                {t('admin.spamAlertTitle', { count: spamAlerts.length })}
              </p>
              <p className="text-xs text-red-500/70">{t('admin.spamAlertSubtitle')}</p>
            </div>
            <span className="text-red-500 text-xs">{spamPanelOpen ? '▲' : '▼'}</span>
          </button>

          {spamPanelOpen && (
            <div className="border-t border-red-800/30 divide-y divide-red-900/30">
              {spamAlerts.map(alert => (
                <div key={alert.whatsapp} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-red-300 font-bold">{alert.whatsapp}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/30 text-red-400 border border-red-600/40">
                        {t('admin.spamCount', { count: alert.count })}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {alert.requests.slice(0, 5).map(r => (
                        <span key={r.id} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md truncate max-w-[160px]">
                          {r.title}
                        </span>
                      ))}
                      {alert.requests.length > 5 && (
                        <span className="text-[10px] text-gray-600">+{alert.requests.length - 5}</span>
                      )}
                    </div>
                  </div>
                  <a
                    href={buildWaUrl(undefined, { phone: alert.whatsapp })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-[10px] text-green-400 border border-green-600/30 px-2 py-1 rounded-lg hover:bg-green-600/10 transition-colors"
                  >
                    WhatsApp
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        {(['all', 'active', 'fulfilled', 'expired', 'deleted', 'suspended'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
              statusFilter === s
                ? 'bg-gray-700 text-white border border-gray-600'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {s === 'all' ? 'Tout' : STATUS_LABELS[s]}
          </button>
        ))}

        <span className="text-gray-700">|</span>

        <button
          onClick={() => setModerationFilter(moderationFilter === 'borderline' ? 'all' : 'borderline')}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border ${
            moderationFilter === 'borderline'
              ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
              : 'text-orange-400/70 hover:text-orange-300 border-orange-500/20'
          }`}
        >
          🟠 Borderline {borderlineCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-orange-500/30">{borderlineCount}</span>}
        </button>

        <button
          onClick={loadRequests}
          className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-white border border-gray-700 rounded-lg transition-colors"
        >
          ↻ Actualiser
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-800/40 rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📭</p>
          <p>Aucune demande trouvée.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map(r => (
            <div
              key={r.id}
              className={`bg-gray-800/40 border rounded-xl p-4 ${
                r.status === 'suspended'
                  ? 'border-red-500/40 bg-red-950/20'
                  : r.moderationFlag
                    ? 'border-orange-500/40 bg-orange-950/10'
                    : 'border-gray-700/50'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {r.category && (
                    <span className="text-[10px] text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full">{r.category}</span>
                  )}
                  {r.moderationFlag && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40"
                      title={r.moderationReason || 'À vérifier'}
                    >
                      🟠 Borderline
                    </span>
                  )}
                </div>
                <p className="font-bold text-white text-sm truncate">{r.title}</p>
                {r.moderationFlag && r.moderationReason && (
                  <p className="text-[11px] text-orange-300/80 italic mt-0.5">
                    🤖 IA : {r.moderationReason}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                  <span>📍 {r.city}, {r.province}</span>
                  <span>👤 {r.buyerName}</span>
                  <span>📅 {formatDate(r.createdAt)}</span>
                  <span>📱 {r.whatsapp}</span>
                  <span>👁 {r.viewCount} vues · 📞 {r.contactCount} contacts</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {r.moderationFlag && (
                  <button
                    onClick={() => handleClearFlag(r.id)}
                    disabled={clearingFlagId === r.id}
                    className="px-3 py-1.5 text-xs text-orange-300 border border-orange-400/30 rounded-lg hover:bg-orange-400/10 transition-colors font-bold disabled:opacity-50"
                  >
                    {clearingFlagId === r.id ? '...' : '✅ Valider'}
                  </button>
                )}
                {r.status === 'suspended' && (
                  <>
                    <button
                      onClick={() => toggleFlagsDetail(r.id)}
                      className="px-3 py-1.5 text-xs text-red-300 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors font-bold"
                    >
                      {expandedFlagsId === r.id ? '▲ Masquer' : '▼ Signalements'}
                    </button>
                    <button
                      onClick={() => handleRestore(r.id)}
                      disabled={restoringId === r.id}
                      className="px-3 py-1.5 text-xs text-green-400 border border-green-400/30 rounded-lg hover:bg-green-400/10 transition-colors font-bold disabled:opacity-50"
                    >
                      {restoringId === r.id ? '...' : '↩ Restaurer'}
                    </button>
                  </>
                )}
                {r.status === 'active' && (
                  <button
                    onClick={() => handleFulfill(r.id)}
                    className="px-3 py-1.5 text-xs text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors font-bold"
                  >
                    ✅ Satisfaite
                  </button>
                )}

                {confirmDeleteId === r.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors font-bold disabled:opacity-50"
                    >
                      {deletingId === r.id ? '...' : 'Confirmer'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-1.5 text-xs text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(r.id)}
                    className="px-3 py-1.5 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors"
                  >
                    🗑 Supprimer
                  </button>
                )}
              </div>
              </div>

              {/* Détail des signalements community (status='suspended') */}
              {r.status === 'suspended' && expandedFlagsId === r.id && (
                <div className="mt-3 pt-3 border-t border-red-500/20 space-y-2">
                  <p className="text-[11px] font-bold text-red-300 uppercase tracking-wide">
                    🚩 Signalements community
                  </p>
                  {loadingFlags === r.id ? (
                    <div className="text-xs text-gray-500">Chargement…</div>
                  ) : !flagsByRequest[r.id] || flagsByRequest[r.id].length === 0 ? (
                    <div className="text-xs text-gray-500 italic">Aucun signalement trouvé.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {flagsByRequest[r.id].map(f => (
                        <div key={f.id} className="text-xs text-gray-300 flex flex-wrap items-baseline gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                            {FLAG_REASON_LABELS[f.reason] || f.reason}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">{f.sellerId.slice(0, 8)}…</span>
                          <span className="text-[10px] text-gray-500">{formatDate(f.createdAt)}</span>
                          {f.comment && (
                            <span className="text-[11px] text-gray-400 italic w-full">
                              💬 {f.comment}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
