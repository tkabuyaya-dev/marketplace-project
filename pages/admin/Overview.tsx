import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../../firebase-config';
import type { OverviewProps } from './types';

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL || '';

export const Overview: React.FC<OverviewProps> = ({
  users, products, banners, pendingCount, sellerCount, approvedCount,
  expiringSoonSellers, setActiveTab, setProductFilter, setSellerStatusFilter,
}) => {
  const { t } = useTranslation();
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const handleReindex = async () => {
    if (!auth?.currentUser || reindexing) return;
    setReindexing(true);
    setReindexResult(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${FUNCTIONS_BASE}/setupAlgoliaIndexes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setReindexResult(data.message);
      } else {
        setReindexResult(`Erreur: ${data.error || 'Échec'}`);
      }
    } catch (err: any) {
      setReindexResult(`Erreur: ${err.message}`);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
          <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">{t('admin.statUsers')}</h3>
          <p className="text-3xl font-black text-white">{users.length}</p>
          <p className="text-xs text-gray-500 mt-1">{sellerCount} {t('admin.sellers')}</p>
        </div>
        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
          <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">{t('admin.statProducts')}</h3>
          <p className="text-3xl font-black text-blue-500">{approvedCount}</p>
          <p className="text-xs text-gray-500 mt-1">{products.length} {t('admin.total')}</p>
        </div>
        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
          <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">{t('admin.statPending')}</h3>
          <p className={`text-3xl font-black ${pendingCount > 0 ? 'text-yellow-500' : 'text-green-500'}`}>{pendingCount}</p>
          <p className="text-xs text-gray-500 mt-1">{t('admin.toValidate')}</p>
        </div>
        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
          <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">{t('admin.statBanners')}</h3>
          <p className="text-3xl font-black text-purple-500">{banners.filter(b => b.isActive).length}</p>
          <p className="text-xs text-gray-500 mt-1">{banners.length} {t('admin.total')}</p>
        </div>
      </div>
      {pendingCount > 0 && (
        <button onClick={() => { setActiveTab('products'); setProductFilter('pending'); }}
          className="w-full bg-yellow-600/10 border border-yellow-600/30 text-yellow-400 p-4 rounded-xl text-sm font-bold hover:bg-yellow-600/20 transition-colors">
          {t('admin.pendingModeration', { count: pendingCount })}
        </button>
      )}
      {expiringSoonSellers.length > 0 && (
        <button onClick={() => { setActiveTab('users'); setSellerStatusFilter('expiring'); }}
          className="w-full bg-orange-600/10 border border-orange-600/30 text-orange-400 p-4 rounded-xl text-sm font-bold hover:bg-orange-600/20 transition-colors">
          {t('admin.sellersExpiring', { count: expiringSoonSellers.length })}
        </button>
      )}

      {/* Algolia Reindex */}
      <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
        <h3 className="text-gray-500 text-xs font-bold uppercase mb-2">{t('admin.algoliaTitle')}</h3>
        <p className="text-xs text-gray-500 mb-3">{t('admin.algoliaHint')}</p>
        <button
          onClick={handleReindex}
          disabled={reindexing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {reindexing ? t('admin.algoliaReindexing') : t('admin.algoliaReindex')}
        </button>
        {reindexResult && (
          <p className={`text-xs mt-2 ${reindexResult.startsWith('Erreur') ? 'text-red-400' : 'text-green-400'}`}>
            {reindexResult}
          </p>
        )}
      </div>
    </div>
  );
};
