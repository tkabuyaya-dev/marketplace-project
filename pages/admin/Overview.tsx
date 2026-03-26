import React from 'react';
import { useTranslation } from 'react-i18next';
import type { OverviewProps } from './types';

export const Overview: React.FC<OverviewProps> = ({
  users, products, banners, pendingCount, sellerCount, approvedCount,
  expiringSoonSellers, setActiveTab, setProductFilter, setSellerStatusFilter,
}) => {
  const { t } = useTranslation();

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
    </div>
  );
};
