import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { Product, User, SubscriptionTier, Category, Country, Marketplace, Currency } from '../types';
import {
    getAllProductsForAdmin, updateProductStatus, deleteProduct,
    getAllUsers, deleteUser, updateUserStatus,
    getCategories, addCategory, deleteCategory,
    getSubscriptionTiers, updateSubscriptionTiers,
    getCountries, addCountry, updateCountry, deleteCountry,
    getBanners, addBanner, updateBanner, deleteBanner,
    getMarketplaces, addMarketplace, updateMarketplace, deleteMarketplace,
    BannerData, BannerActionType, updateUserSubscription, updateUserProfile,
    createNotification,
    getCurrencies, updateCurrency, renewSubscription,
} from '../services/firebase';
import { uploadImage, getOptimizedUrl } from '../services/cloudinary';
import { CURRENCY } from '../constants';
import { useAppContext } from '../contexts/AppContext';

type AdminTab = 'overview' | 'products' | 'subs' | 'users' | 'banners' | 'categories' | 'countries' | 'currencies';

export const AdminDashboard: React.FC = () => {
  const { currentUser, handleContactSeller } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  if (!currentUser || currentUser.role !== 'admin') {
    navigate('/');
    return null;
  }

  const onBack = () => navigate('/');
  const onContactUser = (user: User) => handleContactSeller(user);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Data State
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [allMarketplaces, setAllMarketplaces] = useState<Marketplace[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);

  // Seller filters
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerCountryFilter, setSellerCountryFilter] = useState<string>('all');
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | 'active' | 'suspended' | 'expiring'>('all');
  const [sellerTierFilter, setSellerTierFilter] = useState<string>('all');

  // Filter for products (client-side filtering to avoid index issues)
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Inputs for creation
  const [newCat, setNewCat] = useState({ name: '', icon: '', slug: '', subCategories: '' });
  const [newCountry, setNewCountry] = useState({ name: '', code: '', currency: '', flag: '', isActive: true });

  // Banner form
  const [bannerForm, setBannerForm] = useState<Partial<BannerData>>({
    title: '', subtitle: '', ctaText: '', ctaActionType: 'none', ctaAction: '', isActive: true, order: 0, imageUrl: ''
  });
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState('');
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // Reject modal state
  const [rejectingProductId, setRejectingProductId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refreshData = async () => {
    setLoading(true);
    // Use allSettled so one failing query doesn't block everything
    const results = await Promise.allSettled([
      getSubscriptionTiers(),
      getAllUsers(),
      getAllProductsForAdmin(), // Load ALL products, filter client-side
      getCountries(),
      getCategories(),
      getBanners(),
      getMarketplaces(),
      getCurrencies(),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === 'fulfilled' ? r.value : (console.error('Admin load error:', (r as PromiseRejectedResult).reason), fallback);

    setTiers(val(results[0], []));
    const usersResult = val(results[1], { users: [], lastDoc: null });
    setUsers(Array.isArray(usersResult) ? usersResult : (usersResult as any).users ?? []);
    const productsResult = val(results[2], { products: [], lastDoc: null });
    const allProds = Array.isArray(productsResult) ? productsResult : (productsResult as any).products ?? [];
    setAllProducts(allProds);
    setCountries(val(results[3], []));
    setCategories(val(results[4], []));
    setBanners(val(results[5], []));
    setAllMarketplaces(val(results[6], []));
    setCurrencies(val(results[7], []));
    setLoading(false);
  };

  // Client-side filtering — avoids needing composite Firestore indexes
  useEffect(() => {
    if (productFilter === 'all') {
      setProducts(allProducts);
    } else {
      setProducts(allProducts.filter(p => p.status === productFilter));
    }
  }, [productFilter, allProducts]);

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  // --- PRODUCT ACTIONS ---
  const handleApprove = async (id: string) => {
    await updateProductStatus(id, 'approved');
    const product = allProducts.find(p => p.id === id);
    if (product?.seller?.id) {
      await createNotification({
        userId: product.seller.id,
        type: 'product_approved',
        title: 'Produit approuvé',
        body: `Votre produit "${product.title}" a été approuvé et est maintenant visible.`,
        read: false,
        createdAt: Date.now(),
        data: { productSlug: product.slug || product.id },
      });
    }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
    setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
  };

  const handleReject = async (id: string) => {
    // Open modal to ask for rejection reason
    setRejectingProductId(id);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingProductId || !rejectReason.trim()) return;
    const reason = rejectReason.trim();
    await updateProductStatus(rejectingProductId, 'rejected', reason);
    const product = allProducts.find(p => p.id === rejectingProductId);
    if (product?.seller?.id) {
      await createNotification({
        userId: product.seller.id,
        type: 'product_rejected',
        title: 'Produit rejete',
        body: `Votre produit "${product.title}" n'a pas ete approuve. Raison : ${reason}`,
        read: false,
        createdAt: Date.now(),
        data: { productSlug: product.slug || product.id },
      });
    }
    setProducts(prev => prev.map(p => p.id === rejectingProductId ? { ...p, status: 'rejected', rejectionReason: reason } : p));
    setAllProducts(prev => prev.map(p => p.id === rejectingProductId ? { ...p, status: 'rejected', rejectionReason: reason } : p));
    setRejectingProductId(null);
    setRejectReason('');
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Supprimer ce produit définitivement ?')) {
      await deleteProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  // --- SUBSCRIPTION ACTIONS ---
  const handleTierChange = (index: number, field: keyof SubscriptionTier, value: any) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  };
  const saveTiers = async () => {
    await updateSubscriptionTiers(tiers);
    toast("Abonnements mis à jour !", 'success');
  };
  const addTier = () => {
    setTiers([...tiers, { id: `tier_${Date.now()}`, label: 'Nouveau', min: 0, max: 0, price: 0, requiresNif: false }]);
  };
  const removeTier = (index: number) => {
    const updated = [...tiers];
    updated.splice(index, 1);
    setTiers(updated);
  };

  // --- USER ACTIONS ---
  const toggleSuspend = async (user: User) => {
    await updateUserStatus(user.id, !user.isSuspended);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isSuspended: !u.isSuspended } : u));
  };
  const deleteUserAction = async (id: string) => {
    if (window.confirm("Supprimer cet utilisateur ?")) {
      await deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  // --- COUNTRY ACTIONS ---
  const handleAddCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    await addCountry({ ...newCountry, id: newCountry.code.toLowerCase() });
    setNewCountry({ name: '', code: '', currency: '', flag: '', isActive: true });
    refreshData();
  };
  const toggleCountryStatus = async (country: Country) => {
    await updateCountry(country.id, { isActive: !country.isActive });
    setCountries(prev => prev.map(c => c.id === country.id ? { ...c, isActive: !c.isActive } : c));
  };
  const handleDeleteCountry = async (id: string) => {
    if (window.confirm('Supprimer ce pays ? Les marchés associés ne seront plus visibles.')) {
      await deleteCountry(id);
      refreshData();
    }
  };

  // --- MARKETPLACE ACTIONS ---
  const [newMarket, setNewMarket] = useState({ name: '', icon: '🟠', countryId: 'bi', cityId: '' });
  const MARKET_COLORS = [
    { color: 'bg-orange-600', borderColor: 'border-orange-500', textColor: 'text-orange-400' },
    { color: 'bg-green-600', borderColor: 'border-green-500', textColor: 'text-green-400' },
    { color: 'bg-blue-600', borderColor: 'border-blue-500', textColor: 'text-blue-400' },
    { color: 'bg-purple-600', borderColor: 'border-purple-500', textColor: 'text-purple-400' },
    { color: 'bg-red-600', borderColor: 'border-red-500', textColor: 'text-red-400' },
    { color: 'bg-yellow-600', borderColor: 'border-yellow-500', textColor: 'text-yellow-400' },
    { color: 'bg-gray-600', borderColor: 'border-gray-500', textColor: 'text-gray-400' },
  ];
  const handleAddMarketplace = async (e: React.FormEvent) => {
    e.preventDefault();
    const colorIdx = allMarketplaces.length % MARKET_COLORS.length;
    await addMarketplace({
      name: newMarket.name,
      icon: newMarket.icon,
      ...MARKET_COLORS[colorIdx],
      countryId: newMarket.countryId,
      cityId: newMarket.cityId || newMarket.countryId,
      isActive: true,
    });
    setNewMarket({ name: '', icon: '🟠', countryId: 'bi', cityId: '' });
    refreshData();
    toast("Marché ajouté !", 'success');
  };
  const toggleMarketplace = async (mp: Marketplace) => {
    await updateMarketplace(mp.id, { isActive: !mp.isActive });
    setAllMarketplaces(prev => prev.map(m => m.id === mp.id ? { ...m, isActive: !m.isActive } : m));
  };
  const handleDeleteMarketplace = async (id: string) => {
    if (window.confirm('Supprimer ce marché ?')) {
      await deleteMarketplace(id);
      setAllMarketplaces(prev => prev.filter(m => m.id !== id));
    }
  };

  // --- CATEGORY ACTIONS ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = newCat.slug || newCat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const subCats = newCat.subCategories.split(',').map(s => s.trim()).filter(Boolean);
    await addCategory({ name: newCat.name, icon: newCat.icon, slug, subCategories: subCats });
    setNewCat({ name: '', icon: '', slug: '', subCategories: '' });
    refreshData();
  };

  // --- BANNER ACTIONS ---
  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetBannerForm = () => {
    setBannerForm({ title: '', subtitle: '', ctaText: '', ctaActionType: 'none', ctaAction: '', isActive: true, order: 0, imageUrl: '' });
    setBannerFile(null);
    setBannerPreview('');
    setEditingBannerId(null);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let imageUrl = bannerForm.imageUrl || '';
      if (bannerFile) {
        imageUrl = await uploadImage(bannerFile);
      }
      if (!imageUrl) {
        toast("Ajoutez une image pour la bannière.", 'error');
        setLoading(false);
        return;
      }

      const data: Omit<BannerData, 'id'> = {
        imageUrl,
        title: bannerForm.title || '',
        subtitle: bannerForm.subtitle || '',
        ctaText: bannerForm.ctaText || '',
        ctaActionType: bannerForm.ctaActionType || 'none',
        ctaAction: (bannerForm.ctaActionType && bannerForm.ctaActionType !== 'none') ? (bannerForm.ctaAction || '') : '',
        isActive: bannerForm.isActive ?? true,
        order: bannerForm.order ?? 0,
      };

      if (editingBannerId) {
        await updateBanner(editingBannerId, data);
      } else {
        await addBanner(data);
      }
      resetBannerForm();
      refreshData();
    } catch (err: any) {
      toast('Erreur: ' + (err?.message || 'Réessayez'), 'error');
    }
    setLoading(false);
  };

  const handleDeleteBanner = async (id: string) => {
    if (window.confirm('Supprimer cette bannière ?')) {
      await deleteBanner(id);
      setBanners(prev => prev.filter(b => b.id !== id));
    }
  };

  const handleToggleBanner = async (banner: BannerData) => {
    if (!banner.id) return;
    await updateBanner(banner.id, { isActive: !banner.isActive });
    setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, isActive: !b.isActive } : b));
  };

  const startEditBanner = (banner: BannerData) => {
    setEditingBannerId(banner.id || null);
    setBannerForm(banner);
    setBannerPreview(banner.imageUrl);
    setBannerFile(null);
  };

  // --- COMPUTED STATS ---
  const pendingCount = products.filter(p => p.status === 'pending').length;
  const sellerCount = users.filter(u => u.role === 'seller').length;
  const approvedCount = products.filter(p => p.status === 'approved').length;

  // === RENDERERS ===

  const renderProducts = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-white">
          Modération Produits
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-600 text-white text-xs font-bold rounded-full">{pendingCount} en attente</span>
          )}
        </h2>
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setProductFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                productFilter === f
                  ? f === 'pending' ? 'bg-yellow-600 text-white'
                    : f === 'approved' ? 'bg-green-600 text-white'
                    : f === 'rejected' ? 'bg-red-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : f === 'rejected' ? 'Rejetés' : 'Tous'}
            </button>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500">
          <div className="text-4xl mb-3">
            {productFilter === 'pending' ? '✅' : '📦'}
          </div>
          <p>{productFilter === 'pending' ? 'Aucun produit en attente de validation' : 'Aucun produit trouvé'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map(product => (
            <div key={product.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
              {/* Image */}
              <div className="w-full sm:w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-gray-800">
                {product.images[0] ? (
                  <img src={getOptimizedUrl(product.images[0], 200)} alt={product.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">📷</div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-white font-bold truncate">{product.title}</h3>
                    <p className="text-sm text-gray-400">{product.price.toLocaleString('fr-FR')} {CURRENCY}</p>
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                    product.status === 'pending' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-600/30' :
                    product.status === 'approved' ? 'bg-green-900/40 text-green-400 border border-green-600/30' :
                    'bg-red-900/40 text-red-400 border border-red-600/30'
                  }`}>
                    {product.status === 'pending' ? 'En attente' : product.status === 'approved' ? 'Approuve' : 'Rejete'}
                  </span>
                  {product.resubmittedAt && product.status === 'pending' && (
                    <span className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-900/40 text-blue-400 border border-blue-600/30">
                      Renvoye
                    </span>
                  )}
                </div>

                {product.status === 'rejected' && product.rejectionReason && (
                  <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-1.5 mb-2">
                    Raison : {product.rejectionReason}
                  </p>
                )}
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{product.description}</p>

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    {product.seller?.avatar && <img src={getOptimizedUrl(product.seller.avatar, 20)} className="w-4 h-4 rounded-full" alt="" />}
                    {product.seller?.name || 'Vendeur'}
                  </span>
                  <span>📂 {categories.find(c => c.id === product.category || c.slug === product.category)?.name || product.category}</span>
                  <span>👁 {product.views}</span>
                  <span>❤️ {product.likesCount || 0}</span>
                  {product.images.length > 1 && <span>📸 {product.images.length} photos</span>}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {product.status !== 'approved' && (
                    <button onClick={() => handleApprove(product.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors">
                      Approuver
                    </button>
                  )}
                  {product.status !== 'rejected' && (
                    <button onClick={() => handleReject(product.id)} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-lg transition-colors">
                      Rejeter
                    </button>
                  )}
                  <button onClick={() => handleDeleteProduct(product.id)} className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold rounded-lg border border-red-600/30 transition-colors">
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderBanners = () => (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">Gestion Carrousel / Bannières</h2>

      {/* Banner Form */}
      <form onSubmit={handleSaveBanner} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-white text-sm">
          {editingBannerId ? 'Modifier la bannière' : 'Ajouter une bannière'}
        </h3>

        {/* Image upload */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2">Image bannière *</label>
          {bannerPreview && (
            <div className="relative rounded-xl overflow-hidden h-40 mb-3 bg-gray-800">
              <img src={bannerPreview} alt="Preview" className="w-full h-full object-cover" />
              <button type="button" onClick={() => { setBannerPreview(''); setBannerFile(null); setBannerForm(f => ({...f, imageUrl: ''})); }}
                className="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
                ✕
              </button>
            </div>
          )}
          <input ref={bannerFileRef} type="file" accept="image/*" onChange={handleBannerFileChange} className="hidden" />
          {!bannerPreview && (
            <button type="button" onClick={() => bannerFileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-blue-500/50 transition-colors text-gray-400 text-sm">
              📸 Cliquez pour ajouter une image (1200x400 recommandé)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Titre</label>
            <input value={bannerForm.title || ''} onChange={e => setBannerForm(f => ({...f, title: e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
              placeholder="Ex: Promo Smartphones" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Sous-titre</label>
            <input value={bannerForm.subtitle || ''} onChange={e => setBannerForm(f => ({...f, subtitle: e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
              placeholder="Ex: Jusqu'à -30%" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Texte bouton (CTA)</label>
            <input value={bannerForm.ctaText || ''} onChange={e => setBannerForm(f => ({...f, ctaText: e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
              placeholder="Ex: Voir les offres" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Action (lien)</label>
            <select value={bannerForm.ctaActionType || 'none'} onChange={e => setBannerForm(f => ({...f, ctaActionType: e.target.value as BannerActionType, ctaAction: ''}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500">
              <option value="none">Aucune action</option>
              <option value="external">Lien externe (URL)</option>
              <option value="category">Catégorie de produits</option>
              <option value="product">Produit spécifique</option>
              <option value="page">Page interne</option>
            </select>
          </div>
          {bannerForm.ctaActionType && bannerForm.ctaActionType !== 'none' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-400 mb-1">
                {bannerForm.ctaActionType === 'external' && 'URL externe'}
                {bannerForm.ctaActionType === 'category' && 'ID ou slug de la catégorie'}
                {bannerForm.ctaActionType === 'product' && 'Slug ou ID du produit'}
                {bannerForm.ctaActionType === 'page' && 'Chemin de la page (ex: /register-seller)'}
              </label>
              {bannerForm.ctaActionType === 'category' ? (
                <select value={bannerForm.ctaAction || ''} onChange={e => setBannerForm(f => ({...f, ctaAction: e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500">
                  <option value="">-- Choisir une catégorie --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              ) : (
                <input value={bannerForm.ctaAction || ''} onChange={e => setBannerForm(f => ({...f, ctaAction: e.target.value}))}
                  placeholder={
                    bannerForm.ctaActionType === 'external' ? 'https://example.com' :
                    bannerForm.ctaActionType === 'product' ? 'ex: samsung-galaxy-s24-a1b2' :
                    'ex: /register-seller'
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" />
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Ordre d'affichage</label>
            <input type="number" min={0} value={bannerForm.order ?? 0} onChange={e => setBannerForm(f => ({...f, order: Number(e.target.value)}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={bannerForm.isActive ?? true} onChange={e => setBannerForm(f => ({...f, isActive: e.target.checked}))}
                className="accent-blue-500 w-4 h-4" />
              <span className="text-sm text-gray-300">Bannière active</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" isLoading={loading}>
            {editingBannerId ? 'Mettre à jour' : 'Ajouter la bannière'}
          </Button>
          {editingBannerId && (
            <Button type="button" variant="ghost" onClick={resetBannerForm}>Annuler</Button>
          )}
        </div>
      </form>

      {/* Existing Banners List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Bannières existantes ({banners.length})</h3>
        {banners.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
            Aucune bannière. Ajoutez-en une ci-dessus.
          </div>
        ) : (
          banners.map(banner => (
            <div key={banner.id} className={`bg-gray-900 border rounded-xl overflow-hidden flex flex-col sm:flex-row ${banner.isActive ? 'border-green-600/30' : 'border-gray-800 opacity-60'}`}>
              {/* Preview */}
              <div className="w-full sm:w-48 h-28 flex-shrink-0 bg-gray-800 relative">
                <img src={getOptimizedUrl(banner.imageUrl, 300)} alt={banner.title} className="w-full h-full object-cover" />
                {!banner.isActive && (
                  <div className="absolute inset-0 bg-gray-950/60 flex items-center justify-center">
                    <span className="text-xs font-bold text-red-400 bg-gray-900 px-2 py-1 rounded">DÉSACTIVÉE</span>
                  </div>
                )}
              </div>

              {/* Info + Actions */}
              <div className="flex-1 p-4 flex flex-col sm:flex-row justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-white font-bold text-sm truncate">{banner.title || '(Sans titre)'}</h4>
                  <p className="text-gray-500 text-xs truncate">{banner.subtitle}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>Ordre: {banner.order}</span>
                    {banner.ctaActionType && banner.ctaActionType !== 'none' && (
                      <span className="text-blue-400">
                        {banner.ctaActionType === 'external' && `Lien: ${banner.ctaAction}`}
                        {banner.ctaActionType === 'category' && `Catégorie: ${banner.ctaAction}`}
                        {banner.ctaActionType === 'product' && `Produit: ${banner.ctaAction}`}
                        {banner.ctaActionType === 'page' && `Page: ${banner.ctaAction}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleToggleBanner(banner)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${banner.isActive ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600 hover:text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {banner.isActive ? 'Actif' : 'Inactif'}
                  </button>
                  <button onClick={() => startEditBanner(banner)}
                    className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                    Modifier
                  </button>
                  <button onClick={() => banner.id && handleDeleteBanner(banner.id)}
                    className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors">
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderSubscriptions = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Gestion des Abonnements</h2>
        <Button onClick={saveTiers} className="bg-green-600">Sauvegarder</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase bg-gray-800">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Min</th>
              <th className="px-4 py-3">Max</th>
              <th className="px-4 py-3">Prix (FBu)</th>
              <th className="px-4 py-3">NIF ?</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, idx) => (
              <tr key={tier.id} className="border-b border-gray-800 bg-gray-900">
                <td className="px-4 py-3"><input value={tier.label} onChange={e => handleTierChange(idx, 'label', e.target.value)} className="bg-transparent border border-gray-700 rounded p-1 w-full text-white" /></td>
                <td className="px-4 py-3"><input type="number" value={tier.min} onChange={e => handleTierChange(idx, 'min', Number(e.target.value))} className="bg-transparent border border-gray-700 rounded p-1 w-20 text-white" /></td>
                <td className="px-4 py-3"><input type="number" value={tier.max === null ? 0 : tier.max} onChange={e => handleTierChange(idx, 'max', Number(e.target.value) || null)} className="bg-transparent border border-gray-700 rounded p-1 w-20 text-white" placeholder="∞" /></td>
                <td className="px-4 py-3"><input type="number" value={tier.price} onChange={e => handleTierChange(idx, 'price', Number(e.target.value))} className="bg-transparent border border-gray-700 rounded p-1 w-24 text-white" /></td>
                <td className="px-4 py-3"><input type="checkbox" checked={tier.requiresNif} onChange={e => handleTierChange(idx, 'requiresNif', e.target.checked)} className="accent-blue-500" /></td>
                <td className="px-4 py-3"><button onClick={() => removeTier(idx)} className="text-red-500 hover:text-white">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" onClick={addTier}>+ Ajouter un palier</Button>
    </div>
  );

  const [upgradingUser, setUpgradingUser] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const TIER_OPTIONS = [
    { label: 'Gratuit (0-5 produits)', maxProducts: 5, tierLabel: 'Gratuit' },
    { label: 'Starter (6-15 produits)', maxProducts: 15, tierLabel: 'Starter' },
    { label: 'Pro (16-30 produits)', maxProducts: 30, tierLabel: 'Pro' },
    { label: 'Elite (31-50 produits)', maxProducts: 50, tierLabel: 'Elite' },
    { label: 'Illimité (51+)', maxProducts: 99999, tierLabel: 'Illimité' },
  ];

  const handleUpgradeUser = async (userId: string, option: typeof TIER_OPTIONS[0]) => {
    try {
      await updateUserSubscription(userId, { maxProducts: option.maxProducts, tierLabel: option.tierLabel });
      // Notifier le vendeur du changement d'abonnement
      await createNotification({
        userId,
        type: 'subscription_change',
        title: 'Abonnement modifié',
        body: `Votre abonnement a été mis à jour vers "${option.tierLabel}" (${option.maxProducts >= 99999 ? 'illimité' : option.maxProducts + ' produits max'}).`,
        read: false,
        createdAt: Date.now(),
      });
      setUpgradingUser(null);
      toast(`Abonnement mis à jour: ${option.label}`, 'success');
      refreshData();
    } catch (err) {
      console.error('Erreur upgrade:', err);
      toast('Erreur lors de la mise à jour.', 'error');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await updateUserProfile(userId, { role: newRole });
      toast(`Rôle modifié en "${newRole}"`, 'success');
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
        title: 'Abonnement renouvelé',
        body: 'Votre abonnement a été renouvelé pour 30 jours.',
        read: false,
        createdAt: Date.now(),
      });
      toast(`Abonnement de ${userName} renouvelé pour 30 jours`, 'success');
      refreshData();
    } catch (err) {
      console.error('Erreur renouvellement:', err);
      toast('Erreur lors du renouvellement.', 'error');
    }
  };

  // --- CURRENCY ACTIONS ---
  const toggleCurrencyStatus = async (currency: Currency) => {
    await updateCurrency(currency.id, { isActive: !currency.isActive });
    setCurrencies(prev => prev.map(c => c.id === currency.id ? { ...c, isActive: !c.isActive } : c));
    toast(`Devise ${currency.code} ${!currency.isActive ? 'activée' : 'désactivée'}`, 'success');
  };

  // --- Filtered sellers/users ---
  const filteredUsers = users.filter(u => {
    // Search
    if (sellerSearch) {
      const q = sellerSearch.toLowerCase();
      const match = u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.whatsapp?.includes(q) || u.sellerDetails?.phone?.includes(q);
      if (!match) return false;
    }
    // Country
    if (sellerCountryFilter !== 'all' && u.sellerDetails?.countryId !== sellerCountryFilter && u.role === 'seller') return false;
    // Status
    if (sellerStatusFilter === 'active' && u.isSuspended) return false;
    if (sellerStatusFilter === 'suspended' && !u.isSuspended) return false;
    if (sellerStatusFilter === 'expiring') {
      const exp = u.sellerDetails?.subscriptionExpiresAt;
      if (!exp || exp - Date.now() > 7 * 24 * 60 * 60 * 1000 || exp < Date.now()) return false;
    }
    // Tier
    if (sellerTierFilter !== 'all' && u.sellerDetails?.tierLabel !== sellerTierFilter) return false;
    return true;
  });

  // Seller stats
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

  const renderUsers = () => (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">Utilisateurs ({users.length})</h2>

      {/* Seller Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-blue-400">{allSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Vendeurs</p>
        </div>
        <div className="bg-gray-900 border border-green-900/30 rounded-xl p-3 text-center cursor-pointer hover:bg-gray-800/50" onClick={() => setSellerStatusFilter('active')}>
          <p className="text-2xl font-black text-green-400">{activeSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Actifs</p>
        </div>
        <div className="bg-gray-900 border border-red-900/30 rounded-xl p-3 text-center cursor-pointer hover:bg-gray-800/50" onClick={() => setSellerStatusFilter('suspended')}>
          <p className="text-2xl font-black text-red-400">{suspendedSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Suspendus</p>
        </div>
        <div className="bg-gray-900 border border-yellow-900/30 rounded-xl p-3 text-center cursor-pointer hover:bg-gray-800/50" onClick={() => setSellerStatusFilter('expiring')}>
          <p className="text-2xl font-black text-yellow-400">{expiringSoonSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Expire bientôt</p>
        </div>
        <div className="bg-gray-900 border border-orange-900/30 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-orange-400">{expiredSellers.length}</p>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Expirés</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <input
          type="text"
          placeholder="Rechercher par nom, email ou téléphone..."
          value={sellerSearch}
          onChange={e => setSellerSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500 placeholder-gray-500"
        />
        <div className="flex flex-wrap gap-2">
          <select value={sellerCountryFilter} onChange={e => setSellerCountryFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none">
            <option value="all">Tous les pays</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
          </select>
          <select value={sellerStatusFilter} onChange={e => setSellerStatusFilter(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none">
            <option value="all">Tous statuts</option>
            <option value="active">Actifs</option>
            <option value="suspended">Suspendus</option>
            <option value="expiring">Expire &lt;7j</option>
          </select>
          <select value={sellerTierFilter} onChange={e => setSellerTierFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none">
            <option value="all">Tous les plans</option>
            {TIER_OPTIONS.map(t => <option key={t.tierLabel} value={t.tierLabel}>{t.tierLabel}</option>)}
          </select>
          {(sellerSearch || sellerCountryFilter !== 'all' || sellerStatusFilter !== 'all' || sellerTierFilter !== 'all') && (
            <button onClick={() => { setSellerSearch(''); setSellerCountryFilter('all'); setSellerStatusFilter('all'); setSellerTierFilter('all'); }}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700">
              Effacer filtres
            </button>
          )}
          <span className="text-xs text-gray-500 self-center ml-auto">{filteredUsers.length} résultat(s)</span>
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
                    {u.isSuspended && <span className="ml-1 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full">SUSPENDU</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  {u.sellerDetails?.tierLabel && (
                    <div className="mt-0.5">
                      <p className="text-[10px] text-blue-400">
                        Plan: {u.sellerDetails.tierLabel} ({u.sellerDetails.maxProducts || '?'} max)
                        {u.sellerDetails.countryId && (() => {
                          const c = countries.find(cc => cc.id === u.sellerDetails!.countryId);
                          return c ? <span className="ml-1 text-gray-500">{c.flag}</span> : null;
                        })()}
                      </p>
                      {/* Visual expiration timer */}
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
                              {days <= 0 ? 'EXPIRÉ' : `${days}j`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                {onContactUser && (
                  <button onClick={() => onContactUser(u)}
                    className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                    💬
                  </button>
                )}
                {u.whatsapp && (
                  <a href={`https://wa.me/${u.whatsapp}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-600/30 text-xs font-bold rounded-lg hover:bg-green-600 hover:text-white transition-colors">
                    📱
                  </a>
                )}
                {u.role === 'seller' && (
                  <>
                    <button onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                      className="px-3 py-1.5 bg-gray-700/50 text-gray-300 border border-gray-600/30 text-xs font-bold rounded-lg hover:bg-gray-600 hover:text-white transition-colors">
                      {expandedUserId === u.id ? '✕ Masquer' : '📋 Détails'}
                    </button>
                    <button onClick={() => setUpgradingUser(upgradingUser === u.id ? null : u.id)}
                      className="px-3 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-600/30 text-xs font-bold rounded-lg hover:bg-purple-600 hover:text-white transition-colors">
                      {upgradingUser === u.id ? '✕ Fermer' : '⬆ Abonnement'}
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
                    <option value="buyer">Acheteur</option>
                    <option value="seller">Vendeur</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                <button
                  onClick={async () => {
                    await updateUserProfile(u.id, { isVerified: !u.isVerified });
                    setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, isVerified: !usr.isVerified } : usr));
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${u.isVerified ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600 hover:text-white' : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-blue-600 hover:text-white'}`}
                >
                  {u.isVerified ? '✓ Verifie' : 'Verifier'}
                </button>
                <button onClick={() => toggleSuspend(u)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${u.isSuspended ? 'bg-green-600 text-white' : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 hover:bg-yellow-600 hover:text-white'}`}>
                  {u.isSuspended ? "Reactiver" : "Suspendre"}
                </button>
                <button onClick={() => deleteUserAction(u.id)} className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors">
                  🗑
                </button>
              </div>
            </div>

            {/* Upgrade Panel */}
            {upgradingUser === u.id && u.role === 'seller' && (
              <div className="mt-3 pt-3 border-t border-gray-800 animate-fade-in">
                <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Changer l'abonnement</p>
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
                {/* Informations personnelles */}
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Informations personnelles</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">CNI / Passport</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.cni || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Téléphone</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.phone || u.whatsapp || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Pays</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.countryId || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Province</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.province || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Commune</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.commune || '—'}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Quartier</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.quartier || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Boutique */}
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Boutique</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Nom boutique</p>
                      <p className="text-sm text-white font-medium">{u.sellerDetails.shopName || u.name}</p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Type de vente</p>
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${
                        u.sellerDetails.sellerType === 'shop' ? 'bg-green-600/20 text-green-400' :
                        u.sellerDetails.sellerType === 'street' ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-blue-600/20 text-blue-400'
                      }`}>
                        {u.sellerDetails.sellerType === 'shop' ? '🏪 Magasin Fixe' :
                         u.sellerDetails.sellerType === 'street' ? '🚶 Ambulant' : '🌐 En Ligne'}
                      </span>
                    </div>
                    {u.sellerDetails.shopImage && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase mb-1">Photo boutique</p>
                        <img src={getOptimizedUrl(u.sellerDetails.shopImage, 120)} alt="Boutique" className="w-20 h-14 rounded-lg object-cover" />
                      </div>
                    )}
                    {u.sellerDetails.gps?.lat && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">GPS</p>
                        <a
                          href={`https://www.google.com/maps?q=${u.sellerDetails.gps.lat},${u.sellerDetails.gps.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          📍 {u.sellerDetails.gps.lat.toFixed(4)}, {u.sellerDetails.gps.lng.toFixed(4)}
                        </a>
                      </div>
                    )}
                    {u.sellerDetails.locationUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">Lien Maps</p>
                        <a href={u.sellerDetails.locationUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline truncate block">
                          🔗 Voir sur la carte
                        </a>
                      </div>
                    )}
                  </div>
                  {u.sellerDetails.marketplace && (() => {
                    const mp = allMarketplaces.find(m => m.id === u.sellerDetails!.marketplace);
                    if (!mp) return null;
                    return (
                      <div className="mt-2">
                        <p className="text-[10px] text-gray-500 uppercase mb-1">Marché physique</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.color} text-white`}>{mp.icon} {mp.name}</span>
                      </div>
                    );
                  })()}
                  {u.sellerDetails.categories && u.sellerDetails.categories.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-500 uppercase mb-1">Catégories</p>
                      <div className="flex flex-wrap gap-1">
                        {u.sellerDetails.categories.map(cat => (
                          <span key={cat} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full border border-gray-700">{cat}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Légal & Documents */}
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Légal & Documents</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">NIF</p>
                      <p className={`text-sm font-medium ${u.sellerDetails.nif ? 'text-green-400' : 'text-gray-500'}`}>
                        {u.sellerDetails.nif || 'Non renseigné'}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 p-2.5 rounded-lg">
                      <p className="text-[10px] text-gray-500 uppercase">Registre Commerce</p>
                      <p className={`text-sm font-medium ${u.sellerDetails.registryNumber ? 'text-green-400' : 'text-gray-500'}`}>
                        {u.sellerDetails.registryNumber || 'Non renseigné'}
                      </p>
                    </div>
                    {u.sellerDetails.documents?.cniUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">Document CNI</p>
                        <a href={u.sellerDetails.documents.cniUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">📄 Voir le document</a>
                      </div>
                    )}
                    {u.sellerDetails.documents?.nifUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">Document NIF</p>
                        <a href={u.sellerDetails.documents.nifUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">📄 Voir le document</a>
                      </div>
                    )}
                    {u.sellerDetails.documents?.registryUrl && (
                      <div className="bg-gray-800/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">Doc. Registre</p>
                        <a href={u.sellerDetails.documents.registryUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">📄 Voir le document</a>
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

  const renderCountries = () => (
    <div className="space-y-8 animate-fade-in">
      {/* --- PAYS --- */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Pays Supportés</h2>
        <div className="flex gap-4 flex-wrap">
          {countries.map(c => (
            <div key={c.id} className={`bg-gray-900 p-4 rounded-xl border ${c.isActive ? 'border-green-600/30' : 'border-red-600/30 opacity-60'} flex flex-col items-center min-w-[140px]`}>
              <span className="text-4xl mb-2">{c.flag}</span>
              <h3 className="font-bold text-white">{c.name}</h3>
              <p className="text-xs text-gray-500 mb-2">{c.currency}</p>
              <div className="flex gap-2">
                <button onClick={() => toggleCountryStatus(c)} className={`px-3 py-1 rounded-lg text-xs font-bold ${c.isActive ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                  {c.isActive ? 'Actif' : 'Inactif'}
                </button>
                <button onClick={() => handleDeleteCountry(c.id)} className="px-2 py-1 rounded-lg text-xs font-bold bg-red-900/50 text-red-400 hover:bg-red-800">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddCountry} className="bg-gray-900 p-4 rounded-xl border border-gray-800 max-w-lg mt-4">
          <h3 className="font-bold text-white mb-4">Ajouter un pays</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input placeholder="Nom" className="bg-gray-800 p-2 rounded text-white text-sm" value={newCountry.name} onChange={e => setNewCountry({...newCountry, name: e.target.value})} required />
            <input placeholder="Code (RW)" className="bg-gray-800 p-2 rounded text-white text-sm" value={newCountry.code} onChange={e => setNewCountry({...newCountry, code: e.target.value})} required />
            <input placeholder="Devise" className="bg-gray-800 p-2 rounded text-white text-sm" value={newCountry.currency} onChange={e => setNewCountry({...newCountry, currency: e.target.value})} required />
            <input placeholder="Drapeau emoji" className="bg-gray-800 p-2 rounded text-white text-sm" value={newCountry.flag} onChange={e => setNewCountry({...newCountry, flag: e.target.value})} required />
          </div>
          <Button type="submit">Ajouter</Button>
        </form>
      </div>

      {/* --- MARCHÉS PHYSIQUES --- */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Marchés Physiques ({allMarketplaces.length})</h2>
        <p className="text-xs text-gray-500 mb-4">Les marchés apparaissent sur la page d'accueil et lors de l'inscription vendeur. Désactivez un pays pour masquer tous ses marchés.</p>

        {/* Liste des marchés groupés par pays */}
        {countries.map(country => {
          const countryMarkets = allMarketplaces.filter(m => m.countryId === country.id);
          if (countryMarkets.length === 0) return null;
          return (
            <div key={country.id} className="mb-4">
              <h4 className="text-sm font-bold text-gray-400 mb-2">{country.flag} {country.name}</h4>
              <div className="space-y-2">
                {countryMarkets.map(mp => (
                  <div key={mp.id} className={`flex items-center justify-between p-3 bg-gray-900 border rounded-lg ${mp.isActive ? 'border-gray-800' : 'border-red-900/30 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full ${mp.color}`}></span>
                      <span className="text-white text-sm font-medium">{mp.icon} {mp.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleMarketplace(mp)} className={`px-3 py-1 rounded-lg text-xs font-bold ${mp.isActive ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                        {mp.isActive ? 'Actif' : 'Inactif'}
                      </button>
                      <button onClick={() => handleDeleteMarketplace(mp.id)} className="px-2 py-1 rounded-lg text-xs font-bold bg-red-900/50 text-red-400 hover:bg-red-800">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Formulaire ajout marché */}
        <form onSubmit={handleAddMarketplace} className="bg-gray-900 p-4 rounded-xl border border-gray-800 max-w-lg mt-4">
          <h3 className="font-bold text-white mb-4">Ajouter un marché</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input placeholder="Nom du marché" className="bg-gray-800 p-2 rounded text-white text-sm" value={newMarket.name} onChange={e => setNewMarket({...newMarket, name: e.target.value})} required />
            <input placeholder="Icône (emoji)" className="bg-gray-800 p-2 rounded text-white text-sm w-20" value={newMarket.icon} onChange={e => setNewMarket({...newMarket, icon: e.target.value})} required />
            <select className="bg-gray-800 p-2 rounded text-white text-sm col-span-2" value={newMarket.countryId} onChange={e => setNewMarket({...newMarket, countryId: e.target.value})}>
              {countries.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
            </select>
          </div>
          <Button type="submit">Ajouter</Button>
        </form>
      </div>
    </div>
  );

  const renderCategories = () => (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">Catégories ({categories.length})</h2>
      <form onSubmit={handleAddCategory} className="bg-gray-900 border border-gray-800 p-4 rounded-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nom</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})} placeholder="Ex: Auto & Moto" required />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-500 mb-1 block">Icône</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm text-center" value={newCat.icon} onChange={e => setNewCat({...newCat, icon: e.target.value})} placeholder="🚗" required />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Slug</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" value={newCat.slug} onChange={e => setNewCat({...newCat, slug: e.target.value})} placeholder="auto-moto (auto-généré si vide)" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Sous-catégories (séparées par des virgules)</label>
          <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" value={newCat.subCategories} onChange={e => setNewCat({...newCat, subCategories: e.target.value})} placeholder="Ex: Pièces détachées, Accessoires, Pneus" />
        </div>
        <Button type="submit">Ajouter</Button>
      </form>
      <div className="space-y-2">
        {categories.map(cat => (
          <div key={cat.id} className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-white text-sm font-medium">{cat.icon} {cat.name}</span>
              <button onClick={() => deleteCategory(cat.id).then(refreshData)} className="text-red-500 hover:text-red-300 text-xs font-bold">Supprimer</button>
            </div>
            {cat.subCategories && cat.subCategories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {cat.subCategories.map(sub => (
                  <span key={sub} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{sub}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderCurrencies = () => (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">Gestion des Devises ({currencies.length})</h2>
      <p className="text-sm text-gray-400">Activez ou désactivez les devises disponibles pour les vendeurs lors de la création de produits.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {currencies.map(cur => (
          <div key={cur.id} className={`bg-gray-900 border rounded-xl p-4 flex items-center justify-between ${cur.isActive ? 'border-green-600/30' : 'border-gray-800 opacity-60'}`}>
            <div>
              <p className="text-white font-bold">{cur.symbol} <span className="text-gray-400 font-normal">({cur.code})</span></p>
              <p className="text-xs text-gray-500">{cur.name}</p>
              {cur.countryId !== 'intl' && (() => {
                const c = countries.find(cc => cc.id === cur.countryId);
                return c ? <p className="text-[10px] text-gray-600 mt-0.5">{c.flag} {c.name}</p> : null;
              })()}
              {cur.countryId === 'intl' && <p className="text-[10px] text-gray-600 mt-0.5">🌐 International</p>}
            </div>
            <button
              onClick={() => toggleCurrencyStatus(cur)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                cur.isActive
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600 hover:text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {cur.isActive ? 'Actif' : 'Inactif'}
            </button>
          </div>
        ))}
      </div>
      {currencies.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
          <p className="text-3xl mb-2">💱</p>
          <p className="text-sm">Aucune devise configurée. Lancez le seed initial pour ajouter les devises par défaut.</p>
        </div>
      )}
    </div>
  );

  const tabs: { id: AdminTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Vue Global' },
    { id: 'products', label: 'Produits', badge: pendingCount },
    { id: 'banners', label: 'Bannières' },
    { id: 'subs', label: 'Abonnements' },
    { id: 'users', label: 'Utilisateurs' },
    { id: 'currencies', label: 'Devises' },
    { id: 'categories', label: 'Catégories' },
    { id: 'countries', label: 'Pays' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 pt-20 px-4 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
            Admin Console
          </h1>
          <Button variant="ghost" onClick={onBack}>Quitter</Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 border-b border-gray-800 mb-6 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors relative text-sm ${
                activeTab === t.id ? 'bg-gray-800 text-white border border-gray-700' : 'text-gray-500 hover:text-white'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">Utilisateurs</h3>
                <p className="text-3xl font-black text-white">{users.length}</p>
                <p className="text-xs text-gray-500 mt-1">{sellerCount} vendeurs</p>
              </div>
              <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">Produits</h3>
                <p className="text-3xl font-black text-blue-500">{approvedCount}</p>
                <p className="text-xs text-gray-500 mt-1">{products.length} total</p>
              </div>
              <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">En attente</h3>
                <p className={`text-3xl font-black ${pendingCount > 0 ? 'text-yellow-500' : 'text-green-500'}`}>{pendingCount}</p>
                <p className="text-xs text-gray-500 mt-1">à valider</p>
              </div>
              <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">Bannières</h3>
                <p className="text-3xl font-black text-purple-500">{banners.filter(b => b.isActive).length}</p>
                <p className="text-xs text-gray-500 mt-1">{banners.length} total</p>
              </div>
            </div>
            {pendingCount > 0 && (
              <button onClick={() => { setActiveTab('products'); setProductFilter('pending'); }}
                className="w-full bg-yellow-600/10 border border-yellow-600/30 text-yellow-400 p-4 rounded-xl text-sm font-bold hover:bg-yellow-600/20 transition-colors">
                {pendingCount} produit(s) en attente de validation — Cliquez pour modérer
              </button>
            )}
            {expiringSoonSellers.length > 0 && (
              <button onClick={() => { setActiveTab('users'); setSellerStatusFilter('expiring'); }}
                className="w-full bg-orange-600/10 border border-orange-600/30 text-orange-400 p-4 rounded-xl text-sm font-bold hover:bg-orange-600/20 transition-colors">
                {expiringSoonSellers.length} vendeur(s) avec abonnement expirant dans moins de 7 jours
              </button>
            )}

            {/* Stats par Marketplace */}
            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Vendeurs par Marché</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {allMarketplaces.map(mp => {
                  const mpSellers = users.filter(u => u.role === 'seller' && u.sellerDetails?.marketplace === mp.id);
                  const mpProducts = allProducts.filter(p => p.marketplace === mp.id && p.status === 'approved');
                  return (
                    <div key={mp.id} className={`bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3`}>
                      <span className={`w-10 h-10 ${mp.color} rounded-lg flex items-center justify-center text-lg`}>{mp.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{mp.name.replace('Marché de ', '').replace('Marché du ', '')}</p>
                        <p className="text-xs text-gray-500">{mpSellers.length} vendeur(s) · {mpProducts.length} produit(s)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'products' && renderProducts()}
        {activeTab === 'banners' && renderBanners()}
        {activeTab === 'subs' && renderSubscriptions()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'currencies' && renderCurrencies()}
        {activeTab === 'categories' && renderCategories()}
        {activeTab === 'countries' && renderCountries()}
      </div>

      {/* Reject reason modal */}
      {rejectingProductId && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRejectingProductId(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Raison du rejet</h3>
            <p className="text-sm text-gray-400">Expliquez au vendeur pourquoi ce produit est rejete.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Ex: Images de mauvaise qualite, description insuffisante..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-red-500 outline-none resize-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectingProductId(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Annuler</button>
              <button
                onClick={confirmReject}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Rejeter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
