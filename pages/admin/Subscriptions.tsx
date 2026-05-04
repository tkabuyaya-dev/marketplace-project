import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { SubscriptionRequest, User } from '../../types';
import {
  getAllSubscriptionRequests, approveSubscriptionRequest,
} from '../../services/firebase';
import { INITIAL_COUNTRIES, PAYMENT_METHODS } from '../../constants';
import { auth } from '../../firebase-config';
import type { SubscriptionsProps } from './types';

type SortKey = 'createdAt_desc' | 'createdAt_asc' | 'amount_desc' | 'amount_asc' | 'wait_desc';
type ExpiryWindow = 'all' | '3' | '7' | '15' | '30' | 'expired';

const DAY_MS = 1000 * 60 * 60 * 24;
const THIRTY_DAYS_MS = 30 * DAY_MS;

export const Subscriptions: React.FC<SubscriptionsProps> = ({
  currentUser, refreshData, users,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [allSubRequests, setAllSubRequests] = useState<SubscriptionRequest[]>([]);
  const [subRequestFilter, setSubRequestFilter] = useState<string>('all');
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectRequestReason, setRejectRequestReason] = useState('');

  // Advanced filters (file de validation)
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt_desc');

  // Expiry dashboard filter
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>('all');

  // Vendor 360° drawer
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [forcingRenewal, setForcingRenewal] = useState(false);

  // Approve confirmation modal (operator verification — methods are country-specific)
  const [approvingRequest, setApprovingRequest] = useState<SubscriptionRequest | null>(null);
  const [verifiedMethod, setVerifiedMethod] = useState<string>('');
  const [approving, setApproving] = useState(false);

  // Bulk approve (selection in the validation queue)
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMethod, setBulkMethod] = useState<string>('');
  const [bulkInProgress, setBulkInProgress] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, failed: 0 });

  const loadSubRequests = async () => {
    const requests = await getAllSubscriptionRequests();
    setAllSubRequests(requests);
  };

  useEffect(() => {
    loadSubRequests();
  }, []);

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = Date.now();
    const since30d = now - THIRTY_DAYS_MS;

    const pending = allSubRequests.filter(r => r.status === 'pending').length;
    const submitted = allSubRequests.filter(r => r.status === 'pending_validation').length;
    const approved30d = allSubRequests.filter(
      r => r.status === 'approved' && r.updatedAt >= since30d
    );
    // MRR proxy: sum of approved request amounts in the last 30 days, grouped
    // by currency (no FX conversion — admin reads each currency line separately).
    const mrrByCurrency: Record<string, number> = {};
    for (const r of approved30d) {
      mrrByCurrency[r.currency] = (mrrByCurrency[r.currency] ?? 0) + r.amount;
    }

    const paidSellers = users.filter(u =>
      u.role === 'seller' && (u.sellerDetails?.maxProducts ?? 0) > 5
    );
    const expiringSoon = paidSellers.filter(u => {
      const exp = u.sellerDetails?.subscriptionExpiresAt;
      return exp && exp > now && (exp - now) <= 7 * DAY_MS;
    }).length;
    const expired = paidSellers.filter(u => {
      const exp = u.sellerDetails?.subscriptionExpiresAt;
      return exp && exp <= now;
    }).length;

    return { pending, submitted, mrrByCurrency, expiringSoon, expired, paidTotal: paidSellers.length };
  }, [allSubRequests, users]);

  // Unique tier labels present in the dataset (drives the tier dropdown)
  const availableTiers = useMemo(
    () => Array.from(new Set(allSubRequests.map(r => r.planLabel))).sort(),
    [allSubRequests]
  );

  // ─── Filtering + sorting (validation queue) ────────────────────────────────
  const subRequests = useMemo(() => {
    let list = allSubRequests;

    if (subRequestFilter !== 'all') {
      list = list.filter(r => r.status === subRequestFilter);
    }
    if (countryFilter !== 'all') {
      list = list.filter(r => r.countryId === countryFilter);
    }
    if (tierFilter !== 'all') {
      list = list.filter(r => r.planLabel === tierFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r =>
        r.sellerName?.toLowerCase().includes(q) ||
        r.transactionRef?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'createdAt_asc':  return a.createdAt - b.createdAt;
        case 'amount_desc':    return b.amount - a.amount;
        case 'amount_asc':     return a.amount - b.amount;
        case 'wait_desc':      return a.createdAt - b.createdAt; // oldest first = longest wait
        case 'createdAt_desc':
        default:               return b.createdAt - a.createdAt;
      }
    });
    return sorted;
  }, [allSubRequests, subRequestFilter, countryFilter, tierFilter, searchQuery, sortKey]);

  const hasActiveAdvancedFilter =
    countryFilter !== 'all' || tierFilter !== 'all' || searchQuery.trim().length > 0;
  const clearAdvancedFilters = () => {
    setCountryFilter('all');
    setTierFilter('all');
    setSearchQuery('');
    setSortKey('createdAt_desc');
  };

  // ─── Expiry dashboard ──────────────────────────────────────────────────────
  const expirySellers = useMemo(() => {
    const now = Date.now();
    const paidSellers = users.filter(u =>
      u.role === 'seller'
      && (u.sellerDetails?.maxProducts ?? 0) > 5
      && u.sellerDetails?.subscriptionExpiresAt
    );

    let filtered: User[];
    switch (expiryWindow) {
      case 'expired':
        filtered = paidSellers.filter(u => (u.sellerDetails!.subscriptionExpiresAt!) <= now);
        break;
      case '3':
        filtered = paidSellers.filter(u => {
          const exp = u.sellerDetails!.subscriptionExpiresAt!;
          return exp > now && (exp - now) <= 3 * DAY_MS;
        });
        break;
      case '7':
        filtered = paidSellers.filter(u => {
          const exp = u.sellerDetails!.subscriptionExpiresAt!;
          return exp > now && (exp - now) <= 7 * DAY_MS;
        });
        break;
      case '15':
        filtered = paidSellers.filter(u => {
          const exp = u.sellerDetails!.subscriptionExpiresAt!;
          return exp > now && (exp - now) <= 15 * DAY_MS;
        });
        break;
      case '30':
        filtered = paidSellers.filter(u => {
          const exp = u.sellerDetails!.subscriptionExpiresAt!;
          return exp > now && (exp - now) <= 30 * DAY_MS;
        });
        break;
      case 'all':
      default:
        filtered = paidSellers;
    }

    // Sort by days remaining ascending (most urgent first)
    return [...filtered].sort((a, b) =>
      (a.sellerDetails!.subscriptionExpiresAt!) - (b.sellerDetails!.subscriptionExpiresAt!)
    );
  }, [users, expiryWindow]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const formatWait = (createdAt: number): string => {
    const ms = Date.now() - createdAt;
    const days = Math.floor(ms / DAY_MS);
    const hours = Math.floor((ms % DAY_MS) / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins} min`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getCountryFlag = (countryId: string) =>
    INITIAL_COUNTRIES.find(c => c.id === countryId)?.flag || '';

  const daysLeft = (expiresAt: number) => Math.ceil((expiresAt - Date.now()) / DAY_MS);

  // ─── Vendor 360° drawer data ───────────────────────────────────────────────
  const selectedVendor = useMemo(
    () => (selectedVendorId ? users.find(u => u.id === selectedVendorId) ?? null : null),
    [selectedVendorId, users]
  );

  const vendorRequests = useMemo(() => {
    if (!selectedVendorId) return [];
    return allSubRequests
      .filter(r => r.userId === selectedVendorId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [selectedVendorId, allSubRequests]);

  const vendorKpis = useMemo(() => {
    if (!selectedVendorId) return null;
    const approved = vendorRequests.filter(r => r.status === 'approved');
    const ltvByCurrency: Record<string, number> = {};
    for (const r of approved) {
      ltvByCurrency[r.currency] = (ltvByCurrency[r.currency] ?? 0) + r.amount;
    }
    return {
      totalRequests: vendorRequests.length,
      approvedCount: approved.length,
      rejectedCount: vendorRequests.filter(r => r.status === 'rejected').length,
      ltvByCurrency,
    };
  }, [selectedVendorId, vendorRequests]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Open the operator-verification modal for a given request */
  const openApproveModal = (req: SubscriptionRequest) => {
    setApprovingRequest(req);
    setVerifiedMethod('');
  };

  /**
   * Confirm approval after operator verification.
   * Two-step transaction:
   * 1. approveSubscriptionRequest (transactional, marks request approved + activates subscription)
   * 2. approveRenewal CF (reactivates inactive products + writes audit log with verifiedVia)
   */
  const handleApproveRequest = async () => {
    if (!approvingRequest || !verifiedMethod) return;
    setApproving(true);
    try {
      await approveSubscriptionRequest(approvingRequest.id, currentUser.id);

      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const res = await fetch(
        'https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/approveRenewal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            vendorId: approvingRequest.userId,
            requestId: approvingRequest.id,
            verifiedVia: verifiedMethod,
          }),
        }
      );
      if (!res.ok) {
        console.warn('[approveRenewal] Cloud Function returned', res.status);
      }

      toast(t('admin.subscriptionActivated'), 'success');
      setApprovingRequest(null);
      setVerifiedMethod('');
      loadSubRequests();
      refreshData();
    } catch (err) {
      toast(t('admin.approvalError'), 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectingRequestId || !rejectRequestReason.trim()) return;
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const res = await fetch(
        'https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/rejectSubscription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            requestId: rejectingRequestId,
            reason: rejectRequestReason.trim(),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      toast(t('admin.requestRejected'), 'success');
      setRejectingRequestId(null);
      setRejectRequestReason('');
      loadSubRequests();
    } catch (err) {
      console.error('[rejectSubscription] Error:', err);
      toast(t('admin.rejectionError'), 'error');
    }
  };

  // ─── Bulk approve helpers ──────────────────────────────────────────────────

  /** Requests currently selected for the bulk action — ordered as in the list */
  const selectedRequests = useMemo(
    () => subRequests.filter(r => selectedRequestIds.has(r.id) && r.status === 'pending_validation'),
    [subRequests, selectedRequestIds]
  );

  /** When all selected requests share the same country, propose its payment methods.
   *  Otherwise fall back to a single "admin_bulk" generic option. */
  const bulkCountryId = useMemo(() => {
    if (selectedRequests.length === 0) return null;
    const first = selectedRequests[0].countryId;
    return selectedRequests.every(r => r.countryId === first) ? first : null;
  }, [selectedRequests]);

  const bulkMethods = useMemo(() => {
    if (!bulkCountryId) return null;
    return PAYMENT_METHODS[bulkCountryId] || PAYMENT_METHODS['bi'];
  }, [bulkCountryId]);

  const toggleSelectRequest = (req: SubscriptionRequest) => {
    if (req.status !== 'pending_validation') return; // safety
    setSelectedRequestIds(prev => {
      const next = new Set(prev);
      if (next.has(req.id)) next.delete(req.id);
      else next.add(req.id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const ids = subRequests
      .filter(r => r.status === 'pending_validation')
      .map(r => r.id);
    setSelectedRequestIds(new Set(ids));
  };

  const clearSelection = () => setSelectedRequestIds(new Set());

  const openBulkModal = () => {
    if (selectedRequests.length === 0) return;
    setBulkMethod('');
    setBulkProgress({ done: 0, total: selectedRequests.length, failed: 0 });
    setBulkOpen(true);
  };

  const handleBulkApprove = async () => {
    if (selectedRequests.length === 0 || !bulkMethod) return;
    setBulkInProgress(true);
    setBulkProgress({ done: 0, total: selectedRequests.length, failed: 0 });

    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      // Sequential — keeps Firestore quota usage low and lets partial errors
      // surface cleanly. Each request runs the full 2-step flow:
      //   1. approveSubscriptionRequest (transactional)
      //   2. approveRenewal CF (audit log + product reactivation)
      let done = 0;
      let failed = 0;
      for (const req of selectedRequests) {
        try {
          await approveSubscriptionRequest(req.id, currentUser.id);
          const res = await fetch(
            'https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/approveRenewal',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                vendorId: req.userId,
                requestId: req.id,
                verifiedVia: bulkMethod,
              }),
            }
          );
          if (!res.ok) {
            console.warn('[bulkApprove] approveRenewal returned', res.status, 'for', req.id);
            failed++;
          }
          done++;
        } catch (err) {
          console.error('[bulkApprove] Failed for', req.id, err);
          failed++;
          done++;
        }
        setBulkProgress({ done, total: selectedRequests.length, failed });
      }

      const succeeded = done - failed;
      if (failed === 0) {
        toast(t('admin.subBulkAllOk', '{{count}} demande(s) approuvée(s)', { count: succeeded }), 'success');
      } else if (succeeded > 0) {
        toast(t('admin.subBulkPartial', '{{ok}} approuvée(s), {{ko}} échec(s)', { ok: succeeded, ko: failed }), 'error');
      } else {
        toast(t('admin.subBulkAllFail', 'Toutes les approbations ont échoué'), 'error');
      }

      clearSelection();
      setBulkOpen(false);
      loadSubRequests();
      refreshData();
    } catch (err) {
      console.error('[bulkApprove] Error:', err);
      toast(t('admin.subBulkError', 'Échec du traitement groupé'), 'error');
    } finally {
      setBulkInProgress(false);
    }
  };

  /**
   * Force-renew a vendor without a vendor-initiated request.
   * Used when payment was received out-of-band (e.g. cash, direct WhatsApp).
   * Bypasses approveSubscriptionRequest (no request to approve) — calls
   * approveRenewal directly with verifiedVia='admin_manual' so the audit log
   * captures it as an admin override.
   */
  const handleForceRenew = async (vendorId: string) => {
    if (!window.confirm(t('admin.subForceRenewConfirm', 'Renouveler ce vendeur de 30 jours sans demande client ?'))) return;
    setForcingRenewal(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const res = await fetch(
        'https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/approveRenewal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ vendorId, verifiedVia: 'admin_manual' }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      toast(t('admin.subForceRenewOk', 'Vendeur renouvelé pour 30 jours'), 'success');
      refreshData();
    } catch (err) {
      console.error('[forceRenew] Error:', err);
      toast(t('admin.subForceRenewError', 'Échec du renouvellement forcé'), 'error');
    } finally {
      setForcingRenewal(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in">

      {/* ════════════════════ SECTION 1 — KPIs ════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">
            {t('admin.subDashboardTitle', 'Tableau de bord abonnements')}
          </h2>
          <button
            onClick={loadSubRequests}
            className="text-xs text-blue-400 border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            ↻ {t('admin.refresh', 'Rafraîchir')}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* MRR */}
          <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-900/5 border border-yellow-600/20 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-yellow-400 font-bold mb-1">
              {t('admin.kpiMrr30d', 'Encaissé (30j)')}
            </p>
            {Object.keys(kpis.mrrByCurrency).length === 0 ? (
              <p className="text-xl font-black text-gray-500">—</p>
            ) : (
              <div className="space-y-0.5">
                {Object.entries(kpis.mrrByCurrency).map(([cur, amt]) => (
                  <p key={cur} className="text-sm font-black text-white tracking-tight leading-tight">
                    {amt.toLocaleString()} <span className="text-[10px] text-yellow-400">{cur}</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Pending validation (action immédiate) */}
          <button
            onClick={() => { setSubRequestFilter('pending_validation'); }}
            className="bg-gradient-to-br from-blue-900/20 to-blue-900/5 border border-blue-600/20 rounded-xl p-3 text-left hover:border-blue-500/40 transition-colors"
          >
            <p className="text-[10px] uppercase tracking-wider text-blue-400 font-bold mb-1">
              {t('admin.kpiToValidate', 'À valider')}
            </p>
            <p className="text-2xl font-black text-blue-300">{kpis.submitted}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {t('admin.kpiToValidateHint', 'Paiements soumis')}
            </p>
          </button>

          {/* Pending (no payment yet) */}
          <button
            onClick={() => { setSubRequestFilter('pending'); }}
            className="bg-gradient-to-br from-orange-900/20 to-orange-900/5 border border-orange-600/20 rounded-xl p-3 text-left hover:border-orange-500/40 transition-colors"
          >
            <p className="text-[10px] uppercase tracking-wider text-orange-400 font-bold mb-1">
              {t('admin.kpiPending', 'En attente')}
            </p>
            <p className="text-2xl font-black text-orange-300">{kpis.pending}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {t('admin.kpiPendingHint', 'Sans référence')}
            </p>
          </button>

          {/* Expiring soon (≤7d) */}
          <button
            onClick={() => setExpiryWindow('7')}
            className="bg-gradient-to-br from-amber-900/20 to-amber-900/5 border border-amber-600/20 rounded-xl p-3 text-left hover:border-amber-500/40 transition-colors"
          >
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
              {t('admin.kpiExpiringSoon', 'Expirent ≤7j')}
            </p>
            <p className="text-2xl font-black text-amber-300">{kpis.expiringSoon}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {t('admin.kpiExpiringSoonHint', 'Vendeurs payants')}
            </p>
          </button>

          {/* Expired */}
          <button
            onClick={() => setExpiryWindow('expired')}
            className="bg-gradient-to-br from-red-900/20 to-red-900/5 border border-red-600/20 rounded-xl p-3 text-left hover:border-red-500/40 transition-colors"
          >
            <p className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">
              {t('admin.kpiExpired', 'Expirés')}
            </p>
            <p className="text-2xl font-black text-red-300">{kpis.expired}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {t('admin.kpiExpiredHint', 'À relancer')}
            </p>
          </button>
        </div>
      </section>

      {/* ════════════════════ SECTION 2 — File de validation ════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white">
            {t('admin.subQueueTitle', 'File de validation')}
          </h3>
          {kpis.submitted + kpis.pending > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {kpis.submitted + kpis.pending}
            </span>
          )}
        </div>

        {/* Status filters */}
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

        {/* Advanced filters: search + country + tier + sort */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('admin.subSearchPlaceholder', 'Rechercher par vendeur ou référence de transaction…')}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-blue-500"
            >
              <option value="all">{t('admin.allCountries')}</option>
              {INITIAL_COUNTRIES.map(c => (
                <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
              ))}
            </select>
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-blue-500"
            >
              <option value="all">{t('admin.subAllTiers', 'Tous les plans')}</option>
              {availableTiers.map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-blue-500"
            >
              <option value="createdAt_desc">{t('admin.subSortRecent', '↓ Plus récentes')}</option>
              <option value="createdAt_asc">{t('admin.subSortOldest', '↑ Plus anciennes')}</option>
              <option value="wait_desc">{t('admin.subSortWait', '⏱ Plus longue attente')}</option>
              <option value="amount_desc">{t('admin.subSortAmountDesc', '↓ Montant')}</option>
              <option value="amount_asc">{t('admin.subSortAmountAsc', '↑ Montant')}</option>
            </select>
            {hasActiveAdvancedFilter && (
              <button
                onClick={clearAdvancedFilters}
                className="ml-auto text-xs text-gray-400 hover:text-red-400 underline"
              >
                {t('admin.filterClearAll')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] text-gray-500 flex-1">
              {t('admin.subResultCount', '{{count}} demande(s) affichée(s)', { count: subRequests.length })}
            </p>
            {/* Bulk select toggle — only meaningful when at least one pending_validation is visible */}
            {subRequests.some(r => r.status === 'pending_validation') && (
              <button
                onClick={selectAllVisible}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                title={t('admin.subBulkSelectAllHint', 'Cocher toutes les demandes "Paiement soumis" affichées')}
              >
                {t('admin.subBulkSelectAll', '☐ Tout sélectionner')}
              </button>
            )}
          </div>
        </div>

        {/* Requests List */}
        {subRequests.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500">{subRequestFilter !== 'all' || hasActiveAdvancedFilter ? t('admin.noRequestsFiltered') : t('admin.noRequests')}</p>
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
                  {/* Bulk-select checkbox — only available for pending_validation */}
                  {req.status === 'pending_validation' && (
                    <input
                      type="checkbox"
                      checked={selectedRequestIds.has(req.id)}
                      onChange={() => toggleSelectRequest(req)}
                      className="mt-1 md:mt-0 w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                      title={t('admin.subBulkSelectOne', 'Sélectionner pour traitement groupé')}
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedVendorId(req.userId)}
                        className="text-white font-bold text-sm hover:text-gold-400 underline-offset-2 hover:underline transition-colors"
                        title={t('admin.subOpenVendor360', 'Ouvrir la fiche vendeur')}
                      >
                        {req.sellerName}
                      </button>
                      <span className="text-gray-500 text-xs">{getCountryFlag(req.countryId)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        req.status === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                        req.status === 'pending_validation' ? 'bg-blue-500/20 text-blue-400' :
                        req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {req.status === 'pending' ? t('admin.requestFilterPending') : req.status === 'pending_validation' ? t('admin.requestFilterPaymentSubmitted') : req.status === 'approved' ? t('admin.requestFilterApproved') : t('admin.requestFilterRejected')}
                      </span>
                      {(req.status === 'pending' || req.status === 'pending_validation') && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-700/50 text-gray-300"
                          title={t('admin.subWaitTooltip', 'Temps écoulé depuis la création de la demande')}
                        >
                          ⏱ {formatWait(req.createdAt)}
                        </span>
                      )}
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
                    {req.proofUrl && (
                      <a
                        href={req.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg
                                   text-[11px] font-bold text-purple-300
                                   bg-purple-500/10 border border-purple-500/30
                                   hover:bg-purple-500/20 transition-colors no-underline"
                        title={t('admin.viewProof', 'Voir la preuve de paiement')}
                      >
                        <span>📎</span>
                        {t('admin.proofAttached', 'Preuve jointe')}
                      </a>
                    )}
                    {req.rejectionReason && (
                      <p className="text-xs text-red-400 mt-1">{t('admin.rejectionReason', { reason: req.rejectionReason })}</p>
                    )}
                  </div>
                  {(req.status === 'pending' || req.status === 'pending_validation') && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openApproveModal(req)}
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
      </section>

      {/* ════════════════════ SECTION 3 — Tableau d'expiration ════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base font-bold text-white">
            {t('admin.subExpiryTitle', 'Vendeurs payants — expirations')}
          </h3>
          <p className="text-[11px] text-gray-500">
            {t('admin.subExpirySubtitle', '{{count}} vendeur(s) payant(s) au total', { count: kpis.paidTotal })}
          </p>
        </div>

        {/* Expiry window filter */}
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'all',     label: t('admin.expAll', 'Tous') },
            { id: '3',       label: t('admin.exp3d', '≤ 3 jours') },
            { id: '7',       label: t('admin.exp7d', '≤ 7 jours') },
            { id: '15',      label: t('admin.exp15d', '≤ 15 jours') },
            { id: '30',      label: t('admin.exp30d', '≤ 30 jours') },
            { id: 'expired', label: t('admin.expExpired', 'Expirés') },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setExpiryWindow(opt.id as ExpiryWindow)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                expiryWindow === opt.id
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'text-gray-400 border-gray-700 hover:border-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {expirySellers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500">{t('admin.subExpiryEmpty', 'Aucun vendeur dans cette fenêtre.')}</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-800">
              <div className="col-span-4">{t('admin.subExpColSeller', 'Vendeur')}</div>
              <div className="col-span-2">{t('admin.subExpColTier', 'Plan')}</div>
              <div className="col-span-3">{t('admin.subExpColExpiry', 'Expire le')}</div>
              <div className="col-span-3 text-right">{t('admin.subExpColRemaining', 'Reste')}</div>
            </div>
            {expirySellers.map(u => {
              const exp = u.sellerDetails!.subscriptionExpiresAt!;
              const days = daysLeft(exp);
              const isExpired = days <= 0;
              const isUrgent  = !isExpired && days <= 3;
              const isWarn    = !isExpired && days > 3 && days <= 7;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedVendorId(u.id)}
                  className="w-full text-left grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-800/60 last:border-b-0 items-center hover:bg-gray-800/40 active:bg-gray-800/60 transition-colors"
                >
                  <div className="col-span-4 min-w-0">
                    <p className="text-sm text-white font-bold truncate">{u.sellerDetails?.shopName || u.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {getCountryFlag(u.sellerDetails?.countryId || '')} {u.email || u.whatsapp || u.id}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-gold-400 font-bold">{u.sellerDetails?.tierLabel || '—'}</span>
                  </div>
                  <div className="col-span-3 text-xs text-gray-300">
                    {new Date(exp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="col-span-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                      isExpired ? 'bg-red-500/20 text-red-300' :
                      isUrgent  ? 'bg-orange-500/20 text-orange-300' :
                      isWarn    ? 'bg-amber-500/20 text-amber-300' :
                                  'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {isExpired
                        ? t('admin.subExpExpiredBadge', 'Expiré')
                        : t('admin.subExpDaysBadge', '{{count}}j', { count: days })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ════════════════════ Bulk Selection Bar ════════════════════ */}
      {selectedRequestIds.size > 0 && !bulkOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-2rem)]">
          <div className="bg-blue-600 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-blue-400">
            <span className="text-sm font-bold whitespace-nowrap">
              {t('admin.subBulkSelectedCount', '{{count}} sélectionnée(s)', { count: selectedRequestIds.size })}
            </span>
            <button
              onClick={openBulkModal}
              className="px-3 py-1.5 bg-white text-blue-700 text-xs font-black rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
            >
              {t('admin.subBulkApproveBtn', '✓ Approuver groupé')}
            </button>
            <button
              onClick={clearSelection}
              className="px-2 py-1.5 text-blue-100 hover:text-white text-xs font-bold transition-colors"
              aria-label={t('common.cancel')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════ Bulk Approve Modal ════════════════════ */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-white font-bold text-base">
                  {t('admin.subBulkModalTitle', 'Approbation groupée')}
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {t('admin.subBulkModalSubtitle', '{{count}} demande(s) "Paiement soumis"', { count: selectedRequests.length })}
                </p>
              </div>
              <button
                onClick={() => setBulkOpen(false)}
                disabled={bulkInProgress}
                className="text-gray-500 hover:text-white text-xl leading-none p-1"
                aria-label={t('common.close', 'Fermer')}
              >
                ✕
              </button>
            </div>

            {bulkInProgress ? (
              <div className="space-y-3">
                <p className="text-sm text-white font-bold">
                  {t('admin.subBulkProgress', 'Traitement {{done}} / {{total}}', {
                    done: bulkProgress.done, total: bulkProgress.total,
                  })}
                </p>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${bulkProgress.total === 0 ? 0 : (bulkProgress.done / bulkProgress.total) * 100}%` }}
                  />
                </div>
                {bulkProgress.failed > 0 && (
                  <p className="text-xs text-red-400">
                    {t('admin.subBulkFailedCount', '{{count}} échec(s) jusqu\'ici', { count: bulkProgress.failed })}
                  </p>
                )}
                <p className="text-[11px] text-gray-500 italic">
                  {t('admin.subBulkInProgressHint', 'Ne fermez pas cette fenêtre.')}
                </p>
              </div>
            ) : (
              <>
                {/* Selected list summary */}
                <div className="bg-gray-800/40 rounded-lg max-h-32 overflow-y-auto mb-4 border border-gray-700/50">
                  {selectedRequests.slice(0, 5).map(r => (
                    <div key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px] border-b border-gray-700/40 last:border-b-0">
                      <span className="text-gray-500">{getCountryFlag(r.countryId)}</span>
                      <span className="text-white truncate flex-1">{r.sellerName}</span>
                      <span className="text-gold-400 font-bold whitespace-nowrap">
                        {r.amount.toLocaleString()} {r.currency}
                      </span>
                    </div>
                  ))}
                  {selectedRequests.length > 5 && (
                    <p className="px-3 py-1.5 text-[10px] text-gray-500 italic">
                      {t('admin.subBulkAndMore', '… et {{count}} autres', { count: selectedRequests.length - 5 })}
                    </p>
                  )}
                </div>

                {/* Verification method */}
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">
                  {t('admin.subBulkVerifyVia', 'Méthode de vérification')}
                </p>

                {bulkMethods ? (
                  <>
                    <p className="text-[10px] text-gray-500 mb-2.5">
                      {t('admin.subBulkSameCountry', 'Toutes les demandes proviennent du même pays — utilisez la méthode appropriée.')}
                    </p>
                    <div className="space-y-2 mb-4">
                      {bulkMethods.map((m) => {
                        const isSelected = bulkMethod === m.name;
                        return (
                          <label
                            key={m.name}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
                                        border transition-colors ${
                              isSelected
                                ? 'bg-green-500/15 border-green-500/50'
                                : 'bg-gray-800/40 border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            <input
                              type="radio"
                              name="bulkMethod"
                              value={m.name}
                              checked={isSelected}
                              onChange={() => setBulkMethod(m.name)}
                              className="accent-green-500"
                            />
                            <span className="text-base">{m.icon}</span>
                            <span className="text-sm text-white font-bold">{m.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-3 mb-4">
                    <p className="text-xs text-amber-300 mb-2">
                      {t('admin.subBulkMixedCountries', 'Demandes de pays différents — vérification multi-opérateurs.')}
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkMethod"
                        value="admin_bulk"
                        checked={bulkMethod === 'admin_bulk'}
                        onChange={() => setBulkMethod('admin_bulk')}
                        className="accent-amber-500"
                      />
                      <span className="text-sm text-white font-bold">
                        {t('admin.subBulkAdminGeneric', 'Vérifié manuellement (multi-pays)')}
                      </span>
                    </label>
                  </div>
                )}

                <div className="bg-amber-900/15 border border-amber-600/20 rounded-lg px-3 py-2 mb-4">
                  <p className="text-[11px] text-amber-300 leading-snug">
                    {t('admin.subBulkWarning', 'Vous attestez avoir vérifié chaque transaction sur l\'app de l\'opérateur. Chaque approbation est tracée individuellement dans les logs d\'audit.')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleBulkApprove}
                    disabled={!bulkMethod}
                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500
                               text-white text-sm font-black rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {t('admin.subBulkConfirm', 'Approuver {{count}} demande(s)', { count: selectedRequests.length })}
                  </button>
                  <button
                    onClick={() => setBulkOpen(false)}
                    className="px-4 py-2.5 bg-gray-800 text-gray-400 rounded-lg text-sm border border-gray-700"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════ Vendor 360° Drawer ════════════════════ */}
      {selectedVendor && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setSelectedVendorId(null)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-full sm:max-w-md
                       bg-gray-950 border-l border-gray-800 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
                  {t('admin.subVendor360Title', 'Fiche vendeur')}
                </p>
                <h3 className="text-base font-black text-white truncate">
                  {selectedVendor.sellerDetails?.shopName || selectedVendor.name}
                </h3>
                <p className="text-[11px] text-gray-500 truncate mt-0.5">
                  {getCountryFlag(selectedVendor.sellerDetails?.countryId || '')}{' '}
                  {selectedVendor.email || selectedVendor.whatsapp || selectedVendor.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedVendorId(null)}
                className="text-gray-500 hover:text-white text-xl leading-none p-1"
                aria-label={t('common.close', 'Fermer')}
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Status banner */}
              {(() => {
                const exp = selectedVendor.sellerDetails?.subscriptionExpiresAt;
                const isPaidTier = (selectedVendor.sellerDetails?.maxProducts ?? 0) > 5;
                if (!isPaidTier) {
                  return (
                    <div className="bg-gray-800/40 border border-gray-700 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-400">
                        {t('admin.subVendorFreeTier', 'Plan gratuit (Découverte) — pas d\'expiration suivie.')}
                      </p>
                    </div>
                  );
                }
                if (!exp) {
                  return (
                    <div className="bg-amber-900/20 border border-amber-600/30 rounded-xl px-4 py-3">
                      <p className="text-xs text-amber-300">
                        {t('admin.subVendorNoExpiry', 'Plan payant sans date d\'expiration enregistrée.')}
                      </p>
                    </div>
                  );
                }
                const days = daysLeft(exp);
                const isExpired = days <= 0;
                const isUrgent  = !isExpired && days <= 3;
                const isWarn    = !isExpired && days > 3 && days <= 7;
                return (
                  <div className={`rounded-xl px-4 py-3 border ${
                    isExpired ? 'bg-red-500/10 border-red-500/30' :
                    isUrgent  ? 'bg-orange-500/10 border-orange-500/30' :
                    isWarn    ? 'bg-amber-500/10 border-amber-500/30' :
                                'bg-emerald-500/10 border-emerald-500/30'
                  }`}>
                    <p className={`text-[10px] uppercase tracking-wider font-bold mb-0.5 ${
                      isExpired ? 'text-red-400' :
                      isUrgent  ? 'text-orange-400' :
                      isWarn    ? 'text-amber-400' :
                                  'text-emerald-400'
                    }`}>
                      {selectedVendor.sellerDetails?.tierLabel || t('admin.unknownTier', 'Plan')}
                    </p>
                    <p className={`text-lg font-black tracking-tight ${
                      isExpired ? 'text-red-200' :
                      isUrgent  ? 'text-orange-200' :
                      isWarn    ? 'text-amber-200' :
                                  'text-emerald-200'
                    }`}>
                      {isExpired
                        ? t('admin.subVendorExpired', 'Expiré')
                        : t('admin.subVendorDaysLeft', '{{count}} jour(s) restant(s)', { count: days })}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {t('admin.subVendorExpiryDate', 'Expire le {{date}}', {
                        date: new Date(exp).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: 'long', year: 'numeric',
                        }),
                      })}
                    </p>
                  </div>
                );
              })()}

              {/* KPIs */}
              {vendorKpis && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-black text-white">{vendorKpis.totalRequests}</p>
                    <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                      {t('admin.subVendorTotalReqs', 'Demandes')}
                    </p>
                  </div>
                  <div className="bg-gray-900/60 border border-green-900/30 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-black text-green-400">{vendorKpis.approvedCount}</p>
                    <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                      {t('admin.subVendorApprovedCount', 'Approuvées')}
                    </p>
                  </div>
                  <div className="bg-gray-900/60 border border-red-900/30 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-black text-red-400">{vendorKpis.rejectedCount}</p>
                    <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                      {t('admin.subVendorRejectedCount', 'Refusées')}
                    </p>
                  </div>
                </div>
              )}

              {/* LTV */}
              {vendorKpis && Object.keys(vendorKpis.ltvByCurrency).length > 0 && (
                <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-900/5 border border-yellow-600/20 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-yellow-400 font-bold mb-1.5">
                    {t('admin.subVendorLtv', 'Total encaissé (cycle de vie)')}
                  </p>
                  <div className="space-y-0.5">
                    {Object.entries(vendorKpis.ltvByCurrency).map(([cur, amt]) => (
                      <p key={cur} className="text-sm font-black text-white">
                        {amt.toLocaleString()} <span className="text-[10px] text-yellow-400">{cur}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Force renew */}
              <button
                onClick={() => handleForceRenew(selectedVendor.id)}
                disabled={forcingRenewal}
                className="w-full py-3 bg-gold-400 hover:bg-gold-300 disabled:opacity-50
                           text-gray-900 text-xs font-black rounded-xl transition-colors
                           flex items-center justify-center gap-2"
              >
                {forcingRenewal && <span className="w-3.5 h-3.5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />}
                {forcingRenewal
                  ? t('admin.subForceRenewing', 'Renouvellement…')
                  : t('admin.subForceRenewBtn', 'Renouveler 30 jours (admin manuel)')}
              </button>
              <p className="text-[10px] text-gray-500 -mt-2 text-center">
                {t('admin.subForceRenewHint', 'Pour les paiements reçus hors-app (cash, WhatsApp). Tracé dans les logs d\'audit.')}
              </p>

              {/* History */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
                  {t('admin.subVendorHistory', 'Historique des demandes')}
                </p>
                {vendorRequests.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    {t('admin.subVendorNoHistory', 'Aucune demande enregistrée.')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {vendorRequests.map(req => (
                      <div key={req.id} className={`rounded-lg p-3 border ${
                        req.status === 'pending_validation' ? 'border-blue-500/30 bg-blue-500/5' :
                        req.status === 'pending' ? 'border-orange-500/30 bg-orange-500/5' :
                        req.status === 'approved' ? 'border-green-500/30 bg-green-500/5' :
                        'border-red-500/30 bg-red-500/5'
                      }`}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold text-white">{req.planLabel}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                            req.status === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                            req.status === 'pending_validation' ? 'bg-blue-500/20 text-blue-400' :
                            req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {req.status === 'pending' ? t('admin.requestFilterPending')
                              : req.status === 'pending_validation' ? t('admin.requestFilterPaymentSubmitted')
                              : req.status === 'approved' ? t('admin.requestFilterApproved')
                              : t('admin.requestFilterRejected')}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {req.amount.toLocaleString()} {req.currency} · {formatDate(req.createdAt)}
                        </p>
                        {req.transactionRef && (
                          <p className="text-[10px] text-blue-300 mt-1 font-mono">
                            {req.transactionRef}
                          </p>
                        )}
                        {req.rejectionReason && (
                          <p className="text-[10px] text-red-400 mt-1">
                            {req.rejectionReason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ════════════════════ Operator Verification (Approve) Modal ════════════════════ */}
      {approvingRequest && (() => {
        const methods = PAYMENT_METHODS[approvingRequest.countryId] || PAYMENT_METHODS['bi'];
        const country = INITIAL_COUNTRIES.find(c => c.id === approvingRequest.countryId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-white font-bold text-base">
                    {t('admin.subApproveModalTitle', 'Vérifier le paiement')}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {t('admin.subApproveModalSubtitle', '{{seller}} · {{plan}} · {{amount}} {{currency}}', {
                      seller: approvingRequest.sellerName,
                      plan: approvingRequest.planLabel,
                      amount: approvingRequest.amount.toLocaleString(),
                      currency: approvingRequest.currency,
                    })}
                  </p>
                </div>
                <button
                  onClick={() => { setApprovingRequest(null); setVerifiedMethod(''); }}
                  disabled={approving}
                  className="text-gray-500 hover:text-white text-xl leading-none p-1"
                  aria-label={t('common.close', 'Fermer')}
                >
                  ✕
                </button>
              </div>

              {/* Transaction ref reminder (helps the admin cross-check) */}
              {approvingRequest.transactionRef && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">
                    {t('admin.subApproveRefLabel', 'Référence à vérifier')}
                  </p>
                  <p className="text-sm text-white font-mono font-bold mt-0.5 break-all">
                    {approvingRequest.transactionRef}
                  </p>
                </div>
              )}
              {approvingRequest.proofUrl && (
                <a
                  href={approvingRequest.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mb-3 px-2 py-1 rounded-lg
                             text-[11px] font-bold text-purple-300
                             bg-purple-500/10 border border-purple-500/30
                             hover:bg-purple-500/20 transition-colors no-underline"
                >
                  <span>📎</span>
                  {t('admin.subApproveOpenProof', 'Voir la preuve jointe')}
                </a>
              )}

              {/* Operator selection — country-specific */}
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">
                {t('admin.subApproveVerifyVia', 'J\'ai vérifié cette transaction sur :')}
              </p>
              <p className="text-[10px] text-gray-500 mb-2.5">
                {t('admin.subApproveCountryHint', 'Méthodes disponibles pour {{flag}} {{country}}', {
                  flag: country?.flag ?? '',
                  country: country?.name ?? approvingRequest.countryId,
                })}
              </p>
              <div className="space-y-2 mb-4">
                {methods.map((m) => {
                  const isSelected = verifiedMethod === m.name;
                  return (
                    <label
                      key={m.name}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                                  border transition-colors ${
                        isSelected
                          ? 'bg-green-500/15 border-green-500/50'
                          : 'bg-gray-800/40 border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="verifiedMethod"
                        value={m.name}
                        checked={isSelected}
                        onChange={() => setVerifiedMethod(m.name)}
                        disabled={approving}
                        className="accent-green-500"
                      />
                      <span className="text-lg">{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-bold">{m.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono truncate">{m.number}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="bg-amber-900/15 border border-amber-600/20 rounded-lg px-3 py-2 mb-4">
                <p className="text-[11px] text-amber-300 leading-snug">
                  {t('admin.subApproveWarning', 'Vérifiez le montant et la référence dans l\'app de l\'opérateur avant d\'approuver. L\'action est tracée dans les logs d\'audit.')}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleApproveRequest}
                  disabled={!verifiedMethod || approving}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500
                             text-white text-sm font-black rounded-lg transition-colors
                             flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {approving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {approving
                    ? t('admin.subApproveSaving', 'Approbation…')
                    : t('admin.subApproveConfirm', 'Confirmer & Approuver')}
                </button>
                <button
                  onClick={() => { setApprovingRequest(null); setVerifiedMethod(''); }}
                  disabled={approving}
                  className="px-4 py-2.5 bg-gray-800 text-gray-400 rounded-lg text-sm border border-gray-700 disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════════════════ Reject Reason Modal ════════════════════ */}
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
