/**
 * NUNULIA — Admin: Demandes Clients
 *
 * Full moderation panel for buyer requests.
 * Stats, list, delete, status management.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BuyerRequest, BuyerRequestStatus } from '../../types';
import {
  getAllBuyerRequestsForAdmin,
  adminDeleteBuyerRequest,
  markRequestFulfilled,
  getBuyerRequestStats,
} from '../../services/firebase/buyer-requests';
import { AdminSharedProps } from './types';

const STATUS_COLORS: Record<BuyerRequestStatus, string> = {
  active:    'bg-green-500/20 text-green-400 border-green-500/30',
  fulfilled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  expired:   'bg-gray-700/40 text-gray-500 border-gray-600/30',
  deleted:   'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<BuyerRequestStatus, string> = {
  active:    'Active',
  fulfilled: 'Satisfaite',
  expired:   'Expirée',
  deleted:   'Supprimée',
};

export const BuyerRequestsAdmin: React.FC<AdminSharedProps> = ({ currentUser }) => {
  const { t } = useTranslation();

  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BuyerRequestStatus | 'all'>('all');
  const [stats, setStats] = useState<{ todayCount: number; fulfilledCount: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const totalRequests = requests.length;
  const activeCount   = requests.filter(r => r.status === 'active').length;
  const fulfilledCount = requests.filter(r => r.status === 'fulfilled').length;
  const totalContacts = requests.reduce((s, r) => s + r.contactCount, 0);

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

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'fulfilled', 'expired', 'deleted'] as const).map(s => (
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
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📭</p>
          <p>Aucune demande trouvée.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div
              key={r.id}
              className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {r.category && (
                    <span className="text-[10px] text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full">{r.category}</span>
                  )}
                </div>
                <p className="font-bold text-white text-sm truncate">{r.title}</p>
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
          ))}
        </div>
      )}
    </div>
  );
};
