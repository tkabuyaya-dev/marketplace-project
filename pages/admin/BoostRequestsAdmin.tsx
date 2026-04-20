/**
 * NUNULIA — Admin : Demandes de Boost
 *
 * Affiche toutes les demandes de mise en avant payante.
 * L'admin peut filtrer par statut, voir la référence de paiement,
 * activer ou rejeter chaque demande.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BoostRequest, BoostRequestStatus } from '../../types';
import {
  getAllBoostRequests,
  approveBoostRequest,
  rejectBoostRequest,
} from '../../services/firebase';
import { useToast } from '../../components/Toast';
import type { BoostRequestsAdminProps } from './types';

const STATUS_LABELS: Record<BoostRequestStatus, string> = {
  pending:            'En attente',
  pending_validation: 'À valider',
  approved:           'Activé',
  rejected:           'Refusé',
};

const STATUS_COLORS: Record<BoostRequestStatus, string> = {
  pending:            'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  pending_validation: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  approved:           'bg-green-500/20 text-green-300 border-green-500/30',
  rejected:           'bg-red-500/20 text-red-300 border-red-500/30',
};

const BOOST_DURATION_DAYS = 7;

export const BoostRequestsAdmin: React.FC<BoostRequestsAdminProps> = ({
  currentUser,
  refreshData,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [requests, setRequests]         = useState<BoostRequest[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<BoostRequestStatus | 'all'>('pending');
  const [rejectingId, setRejectingId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const all = await getAllBoostRequests();
      setRequests(all);
    } catch {
      toast(t('boost.admin.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  const pendingCount = requests.filter(r =>
    r.status === 'pending' || r.status === 'pending_validation'
  ).length;

  const handleApprove = async (request: BoostRequest) => {
    setActionLoading(request.id);
    try {
      await approveBoostRequest(request.id, currentUser.id);
      toast(t('boost.admin.approveSuccess', { title: request.productTitle }), 'success');
      await load();
      await refreshData();
    } catch (err: any) {
      toast(err.message || t('boost.admin.approveError'), 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (request: BoostRequest) => {
    if (!rejectReason.trim()) {
      toast(t('boost.admin.rejectReasonRequired'), 'error');
      return;
    }
    setActionLoading(request.id);
    try {
      await rejectBoostRequest(request.id, rejectReason.trim());
      toast(t('boost.admin.rejectSuccess'), 'success');
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch {
      toast(t('boost.admin.rejectError'), 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const formatExpiry = (startAt: number | null) => {
    if (!startAt) return '—';
    const exp = new Date(startAt + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000);
    return exp.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            🚀 {t('boost.admin.title')}
            {pendingCount > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('boost.admin.subtitle')}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? '⟳' : t('boost.admin.refresh')}
        </button>
      </div>

      {/* Filtres statut */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'pending_validation', 'approved', 'rejected', 'all'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              statusFilter === s
                ? 'bg-white text-gray-900 border-white'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
            }`}
          >
            {s === 'all' ? t('boost.admin.filterAll') : STATUS_LABELS[s]}
            {s !== 'all' && (
              <span className="ml-1.5 opacity-60">
                ({requests.filter(r => r.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-3xl mb-3">🚀</p>
          <p className="text-sm">{t('boost.admin.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(request => (
            <div
              key={request.id}
              className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 space-y-4"
            >
              {/* Row 1: Identité + statut */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-0.5">
                  <p className="text-white font-bold text-sm">{request.productTitle}</p>
                  <p className="text-gray-400 text-xs">{t('boost.admin.seller')} : {request.sellerName}</p>
                  <p className="text-gray-500 text-xs">{formatDate(request.createdAt)}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[request.status]}`}>
                  {STATUS_LABELS[request.status]}
                </span>
              </div>

              {/* Row 2: Paiement */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-black/30 rounded-xl px-3 py-2">
                  <p className="text-gray-500 mb-0.5">{t('boost.admin.amount')}</p>
                  <p className="text-gold-400 font-bold">{request.amount.toLocaleString()} {request.currency}</p>
                </div>
                <div className="bg-black/30 rounded-xl px-3 py-2">
                  <p className="text-gray-500 mb-0.5">{t('boost.admin.transactionRef')}</p>
                  <p className="text-white font-mono font-bold">
                    {request.transactionRef || <span className="text-gray-600 italic">{t('boost.admin.noRef')}</span>}
                  </p>
                </div>
                <div className="bg-black/30 rounded-xl px-3 py-2">
                  <p className="text-gray-500 mb-0.5">{t('boost.admin.duration')}</p>
                  <p className="text-white font-bold">
                    {request.status === 'approved'
                      ? `→ ${formatExpiry(request.boostStartAt)}`
                      : `${BOOST_DURATION_DAYS} jours`}
                  </p>
                </div>
              </div>

              {/* Row 3 : Actions */}
              {(request.status === 'pending' || request.status === 'pending_validation') && (
                <div className="flex flex-col gap-2 pt-1">
                  {rejectingId === request.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder={t('boost.admin.rejectReasonPlaceholder')}
                        className="w-full px-3 py-2 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 text-xs focus:border-red-400 outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(request)}
                          disabled={!!actionLoading}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
                        >
                          {actionLoading === request.id ? '...' : t('boost.admin.confirmReject')}
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason(''); }}
                          className="px-4 py-2 bg-gray-700 text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-600 transition-colors"
                        >
                          {t('boost.admin.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={!!actionLoading}
                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                      >
                        {actionLoading === request.id
                          ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : '✅'}
                        {t('boost.admin.approve')}
                      </button>
                      <button
                        onClick={() => setRejectingId(request.id)}
                        disabled={!!actionLoading}
                        className="px-4 py-2.5 bg-red-900/40 hover:bg-red-900/60 disabled:opacity-50 text-red-400 text-xs font-bold rounded-xl border border-red-500/30 transition-colors"
                      >
                        {t('boost.admin.reject')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Rejection reason display */}
              {request.status === 'rejected' && request.rejectionReason && (
                <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
                  <span className="font-bold">{t('boost.admin.rejectionReason')} :</span> {request.rejectionReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
