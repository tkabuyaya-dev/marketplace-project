import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { SubscriptionRequest } from '../../types';
import {
  getAllSubscriptionRequests, approveSubscriptionRequest, rejectSubscriptionRequest,
} from '../../services/firebase';
import { INITIAL_COUNTRIES } from '../../constants';
import type { SubscriptionsProps } from './types';

export const Subscriptions: React.FC<SubscriptionsProps> = ({
  currentUser, refreshData,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [allSubRequests, setAllSubRequests] = useState<SubscriptionRequest[]>([]);
  const [subRequests, setSubRequests] = useState<SubscriptionRequest[]>([]);
  const [subRequestFilter, setSubRequestFilter] = useState<string>('all');
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectRequestReason, setRejectRequestReason] = useState('');

  const loadSubRequests = async () => {
    const requests = await getAllSubscriptionRequests();
    setAllSubRequests(requests);
  };

  useEffect(() => {
    if (subRequestFilter === 'all') {
      setSubRequests(allSubRequests);
    } else {
      setSubRequests(allSubRequests.filter(r => r.status === subRequestFilter));
    }
  }, [subRequestFilter, allSubRequests]);

  useEffect(() => {
    loadSubRequests();
  }, []);

  const handleApproveRequest = async (requestId: string, vendorId: string) => {
    try {
      // 1. Approve request in Firestore + update seller subscription details
      await approveSubscriptionRequest(requestId, currentUser.id);

      // 2. Call approveRenewal Cloud Function to reactivate inactive products
      //    and sync subscriptionExpiry (used by expireSellers cron)
      const token = import.meta.env.VITE_NUNULIA_ADMIN_TOKEN as string;
      const res = await fetch(
        'https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/approveRenewal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ vendorId }),
        }
      );
      if (!res.ok) {
        console.warn('[approveRenewal] Cloud Function returned', res.status);
      }

      toast(t('admin.subscriptionActivated'), 'success');
      loadSubRequests();
      refreshData();
    } catch (err) {
      toast(t('admin.approvalError'), 'error');
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectingRequestId || !rejectRequestReason.trim()) return;
    try {
      await rejectSubscriptionRequest(rejectingRequestId, rejectRequestReason.trim());
      toast(t('admin.requestRejected'), 'success');
      setRejectingRequestId(null);
      setRejectRequestReason('');
      loadSubRequests();
    } catch (err) {
      toast(t('admin.rejectionError'), 'error');
    }
  };

  const pendingRequestsCount = allSubRequests.filter(r => r.status === 'pending' || r.status === 'pending_validation').length;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getCountryFlag = (countryId: string) => {
    return INITIAL_COUNTRIES.find(c => c.id === countryId)?.flag || '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with pending count */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">
          {t('admin.subscriptionRequests')}
          {pendingRequestsCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRequestsCount}</span>
          )}
        </h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'pending_validation', 'approved', 'rejected'].map(f => (
          <button key={f} onClick={() => setSubRequestFilter(f)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
              subRequestFilter === f ? 'bg-gold-400/20 text-gold-400 border-gold-400/50' : 'text-gray-400 border-gray-700 hover:border-gray-500'
            }`}>
            {f === 'all' ? t('admin.requestFilterAll') : f === 'pending' ? t('admin.requestFilterPending') : f === 'pending_validation' ? t('admin.requestFilterPaymentSubmitted') : f === 'approved' ? t('admin.requestFilterApproved') : t('admin.requestFilterRejected')}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {subRequests.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">{subRequestFilter !== 'all' ? t('admin.noRequestsFiltered') : t('admin.noRequests')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subRequests.map(req => (
            <div key={req.id} className={`bg-gray-900 border rounded-xl p-4 ${
              req.status === 'pending_validation' ? 'border-blue-500/30' :
              req.status === 'pending' ? 'border-orange-500/30' :
              req.status === 'approved' ? 'border-green-500/30' :
              'border-red-500/30'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-bold text-sm">{req.sellerName}</span>
                    <span className="text-gray-500 text-xs">{getCountryFlag(req.countryId)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      req.status === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                      req.status === 'pending_validation' ? 'bg-blue-500/20 text-blue-400' :
                      req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {req.status === 'pending' ? t('admin.requestFilterPending') : req.status === 'pending_validation' ? t('admin.requestFilterPaymentSubmitted') : req.status === 'approved' ? t('admin.requestFilterApproved') : t('admin.requestFilterRejected')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>{t('admin.plan')}: <strong className="text-gold-400">{req.planLabel}</strong></span>
                    <span>{t('admin.amount')}: <strong className="text-white">{req.amount.toLocaleString()} {req.currency}</strong></span>
                    <span>{t('admin.maxProducts')}: <strong className="text-white">{req.maxProducts >= 99999 ? t('admin.unlimited') : req.maxProducts}</strong></span>
                    <span>{formatDate(req.createdAt)}</span>
                  </div>
                  {req.transactionRef && (
                    <p className="text-xs text-blue-400 mt-1">{t('admin.transactionRef', { ref: '' })} <span className="font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">{req.transactionRef}</span></p>
                  )}
                  {req.rejectionReason && (
                    <p className="text-xs text-red-400 mt-1">{t('admin.rejectionReason', { reason: req.rejectionReason })}</p>
                  )}
                </div>
                {(req.status === 'pending' || req.status === 'pending_validation') && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApproveRequest(req.id, req.userId)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500 transition-colors">
                      {t('admin.approve')}
                    </button>
                    <button onClick={() => { setRejectingRequestId(req.id); setRejectRequestReason(''); }}
                      className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors">
                      {t('admin.reject')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-white font-bold mb-3">{t('admin.rejectRequestTitle')}</h3>
            <textarea
              value={rejectRequestReason}
              onChange={e => setRejectRequestReason(e.target.value)}
              placeholder={t('admin.rejectRequestPlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-sm resize-none h-24 outline-none focus:border-red-500"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={handleRejectRequest} disabled={!rejectRequestReason.trim()}
                className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {t('admin.confirmRejectRequest')}
              </button>
              <button onClick={() => setRejectingRequestId(null)}
                className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm border border-gray-700">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
