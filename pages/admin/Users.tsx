import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { User, Country } from '../../types';
import {
  deleteUser, updateUserStatus, updateUserSubscription, updateUserProfile,
  createNotification, renewSubscription,
} from '../../services/firebase';
import { getOptimizedUrl } from '../../services/cloudinary';
import type { UsersProps } from './types';

const TIER_OPTIONS = [
  { label: 'Gratuit (0-5 produits)', maxProducts: 5, tierLabel: 'Gratuit' },
  { label: 'Starter (6-15 produits)', maxProducts: 15, tierLabel: 'Starter' },
  { label: 'Pro (16-30 produits)', maxProducts: 30, tierLabel: 'Pro' },
  { label: 'Elite (31-50 produits)', maxProducts: 50, tierLabel: 'Elite' },
  { label: 'Illimité (51+)', maxProducts: 99999, tierLabel: 'Illimité' },
];

export const Users: React.FC<UsersProps> = ({
  users, countries, setUsers, currentUser, refreshData, onContactUser,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerCountryFilter, setSellerCountryFilter] = useState<string>('all');
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | 'active' | 'suspended' | 'expiring'>('all');
  const [sellerTierFilter, setSellerTierFilter] = useState<string>('all');
  const [upgradingUser, setUpgradingUser] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const toggleSuspend = async (user: User) => {
    await updateUserStatus(user.id, !user.isSuspended);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isSuspended: !u.isSuspended } : u));
  };

  const deleteUserAction = async (id: string) => {
    if (window.confirm(t('admin.confirmDeleteUser'))) {
      await deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleUpgradeUser = async (userId: string, option: typeof TIER_OPTIONS[0]) => {
    try {
      await updateUserSubscription(userId, { maxProducts: option.maxProducts, tierLabel: option.tierLabel });
      await createNotification({
        userId,
        type: 'subscription_change',
        title: t('admin.subscriptionChangedNotif'),
        body: t('admin.subscriptionChangedBody', { label: option.tierLabel, max: option.maxProducts >= 99999 ? t('admin.unlimited') : option.maxProducts }),
        read: false,
        createdAt: Date.now(),
      });
      setUpgradingUser(null);
      toast(t('admin.subscriptionUpdated', { label: option.label }), 'success');
      refreshData();
    } catch (err) {
      console.error('Erreur upgrade:', err);
      toast(t('admin.subscriptionUpdateError'), 'error');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await updateUserProfile(userId, { role: newRole });
      toast(t('admin.roleChanged', { role: newRole }), 'success');
      refreshData();
    } catch (err) {
      console.error('Erreur changement rôle:', err);
    }
  };

  const handleRenewSub = async (userId: string, userName: string) => {
    try {
      await renewSubscription(userId, 30);
      await createNotification({
        userId,
        type: 'subscription_change',
        title: t('admin.subscriptionRenewedNotif'),
        body: t('admin.subscriptionRenewedBody'),
        read: false,
        createdAt: Date.now(),
      });
      toast(t('admin.subscriptionRenewed', { name: userName }), 'success');
      refreshData();
    } catch (err) {
      console.error('Erreur renouvellement:', err);
      toast(t('admin.renewError'), 'error');
    }
  };

  const handleVerifyUser = async (userId: string) => {
    try {
      await updateUserProfile(userId, {
        isVerified: true,
        'sellerDetails.verificationStatus': 'verified',
      });
      toast(t('admin.verifyApproved'), 'success');
      refreshData();
    } catch { toast(t('admin.verifyError'), 'error'); }
  };

  const handleRejectVerification = async (userId: string) => {
    const reason = prompt(t('admin.verifyRejectReason'));
    if (!reason) return;
    try {
      await updateUserProfile(userId, {
        'sellerDetails.verificationStatus': 'rejected',
        'sellerDetails.verificationNote': reason,
      });
      toast(t('admin.verifyRejected'), 'success');
      refreshData();
    } catch { toast(t('admin.verifyError'), 'error'); }
  };

  // --- Filtered sellers/users ---
  const filteredUsers = users.filter(u => {
    if (sellerSearch) {
      const q = sellerSearch.toLowerCase();
      const match = u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.whatsapp?.includes(q) || u.sellerDetails?.phone?.includes(q);
      if (!match) return false;
    }
    if (sellerCountryFilter !== 'all' && u.sellerDetails?.countryId !== sellerCountryFilter && u.role === 'seller') return false;
    if (sellerStatusFilter === 'active' && u.isSuspended) return false;
    if (sellerStatusFilter === 'suspended' && !u.isSuspended) return false;
    if (sellerStatusFilter === 'expiring') {
      const exp = u.sellerDetails?.subscriptionExpiresAt;
      if (!exp || exp - Date.now() > 7 * 24 * 60 * 60 * 1000 || exp < Date.now()) return false;
    }
    if (sellerTierFilter !== 'all' && u.sellerDetails?.tierLabel !== sellerTierFilter) return false;
    return true;
  });

  const allSellers = users.filter(u => u.role === 'seller');
  const activeSellers = allSellers.filter(u => !u.isSuspended);
  const suspendedSellers = allSellers.filter(u => u.isSuspended);
  const expiringSoonSellers = allSellers.filter(u => {
    const exp = u.sellerDetails?.subscriptionExpiresAt;
    return exp && exp > Date.now() && (exp - Date.now()) < 7 * 24 * 60 * 60 * 1000;
  });
  const expiredSellers = allSellers.filter(u => {
    const exp = u.sellerDetails?.subscriptionExpiresAt;
    return exp && exp < Date.now();
  });
  const pendingVerifications = users.filter(u => u.sellerDetails?.verificationStatus === 'pending');

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">{t('admin.usersTitle', { count: users.length })}</h2>

      {/* Pending verifications */}
      {pendingVerifications.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5 space-y-3">
          <h3 className="text-blue-400 font-bold flex items-center gap-2">
            <span>🪪</span> {t('admin.verifyPending')} ({pendingVerifications.length})
          </h3>
          {pendingVerifications.map(user => (
            <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/80 rounded-xl p-3 border border-gray-800">
              <div className="flex items-center gap-3">
                <img src={user.avatar || '/default-avatar.png'} className="w-10 h-10 rounded-full object-cover" alt="" />
                <div>
                  <p className="text-white font-semibold text-sm">{user.name}</p>
                  <p className="text-gray-500 text-xs">{user.sellerDetails?.shopName} — {user.sellerDetails?.province}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {user.sellerDetails?.documents?.cniUrl && (
                  <a href={user.sellerDetails.documents.cniUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/10">
                    🪪 CNI
                  </a>
                )}
                <button onClick={() => handleVerifyUser(user.id)}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500">
                  {t('admin.approve')}
                </button>
                <button onClick={() => handleRejectVerification(user.id)}
                  className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white">
                  {t('admin.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seller Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-blue-400">{allSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">{t('admin.sellerStats')}</p>
        </div>
        <div className="bg-gray-900 border border-green-900/30 rounded-xl p-3 text-center cursor-pointer hover:bg-gray-800/50" onClick={() => setSellerStatusFilter('active')}>
          <p className="text-2xl font-black text-green-400">{activeSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">{t('admin.activeCount')}</p>
        </div>
        <div className="bg-gray-900 border border-red-900/30 rounded-xl p-3 text-center cursor-pointer hover:bg-gray-800/50" onClick={() => setSellerStatusFilter('suspended')}>
          <p className="text-2xl font-black text-red-400">{suspendedSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">{t('admin.suspendedCount')}</p>
        </div>
        <div className="bg-gray-900 border border-yellow-900/30 rounded-xl p-3 text-center cursor-pointer hover:bg-gray-800/50" onClick={() => setSellerStatusFilter('expiring')}>
          <p className="text-2xl font-black text-yellow-400">{expiringSoonSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">{t('admin.expiringCount')}</p>
        </div>
        <div className="bg-gray-900 border border-orange-900/30 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-orange-400">{expiredSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">{t('admin.expiredCount')}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <input
          type="text"
          placeholder={t('admin.searchUsers')}
          value={sellerSearch}
          onChange={e => setSellerSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500 placeholder-gray-500"
        />
        <div className="flex flex-wrap gap-2">
          <select value={sellerCountryFilter} onChange={e => setSellerCountryFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none">
            <option value="all">{t('admin.allCountries')}</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
          </select>
          <select value={sellerStatusFilter} onChange={e => setSellerStatusFilter(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none">
            <option value="all">{t('admin.allStatuses')}</option>
            <option value="active">{t('admin.statusActiveFilter')}</option>
            <option value="suspended">{t('admin.statusSuspendedFilter')}</option>
            <option value="expiring">{t('admin.statusExpiringFilter')}</option>
          </select>
          <select value={sellerTierFilter} onChange={e => setSellerTierFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none">
            <option value="all">{t('admin.allPlans')}</option>
            {TIER_OPTIONS.map(t => <option key={t.tierLabel} value={t.tierLabel}>{t.tierLabel}</option>)}
          </select>
          {(sellerSearch || sellerCountryFilter !== 'all' || sellerStatusFilter !== 'all' || sellerTierFilter !== 'all') && (
            <button onClick={() => { setSellerSearch(''); setSellerCountryFilter('all'); setSellerStatusFilter('all'); setSellerTierFilter('all'); }}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700">
              {t('admin.clearFilters')}
            </button>
          )}
          <span className="text-xs text-gray-500 self-center ml-auto">{t('admin.resultsCount', { count: filteredUsers.length })}</span>
        </div>
      </div>

      <div className="space-y-3">
        {filteredUsers.map(u => (
          <div key={u.id} className={`bg-gray-900 p-4 rounded-xl border ${u.isSuspended ? 'border-red-600/30 opacity-60' : 'border-gray-800'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-4 min-w-0">
                {u.avatar ? (
                  <img src={getOptimizedUrl(u.avatar, 40)} className="w-10 h-10 rounded-full flex-shrink-0 object-cover" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center text-gray-400 font-bold">{u.name?.charAt(0)}</div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">
                    {u.name}
                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      u.role === 'admin' ? 'bg-red-600/20 text-red-400' :
                      u.role === 'seller' ? 'bg-blue-600/20 text-blue-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>{u.role}</span>
                    {u.isSuspended && <span className="ml-1 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full">{t('admin.suspended')}</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  {u.sellerDetails?.tierLabel && (
                    <div className="mt-0.5">
                      <p className="text-[10px] text-blue-400">
                        {t('admin.planInfo', { label: u.sellerDetails.tierLabel, max: u.sellerDetails.maxProducts || '?' })}
                        {u.sellerDetails.countryId && (() => {
                          const c = countries.find(cc => cc.id === u.sellerDetails!.countryId);
                          return c ? <span className="ml-1 text-gray-500">{c.flag}</span> : null;
                        })()}
                      </p>
                      {u.sellerDetails.subscriptionExpiresAt && (() => {
                        const days = Math.ceil((u.sellerDetails.subscriptionExpiresAt - Date.now()) / (24*60*60*1000));
                        const pct = Math.max(0, Math.min(100, (days / 30) * 100));
                        return (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-1.5 flex-1 max-w-[120px] bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  days <= 0 ? 'bg-red-500 w-full' :
                                  days <= 3 ? 'bg-red-500' :
                                  days <= 7 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: days <= 0 ? '100%' : `${pct}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${
                              days <= 0 ? 'text-red-400' : days <= 7 ? 'text-yellow-400' : 'text-gray-500'
                            }`}>
                              {days <= 0 ? t('admin.expired') : `${days}j`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                <button onClick={() => onContactUser(u)}
                  className="px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-600/30 text-xs font-bold rounded-lg hover:bg-green-600 hover:text-white transition-colors">
                  📱
                </button>
                {u.role === 'seller' && (
                  <>
                    <button onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                      className="px-3 py-1.5 bg-gray-700/50 text-gray-300 border border-gray-600/30 text-xs font-bold rounded-lg hover:bg-gray-600 hover:text-white transition-colors">
                      {expandedUserId === u.id ? t('admin.hideDetails') : t('admin.showDetails')}
                    </button>
                    <button onClick={() => setUpgradingUser(upgradingUser === u.id ? null : u.id)}
                      className="px-3 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-600/30 text-xs font-bold rounded-lg hover:bg-purple-600 hover:text-white transition-colors">
                      {upgradingUser === u.id ? t('admin.closeSubscription') : t('admin.manageSubscription')}
                    </button>
                    <button onClick={() => handleRenewSub(u.id, u.name || 'Vendeur')}
                      className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 text-xs font-bold rounded-lg hover:bg-emerald-600 hover:text-white transition-colors">
                      🔄 +30j
                    </button>
                  </>
                )}
                {u.role !== 'admin' && (
                  <select
                    value={u.role}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 outline-none"
                  >
                    <option value="buyer">{t('admin.buyer')}</option>
                    <option value="seller">{t('admin.sellerRole')}</option>
                    <option value="admin">{t('admin.adminRole')}</option>
                  </select>
                )}
                <button
                  onClick={async () => {
                    await updateUserProfile(u.id, { isVerified: !u.isVerified });
                    setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, isVerified: !usr.isVerified } : usr));
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${u.isVerified ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600 hover:text-white' : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-blue-600 hover:text-white'}`}
                >
                  {u.isVerified ? t('admin.verified') : t('admin.verify')}
                </button>
                <button onClick={() => toggleSuspend(u)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${u.isSuspended ? 'bg-green-600 text-white' : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 hover:bg-yellow-600 hover:text-white'}`}>
                  {u.isSuspended ? t('admin.reactivate') : t('admin.suspend')}
                </button>
                <button onClick={() => deleteUserAction(u.id)} className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors">
                  🗑
                </button>
              </div>
            </div>

            {/* Upgrade Panel */}
            {upgradingUser === u.id && u.role === 'seller' && (
              <div className="mt-3 pt-3 border-t border-gray-800 animate-fade-in">
                <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">{t('admin.changeSubscription')}</p>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map(opt => (
                    <button
                      key={opt.tierLabel}
                      onClick={() => handleUpgradeUser(u.id, opt)}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                        u.sellerDetails?.tierLabel === opt.tierLabel
                          ? 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-400/30'
                          : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seller Details Panel */}
            {expandedUserId === u.id && u.role === 'seller' && u.sellerDetails && (
              <div className="mt-3 pt-3 border-t border-gray-800 animate-fade-in space-y-4">
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">{t('admin.personalInfo')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.cniPassport')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.cni || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.phoneLabel')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.phone || u.whatsapp || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.countryLabel')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.countryId || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.provinceLabel')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.province || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.communeLabel')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.commune || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.quarterLabel')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.quartier || '—'}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">{t('admin.shopSection')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.shopNameLabel')}</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.shopName || u.name}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.sellingType')}</p>
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${
                        u.sellerDetails.sellerType === 'shop' ? 'bg-green-600/20 text-green-400' :
                        u.sellerDetails.sellerType === 'street' ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-blue-600/20 text-blue-400'
                      }`}>
                        {u.sellerDetails.sellerType === 'shop' ? t('admin.fixedShop') :
                         u.sellerDetails.sellerType === 'street' ? t('admin.streetVendor') : t('admin.onlineSeller')}
                      </span>
                    </div>
                    {u.sellerDetails.shopImage && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase mb-1">{t('admin.shopPhoto')}</p>
                        <img src={getOptimizedUrl(u.sellerDetails.shopImage, 120)} alt="Boutique" className="w-20 h-14 rounded-lg object-cover" />
                      </div>
                    )}
                    {u.sellerDetails.gps?.lat && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">{t('admin.gps')}</p>
                        <a href={`https://www.google.com/maps?q=${u.sellerDetails.gps.lat},${u.sellerDetails.gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                          📍 {u.sellerDetails.gps.lat.toFixed(4)}, {u.sellerDetails.gps.lng.toFixed(4)}
                        </a>
                      </div>
                    )}
                    {u.sellerDetails.locationUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">{t('admin.mapsLink')}</p>
                        <a href={u.sellerDetails.locationUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline truncate block">
                          🔗 {t('admin.viewOnMap')}
                        </a>
                      </div>
                    )}
                  </div>
                  {u.sellerDetails.categories && u.sellerDetails.categories.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-500 uppercase mb-1">{t('admin.categoriesLabel')}</p>
                      <div className="flex flex-wrap gap-1">
                        {u.sellerDetails.categories.map(cat => (
                          <span key={cat} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full border border-gray-700">{cat}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">{t('admin.legalSection')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.nifLabel')}</p>
                      <p className={`text-sm font-medium ${u.sellerDetails.nif ? 'text-green-400' : 'text-gray-500'}`}>
                        {u.sellerDetails.nif || t('admin.notProvided')}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">{t('admin.registryLabel')}</p>
                      <p className={`text-sm font-medium ${u.sellerDetails.registryNumber ? 'text-green-400' : 'text-gray-500'}`}>
                        {u.sellerDetails.registryNumber || t('admin.notProvided')}
                      </p>
                    </div>
                    {u.sellerDetails.documents?.cniUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">{t('admin.cniDocument')}</p>
                        <a href={u.sellerDetails.documents.cniUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">📄 {t('admin.viewDocument')}</a>
                      </div>
                    )}
                    {u.sellerDetails.documents?.nifUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">{t('admin.nifDocument')}</p>
                        <a href={u.sellerDetails.documents.nifUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">📄 {t('admin.viewDocument')}</a>
                      </div>
                    )}
                    {u.sellerDetails.documents?.registryUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">{t('admin.registryDocument')}</p>
                        <a href={u.sellerDetails.documents.registryUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">📄 {t('admin.viewDocument')}</a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
