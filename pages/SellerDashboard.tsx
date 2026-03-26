import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Product, User, ProductStatus, Category, Currency, SubscriptionRequest } from '../types';
import { addProduct, getSellerProducts, getSellerAllProducts, deleteProduct, syncProductCount, getCategories, updateUserProfile, resubmitProduct, updateProduct, getActiveCurrencies, getMySubscriptionRequests } from '../services/firebase';
import { uploadImages, uploadImage, getOptimizedUrl } from '../services/cloudinary';
import { generateBlurhash } from '../utils/blurhash';
import { INITIAL_SUBSCRIPTION_TIERS, CURRENCY, PROVINCES_BY_COUNTRY, FREE_TIER_WARNING_AT, SUPPORT_WHATSAPP } from '../constants';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useCategories } from '../hooks/useCategories';
import { useProductScore } from '../hooks/useProductScore';
import { compressImages } from '../utils/imageCompressor';
import { generateDescription } from '../utils/descriptionTemplates';
import { getSubscriptionStatus } from '../utils/subscription';
import { SmartImageUpload } from '../components/SmartImageUpload';
import { SmartTitleInput } from '../components/SmartTitleInput';
import { ProductQualityScore } from '../components/ProductQualityScore';
import { ProductPreview } from '../components/ProductPreview';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

type Tab = 'overview' | 'products' | 'shop' | 'add_product' | 'verification';

