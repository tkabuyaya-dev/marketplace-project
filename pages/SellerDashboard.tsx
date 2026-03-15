import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Product, User, ProductStatus, Category, MarketplaceId } from '../types';
import { addProduct, getSellerProducts, getSellerAllProducts, deleteProduct, getCategories, updateUserProfile, resubmitProduct, updateProduct } from '../services/firebase';
import { uploadImages, uploadImage, getOptimizedUrl } from '../services/cloudinary';
import { INITIAL_SUBSCRIPTION_TIERS, CURRENCY, PROVINCES_BURUNDI, MARKETPLACES, getMarketplaceInfo } from '../constants';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';

type Tab = 'overview' | 'products' | 'shop' | 'add_product';

export const SellerDashboard: React.FC = () => {
  const { currentUser, handleContactSeller } = useAppContext();
  const navigate = useNavigate();

  if (!currentUser || (currentUser.role !== 'seller' && currentUser.role !== 'admin')) {
    navigate('/');
    return null;
  }
  const { toast } = useToast();
  const { categories: firestoreCategories } = useCategories();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | ProductStatus>('all');
  
  // Profile Editable State
  const [shopProfile, setShopProfile] = useState({
      name: currentUser.name || '',
      bio: currentUser.bio || '',
      whatsapp: currentUser.whatsapp || '',
      avatar: currentUser.avatar || '',
      nif: currentUser.sellerDetails?.nif || '',
      registryNumber: currentUser.sellerDetails?.registryNumber || '',
      locationUrl: currentUser.sellerDetails?.locationUrl || '',
      gps: currentUser.sellerDetails?.gps || null as { lat: number; lng: number } | null,
      sellerType: (currentUser.sellerDetails?.sellerType || 'online') as 'shop' | 'street' | 'online',
      categories: currentUser.sellerDetails?.categories || [] as string[],
      province: currentUser.sellerDetails?.province || '',
      commune: currentUser.sellerDetails?.commune || '',
      quartier: currentUser.sellerDetails?.quartier || '',
      shopImage: currentUser.sellerDetails?.shopImage || '',
      marketplace: (currentUser.sellerDetails?.marketplace || 'autres') as MarketplaceId,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar || '');
  const [shopImageFile, setShopImageFile] = useState<File | null>(null);
  const [shopImagePreview, setShopImagePreview] = useState(currentUser.sellerDetails?.shopImage || '');
  const [gpsLoading, setGpsLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const shopImageInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const data = await getSellerAllProducts(currentUser.id);
      setMyProducts(data);
      const cats = await getCategories();
      setCategoriesList(cats);
    };
    load();
  }, [currentUser.id, activeTab]);

  const hasNif = !!currentUser.sellerDetails?.nif;
  const currentCount = myProducts.length;

  // LOGIQUE DE LIMITATION — Utilise maxProducts/tierLabel défini par l'admin (temps réel)
  const adminMaxProducts = currentUser.sellerDetails?.maxProducts;
  const adminTierLabel = currentUser.sellerDetails?.tierLabel;

  let currentTier;
  if (adminMaxProducts !== undefined && adminTierLabel) {
      // L'admin a configuré l'abonnement de ce vendeur → utiliser ses valeurs
      currentTier = {
        id: 'admin_set',
        label: adminTierLabel,
        min: 0,
        max: adminMaxProducts >= 99999 ? null : adminMaxProducts,
        price: 0,
        requiresNif: true,
      };
  } else if (!hasNif) {
      // Pas de NIF → tier gratuit limité
      currentTier = INITIAL_SUBSCRIPTION_TIERS[0]; // min:0, max:1
  } else {
      // Logique par défaut basée sur les tiers initiaux
      currentTier = INITIAL_SUBSCRIPTION_TIERS.find(t =>
        t.requiresNif && currentCount >= t.min && (t.max === null || currentCount <= t.max)
      ) || INITIAL_SUBSCRIPTION_TIERS[1];
  }

  const nextTier = INITIAL_SUBSCRIPTION_TIERS.find(t => t.min > (currentTier.max || 9999)) || currentTier;
  const isLimitReached = currentTier.max !== null && currentCount >= currentTier.max;
  const progressPercentage = currentTier.max ? (currentCount / currentTier.max) * 100 : 100;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const total = imageFiles.length + files.length;
    if (total > 5) {
      setFormError('Maximum 5 images par produit.');
      return;
    }
    setFormError('');
    setImageFiles(prev => [...prev, ...files]);

    // Generate previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached) return;
    setFormError('');

    if (imageFiles.length === 0) {
      setFormError('Ajoutez au moins une photo du produit.');
      return;
    }

    if (!title.trim() || !desc.trim() || !price || !category) {
      setFormError('Remplissez tous les champs obligatoires.');
      return;
    }

    setLoading(true);
    try {
      setUploadProgress('Upload des images...');
      const imageUrls = await uploadImages(imageFiles);

      setUploadProgress('Enregistrement du produit...');
      await addProduct({
        title: title.trim(),
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        description: desc.trim(),
        category,
        subCategory,
        images: imageUrls,
      });

      // Reset form
      setTitle(''); setPrice(''); setOriginalPrice(''); setDesc(''); setCategory(''); setSubCategory('');
      setImageFiles([]); setImagePreviews([]);
      setUploadProgress('');

      // Refresh products list
      const data = await getSellerAllProducts(currentUser.id);
      setMyProducts(data);
      setActiveTab('products');
    } catch (error: any) {
      console.error('Erreur ajout produit:', error);
      setFormError(error?.message || 'Erreur lors de la publication. Réessayez.');
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const handleDeleteProduct = async (id: string) => {
      if (window.confirm('Voulez-vous vraiment supprimer ce produit ? Cette action est irreversible.')) {
          await deleteProduct(id);
          setMyProducts(prev => prev.filter(p => p.id !== id));
      }
  };

  const handleResubmit = async (id: string) => {
      await resubmitProduct(id);
      setMyProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'pending' as ProductStatus, resubmittedAt: Date.now() } : p));
      toast("Produit renvoye en validation !", 'success');
  };

  const filteredProducts = productStatusFilter === 'all'
    ? myProducts
    : myProducts.filter(p => p.status === productStatusFilter);

  const [savingProfile, setSavingProfile] = useState(false);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast("La géolocalisation n'est pas supportée par votre navigateur.", 'error');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setShopProfile(prev => ({
          ...prev,
          gps: { lat: position.coords.latitude, lng: position.coords.longitude },
        }));
        setGpsLoading(false);
      },
      (error) => {
        console.error(error);
        toast("Impossible de récupérer la position. Vérifiez vos permissions.", 'error');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleShopImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShopImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setShopImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const toggleShopCategory = (cat: string) => {
    setShopProfile(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingProfile(true);
      try {
        let avatarUrl = shopProfile.avatar;
        if (avatarFile) {
          avatarUrl = await uploadImage(avatarFile, { folder: 'aurabuja-app-2026/shops' });
        }

        let shopImageUrl = shopProfile.shopImage;
        if (shopImageFile) {
          shopImageUrl = await uploadImage(shopImageFile, { folder: 'aurabuja-app-2026/shops' });
        }

        const profileData: Record<string, any> = {
          name: shopProfile.name.trim(),
          bio: shopProfile.bio.trim(),
          whatsapp: shopProfile.whatsapp.trim(),
          avatar: avatarUrl,
          'sellerDetails.nif': shopProfile.nif.trim(),
          'sellerDetails.registryNumber': shopProfile.registryNumber.trim(),
          'sellerDetails.locationUrl': shopProfile.locationUrl.trim(),
          'sellerDetails.sellerType': shopProfile.sellerType,
          'sellerDetails.categories': shopProfile.categories,
          'sellerDetails.province': shopProfile.province.trim(),
          'sellerDetails.commune': shopProfile.commune.trim(),
          'sellerDetails.quartier': shopProfile.quartier.trim(),
          'sellerDetails.shopImage': shopImageUrl,
          'sellerDetails.marketplace': shopProfile.marketplace,
        };

        if (shopProfile.gps) {
          profileData['sellerDetails.gps'] = shopProfile.gps;
        }

        await updateUserProfile(currentUser.id, profileData);
        setShopProfile(prev => ({ ...prev, avatar: avatarUrl, shopImage: shopImageUrl }));
        // Update previews immediately with cache-busted URLs
        if (avatarFile) setAvatarPreview(avatarUrl);
        if (shopImageFile) setShopImagePreview(shopImageUrl);
        setAvatarFile(null);
        setShopImageFile(null);
        toast("Profil mis à jour avec succès !", 'success');
      } catch (err) {
        console.error('Erreur mise à jour profil:', err);
        toast("Erreur lors de la sauvegarde. Réessayez.", 'error');
      } finally {
        setSavingProfile(false);
      }
  };

  // --- SUB-COMPONENTS ---

  const SidebarItem = ({ id, icon, label, count }: { id: Tab, icon: string, label: string, count?: number }) => (
      <button 
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
            activeTab === id 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
          <div className="flex items-center gap-3">
              <span className={`text-xl ${activeTab === id ? 'scale-110' : 'group-hover:scale-110'} transition-transform`}>{icon}</span>
              <span className="font-medium text-sm">{label}</span>
          </div>
          {count !== undefined && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === id ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-500'}`}>
                  {count}
              </span>
          )}
      </button>
  );

  const StatCard = ({ title, value, sub, trend, color }: any) => (
      <div className="bg-gray-800/50 border border-gray-700/50 p-5 rounded-2xl relative overflow-hidden group hover:border-gray-600 transition-colors">
          <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-opacity group-hover:opacity-100`}></div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-2xl font-black text-white mb-1">{value}</h3>
          <div className="flex items-center gap-2 text-xs">
              <span className={`text-${color === 'red' ? 'red' : 'green'}-400 font-bold bg-${color === 'red' ? 'red' : 'green'}-500/10 px-1.5 py-0.5 rounded`}>
                  {trend}
              </span>
              <span className="text-gray-500">{sub}</span>
          </div>
      </div>
  );

  // --- VIEWS ---

  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
        {/* Welcome Banner with Subscription Info */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-6 border border-blue-800 relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
               <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Bonjour, {currentUser.name.split(' ')[0]} 👋</h2>
                  <p className="text-blue-200 text-sm">
                      {!hasNif ? "⚠️ Compte Limité (Pas de NIF)" : "Votre boutique est active."}
                  </p>
                  {currentUser.sellerDetails?.marketplace && (() => {
                    const mp = getMarketplaceInfo(currentUser.sellerDetails!.marketplace);
                    return <span className={`inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${mp.color} text-white`}>{mp.icon} {mp.name}</span>;
                  })()}
               </div>
               
               {/* Subscription Widget */}
               <div className="bg-gray-900/40 backdrop-blur-md p-3 rounded-xl border border-white/10 min-w-[200px]">
                  <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-blue-200 font-medium">{currentTier.label}</span>
                      <span className={`${isLimitReached ? 'text-red-400' : 'text-white'} font-bold`}>{currentCount} / {currentTier.max === null ? '∞' : currentTier.max}</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${isLimitReached ? 'bg-red-500' : 'bg-blue-400'}`} 
                        style={{ width: `${currentTier.max === null ? 100 : Math.min(progressPercentage, 100)}%` }}
                      ></div>
                  </div>
                  {isLimitReached && <p className="text-[10px] text-red-300 mt-1">Limite atteinte. {hasNif ? 'Upgrade requis.' : 'Ajoutez votre NIF.'}</p>}
               </div>
            </div>
            
            <div className="mt-6">
                 <Button size="sm" variant="secondary" className="bg-white/10 border-white/20 hover:bg-white/20 text-white" onClick={() => setActiveTab('add_product')}>
                    + Ajouter un article
                 </Button>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Produits" value={myProducts.length} trend={`${myProducts.filter(p => p.status === 'approved').length} actifs`} sub="publies" color="blue" />
            <StatCard title="Vues Total" value={myProducts.reduce((sum, p) => sum + (p.views || 0), 0).toLocaleString()} trend="👁" sub="toutes annonces" color="blue" />
            <StatCard title="Likes Total" value={myProducts.reduce((sum, p) => sum + (p.likesCount || 0), 0)} trend="❤️" sub="toutes annonces" color="red" />
            <StatCard title="En Attente" value={myProducts.filter(p => p.status === 'pending').length} trend="⏳" sub="validation admin" color="yellow" />
        </div>

        {/* Rejected products alert */}
        {myProducts.filter(p => p.status === 'rejected').length > 0 && (
          <div className="bg-red-900/10 border border-red-800/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm text-red-400 font-bold">{myProducts.filter(p => p.status === 'rejected').length} produit(s) rejete(s)</p>
              <p className="text-xs text-gray-400 mt-1">Consultez la raison du rejet et renvoyez apres correction.</p>
              <button onClick={() => { setActiveTab('products'); setProductStatusFilter('rejected'); }} className="text-xs text-blue-400 hover:underline mt-1">
                Voir les produits rejetes →
              </button>
            </div>
          </div>
        )}

        {/* Top products by views */}
        {myProducts.filter(p => p.status === 'approved' && p.views > 0).length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Top produits par vues</h3>
            <div className="space-y-2">
              {[...myProducts].filter(p => p.status === 'approved').sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-2.5">
                  <span className="text-xs font-bold text-gray-500 w-5 text-center">{i + 1}</span>
                  <img src={p.images[0] ? getOptimizedUrl(p.images[0], 40) : ''} alt="" className="w-8 h-8 rounded-md object-cover bg-gray-700" />
                  <span className="flex-1 text-sm text-white truncate">{p.title}</span>
                  <span className="text-xs text-gray-400">👁 {p.views}</span>
                  <span className="text-xs text-gray-400">❤️ {p.likesCount || 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );

  const renderAddProduct = () => {
      // LOGIQUE DE BLOCAGE SI LIMITE ATTEINTE
      if (isLimitReached) {
          return (
            <div className="max-w-md mx-auto animate-fade-in py-10 text-center">
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
                    <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-gray-700 shadow-inner">
                        <span className="text-4xl">🔒</span>
                    </div>
                    
                    <h2 className="text-2xl font-black text-white mb-2">Limite Atteinte</h2>
                    
                    {!hasNif ? (
                         <div className="mb-6">
                            <p className="text-gray-300 text-sm mb-4">
                                En tant que vendeur sans NIF, vous êtes limité à <strong>1 seul produit</strong>.
                            </p>
                            <Button onClick={() => setActiveTab('shop')} className="w-full bg-blue-600 text-white">
                                Ajouter mon NIF maintenant
                            </Button>
                         </div>
                    ) : (
                        <div className="mb-6 space-y-3">
                            <p className="text-gray-400 mb-4 text-sm leading-relaxed">
                                Vous avez utilisé vos <strong>{currentTier.max} emplacements</strong> du pack {currentTier.label}.
                            </p>
                            <a
                              href="https://wa.me/25779000000"
                              target="_blank"
                              className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all"
                            >
                              <span>📱</span> Contacter via WhatsApp pour un Upgrade
                            </a>
                        </div>
                    )}
                    
                    <button onClick={() => setActiveTab('overview')} className="mt-4 text-sm text-gray-500 hover:text-white underline">
                        Retour au tableau de bord
                    </button>
                </div>
            </div>
          );
      }

      return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setActiveTab('products')} className="text-gray-400 hover:text-white">← Retour</button>
                <h2 className="text-xl font-bold text-white">Ajouter un produit</h2>
                <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                    Quota: {currentCount}/{currentTier.max === null ? '∞' : currentTier.max}
                </span>
            </div>
            
            <form onSubmit={handleAddProduct} className="space-y-6">
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">Informations de base</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">Catégorie</label>
                          <select
                              required value={category} onChange={e => { setCategory(e.target.value); setSubCategory(''); }}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
                          >
                              <option value="">Sélectionner...</option>
                              {categoriesList.map(c => (
                                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                          </select>
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">Sous-catégorie</label>
                          <select
                              value={subCategory} onChange={e => setSubCategory(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
                              disabled={!category}
                          >
                              <option value="">Sélectionner...</option>
                              {(categoriesList.find(c => c.id === category)?.subCategories || []).map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                              ))}
                          </select>
                       </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">Nom du produit</label>
                        <input 
                          required value={title} onChange={e => setTitle(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-1 focus:ring-blue-500 outline-none"
                          placeholder="Ex: MacBook Pro M3..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">Description détaillée</label>
                        <textarea 
                          required value={desc} onChange={e => setDesc(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-1 focus:ring-blue-500 outline-none min-h-[100px]"
                          placeholder="Décrivez l'état, les caractéristiques..."
                        />
                    </div>
                </div>

                <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                     <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">Prix & Images</h3>
                     
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">Prix de vente (FBu) *</label>
                          <input
                            required type="number" min="100" value={price} onChange={e => setPrice(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">Ancien prix (optionnel)</label>
                          <input
                            type="number" min="0" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="—"
                          />
                        </div>
                     </div>

                    {/* Image Upload Zone */}
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">Photos du produit * (max 5)</label>

                      {/* Preview grid */}
                      {imagePreviews.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                          {imagePreviews.map((preview, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-700 group">
                              <img src={preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeImage(i)}
                                className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                ✕
                              </button>
                              {i === 0 && (
                                <span className="absolute bottom-1 left-1 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded">Principal</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleImageSelect}
                        className="hidden"
                      />

                      {imageFiles.length < 5 && (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-blue-500/50 transition-colors cursor-pointer bg-gray-900/30"
                        >
                          <div className="text-3xl mb-2">📸</div>
                          <p className="text-gray-300 font-medium text-sm">Cliquez pour ajouter des photos</p>
                          <p className="text-xs text-gray-500 mt-1">JPG, PNG ou WebP — max 10MB/image</p>
                        </div>
                      )}
                    </div>
                </div>

                {formError && (
                  <div className="bg-red-900/20 border border-red-500/40 text-red-300 text-sm p-3 rounded-xl">
                    {formError}
                  </div>
                )}

                {uploadProgress && (
                  <div className="bg-blue-900/20 border border-blue-500/40 text-blue-300 text-sm p-3 rounded-xl flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    {uploadProgress}
                  </div>
                )}

                <div className="flex gap-4 pt-4 pb-24 md:pb-4">
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => setActiveTab('products')}>Annuler</Button>
                    <Button type="submit" className="flex-[2]" isLoading={loading} disabled={loading}>
                      {loading ? 'Publication...' : 'Publier maintenant'}
                    </Button>
                </div>
            </form>
        </div>
      );
  };

  const renderShopSettings = () => (
      <div className="max-w-2xl mx-auto animate-fade-in space-y-6 pb-24 md:pb-6">
          <h2 className="text-xl font-bold text-white mb-4">Personnalisation Boutique</h2>

          <form onSubmit={handleSaveProfile} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
              <div className="space-y-4">
                  {/* Logo / Image boutique */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">Logo / Image boutique</label>
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-700 bg-gray-900 flex-shrink-0">
                          <img
                            src={avatarPreview || '/icons/icon-192.png'}
                            alt="Logo"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleAvatarSelect}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-blue-500 transition-colors"
                          >
                            Changer l'image
                          </button>
                          <p className="text-[10px] text-gray-500 mt-1">JPG, PNG ou WebP. Cette image sera visible sur votre page boutique.</p>
                        </div>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Nom de l'enseigne</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                        value={shopProfile.name}
                        onChange={(e) => setShopProfile({...shopProfile, name: e.target.value})}
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Bio / Description</label>
                      <textarea
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none min-h-[80px]"
                        value={shopProfile.bio}
                        onChange={(e) => setShopProfile({...shopProfile, bio: e.target.value})}
                        placeholder="Décrivez votre boutique en quelques mots..."
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">WhatsApp</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                        value={shopProfile.whatsapp}
                        onChange={(e) => setShopProfile({...shopProfile, whatsapp: e.target.value})}
                        placeholder="+257..."
                      />
                  </div>

                  {/* GPS — Capture automatique */}
                  <div className="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-blue-300">Localisation GPS de la boutique</label>
                      <button
                        type="button"
                        onClick={captureGPS}
                        disabled={gpsLoading}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                          shopProfile.gps
                            ? 'bg-green-600 hover:bg-green-500 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {gpsLoading ? (
                          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Capture en cours...</>
                        ) : shopProfile.gps ? (
                          <>📍 Position capturée ({shopProfile.gps.lat.toFixed(4)}, {shopProfile.gps.lng.toFixed(4)})</>
                        ) : (
                          <>📍 Capturer ma position GPS</>
                        )}
                      </button>
                      <p className="text-[10px] text-gray-500">Rendez-vous à votre boutique et cliquez pour capturer la position exacte. Les clients pourront vous localiser sur la carte.</p>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Lien Localisation (optionnel)</label>
                      <input
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                          value={shopProfile.locationUrl}
                          onChange={(e) => setShopProfile({...shopProfile, locationUrl: e.target.value})}
                          placeholder="https://maps.google.com/..."
                      />
                  </div>
                  
                  {/* TYPE DE VENTE */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">Type de vente</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: 'shop' as const, icon: '🏪', label: 'Magasin Fixe' },
                          { value: 'street' as const, icon: '🚶', label: 'Ambulant' },
                          { value: 'online' as const, icon: '🌐', label: 'En Ligne' },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setShopProfile({...shopProfile, sellerType: opt.value})}
                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-medium transition-all ${
                              shopProfile.sellerType === opt.value
                                ? 'bg-blue-600/20 border-blue-500 text-white'
                                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-xl">{opt.icon}</span>
                            <span className="text-xs">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                  </div>

                  {/* MARCHÉ PHYSIQUE */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">Marché physique</label>
                      <div className="grid grid-cols-1 gap-2">
                        {MARKETPLACES.map(mp => (
                          <button
                            key={mp.id}
                            type="button"
                            onClick={() => setShopProfile({...shopProfile, marketplace: mp.id})}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-bold transition-all text-left ${
                              shopProfile.marketplace === mp.id
                                ? `${mp.color} text-white border-transparent shadow-lg`
                                : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-lg">{mp.icon}</span>
                            <span>{mp.name}</span>
                          </button>
                        ))}
                      </div>
                  </div>

                  {/* PHOTO DE LA BOUTIQUE (distincte du logo/avatar) */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">Photo de la boutique / vitrine</label>
                      <div className="flex items-center gap-4">
                        <div className="relative w-24 h-16 rounded-lg overflow-hidden border-2 border-gray-700 bg-gray-900 flex-shrink-0">
                          {shopImagePreview ? (
                            <img src={shopImagePreview} alt="Boutique" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl">🏪</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <input ref={shopImageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleShopImageSelect} className="hidden" />
                          <button type="button" onClick={() => shopImageInputRef.current?.click()} className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-blue-500 transition-colors">
                            {shopImagePreview ? 'Changer la photo' : 'Ajouter une photo'}
                          </button>
                          <p className="text-[10px] text-gray-500 mt-1">Photo de votre enseigne ou devanture.</p>
                        </div>
                      </div>
                  </div>

                  {/* CATÉGORIES */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">Catégories principales</label>
                      <div className="flex flex-wrap gap-2">
                        {firestoreCategories.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleShopCategory(c.name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                              shopProfile.categories.includes(c.name)
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-transparent text-gray-500 border-gray-700 hover:border-gray-600'
                            }`}
                          >
                            {c.icon} {c.name}
                          </button>
                        ))}
                      </div>
                  </div>

                  {/* ADRESSE */}
                  <div className="bg-gray-900/50 border border-gray-700/50 p-4 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-gray-400 mb-1">Adresse</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Province</label>
                          <select
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                            value={shopProfile.province}
                            onChange={(e) => setShopProfile({...shopProfile, province: e.target.value})}
                          >
                            <option value="">Sélectionner...</option>
                            {PROVINCES_BURUNDI.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Commune / Ville</label>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                            value={shopProfile.commune}
                            onChange={(e) => setShopProfile({...shopProfile, commune: e.target.value})}
                            placeholder="Ex: Bujumbura Mairie"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Quartier / Avenue</label>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                            value={shopProfile.quartier}
                            onChange={(e) => setShopProfile({...shopProfile, quartier: e.target.value})}
                            placeholder="Ex: Rohero, Av. de la Liberté"
                          />
                        </div>
                      </div>
                  </div>

                  {/* SECTION NIF & REGISTRE */}
                  <div className={`p-4 rounded-xl border ${!hasNif ? 'bg-red-900/10 border-red-500/30' : 'bg-green-900/10 border-green-500/30'}`}>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">Numéro NIF</label>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                            value={shopProfile.nif}
                            onChange={(e) => setShopProfile({...shopProfile, nif: e.target.value})}
                            placeholder={!hasNif ? "Ajoutez votre NIF pour débloquer le compte..." : "Votre NIF est enregistré"}
                          />
                          {!hasNif && <p className="text-xs text-red-400 mt-2">Ajoutez un NIF pour publier plus de 1 produit.</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">N° Registre de Commerce (optionnel)</label>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                            value={shopProfile.registryNumber}
                            onChange={(e) => setShopProfile({...shopProfile, registryNumber: e.target.value})}
                            placeholder="Ex: RC/BUJ/2026-xxxx"
                          />
                        </div>
                      </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                      <Button type="submit" isLoading={savingProfile} disabled={savingProfile}>
                        {savingProfile ? 'Sauvegarde...' : 'Enregistrer les modifications'}
                      </Button>
                  </div>
              </div>
          </form>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row">
       <aside className="hidden md:flex flex-col w-64 bg-gray-900 border-r border-gray-800 h-screen sticky top-0 p-4">
           {/* ... Sidebar content same as before ... */}
           <div className="flex items-center gap-2 mb-8 px-2">
               <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"></div>
               <span className="font-black text-xl text-white tracking-tight">Espace <span className="text-blue-500">Vendeur</span></span>
           </div>
           <div className="space-y-2 flex-1">
               <SidebarItem id="overview" icon="📊" label="Vue d'ensemble" />
               <SidebarItem id="products" icon="📦" label="Inventaire" count={myProducts.length} />
               <SidebarItem id="shop" icon="🎨" label="Ma Boutique" />
           </div>
           <div className="mb-4 bg-gray-800 p-3 rounded-xl border border-gray-700">
               <div className="flex justify-between text-xs text-gray-400 mb-1">
                   <span>{currentTier.label}</span>
                   <span className={isLimitReached ? "text-red-400 font-bold" : "text-blue-400"}>{currentCount}/{currentTier.max || '∞'}</span>
               </div>
               <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                   <div className={`h-full ${isLimitReached ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(progressPercentage, 100)}%` }}></div>
               </div>
           </div>
           <div className="pt-4 border-t border-gray-800">
               <button onClick={() => navigate('/')} className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-white transition-colors">
                   <span>🚪</span> Retour au site
               </button>
           </div>
       </aside>

       <div className="md:hidden bg-gray-900/95 backdrop-blur-xl border-b border-gray-800 p-3 px-4 flex justify-between items-center sticky top-0 z-30">
           <span className="font-black text-lg text-white">Espace <span className="text-blue-500">Vendeur</span></span>
           <div className="flex items-center gap-2">
             <div className="bg-gray-800 px-2 py-1 rounded-lg border border-gray-700">
               <span className={`text-xs font-bold ${isLimitReached ? 'text-red-400' : 'text-blue-400'}`}>
                 {currentCount}/{currentTier.max || '∞'}
               </span>
             </div>
             <button onClick={() => navigate('/')} className="text-gray-400 p-1 hover:text-white">✕</button>
           </div>
       </div>

       <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-60px)] md:h-screen">
           {activeTab === 'overview' && renderOverview()}
           {activeTab === 'products' && (
               <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Mon Inventaire</h2>
                    <Button size="sm" onClick={() => setActiveTab('add_product')}>+ Nouveau</Button>
                </div>

                {/* Status filter tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {([
                    { value: 'all' as const, label: 'Tous', count: myProducts.length },
                    { value: 'approved' as const, label: 'Approuves', count: myProducts.filter(p => p.status === 'approved').length },
                    { value: 'pending' as const, label: 'En attente', count: myProducts.filter(p => p.status === 'pending').length },
                    { value: 'rejected' as const, label: 'Rejetes', count: myProducts.filter(p => p.status === 'rejected').length },
                  ]).map(tab => (
                    <button
                      key={tab.value}
                      onClick={() => setProductStatusFilter(tab.value)}
                      className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${
                        productStatusFilter === tab.value
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-transparent text-gray-500 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-8 text-center text-gray-400">
                    <div className="text-4xl mb-3">📦</div>
                    <p className="font-medium text-white mb-1">Aucun produit</p>
                    <p className="text-sm">{productStatusFilter === 'all' ? 'Commencez par ajouter votre premier article.' : 'Aucun produit dans cette categorie.'}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProducts.map(product => (
                      <div key={product.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-4">
                          <img
                            src={product.images[0] ? getOptimizedUrl(product.images[0], 80) : ''}
                            alt={product.title}
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-700"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium text-sm truncate">{product.title}</h4>
                            <p className="text-gray-400 text-xs">{product.price.toLocaleString('fr-FR')} {CURRENCY}</p>
                            <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              product.status === 'approved' ? 'bg-green-900/30 text-green-400' :
                              product.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                              'bg-red-900/30 text-red-400'
                            }`}>
                              {product.status === 'approved' ? 'Approuve' : product.status === 'pending' ? 'En attente' : 'Rejete'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-gray-500">👁 {product.views}</span>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                              title="Supprimer"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Rejection reason + resubmit button */}
                        {product.status === 'rejected' && (
                          <div className="bg-red-900/10 border border-red-800/30 rounded-lg p-3 space-y-2">
                            {product.rejectionReason && (
                              <p className="text-xs text-red-400">
                                <span className="font-bold">Raison du rejet :</span> {product.rejectionReason}
                              </p>
                            )}
                            <button
                              onClick={() => handleResubmit(product.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              Renvoyer en validation
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
               </div>
           )}
           {activeTab === 'add_product' && renderAddProduct()}
           {activeTab === 'shop' && renderShopSettings()}
       </main>

       {/* Mobile Bottom Nav — All tabs visible with labels */}
       <div className="md:hidden fixed bottom-0 w-full bg-gray-900/95 backdrop-blur-xl border-t border-gray-800 pb-safe z-50">
         <div className="flex justify-around items-center h-16">
           {([
             { id: 'overview' as Tab, icon: '📊', label: 'Accueil' },
             { id: 'products' as Tab, icon: '📦', label: 'Produits' },
             { id: 'add_product' as Tab, icon: '➕', label: 'Ajouter' },
             { id: 'shop' as Tab, icon: '🎨', label: 'Boutique' },
           ]).map(item => (
             <button
               key={item.id}
               onClick={() => setActiveTab(item.id)}
               className={`flex flex-col items-center justify-center w-full h-full space-y-0.5 ${
                 activeTab === item.id ? 'text-blue-400' : 'text-gray-500'
               }`}
             >
               <span className={`text-lg transition-transform ${activeTab === item.id ? 'scale-110' : ''}`}>{item.icon}</span>
               <span className="text-[9px] font-medium">{item.label}</span>
             </button>
           ))}
         </div>
       </div>
    </div>
  );
};

export default SellerDashboard;