/**
 * NUNULIA — Admin Dashboard (orchestrator)
 * Each tab is a lazy-loaded sub-component.
 * Countries et Languages gérés directement via Firebase Console
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Product, User, Category, Country, Currency } from '../../types';
import {
  getAllProductsForAdmin, getAllUsers,
  getCategories, getCountries,
  getBanners, BannerData, getCurrencies,
  countPendingBoostRequests,
} from '../../services/firebase';
import { useAppContext } from '../../contexts/AppContext';
import type { AdminTab } from './types';

// Lazy sub-components
const Overview = lazy(() => import('./Overview').then(m => ({ default: m.Overview })));
const Products = lazy(() => import('./Products').then(m => ({ default: m.Products })));
const Banners = lazy(() => import('./Banners').then(m => ({ default: m.Banners })));
const Subscriptions = lazy(() => import('./Subscriptions').then(m => ({ default: m.Subscriptions })));
const Users = lazy(() => import('./Users').then(m => ({ default: m.Users })));
const Categories = lazy(() => import('./Categories').then(m => ({ default: m.Categories })));
const Currencies = lazy(() => import('./Currencies').then(m => ({ default: m.Currencies })));
const BuyerRequestsAdmin = lazy(() => import('./BuyerRequestsAdmin').then(m => ({ default: m.BuyerRequestsAdmin })));
const AuditLogs = lazy(() => import('./AuditLogs').then(m => ({ default: m.AuditLogs })));
const BoostRequestsAdmin = lazy(() => import('./BoostRequestsAdmin').then(m => ({ default: m.BoostRequestsAdmin })));

const TabLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

export const AdminDashboard: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!currentUser || currentUser.role !== 'admin') {
    navigate('/');
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);

  // Shared data
  const [users, setUsers] = useState<User[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Product filter (client-side)
  const [productFilter, setProductFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [productSellerSearch, setProductSellerSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productDateSort, setProductDateSort] = useState<'newest' | 'oldest'>('newest');
  const [productResubmittedOnly, setProductResubmittedOnly] = useState(false);
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | 'active' | 'suspended' | 'expiring'>('all');
  const [pendingBoostCount, setPendingBoostCount] = useState(0);

  // Reject modal state (for Products tab)
  const [rejectingProductId, setRejectingProductId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refreshData = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      getAllUsers(),
      getAllProductsForAdmin(),
      getCountries(),
      getCategories(),
      getBanners(),
      getCurrencies(),
      countPendingBoostRequests(),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === 'fulfilled' ? r.value : (console.error('Admin load error:', (r as PromiseRejectedResult).reason), fallback);

    const usersResult = val(results[0], { users: [], lastDoc: null });
    setUsers(Array.isArray(usersResult) ? usersResult : (usersResult as any).users ?? []);
    const productsResult = val(results[1], { products: [], lastDoc: null });
    const allProds = Array.isArray(productsResult) ? productsResult : (productsResult as any).products ?? [];
    setAllProducts(allProds);
    setCountries(val(results[2], []));
    setCategories(val(results[3], []));
    setBanners(val(results[4], []));
    setCurrencies(val(results[5], []));
    setPendingBoostCount(val(results[6] as PromiseSettledResult<number>, 0));
    setLoading(false);
  };

  // Client-side product filtering (status + seller + category + date + resubmitted)
  useEffect(() => {
    let filtered = productFilter === 'all'
      ? allProducts
      : allProducts.filter(p => p.status === productFilter);

    if (productSellerSearch.trim()) {
      const q = productSellerSearch.toLowerCase();
      filtered = filtered.filter(p => p.seller?.name?.toLowerCase().includes(q));
    }
    if (productCategoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === productCategoryFilter);
    }
    if (productResubmittedOnly) {
      filtered = filtered.filter(p => !!p.resubmittedAt);
    }
    filtered = [...filtered].sort((a, b) =>
      productDateSort === 'newest'
        ? (b.createdAt || 0) - (a.createdAt || 0)
        : (a.createdAt || 0) - (b.createdAt || 0)
    );
    setProducts(filtered);
  }, [productFilter, allProducts, productSellerSearch, productCategoryFilter, productDateSort, productResubmittedOnly]);

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  // Computed stats
  const pendingCount = allProducts.filter(p => p.status === 'pending').length;
  const sellerCount = users.filter(u => u.role === 'seller').length;
  const approvedCount = allProducts.filter(p => p.status === 'approved').length;
  const expiringSoonSellers = users.filter(u => {
    if (u.role !== 'seller') return false;
    const exp = u.sellerDetails?.subscriptionExpiresAt;
    return exp && exp > Date.now() && (exp - Date.now()) < 7 * 24 * 60 * 60 * 1000;
  });

  const onContactUser = (user: User) => {
    const num = user.whatsapp || (user as any).sellerDetails?.phone;
    if (num) window.open(`https://wa.me/${num.replace(/[^0-9+]/g, '')}`, '_blank', 'noopener,noreferrer');
  };

  const tabs: { id: AdminTab; label: string; badge?: number }[] = [
    { id: 'overview', label: t('admin.tabOverview') },
    { id: 'products', label: t('admin.tabProducts'), badge: pendingCount },
    { id: 'requests', label: t('admin.tabRequests') },
    { id: 'banners', label: t('admin.tabBanners') },
    { id: 'subs', label: t('admin.tabSubscriptions') },
    { id: 'users', label: t('admin.tabUsers') },
    { id: 'currencies', label: t('admin.tabCurrencies') },
    { id: 'categories', label: t('admin.tabCategories') },
    { id: 'audit', label: t('admin.tabAudit') },
    { id: 'boosts', label: t('admin.tabBoosts'), badge: pendingBoostCount },
  ];

  const sharedProps = { currentUser, refreshData, loading };

  return (
    <div className="min-h-screen bg-gray-950 pt-20 px-4 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
            {t('admin.console')}
          </h1>
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            <Button variant="ghost" onClick={() => navigate('/')}>{t('admin.quit')}</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 border-b border-gray-800 mb-6 scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors relative text-sm ${
                activeTab === tab.id ? 'bg-gray-800 text-white border border-gray-700' : 'text-gray-500 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'overview' && (
            <Overview
              {...sharedProps}
              users={users} products={allProducts} banners={banners}
              pendingCount={pendingCount} sellerCount={sellerCount} approvedCount={approvedCount}
              expiringSoonSellers={expiringSoonSellers}
              setActiveTab={setActiveTab} setProductFilter={setProductFilter} setSellerStatusFilter={setSellerStatusFilter}
            />
          )}
          {activeTab === 'products' && (
            <Products
              {...sharedProps}
              products={products} allProducts={allProducts} categories={categories}
              pendingCount={pendingCount} productFilter={productFilter} setProductFilter={setProductFilter}
              productSellerSearch={productSellerSearch} setProductSellerSearch={setProductSellerSearch}
              productCategoryFilter={productCategoryFilter} setProductCategoryFilter={setProductCategoryFilter}
              productDateSort={productDateSort} setProductDateSort={setProductDateSort}
              productResubmittedOnly={productResubmittedOnly} setProductResubmittedOnly={setProductResubmittedOnly}
              setProducts={setProducts} setAllProducts={setAllProducts}
              rejectingProductId={rejectingProductId} setRejectingProductId={setRejectingProductId}
              rejectReason={rejectReason} setRejectReason={setRejectReason}
            />
          )}
          {activeTab === 'banners' && (
            <Banners {...sharedProps} banners={banners} categories={categories} setBanners={setBanners} />
          )}
          {activeTab === 'subs' && (
            <Subscriptions {...sharedProps} users={users} />
          )}
          {activeTab === 'users' && (
            <Users {...sharedProps} users={users} countries={countries} setUsers={setUsers} onContactUser={onContactUser} />
          )}
          {activeTab === 'currencies' && (
            <Currencies {...sharedProps} currencies={currencies} countries={countries} setCurrencies={setCurrencies} />
          )}
          {activeTab === 'categories' && (
            <Categories {...sharedProps} categories={categories} />
          )}
          {activeTab === 'requests' && (
            <BuyerRequestsAdmin {...sharedProps} />
          )}
          {activeTab === 'audit' && (
            <AuditLogs {...sharedProps} />
          )}
          {activeTab === 'boosts' && (
            <BoostRequestsAdmin {...sharedProps} />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default AdminDashboard;