export const SellerDashboard: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!currentUser || (currentUser.role !== 'seller' && currentUser.role !== 'admin')) {
    navigate('/');
    return null;
  }
  const { toast } = useToast();
  const { categories: firestoreCategories } = useCategories();
  const { queue: offlineQueue, queueCount, addToQueue, removeFromQueue, syncing, setSyncing } = useOfflineQueue();
  const isOnline = navigator.onLine;
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | ProductStatus>('all');
  const [subRequests, setSubRequests] = useState<SubscriptionRequest[]>([]);
  
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
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar || '');
  const [shopImageFile, setShopImageFile] = useState<File | null>(null);
  const [shopImagePreview, setShopImagePreview] = useState(currentUser.sellerDetails?.shopImage || '');
  const [gpsLoading, setGpsLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const shopImageInputRef = useRef<HTMLInputElement>(null);

  // Dynamic data (country-aware)
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const sellerCountryId = currentUser.sellerDetails?.countryId || 'bi';
  const sellerProvinces = PROVINCES_BY_COUNTRY[sellerCountryId] || [];

  // Subscription status — computed from shared utility (single source of truth)
  // Server-side enforcement via Firestore rules + Cloud Function cron.
  // This is UI-only: reflects data already validated server-side.

  // Form State
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [productCurrency, setProductCurrency] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [isWholesale, setIsWholesale] = useState(false);
  const [minOrderQty, setMinOrderQty] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [isAuction, setIsAuction] = useState(false);
  const [auctionDuration, setAuctionDuration] = useState('7');
  const [startingBid, setStartingBid] = useState('');

  // Product Quality Score
  const productScore = useProductScore({
    title, description: desc, price, category, subCategory, originalPrice,
    imageCount: imageFiles.length,
  });

  // Edit rejected product state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubCategory, setEditSubCategory] = useState('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editNewImages, setEditNewImages] = useState<File[]>([]);
  const [editNewPreviews, setEditNewPreviews] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);

  // Load currencies + marketplaces for seller's country
  useEffect(() => {
    getActiveCurrencies().then(all => {
      setCurrencies(all);
      // Default product currency = seller's country currency
      const countryCurrency = all.find(c => c.countryId === sellerCountryId);
      if (countryCurrency && !productCurrency) setProductCurrency(countryCurrency.code);
    });
  }, [sellerCountryId]);

  useEffect(() => {
    const load = async () => {
      const data = await getSellerAllProducts(currentUser.id);
      setMyProducts(data);
      const cats = await getCategories();
      setCategoriesList(cats);
      // Sync productCount with real active products
      syncProductCount(currentUser.id);
      // Fetch subscription request history
      getMySubscriptionRequests(currentUser.id).then(setSubRequests).catch(() => {});
    };
    load();
  }, [currentUser.id, activeTab]);

  const hasNif = !!currentUser.sellerDetails?.nif;
  // Count only active products (approved + pending), not rejected/deleted
  const currentCount = myProducts.filter(p => p.status === 'approved' || p.status === 'pending').length;

  // Subscription status — single source of truth from shared utility.
  // Server-side enforcement: Firestore rules + Cloud Function cron.
  // This is UI-only: reflects data already validated server-side.
  const subStatus = getSubscriptionStatus({
    maxProducts: currentUser.sellerDetails?.maxProducts,
    tierLabel: currentUser.sellerDetails?.tierLabel,
    subscriptionExpiresAt: currentUser.sellerDetails?.subscriptionExpiresAt,
    productCount: currentCount,
    hasNif,
  });
  const { currentTier, isExpired, isPaidTier, daysRemaining, isLimitReached, progressPercentage } = subStatus;

  // Warning flags
  const showUpgradeWarning = currentTier.id === 'free' && currentCount >= FREE_TIER_WARNING_AT;
  const showExpirationWarning = isPaidTier && daysRemaining !== null && daysRemaining <= 7 && !isExpired;
  const showUrgentWarning = isPaidTier && daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;
  const nextTier = INITIAL_SUBSCRIPTION_TIERS.find(t => t.min > (currentTier.max || 9999)) || currentTier;

  // UI-only toast for expired sellers visiting dashboard
  useEffect(() => {
    if (isPaidTier && isExpired) {
      toast(t('dashboard.subscriptionExpiredToast'), 'error');
    }
  }, [isExpired, isPaidTier]);

  const handleSmartImageAdd = useCallback(async (newFiles: File[], newPreviews: string[]) => {
    const total = imageFiles.length + newFiles.length;
    if (total > 5) {
      setFormError(t('dashboard.maxImages'));
      return;
    }
    setFormError('');

    // Show previews immediately (before compression)
    setImagePreviews(prev => [...prev, ...newPreviews]);

    // Compress in background
    setCompressing(true);
    try {
      const compressed = await compressImages(newFiles);
      setImageFiles(prev => [...prev, ...compressed]);
    } catch {
      // Fallback to originals
      setImageFiles(prev => [...prev, ...newFiles]);
    } finally {
      setCompressing(false);
    }
  }, [imageFiles.length]);

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const reorderImages = useCallback((from: number, to: number) => {
    setImageFiles(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    setImagePreviews(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const handleSuggestionSelect = useCallback((product: Product) => {
    if (product.category) setCategory(product.category);
    if (product.subCategory) setSubCategory(product.subCategory);
  }, []);

  const handleGenerateDescription = useCallback(() => {
    if (!title.trim()) {
      toast(t('dashboard.generateTitleFirst'), 'error');
      return;
    }
    const generated = generateDescription(title, category, price ? `${price} ${productCurrency || CURRENCY}` : undefined);
    setDesc(generated);
    toast(t('dashboard.descriptionGenerated'), 'success');
  }, [title, category, price, productCurrency, toast]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached) return;
    setFormError('');

    if (imageFiles.length === 0) {
      setFormError(t('dashboard.addPhoto'));
      return;
    }

    if (!title.trim() || !desc.trim() || !price || !category) {
      setFormError(t('dashboard.fillRequired'));
      return;
    }

    // Offline mode: save draft locally
    if (!navigator.onLine) {
      addToQueue({
        title: title.trim(),
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        currency: productCurrency || undefined,
        description: desc.trim(),
        category,
        subCategory,
        isWholesale,
        minOrderQuantity: isWholesale && minOrderQty ? Number(minOrderQty) : undefined,
        wholesalePrice: isWholesale && wholesalePrice ? Number(wholesalePrice) : undefined,
        isAuction,
        auctionEndTime: isAuction ? Date.now() + Number(auctionDuration) * 86400000 : undefined,
        startingBid: isAuction && startingBid ? Number(startingBid) : undefined,
      }, imagePreviews);
      setTitle(''); setPrice(''); setOriginalPrice(''); setDesc(''); setCategory(''); setSubCategory('');
      setImageFiles([]); setImagePreviews([]);
      setIsWholesale(false); setMinOrderQty(''); setWholesalePrice('');
      setIsAuction(false); setAuctionDuration('7'); setStartingBid('');
      toast(t('dashboard.savedOffline'), 'success');
      setActiveTab('products');
      return;
    }

    setLoading(true);
    try {
      setUploadProgress(t('dashboard.uploadingImages'));
      const imageUrls = await uploadImages(imageFiles);

      // Generate BlurHash from first image (instant placeholder for 2G/3G/offline)
      const blurhash = imageFiles[0] ? await generateBlurhash(imageFiles[0]) : null;

      setUploadProgress(t('dashboard.savingProduct'));
      await addProduct({
        title: title.trim(),
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        currency: productCurrency || undefined,
        description: desc.trim(),
        category,
        subCategory,
        images: imageUrls,
        blurhash: blurhash || undefined,
        isWholesale,
        minOrderQuantity: isWholesale && minOrderQty ? Number(minOrderQty) : undefined,
        wholesalePrice: isWholesale && wholesalePrice ? Number(wholesalePrice) : undefined,
        isAuction,
        auctionEndTime: isAuction ? Date.now() + Number(auctionDuration) * 24 * 60 * 60 * 1000 : undefined,
        startingBid: isAuction && startingBid ? Number(startingBid) : undefined,
      });

      // Reset form
      setTitle(''); setPrice(''); setOriginalPrice(''); setDesc(''); setCategory(''); setSubCategory('');
      setImageFiles([]); setImagePreviews([]);
      setIsWholesale(false); setMinOrderQty(''); setWholesalePrice('');
      setIsAuction(false); setAuctionDuration('7'); setStartingBid('');
      setUploadProgress('');

      // Refresh products list
      const data = await getSellerAllProducts(currentUser.id);
      setMyProducts(data);
      setActiveTab('products');
    } catch (error: any) {
      console.error('Erreur ajout produit:', error);
      setFormError(error?.message || t('dashboard.publishError'));
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const handleDeleteProduct = async (id: string) => {
      if (window.confirm(t('dashboard.confirmDelete'))) {
          await deleteProduct(id);
          setMyProducts(prev => prev.filter(p => p.id !== id));
      }
  };

  const handleResubmit = async (id: string) => {
      await resubmitProduct(id);
      setMyProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'pending' as ProductStatus, resubmittedAt: Date.now() } : p));
      toast(t('dashboard.resubmitted'), 'success');
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditTitle(product.title);
    setEditPrice(String(product.price));
    setEditDesc(product.description);
    setEditCategory(product.category);
    setEditSubCategory(product.subCategory || '');
    setEditImages(product.images || []);
    setEditNewImages([]);
    setEditNewPreviews([]);
  };

  const handleEditNewImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setEditNewImages(prev => [...prev, ...files]);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => setEditNewPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeEditExistingImage = (index: number) => {
    setEditImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeEditNewImage = (index: number) => {
    setEditNewImages(prev => prev.filter((_, i) => i !== index));
    setEditNewPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    const trimmedTitle = editTitle.trim();
    const numPrice = Number(editPrice);
    if (!trimmedTitle || !numPrice || !editCategory) {
      toast(t('dashboard.titleRequired'), 'error');
      return;
    }
    if (editImages.length === 0 && editNewImages.length === 0) {
      toast(t('dashboard.imageRequired'), 'error');
      return;
    }

    setEditLoading(true);
    try {
      let finalImages = [...editImages];
      if (editNewImages.length > 0) {
        const uploaded = await uploadImages(editNewImages, { folder: 'aurabuja-app-2026/products' });
        finalImages = [...finalImages, ...uploaded];
      }

      await updateProduct(editingProduct.id, {
        title: trimmedTitle,
        description: editDesc.trim(),
        price: numPrice,
        category: editCategory,
        subCategory: editSubCategory,
        images: finalImages,
      });

      // Resubmit for review
      await resubmitProduct(editingProduct.id);

      setMyProducts(prev => prev.map(p =>
        p.id === editingProduct.id
          ? { ...p, title: trimmedTitle, description: editDesc.trim(), price: numPrice, category: editCategory, subCategory: editSubCategory, images: finalImages, status: 'pending' as ProductStatus, resubmittedAt: Date.now() }
          : p
      ));

      setEditingProduct(null);
      toast(t('dashboard.productEdited'), 'success');
    } catch (err: any) {
      toast(err?.message || t('dashboard.editError'), 'error');
    } finally {
      setEditLoading(false);
    }
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
      toast(t('dashboard.gpsNotSupported'), 'error');
      return;
    }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      toast(t('dashboard.gpsNeedsHttps'), 'error');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setShopProfile(prev => ({
          ...prev,
          gps: { lat: position.coords.latitude, lng: position.coords.longitude },
        }));
        toast(t('dashboard.gpsCapturedSuccess'), 'success');
        setGpsLoading(false);
      },
      (error) => {
        console.error('[GPS]', error.code, error.message);
        let msg = t('dashboard.gpsErrorGeneric');
        switch (error.code) {
          case 1: msg = t('dashboard.gpsErrorDenied'); break;
          case 2: msg = t('dashboard.gpsErrorUnavailable'); break;
          case 3: msg = t('dashboard.gpsErrorTimeout'); break;
        }
        toast(msg, 'error');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
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
        toast(t('dashboard.profileUpdated'), 'success');
      } catch (err) {
        console.error('Erreur mise à jour profil:', err);
        toast(t('dashboard.profileSaveError'), 'error');
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

  const contactAdmin = () => {
    const supportNum = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];
    window.open(`https://wa.me/${supportNum.replace('+', '')}?text=${encodeURIComponent('Bonjour, je suis vendeur sur AuraBuja et j\'ai besoin d\'aide.')}`, '_blank', 'noopener,noreferrer');
  };

  // Sync offline queue when online
  const handleSyncQueue = async () => {
    if (syncing || !navigator.onLine || offlineQueue.length === 0) return;
    setSyncing(true);
    let synced = 0;
    for (const draft of offlineQueue) {
      try {
        // Convert base64 previews to files for upload
        const files: File[] = [];
        for (const dataUrl of draft.images) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          files.push(new File([blob], `draft_${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }
        const imageUrls = await uploadImages(files);
        const draftBlurhash = files[0] ? await generateBlurhash(files[0]) : null;
        await addProduct({ ...draft.data, images: imageUrls, blurhash: draftBlurhash || undefined });
        removeFromQueue(draft.id);
        synced++;
      } catch (err) {
        console.error('[OfflineSync] Failed:', draft.id, err);
      }
    }
    if (synced > 0) {
      toast(t('dashboard.syncSuccess', { count: synced }), 'success');
      const data = await getSellerAllProducts(currentUser.id);
      setMyProducts(data);
    }
    setSyncing(false);
  };

  // Auto-sync when coming back online
  useEffect(() => {
    const handler = () => {
      if (offlineQueue.length > 0) handleSyncQueue();
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [offlineQueue.length]);

  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
        {/* Offline Queue Banner */}
        {queueCount > 0 && (
          <div className={`${navigator.onLine ? 'bg-green-500/10 border-green-500/30' : 'bg-orange-500/10 border-orange-500/30'} border rounded-2xl p-4 flex items-center gap-3`}>
            <span className="text-2xl">{navigator.onLine ? '🔄' : '📦'}</span>
            <div className="flex-1">
              <p className={`${navigator.onLine ? 'text-green-400' : 'text-orange-400'} font-semibold text-sm`}>
                {t('dashboard.offlineQueue', { count: queueCount })}
              </p>
              <p className="text-gray-500 text-xs">
                {navigator.onLine ? t('dashboard.readyToSync') : t('dashboard.willSyncOnline')}
              </p>
            </div>
            {navigator.onLine && (
              <button
                onClick={handleSyncQueue}
                disabled={syncing}
                className="text-green-400 text-xs px-4 py-2 border border-green-500/30 rounded-xl hover:bg-green-500/10 transition-colors disabled:opacity-50"
              >
                {syncing ? t('dashboard.syncing') : t('dashboard.syncNow')}
              </button>
            )}
          </div>
        )}

        {/* Welcome Banner */}
        <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 rounded-2xl p-6 border border-blue-800/50 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-20%,rgba(59,130,246,0.3),transparent_50%)]"></div>
            <div className="relative z-10">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                 <div>
                    <h2 className="text-2xl font-black text-white mb-1">
                      {currentUser.sellerDetails?.shopName || currentUser.name}
                    </h2>
                    <p className="text-blue-200/80 text-sm flex items-center gap-2">
                      {currentUser.isVerified && <span className="text-green-400">{t('dashboard.verified')}</span>}
                      {!hasNif && <span className="text-yellow-400">{t('dashboard.noNif')}</span>}
                      {currentUser.sellerDetails?.sellerType === 'shop' && `🏪 ${t('dashboard.shopType')}`}
                      {currentUser.sellerDetails?.sellerType === 'street' && `🚶 ${t('dashboard.streetType')}`}
                      {currentUser.sellerDetails?.sellerType === 'online' && `🌐 ${t('dashboard.onlineType')}`}
                    </p>
                 </div>

                 {/* Subscription Widget */}
                 <div className="bg-black/30 backdrop-blur-md p-4 rounded-xl border border-white/10 min-w-[220px]">
                    <div className="flex justify-between items-center text-xs mb-2">
                        <span className="text-blue-200 font-bold">{currentTier.label}</span>
                        <span className={`${isLimitReached ? 'text-red-400' : 'text-white'} font-bold`}>{currentCount} / {currentTier.max === null ? '∞' : currentTier.max}</span>
                    </div>
                    <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isLimitReached ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]' :
                            progressPercentage > 80 ? 'bg-gradient-to-r from-yellow-600 to-orange-400 shadow-[0_0_6px_rgba(234,179,8,0.3)]' :
                            progressPercentage > 50 ? 'bg-gradient-to-r from-gold-400 to-gold-600' :
                            'bg-gradient-to-r from-emerald-500 to-blue-400'
                          }`}
                          style={{ width: `${currentTier.max === null ? 100 : Math.min(progressPercentage, 100)}%` }}
                        ></div>
                    </div>
                    {isLimitReached && <p className="text-[10px] text-red-300 mt-1.5">{t('dashboard.limitReached')}. <button onClick={() => navigate('/plans')} className="underline text-gold-400 bg-transparent border-none cursor-pointer p-0">{t('dashboard.upgradePlan')}</button></p>}
                    {daysRemaining !== null && isPaidTier && !isExpired && (
                      <p className={`text-[10px] mt-1.5 font-medium ${daysRemaining <= 7 ? 'text-red-300' : daysRemaining <= 15 ? 'text-yellow-300' : 'text-green-300'}`}>
                        {daysRemaining} jour{daysRemaining > 1 ? 's' : ''} restant{daysRemaining > 1 ? 's' : ''}
                      </p>
                    )}
                 </div>
               </div>

               <div className="mt-5 flex flex-wrap gap-2">
                 <Button size="sm" variant="secondary" className="bg-white/10 border-white/20 hover:bg-white/20 text-white" onClick={() => setActiveTab('add_product')}>
                    {t('dashboard.addArticle')}
                 </Button>
                 <Button size="sm" variant="secondary" className="bg-white/5 border-white/10 hover:bg-white/15 text-white/80" onClick={() => setActiveTab('shop')}>
                    {t('dashboard.editShop')}
                 </Button>
               </div>
            </div>
        </div>

        {/* Expiration Alert */}
        {isExpired && isPaidTier && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div className="flex-1">
              <p className="text-sm text-red-400 font-bold">{t('dashboard.subscriptionExpired')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.expiredLimitMessage')}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => navigate('/plans')} className="px-3 py-1.5 bg-gold-400 text-gray-900 text-xs font-bold rounded-lg hover:bg-gold-300">{t('dashboard.renewPlan')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite renouveler mon abonnement AuraBuja.`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Expiration Warning (< 7 days, urgent at <= 3 days) */}
        {showExpirationWarning && (
          <div className={`${showUrgentWarning ? 'bg-red-900/20 border-red-500/30' : 'bg-yellow-900/20 border-yellow-500/30'} border rounded-xl p-4 flex items-start gap-3`}>
            <span className="text-2xl">{showUrgentWarning ? '&#9888;' : '&#9200;'}</span>
            <div className="flex-1">
              <p className={`text-sm font-bold ${showUrgentWarning ? 'text-red-400' : 'text-yellow-400'}`}>
                {showUrgentWarning ? 'URGENT — ' : ''}{t('dashboard.expiresIn', { days: daysRemaining })}
              </p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.renewMessage')}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => navigate('/plans')} className={`px-3 py-1.5 text-xs font-bold rounded-lg ${showUrgentWarning ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-gold-400 text-gray-900 hover:bg-gold-300'}`}>{t('dashboard.renewNow')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite renouveler mon abonnement AuraBuja. Mon plan expire dans ${daysRemaining} jour(s).`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade Warning (free plan, 3+ products) */}
        {showUpgradeWarning && !isExpired && (
          <div className="bg-gold-400/5 border border-gold-400/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">&#128640;</span>
            <div className="flex-1">
              <p className="text-sm text-gold-400 font-bold">{t('dashboard.upgradeTitle')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.upgradeMessage', { count: currentCount })}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => navigate('/plans')} className="px-3 py-1.5 bg-gold-400 text-gray-900 text-xs font-bold rounded-lg hover:bg-gold-300">{t('dashboard.viewPlans')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite souscrire a un plan AuraBuja.`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title={t('dashboard.statProducts')} value={myProducts.length} trend={`${myProducts.filter(p => p.status === 'approved').length} ${t('dashboard.active')}`} sub={t('dashboard.published')} color="blue" />
            <StatCard title={t('dashboard.statTotalViews')} value={myProducts.reduce((sum, p) => sum + (p.views || 0), 0).toLocaleString()} trend="👁" sub={t('dashboard.allListings')} color="blue" />
            <StatCard title={t('dashboard.statTotalLikes')} value={myProducts.reduce((sum, p) => sum + (p.likesCount || 0), 0)} trend="❤️" sub={t('dashboard.allListings')} color="red" />
            <StatCard title={t('dashboard.statPending')} value={myProducts.filter(p => p.status === 'pending').length} trend="⏳" sub={t('dashboard.adminValidation')} color="yellow" />
        </div>

        {/* ── My Subscription Card ── */}
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('dashboard.mySubscription')}</h3>

          {/* Current plan info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                isPaidTier && !isExpired
                  ? 'bg-gold-400/20 text-gold-400'
                  : isExpired
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {isPaidTier && !isExpired ? '★' : isExpired ? '!' : '○'}
              </div>
              <div>
                <p className="text-white font-bold text-sm">{currentTier.label}</p>
                <p className="text-gray-500 text-xs">
                  {currentTier.max === null
                    ? t('dashboard.subUnlimited')
                    : t('dashboard.subProductLimit', { max: currentTier.max })}
                </p>
              </div>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              isExpired
                ? 'bg-red-500/20 text-red-400'
                : isPaidTier
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-700 text-gray-400'
            }`}>
              {isExpired ? t('dashboard.subExpired') : isPaidTier ? t('dashboard.subActive') : t('dashboard.subFree')}
            </span>
          </div>

          {/* Expiration details (paid tier only) */}
          {isPaidTier && !isExpired && daysRemaining !== null && (
            <div className="bg-gray-900/50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-gray-400">{t('dashboard.subExpiresOn')}</span>
              <span className={`text-xs font-bold ${daysRemaining <= 7 ? 'text-red-400' : daysRemaining <= 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                {currentUser.sellerDetails?.subscriptionExpiresAt
                  ? new Date(currentUser.sellerDetails.subscriptionExpiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—'} ({daysRemaining} {t('dashboard.subDays')})
              </span>
            </div>
          )}

          {/* Usage bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-400">{t('dashboard.subUsage')}</span>
              <span className={`font-bold ${isLimitReached ? 'text-red-400' : 'text-white'}`}>{currentCount} / {currentTier.max === null ? '∞' : currentTier.max}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isLimitReached ? 'bg-red-500' : progressPercentage > 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${currentTier.max === null ? 100 : Math.min(progressPercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* CTA button */}
          <div>
            {(() => {
              const hasPendingRequest = subRequests.some(r => r.status === 'pending' || r.status === 'pending_validation');
              if (hasPendingRequest) {
                return (
                  <button disabled className="w-full py-2.5 bg-gray-700 text-gray-400 text-xs font-bold rounded-xl cursor-not-allowed flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
                    {t('dashboard.subPendingRequest')}
                  </button>
                );
              }
              if (isExpired) {
                return <button onClick={() => navigate('/plans')} className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-colors">{t('dashboard.subRenew')}</button>;
              }
              return <button onClick={() => navigate('/plans')} className="w-full py-2.5 bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-xs font-bold rounded-xl transition-colors">{isPaidTier ? t('dashboard.subChangePlan') : t('dashboard.subUpgrade')}</button>;
            })()}
          </div>

          {/* Request history */}
          {subRequests.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('dashboard.subHistory')}</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {subRequests.slice(0, 5).map(req => (
                  <div key={req.id} className="flex items-center justify-between bg-gray-900/50 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        req.status === 'approved' ? 'bg-green-400' :
                        req.status === 'rejected' ? 'bg-red-400' :
                        req.status === 'pending_validation' ? 'bg-blue-400' :
                        'bg-yellow-400'
                      }`} />
                      <span className="text-white truncate">{req.planLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-medium ${
                        req.status === 'approved' ? 'text-green-400' :
                        req.status === 'rejected' ? 'text-red-400' :
                        req.status === 'pending_validation' ? 'text-blue-400' :
                        'text-yellow-400'
                      }`}>
                        {req.status === 'approved' ? t('dashboard.subApproved') :
                         req.status === 'rejected' ? t('dashboard.subRejected') :
                         req.status === 'pending_validation' ? t('dashboard.subValidating') :
                         t('dashboard.subPending')}
                      </span>
                      <span className="text-gray-600">{new Date(req.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>
              {subRequests.some(r => r.status === 'rejected' && r.rejectionReason) && (
                <div className="mt-2 bg-red-900/10 border border-red-800/20 rounded-lg p-2.5">
                  <p className="text-xs text-red-400">
                    {t('dashboard.subLastRejection')}: {subRequests.find(r => r.status === 'rejected')?.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rejected products alert */}
        {myProducts.filter(p => p.status === 'rejected').length > 0 && (
          <div className="bg-red-900/10 border border-red-800/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm text-red-400 font-bold">{t('dashboard.rejectedProducts', { count: myProducts.filter(p => p.status === 'rejected').length })}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.rejectedHint')}</p>
              <button onClick={() => { setActiveTab('products'); setProductStatusFilter('rejected'); }} className="text-xs text-blue-400 hover:underline mt-1">
                {t('dashboard.viewRejected')}
              </button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.quickActions')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: '➕', label: t('dashboard.addProduct'), action: () => setActiveTab('add_product') },
              { icon: '🎨', label: t('dashboard.myShopAction'), action: () => setActiveTab('shop') },
              { icon: '📦', label: t('dashboard.myProducts'), action: () => setActiveTab('products') },
              { icon: '💬', label: t('dashboard.contactAdmin'), action: contactAdmin },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-xl p-4 text-center transition-all group">
                <span className="text-2xl block mb-1 group-hover:scale-110 transition-transform">{item.icon}</span>
                <span className="text-xs text-gray-400 font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Top products by views */}
        {myProducts.filter(p => p.status === 'approved' && p.views > 0).length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.topByViews')}</h3>
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
                    
                    <h2 className="text-2xl font-black text-white mb-2">{t('dashboard.limitReachedTitle')}</h2>

                    {!hasNif ? (
                         <div className="mb-6">
                            <p className="text-gray-300 text-sm mb-4">
                                {t('dashboard.noNifLimit')}
                            </p>
                            <Button onClick={() => setActiveTab('shop')} className="w-full bg-blue-600 text-white">
                                {t('dashboard.addNifNow')}
                            </Button>
                         </div>
                    ) : (
                        <div className="mb-6 space-y-3">
                            <p className="text-gray-400 mb-4 text-sm leading-relaxed">
                                {t('dashboard.usedSlots', { max: currentTier.max, label: currentTier.label })}
                            </p>
                            <a
                              href="https://wa.me/25768515135"
                              target="_blank"
                              className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all"
                            >
                              <span>📱</span> {t('dashboard.whatsappUpgrade')}
                            </a>
                        </div>
                    )}

                    <button onClick={() => setActiveTab('overview')} className="mt-4 text-sm text-gray-500 hover:text-white underline">
                        {t('dashboard.backToDashboard')}
                    </button>
                </div>
            </div>
          );
      }

      return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setActiveTab('products')} className="text-gray-400 hover:text-white">{t('dashboard.backButton')}</button>
                <h2 className="text-xl font-bold text-white">{t('dashboard.addProductTitle')}</h2>
                <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                    {t('dashboard.quota', { current: currentCount, max: currentTier.max === null ? '∞' : currentTier.max })}
                </span>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              {/* Form Column */}
              <div className="flex-1 min-w-0">
                <form onSubmit={handleAddProduct} className="space-y-6">
                  {/* Quality Score */}
                  <ProductQualityScore score={productScore} />

                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">{t('dashboard.basicInfo')}</h3>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.categoryLabel')}</label>
                          <select
                              required value={category} onChange={e => { setCategory(e.target.value); setSubCategory(''); }}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
                          >
                              <option value="">{t('dashboard.selectPlaceholder')}</option>
                              {categoriesList.map(c => (
                                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                          </select>
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.subCategoryLabel')}</label>
                          <select
                              value={subCategory} onChange={e => setSubCategory(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
                              disabled={!category}
                          >
                              <option value="">{t('dashboard.selectPlaceholder')}</option>
                              {(categoriesList.find(c => c.id === category)?.subCategories || []).map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                              ))}
                          </select>
                       </div>
                    </div>

                    {/* Smart Title Input with autocomplete */}
                    <SmartTitleInput
                      value={title}
                      onChange={setTitle}
                      existingProducts={myProducts}
                      categories={categoriesList}
                      onSuggestionSelect={handleSuggestionSelect}
                    />

                    {/* Description with generate button */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-gray-400">{t('dashboard.detailedDescription')}</label>
                          <button
                            type="button"
                            onClick={handleGenerateDescription}
                            className="text-[10px] font-bold text-gold-400 hover:text-gold-300 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gold-400/10"
                          >
                            <span>✨</span> {t('dashboard.generateDescription')}
                          </button>
                        </div>
                        <textarea
                          required value={desc} onChange={e => setDesc(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-1 focus:ring-blue-500 outline-none min-h-[100px]"
                          placeholder={t('dashboard.descriptionPlaceholder')}
                        />
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                     <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">{t('dashboard.priceAndImages')}</h3>

                     <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.priceLabel')}</label>
                          <input
                            required type="number" min="0.01" step="any" value={price} onChange={e => setPrice(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.currencyLabel')}</label>
                          <select
                            value={productCurrency}
                            onChange={e => setProductCurrency(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            {currencies.map(c => <option key={c.id} value={c.code}>{c.symbol} ({c.code})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.oldPrice')}</label>
                          <input
                            type="number" min="0" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="—"
                          />
                        </div>
                     </div>

                    {/* B2B Wholesale Toggle */}
                    <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-xl p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`relative w-11 h-6 rounded-full transition-colors ${isWholesale ? 'bg-indigo-600' : 'bg-gray-700'}`}
                          onClick={() => setIsWholesale(!isWholesale)}>
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isWholesale ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-white">{t('dashboard.wholesaleToggle')}</span>
                          <p className="text-xs text-gray-500">{t('dashboard.wholesaleHint')}</p>
                        </div>
                      </label>
                      {isWholesale && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.minOrder')}</label>
                            <input
                              type="number" min="2" value={minOrderQty} onChange={e => setMinOrderQty(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                              placeholder="10"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.wholesalePrice')}</label>
                            <input
                              type="number" min="0" step="any" value={wholesalePrice} onChange={e => setWholesalePrice(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Auction Toggle */}
                    <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`relative w-11 h-6 rounded-full transition-colors ${isAuction ? 'bg-red-600' : 'bg-gray-700'}`}
                          onClick={() => { setIsAuction(!isAuction); if (!isAuction) setIsWholesale(false); }}>
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAuction ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-white">{t('dashboard.auctionToggle')}</span>
                          <p className="text-xs text-gray-500">{t('dashboard.auctionHint')}</p>
                        </div>
                      </label>
                      {isAuction && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.startingBid')}</label>
                            <input
                              type="number" min="1" value={startingBid} onChange={e => setStartingBid(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-1 focus:ring-red-500 outline-none"
                              placeholder="1000"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.auctionDuration')}</label>
                            <select
                              value={auctionDuration} onChange={e => setAuctionDuration(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-1 focus:ring-red-500 outline-none"
                            >
                              <option value="1">1 {t('dashboard.day')}</option>
                              <option value="3">3 {t('dashboard.days')}</option>
                              <option value="7">7 {t('dashboard.days')}</option>
                              <option value="14">14 {t('dashboard.days')}</option>
                              <option value="30">30 {t('dashboard.days')}</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Smart Image Upload */}
                    <SmartImageUpload
                      previews={imagePreviews}
                      maxImages={5}
                      onAdd={handleSmartImageAdd}
                      onRemove={removeImage}
                      onReorder={reorderImages}
                      compressing={compressing}
                    />
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

                  {/* Mobile Preview Toggle */}
                  <div className="md:hidden">
                    <ProductPreview
                      data={{
                        title, price, originalPrice, currency: productCurrency,
                        imagePreviews,
                        sellerName: currentUser.sellerDetails?.shopName || currentUser.name,
                        sellerAvatar: currentUser.avatar || '',
                        isVerified: currentUser.isVerified,
                      }}
                      visible={showPreview}
                      onToggle={() => setShowPreview(v => !v)}
                    />
                  </div>

                  <div className="flex gap-4 pt-4 pb-24 md:pb-4">
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => setActiveTab('products')}>{t('dashboard.cancelButton')}</Button>
                    <Button type="submit" className="flex-[2]" isLoading={loading} disabled={loading || compressing}>
                      {loading ? t('dashboard.publishing') : compressing ? t('dashboard.optimizing') : t('dashboard.publishNow')}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Desktop Preview Sidebar */}
              <div className="hidden md:block w-[300px] flex-shrink-0">
                <div className="sticky top-24">
                  <ProductPreview
                    data={{
                      title, price, originalPrice, currency: productCurrency,
                      imagePreviews,
                      sellerName: currentUser.sellerDetails?.shopName || currentUser.name,
                      sellerAvatar: currentUser.avatar || '',
                      isVerified: currentUser.isVerified,
                    }}
                    visible={true}
                    onToggle={() => {}}
                  />
                </div>
              </div>
            </div>
        </div>
      );
  };

  const renderShopSettings = () => (
      <div className="max-w-2xl mx-auto animate-fade-in space-y-6 pb-24 md:pb-6">
          <h2 className="text-xl font-bold text-white mb-4">{t('dashboard.shopCustomization')}</h2>

          <form onSubmit={handleSaveProfile} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
              <div className="space-y-4">
                  {/* Logo / Image boutique */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">{t('dashboard.logoLabel')}</label>
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
                            {t('dashboard.changeImage')}
                          </button>
                          <p className="text-[10px] text-gray-500 mt-1">{t('dashboard.imageHint')}</p>
                        </div>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.shopNameLabel')}</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                        value={shopProfile.name}
                        onChange={(e) => setShopProfile({...shopProfile, name: e.target.value})}
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.bioLabel')}</label>
                      <textarea
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none min-h-[80px]"
                        value={shopProfile.bio}
                        onChange={(e) => setShopProfile({...shopProfile, bio: e.target.value})}
                        placeholder={t('dashboard.bioPlaceholder')}
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.whatsappLabel')}</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                        value={shopProfile.whatsapp}
                        onChange={(e) => setShopProfile({...shopProfile, whatsapp: e.target.value})}
                        placeholder="+257..."
                      />
                  </div>

                  {/* GPS — Capture automatique */}
                  <div className="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-blue-300">{t('dashboard.gpsLabel')}</label>
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
                          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('dashboard.capturingGps')}</>
                        ) : shopProfile.gps ? (
                          <>📍 {t('dashboard.gpsCaptured')} ({shopProfile.gps.lat.toFixed(4)}, {shopProfile.gps.lng.toFixed(4)})</>
                        ) : (
                          <>📍 {t('dashboard.captureGps')}</>
                        )}
                      </button>
                      <p className="text-[10px] text-gray-500">{t('dashboard.gpsHint')}</p>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.locationUrlLabel')}</label>
                      <input
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                          value={shopProfile.locationUrl}
                          onChange={(e) => setShopProfile({...shopProfile, locationUrl: e.target.value})}
                          placeholder="https://maps.google.com/..."
                      />
                  </div>
                  
                  {/* TYPE DE VENTE */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">{t('dashboard.sellingTypeLabel')}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: 'shop' as const, icon: '🏪', label: t('dashboard.fixedShop') },
                          { value: 'street' as const, icon: '🚶', label: t('dashboard.ambulant') },
                          { value: 'online' as const, icon: '🌐', label: t('dashboard.online') },
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

                  {/* PHOTO DE LA BOUTIQUE (distincte du logo/avatar) */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">{t('dashboard.shopPhotoLabel')}</label>
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
                            {shopImagePreview ? t('dashboard.changePhoto') : t('dashboard.addPhoto2')}
                          </button>
                          <p className="text-[10px] text-gray-500 mt-1">{t('dashboard.shopPhotoHint')}</p>
                        </div>
                      </div>
                  </div>

                  {/* CATÉGORIES */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">{t('dashboard.categoriesLabel')}</label>
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
                      <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.addressLabel')}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">{t('dashboard.provinceLabel')}</label>
                          {sellerProvinces.length > 0 ? (
                            <select
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                              value={shopProfile.province}
                              onChange={(e) => setShopProfile({...shopProfile, province: e.target.value})}
                            >
                              <option value="">{t('dashboard.selectPlaceholder')}</option>
                              {sellerProvinces.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          ) : (
                            <input
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                              value={shopProfile.province}
                              onChange={(e) => setShopProfile({...shopProfile, province: e.target.value})}
                              placeholder="Votre province ou région"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">{t('dashboard.communeLabel')}</label>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                            value={shopProfile.commune}
                            onChange={(e) => setShopProfile({...shopProfile, commune: e.target.value})}
                            placeholder="Ex: Bujumbura Mairie"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">{t('dashboard.quarterLabel')}</label>
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
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.nifLabel')}</label>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                            value={shopProfile.nif}
                            onChange={(e) => setShopProfile({...shopProfile, nif: e.target.value})}
                            placeholder={!hasNif ? t('dashboard.nifPlaceholder') : t('dashboard.nifRegistered')}
                          />
                          {!hasNif && <p className="text-xs text-red-400 mt-2">{t('dashboard.addNifHint')}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{t('dashboard.registryLabel')}</label>
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
                        {savingProfile ? t('dashboard.saving') : t('dashboard.saveChanges')}
                      </Button>
                  </div>
              </div>
          </form>
      </div>
  );

  const verificationStatus = currentUser.sellerDetails?.verificationStatus || 'none';
  const hasDocuments = !!(currentUser.sellerDetails?.documents?.cniUrl);

  const handleRequestVerification = async () => {
    if (!currentUser.sellerDetails?.documents?.cniUrl) {
      toast(t('dashboard.verifyUploadFirst'), 'error');
      return;
    }
    try {
      await updateUserProfile(currentUser.id, {
        'sellerDetails.verificationStatus': 'pending',
      });
      toast(t('dashboard.verifyRequestSent'), 'success');
    } catch {
      toast(t('dashboard.verifyRequestError'), 'error');
    }
  };

  const renderVerification = () => (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-6 pb-24 md:pb-6">
      <h2 className="text-xl font-bold text-white">{t('dashboard.verification')}</h2>

      {/* Statut actuel */}
      <div className={`p-5 rounded-2xl border ${
        verificationStatus === 'verified' ? 'bg-green-500/10 border-green-500/30' :
        verificationStatus === 'pending' ? 'bg-blue-500/10 border-blue-500/30' :
        verificationStatus === 'rejected' ? 'bg-red-500/10 border-red-500/30' :
        'bg-gray-800/50 border-gray-700'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">
            {verificationStatus === 'verified' ? '✅' : verificationStatus === 'pending' ? '⏳' : verificationStatus === 'rejected' ? '❌' : '🔒'}
          </span>
          <div>
            <p className={`font-bold ${
              verificationStatus === 'verified' ? 'text-green-400' :
              verificationStatus === 'pending' ? 'text-blue-400' :
              verificationStatus === 'rejected' ? 'text-red-400' : 'text-gray-300'
            }`}>
              {verificationStatus === 'verified' ? t('dashboard.verifyStatusVerified') :
               verificationStatus === 'pending' ? t('dashboard.verifyStatusPending') :
               verificationStatus === 'rejected' ? t('dashboard.verifyStatusRejected') :
               t('dashboard.verifyStatusNone')}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {verificationStatus === 'verified' ? t('dashboard.verifyStatusVerifiedDesc') :
               verificationStatus === 'pending' ? t('dashboard.verifyStatusPendingDesc') :
               verificationStatus === 'rejected' ? currentUser.sellerDetails?.verificationNote || t('dashboard.verifyStatusRejectedDesc') :
               t('dashboard.verifyStatusNoneDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* Documents uploadés */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold">{t('dashboard.verifyDocuments')}</h3>
        {currentUser.sellerDetails?.documents?.cniUrl ? (
          <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700">
            <span className="text-xl">🪪</span>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">{t('dashboard.verifyCNI')}</p>
              <p className="text-xs text-green-400">{t('dashboard.verifyUploaded')}</p>
            </div>
            <a href={currentUser.sellerDetails.documents.cniUrl} target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-400 hover:underline">{t('dashboard.verifyView')}</a>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('dashboard.verifyNoDocuments')}</p>
        )}
        {currentUser.sellerDetails?.documents?.nifUrl && (
          <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700">
            <span className="text-xl">📄</span>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">NIF</p>
              <p className="text-xs text-green-400">{t('dashboard.verifyUploaded')}</p>
            </div>
            <a href={currentUser.sellerDetails.documents.nifUrl} target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-400 hover:underline">{t('dashboard.verifyView')}</a>
          </div>
        )}
      </div>

      {/* Bouton demander vérification */}
      {verificationStatus !== 'verified' && verificationStatus !== 'pending' && (
        <Button onClick={handleRequestVerification} disabled={!hasDocuments} className="w-full">
          {t('dashboard.verifyRequest')}
        </Button>
      )}
      {!hasDocuments && verificationStatus !== 'verified' && (
        <p className="text-xs text-gray-500 text-center">{t('dashboard.verifyUploadHint')}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row">
       <aside className="hidden md:flex flex-col w-64 bg-gray-900 border-r border-gray-800 h-screen sticky top-0 p-4">
           {/* ... Sidebar content same as before ... */}
           <div className="flex items-center gap-2 mb-8 px-2">
               <div className="w-8 h-8 bg-gradient-to-br from-gold-400 to-gold-600 rounded-lg"></div>
               <span className="font-black text-xl text-white tracking-tight">{t('dashboard.sellerSpace')}</span>
           </div>
           <div className="space-y-2 flex-1">
               <SidebarItem id="overview" icon="📊" label={t('dashboard.overview')} />
               <SidebarItem id="products" icon="📦" label={t('dashboard.inventory')} count={myProducts.length} />
               <SidebarItem id="shop" icon="🎨" label={t('dashboard.myShop')} />
               <SidebarItem id="verification" icon="✅" label={t('dashboard.verification')} />
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
                   <span>🚪</span> {t('dashboard.backToSite')}
               </button>
           </div>
       </aside>

       <div className="md:hidden bg-gray-900/95 backdrop-blur-xl border-b border-gray-800 p-3 px-4 flex justify-between items-center sticky top-0 z-30">
           <span className="font-black text-lg text-white">{t('dashboard.sellerSpace')}</span>
           <div className="flex items-center gap-2">
             <div className="bg-gray-800 px-2 py-1 rounded-lg border border-gray-700">
               <span className={`text-xs font-bold ${isLimitReached ? 'text-red-400' : 'text-blue-400'}`}>
                 {currentCount}/{currentTier.max || '∞'}
               </span>
             </div>
             <LanguageSwitcher compact />
             <button onClick={() => navigate('/')} className="text-gray-400 p-1 hover:text-white">✕</button>
           </div>
       </div>

       <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-60px)] md:h-screen">
           {activeTab === 'overview' && renderOverview()}
           {activeTab === 'products' && (
               <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">{t('dashboard.myInventory')}</h2>
                    <Button size="sm" onClick={() => setActiveTab('add_product')}>{t('dashboard.newButton')}</Button>
                </div>

                {/* Status filter tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {([
                    { value: 'all' as const, label: t('dashboard.all'), count: myProducts.length },
                    { value: 'approved' as const, label: t('dashboard.approved'), count: myProducts.filter(p => p.status === 'approved').length },
                    { value: 'pending' as const, label: t('dashboard.pendingStatus'), count: myProducts.filter(p => p.status === 'pending').length },
                    { value: 'rejected' as const, label: t('dashboard.rejected'), count: myProducts.filter(p => p.status === 'rejected').length },
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
                    <p className="font-medium text-white mb-1">{t('dashboard.noProducts')}</p>
                    <p className="text-sm">{productStatusFilter === 'all' ? t('dashboard.startAdding') : t('dashboard.noProductsInCategory')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProducts.map(product => {
                      const cur = product.currency || CURRENCY;
                      return (
                      <div key={product.id} className={`bg-gray-800/50 border rounded-xl p-4 space-y-2 transition-all ${
                        product.status === 'rejected' ? 'border-red-800/40' :
                        product.status === 'pending' ? 'border-yellow-800/30' :
                        'border-gray-700/50'
                      }`}>
                        <div className="flex items-center gap-4">
                          <div className="relative flex-shrink-0">
                            <img
                              src={product.images[0] ? getOptimizedUrl(product.images[0], 80) : ''}
                              alt={product.title}
                              className="w-16 h-16 rounded-lg object-cover bg-gray-700"
                            />
                            {product.images.length > 1 && (
                              <span className="absolute -bottom-1 -right-1 bg-gray-700 text-gray-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-gray-600">
                                +{product.images.length - 1}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium text-sm truncate">{product.title}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-blue-400 text-sm font-bold">{product.price.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-500">{cur}</span></p>
                              {product.originalPrice && product.originalPrice > product.price && (
                                <p className="text-gray-600 text-xs line-through">{product.originalPrice.toLocaleString('fr-FR')}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                product.status === 'approved' ? 'bg-green-900/30 text-green-400 border border-green-800/30' :
                                product.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/30' :
                                'bg-red-900/30 text-red-400 border border-red-800/30'
                              }`}>
                                {product.status === 'approved' ? t('dashboard.statusActive') : product.status === 'pending' ? t('dashboard.statusPending') : t('dashboard.statusRejected')}
                              </span>
                              {product.isPromoted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-400 border border-purple-800/30">{t('dashboard.statusSponsored')}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>👁 {product.views}</span>
                              <span>❤️ {product.likesCount || 0}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                              title="Supprimer"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Rejection reason + edit & resubmit buttons */}
                        {product.status === 'rejected' && (
                          <div className="bg-red-900/10 border border-red-800/30 rounded-lg p-3 space-y-2">
                            {product.rejectionReason && (
                              <p className="text-xs text-red-400">
                                <span className="font-bold">{t('dashboard.rejectionReason')}</span> {product.rejectionReason}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => openEditProduct(product)}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                {t('dashboard.editAndResubmit')}
                              </button>
                              <button
                                onClick={() => handleResubmit(product.id)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                {t('dashboard.resubmitAsIs')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                )}
               </div>
           )}
           {activeTab === 'add_product' && renderAddProduct()}
           {activeTab === 'shop' && renderShopSettings()}
           {activeTab === 'verification' && renderVerification()}
       </main>

       {/* Mobile Bottom Nav — All tabs visible with labels */}
       <div className="md:hidden fixed bottom-0 w-full bg-gray-900/95 backdrop-blur-xl border-t border-gray-800 pb-safe z-50">
         <div className="flex justify-around items-center h-16">
           {([
             { id: 'overview' as Tab, icon: '📊', label: t('dashboard.mobileHome') },
             { id: 'products' as Tab, icon: '📦', label: t('dashboard.mobileProducts') },
             { id: 'add_product' as Tab, icon: '➕', label: t('dashboard.mobileAdd') },
             { id: 'shop' as Tab, icon: '🎨', label: t('dashboard.mobileShop') },
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

       {/* Edit Rejected Product Modal */}
       {editingProduct && (
         <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingProduct(null)}>
           <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between">
               <h3 className="text-lg font-bold text-white">{t('dashboard.editProductTitle')}</h3>
               <button onClick={() => setEditingProduct(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
             </div>

             {editingProduct.rejectionReason && (
               <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
                 <p className="text-xs text-red-400"><span className="font-bold">{t('dashboard.rejectionReason')}</span> {editingProduct.rejectionReason}</p>
               </div>
             )}

             <div>
               <label className="block text-xs font-bold text-gray-400 mb-1">Titre *</label>
               <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-blue-500" />
             </div>

             <div className="grid grid-cols-2 gap-3">
               <div>
                 <label className="block text-xs font-bold text-gray-400 mb-1">Prix *</label>
                 <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-blue-500" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-400 mb-1">Categorie *</label>
                 <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white outline-none">
                   <option value="">Choisir</option>
                   {firestoreCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                 </select>
               </div>
             </div>

             <div>
               <label className="block text-xs font-bold text-gray-400 mb-1">Description</label>
               <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 resize-none" />
             </div>

             {/* Existing images */}
             {editImages.length > 0 && (
               <div>
                 <label className="block text-xs font-bold text-gray-400 mb-2">Images actuelles</label>
                 <div className="flex gap-2 flex-wrap">
                   {editImages.map((img, i) => (
                     <div key={i} className="relative w-16 h-16">
                       <img src={getOptimizedUrl(img, 80)} className="w-full h-full object-cover rounded-lg" />
                       <button onClick={() => removeEditExistingImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center">&times;</button>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             {/* New images */}
             {editNewPreviews.length > 0 && (
               <div>
                 <label className="block text-xs font-bold text-gray-400 mb-2">Nouvelles images</label>
                 <div className="flex gap-2 flex-wrap">
                   {editNewPreviews.map((src, i) => (
                     <div key={i} className="relative w-16 h-16">
                       <img src={src} className="w-full h-full object-cover rounded-lg" />
                       <button onClick={() => removeEditNewImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center">&times;</button>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             <div>
               <input ref={editFileRef} type="file" accept="image/*" multiple onChange={handleEditNewImages} className="hidden" />
               <button onClick={() => editFileRef.current?.click()} className="w-full border border-dashed border-gray-600 rounded-xl p-3 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors">
                 + Ajouter des images
               </button>
             </div>

             <div className="flex gap-3 pt-2">
               <button onClick={() => setEditingProduct(null)} className="flex-1 px-4 py-2.5 bg-gray-800 text-gray-300 rounded-xl font-medium hover:bg-gray-700 transition-colors">
                 {t('common.cancel')}
               </button>
               <button
                 onClick={handleSaveEdit}
                 disabled={editLoading}
                 className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
               >
                 {editLoading ? t('common.loading') : t('dashboard.editAndResubmit')}
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default SellerDashboard;