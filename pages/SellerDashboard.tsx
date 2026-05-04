import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Product, User, ProductStatus, Category, Currency, SubscriptionRequest, BoostRequest } from '../types';
import { addProduct, getSellerProducts, getSellerAllProducts, deleteProduct, syncProductCount, getCategories, updateUserProfile, resubmitProduct, editAndResubmitProduct, getActiveCurrencies, subscribeToMyRequests, getProductActivityLast30Days, ActivityEntry, MAX_RESUBMIT_ATTEMPTS, subscribeToMyBoostRequests, getBuyerRequestStats, canContactBuyer } from '../services/firebase';
import { BoostProductModal } from '../components/BoostProductModal';
import { uploadImages, uploadImage, getOptimizedUrl, UploadError } from '../services/cloudinary';
import { probeConnectivity } from '../utils/connectivity';
import { generateBlurhash } from '../utils/blurhash';
import { INITIAL_SUBSCRIPTION_TIERS, CURRENCY, FREE_TIER_WARNING_AT, SUPPORT_WHATSAPP } from '../constants';
import { CITIES_BY_COUNTRY } from '../data/locations';
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
import { RenewSubscriptionModal } from '../components/RenewSubscriptionModal';
import { VerificationRequestModal } from '../components/VerificationRequestModal';
import { useOfflineQueue, type OfflineDraft, type SyncResult } from '../hooks/useOfflineQueue';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { getInventoryFromIDB, saveInventoryToIDB } from '../services/inventoryIdb';

type Tab = 'overview' | 'products' | 'shop' | 'add_product' | 'verification' | 'requests' | 'analytics' | 'boost';

export const SellerDashboard: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  if (!currentUser || (currentUser.role !== 'seller' && currentUser.role !== 'admin')) {
    navigate('/');
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
      </div>
    );
  }
  const { toast } = useToast();
  const { categories: firestoreCategories } = useCategories();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  /** Timestamp (ms) of the last successful Firestore fetch. null = no fetch yet
   *  this session; if myProducts is non-empty AND inventoryFreshAt is null,
   *  we're rendering from the IDB cache (data is from a previous session). */
  const [inventoryFreshAt, setInventoryFreshAt] = useState<number | null>(null);
  /** Timestamp of the cached snapshot (when older than this session, drives
   *  the "data from DD/MM HH:MM" staleness chip). */
  const [inventoryCachedAt, setInventoryCachedAt] = useState<number | null>(null);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | ProductStatus>('all');
  const [subRequests, setSubRequests] = useState<SubscriptionRequest[]>([]);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showVerifModal, setShowVerifModal] = useState(false);
  const [verifForm, setVerifForm] = useState({
    nif: currentUser.sellerDetails?.nif || '',
    registryNumber: currentUser.sellerDetails?.registryNumber || '',
    phone: currentUser.sellerDetails?.phone || currentUser.whatsapp || '',
  });
  const [verifSubmitting, setVerifSubmitting] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<ActivityEntry[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Buyer request stats (for feature banner in overview)
  const [requestStats, setRequestStats] = useState<{ todayCount: number; fulfilledCount: number } | null>(null);

  // Boost
  const [boostRequests, setBoostRequests] = useState<BoostRequest[]>([]);
  const [boostingProduct, setBoostingProduct] = useState<Product | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // ─── Offline draft sync ──────────────────────────────────────────────────────
  // syncFn is invoked by useOfflineQueue once per due draft (after a real
  // connectivity probe + per-draft backoff). Throwing here records the error on
  // the draft and reschedules; returning normally removes it from the queue.
  const syncOneDraft = useCallback(async (
    draft: OfflineDraft,
    report: (p: { stage: 'queued' | 'uploading-images' | 'saving-doc'; imagesUploaded?: number; imagesTotal?: number }) => void | Promise<void>,
  ) => {
    // Each stage is wrapped so the `lastError` surfaced in the UI tells the
    // seller WHICH step actually failed — "Failed to fetch" alone could mean
    // Cloudinary upload or Firestore write.
    // Blobs may be raw Blob (legacy) or File — Cloudinary upload needs a File
    // (it reads .name for the form-data filename).
    const files: File[] = draft.images.map((blob, i) =>
      blob instanceof File
        ? blob
        : new File([blob], `draft_${draft.id}_${i}.jpg`, { type: blob.type || 'image/jpeg' })
    );

    let imageUrls: string[];
    try {
      await report({ stage: 'uploading-images', imagesUploaded: 0, imagesTotal: files.length });
      imageUrls = await uploadImages(files, {}, (uploaded, total) => {
        // Fire-and-forget — the reporter persists to IDB. Awaiting per-image
        // would serialize cloud uploads with disk writes; we don't need that.
        void report({ stage: 'uploading-images', imagesUploaded: uploaded, imagesTotal: total });
      });
    } catch (err: any) {
      throw new Error(`Upload Cloudinary: ${err?.message || err}`);
    }
    if (imageUrls.length === 0) throw new Error(t('dashboard.uploadError') || 'Échec upload images');

    let draftBlurhash: string | null = null;
    try {
      draftBlurhash = files[0] ? await generateBlurhash(files[0]) : null;
    } catch { /* blurhash is best-effort, never block sync */ }

    try {
      await report({ stage: 'saving-doc' });
      // Use draft.id as the idempotency key — if the previous sync wrote the
      // doc but lost its response, addProduct() returns the existing doc
      // instead of creating a duplicate.
      await addProduct(
        { ...draft.data, images: imageUrls, blurhash: draftBlurhash || undefined },
        { idempotencyKey: draft.id },
      );
    } catch (err: any) {
      throw new Error(`Sauvegarde Firestore: ${err?.message || err}`);
    }
  }, [t]);

  const handleSyncComplete = useCallback(async (result: SyncResult) => {
    if (result.synced > 0) {
      toast(t('dashboard.syncSuccess', { count: result.synced }), 'success');
      try {
        const data = await getSellerAllProducts(currentUser.id);
        setMyProducts(data);
      } catch { /* refresh non-critical */ }
    }
    if (result.failed > 0) {
      toast(t('dashboard.syncPartialError', { count: result.failed }), 'error');
    }
  }, [currentUser.id, t, toast]);

  const { queue: offlineQueue, queueCount, addToQueue, syncing, sync } = useOfflineQueue({
    userId: currentUser.id,
    syncFn: syncOneDraft,
    onSyncComplete: handleSyncComplete,
  });

  const failedDrafts = useMemo(() => offlineQueue.filter(d => d.lastError), [offlineQueue]);

  // ─── Background Sync handoff from the SW ────────────────────────────────
  // The SW (public/sw-extras.js) shows a notification when connectivity
  // returns. Tapping it focuses the app and posts NUNULIA_SYNC_DRAFTS — we
  // run a sweep on receipt. We also honor ?syncDrafts=1 in the URL for the
  // case where the SW had to open a brand-new tab.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NUNULIA_SYNC_DRAFTS') {
        sync({ force: true });
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
      }
    };
  }, [sync]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('syncDrafts') === '1') {
      sync({ force: true });
      // Strip the query param so a refresh doesn't re-trigger.
      navigate(location.pathname, { replace: true });
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Network quality (used for banner + adaptive compression) ────────────
  // 'slow' = slow-2g/2g OR Save Data on. We compress harder and warn the
  // seller in advance. 'fast'/'offline' use defaults.
  const networkQuality = useNetworkQuality();
  const isSlowNetwork = networkQuality === 'slow';
  const compressionOptions = useMemo(
    () => isSlowNetwork ? { maxDimension: 900, quality: 0.70, webpQuality: 0.68 } : undefined,
    [isSlowNetwork]
  );

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
  const sellerCities = CITIES_BY_COUNTRY[sellerCountryId] ?? [];

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

  // Stable ref so the cache-first hydrate doesn't overwrite fresh network
  // data on a fast re-render.
  const myProductsRef = useRef(myProducts);
  useEffect(() => { myProductsRef.current = myProducts; }, [myProducts]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // 1. Cache-first: hydrate from IDB instantly. On a cold reload offline,
      //    the seller sees their inventory in <50ms instead of an empty list.
      if (inventoryFreshAt === null) {
        try {
          const cached = await getInventoryFromIDB(currentUser.id);
          if (!cancelled && cached && myProductsRef.current.length === 0) {
            setMyProducts(cached.products);
            setInventoryCachedAt(cached.ts);
          }
        } catch { /* IDB miss — proceed to network */ }
      }

      // 2. Network fetch. Failure here keeps the cached data on screen and
      //    surfaces the staleness chip. We do NOT clear myProducts on error.
      try {
        const data = await getSellerAllProducts(currentUser.id);
        if (cancelled) return;
        setMyProducts(data);
        setInventoryFreshAt(Date.now());
        setInventoryCachedAt(null);
        // Persist for next cold load. Fire-and-forget.
        void saveInventoryToIDB(currentUser.id, data);
      } catch (err) {
        // Network/Firestore down — keep cached snapshot, log for diagnostics.
        console.warn('[Dashboard] Inventory fetch failed, keeping cached snapshot', err);
      }

      try {
        const cats = await getCategories();
        if (!cancelled) setCategoriesList(cats);
      } catch { /* categories non-critical for offline browsing */ }

      // Sync productCount with real active products — best-effort, may fail offline
      try { await syncProductCount(currentUser.id); } catch { /* noop */ }
    };
    load();
    return () => { cancelled = true; };
    // inventoryFreshAt intentionally omitted — only re-run on user/tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, activeTab]);

  // Real-time listener for subscription requests
  useEffect(() => {
    const unsub = subscribeToMyRequests(currentUser.id, setSubRequests);
    return () => unsub();
  }, [currentUser.id]);

  // Fetch buyer request stats once on mount (for overview feature card)
  useEffect(() => {
    getBuyerRequestStats().then(setRequestStats).catch(() => {});
  }, []);

  // Real-time listener for boost requests
  useEffect(() => {
    const unsub = subscribeToMyBoostRequests(currentUser.id, setBoostRequests);
    return () => unsub();
  }, [currentUser.id]);

  // Load analytics when tab becomes active (lazy, once per session)
  useEffect(() => {
    if (activeTab !== 'analytics' || myProducts.length === 0 || analyticsData.length > 0) return;
    const productIds = myProducts.map(p => p.id).filter((id): id is string => Boolean(id));
    setAnalyticsLoading(true);
    getProductActivityLast30Days(productIds)
      .then(setAnalyticsData)
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, myProducts]);

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

  // Grace-phase downgrade (R19)
  const downgradePhase = currentUser.sellerDetails?.downgradePhase;
  const gracePhaseSince = currentUser.sellerDetails?.gracePhaseSince;
  const isInGrace = !!downgradePhase && downgradePhase < 3 && !!gracePhaseSince;
  const graceDaysElapsed = gracePhaseSince ? Math.floor((Date.now() - gracePhaseSince) / (1000 * 60 * 60 * 24)) : 0;
  const graceDaysLeft = isInGrace
    ? (downgradePhase === 1 ? Math.max(0, 3 - graceDaysElapsed) : Math.max(0, 14 - graceDaysElapsed))
    : 0;

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

    // Compress in background — adaptive options on slow networks save more
    // bytes upfront so the eventual upload has a fighting chance over 2G.
    setCompressing(true);
    try {
      const compressed = await compressImages(newFiles, undefined, compressionOptions);
      setImageFiles(prev => [...prev, ...compressed]);
    } catch {
      // Fallback to originals
      setImageFiles(prev => [...prev, ...newFiles]);
    } finally {
      setCompressing(false);
    }
  }, [imageFiles.length, compressionOptions]);

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

    // Single source of truth for the product payload — used by online publish,
    // offline queue, and the network-error fallback below.
    const productData: Partial<Product> = {
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
    };

    const resetForm = () => {
      setTitle(''); setPrice(''); setOriginalPrice(''); setDesc(''); setCategory(''); setSubCategory('');
      setImageFiles([]); setImagePreviews([]);
      setIsWholesale(false); setMinOrderQty(''); setWholesalePrice('');
    };

    const queueAsDraft = async (): Promise<boolean> => {
      const draftId = await addToQueue(productData, imageFiles);
      if (!draftId) {
        setFormError(t('dashboard.publishError'));
        return false;
      }
      resetForm();
      toast(t('dashboard.savedOffline'), 'success');
      setActiveTab('products');
      // Ask for notification permission contextually — only the first time
      // a seller queues offline. The browser respects the user's previous
      // 'denied' answer; we never ask twice. Fire-and-forget.
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try { void Notification.requestPermission(); } catch { /* old Safari */ }
      }
      return true;
    };

    setLoading(true);
    try {
      // Probe real connectivity, not just navigator.onLine — that flag is
      // unreliable on captive Wi-Fi and on Chrome DevTools' "Offline" preset
      // when a service worker is active. The probe is ~100-300ms when online,
      // and aborts in 5s when truly offline.
      const online = await probeConnectivity();
      if (!online) {
        await queueAsDraft();
        return;
      }

      setUploadProgress(t('dashboard.uploadingImages'));
      const imageUrls = await uploadImages(imageFiles);

      // Guard: never create a Firestore document without images (all uploads must succeed first)
      if (imageUrls.length === 0) throw new Error(t('dashboard.uploadError') || 'Échec upload images');

      // Generate BlurHash from first image (instant placeholder for 2G/3G/offline)
      const blurhash = imageFiles[0] ? await generateBlurhash(imageFiles[0]) : null;

      setUploadProgress(t('dashboard.savingProduct'));
      await addProduct({
        ...productData,
        images: imageUrls,
        blurhash: blurhash || undefined,
      });

      resetForm();

      // Refresh products list
      const data = await getSellerAllProducts(currentUser.id);
      setMyProducts(data);
      toast(t('dashboard.productSubmitSuccess'), 'success');
      // Inform seller about Algolia indexing delay — prevents "my product isn't searchable" panic
      setTimeout(() => toast(t('dashboard.searchDelayHint'), 'info'), 1800);
      setActiveTab('products');
    } catch (error: any) {
      // Network/timeout failure during upload means we never reached Cloudinary
      // — degrade gracefully into the offline queue rather than burning the
      // seller's work on a "Réseau indisponible" alert.
      const isOfflineish =
        error instanceof UploadError &&
        (error.kind === 'network' || error.kind === 'timeout');
      if (isOfflineish) {
        await queueAsDraft();
        return;
      }
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

  const handleBulkDelete = async () => {
    if (selectedProductIds.size === 0) return;
    if (!window.confirm(t('dashboard.confirmBulkDelete', { count: selectedProductIds.size }))) return;
    const ids = [...selectedProductIds];
    for (const id of ids) {
      try { await deleteProduct(id); } catch { /* silent — continue batch */ }
    }
    setMyProducts(prev => prev.filter(p => !p.id || !selectedProductIds.has(p.id)));
    setSelectedProductIds(new Set());
    setBulkSelectMode(false);
    toast(t('dashboard.bulkDeleteSuccess', { count: ids.length }), 'success');
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleResubmit = async (id: string) => {
    try {
      await resubmitProduct(id);
      setMyProducts(prev => prev.map(p =>
        p.id === id
          ? { ...p, status: 'pending' as ProductStatus, resubmittedAt: Date.now(), resubmitCount: (p.resubmitCount ?? 0) + 1 }
          : p
      ));
      toast(t('dashboard.resubmitted'), 'success');
    } catch (err: any) {
      if (err?.message === 'RESUBMIT_LIMIT_REACHED') {
        toast(t('dashboard.resubmitLimitReached'), 'error');
      } else {
        toast(t('dashboard.resubmitError'), 'error');
      }
    }
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

  // Open edit modal if navigated here from ProductDetail with a product to edit
  useEffect(() => {
    const editProduct = (location.state as any)?.editProduct as Product | undefined;
    if (editProduct) {
      setActiveTab('products');
      openEditProduct(editProduct);
      // Clear state to avoid re-opening on tab changes
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      let newBlurhash: string | undefined = undefined;
      if (editNewImages.length > 0) {
        const uploaded = await uploadImages(editNewImages, { folder: 'aurabuja-app-2026/products' });
        // New images prepended to front → regenerate blurhash from first new image
        finalImages = [...uploaded, ...finalImages];
        newBlurhash = (await generateBlurhash(editNewImages[0])) || undefined;
      }

      await editAndResubmitProduct(editingProduct.id, {
        title: trimmedTitle,
        description: editDesc.trim(),
        price: numPrice,
        category: editCategory,
        subCategory: editSubCategory,
        images: finalImages,
        ...(newBlurhash ? { blurhash: newBlurhash } : {}),
      });

      setMyProducts(prev => prev.map(p =>
        p.id === editingProduct.id
          ? { ...p, title: trimmedTitle, description: editDesc.trim(), price: numPrice, category: editCategory, subCategory: editSubCategory, images: finalImages, status: 'pending' as ProductStatus, resubmittedAt: Date.now(), resubmitCount: (p.resubmitCount ?? 0) + 1, ...(newBlurhash ? { blurhash: newBlurhash } : {}) }
          : p
      ));

      setEditingProduct(null);
      toast(t('dashboard.productEdited'), 'success');
    } catch (err: any) {
      if (err?.message === 'RESUBMIT_LIMIT_REACHED') {
        toast(t('dashboard.resubmitLimitReached'), 'error');
      } else {
        toast(err?.message || t('dashboard.editError'), 'error');
      }
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
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
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

  const SidebarItem = ({ id, icon, label, count, gold }: { id: Tab, icon: string, label: string, count?: number, gold?: boolean }) => (
      <button
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
            activeTab === id
            ? gold ? 'bg-gradient-to-r from-amber-500 to-gold-500 text-white shadow-lg shadow-amber-200/50 dark:shadow-amber-900/50' : 'bg-gold-400 text-gray-900 shadow-[0_4px_12px_rgba(245,200,66,0.35)]'
            : gold ? 'text-gold-700 dark:text-gold-400 hover:bg-gold-400/10 border border-gold-400/30 dark:border-gold-400/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
          <div className="flex items-center gap-3">
              <span className={`text-xl ${activeTab === id ? 'scale-110' : 'group-hover:scale-110'} transition-transform`}>{icon}</span>
              <span className="font-medium text-sm">{label}</span>
          </div>
          {count !== undefined && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                activeTab === id
                  ? gold ? 'bg-white/20 text-white' : 'bg-gray-900/15 text-gray-900'
                  : gold
                  ? 'bg-gold-400/20 text-gold-700 dark:text-gold-400 border border-gold-400/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
              }`}>
                  {count}
              </span>
          )}
      </button>
  );

  const StatCard = ({ title, value, sub, trend, color }: any) => (
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 p-5 rounded-2xl relative overflow-hidden group hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm dark:shadow-none">
          <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-opacity group-hover:opacity-100`}></div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-1">{value}</h3>
          <div className="flex items-center gap-2 text-xs">
              <span className={`text-${color === 'red' ? 'red' : 'green'}-600 dark:text-${color === 'red' ? 'red' : 'green'}-400 font-bold bg-${color === 'red' ? 'red' : 'green'}-500/10 px-1.5 py-0.5 rounded`}>
                  {trend}
              </span>
              <span className="text-gray-500">{sub}</span>
          </div>
      </div>
  );

  // --- VIEWS ---

  const contactAdmin = () => {
    const supportNum = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];
    window.open(`https://wa.me/${supportNum.replace('+', '')}?text=${encodeURIComponent('Bonjour, je suis vendeur sur Nunulia et j\'ai besoin d\'aide.')}`, '_blank', 'noopener,noreferrer');
  };

  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
        {/* Offline Queue Banner — auto-syncs in background; manual button forces a retry. */}
        {queueCount > 0 && (
          <div className={`border rounded-2xl p-4 space-y-3 ${
            failedDrafts.length > 0
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-green-500/10 border-green-500/30'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {failedDrafts.length > 0 ? '⚠️' : syncing ? '🔄' : '📦'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${
                  failedDrafts.length > 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  {failedDrafts.length > 0
                    ? t('dashboard.syncError', { count: failedDrafts.length })
                    : t('dashboard.offlineQueue', { count: queueCount })}
                </p>
                <p className="text-gray-500 text-xs">
                  {failedDrafts.length > 0
                    ? t('dashboard.syncErrorHint')
                    : syncing
                    ? t('dashboard.syncing')
                    : t('dashboard.willSyncOnline')}
                </p>
              </div>
              <button
                onClick={() => sync({ force: true })}
                disabled={syncing}
                className={`text-xs px-4 py-2 border rounded-xl transition-colors disabled:opacity-50 ${
                  failedDrafts.length > 0
                    ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
                    : 'text-green-400 border-green-500/30 hover:bg-green-500/10'
                }`}
              >
                {syncing
                  ? t('dashboard.syncing')
                  : failedDrafts.length > 0
                  ? t('dashboard.retrySync')
                  : t('dashboard.syncNow')}
              </button>
            </div>

            {/* Per-draft status rows — surface live progress AND lastError */}
            <div className="space-y-1.5 pl-9">
              {offlineQueue.map(draft => {
                const hasFailed = !!draft.lastError;
                const progress = draft.progress;
                const isUploading = progress?.stage === 'uploading-images';
                const isSaving = progress?.stage === 'saving-doc';
                const isActive = isUploading || isSaving;
                const uploaded = progress?.imagesUploaded ?? 0;
                const total = progress?.imagesTotal ?? 0;
                const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;

                let statusLabel: string;
                let statusColor: string;
                if (hasFailed) {
                  statusLabel = t('dashboard.syncStatusFailed');
                  statusColor = 'text-red-400';
                } else if (isUploading) {
                  statusLabel = t('dashboard.syncStageUploading', { current: uploaded + 1, total }) || `Photo ${uploaded + 1}/${total}`;
                  statusColor = 'text-blue-400';
                } else if (isSaving) {
                  statusLabel = t('dashboard.syncStageSaving') || 'Sauvegarde...';
                  statusColor = 'text-blue-400';
                } else if (syncing) {
                  statusLabel = t('dashboard.syncStatusPending');
                  statusColor = 'text-gray-400';
                } else {
                  statusLabel = t('dashboard.syncStatusWaiting');
                  statusColor = 'text-gray-500';
                }

                return (
                  <div key={draft.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-20 flex-shrink-0 truncate ${statusColor}`} title={statusLabel}>
                        {statusLabel}
                      </span>
                      <span className="text-xs text-gray-400 truncate flex-1">
                        {(draft.data.title as string | undefined) || t('dashboard.syncDraftNoTitle')}
                      </span>
                    </div>
                    {isActive && total > 0 && (
                      <div className="h-1 bg-gray-800/40 rounded-full overflow-hidden ml-[5.5rem] mt-0.5">
                        <div
                          className="h-full bg-blue-400 transition-all duration-300 ease-out"
                          style={{ width: `${isSaving ? 100 : pct}%` }}
                        />
                      </div>
                    )}
                    {hasFailed && draft.lastError && (
                      <span className="text-[10px] text-red-400/70 pl-[5.5rem] truncate" title={draft.lastError}>
                        {draft.lastError}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Welcome Banner */}
        <div className="bg-gradient-to-br from-amber-50 via-white to-white dark:from-blue-900 dark:via-indigo-900 dark:to-purple-900 rounded-2xl p-6 border border-gray-200 dark:border-blue-800/50 shadow-sm dark:shadow-none relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-20%,rgba(245,200,66,0.18),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_-20%,rgba(59,130,246,0.3),transparent_50%)]"></div>
            <div className="relative z-10">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                 <div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-1">
                      {currentUser.sellerDetails?.shopName || currentUser.name}
                    </h2>
                    <p className="text-gray-600 dark:text-blue-200/80 text-sm flex items-center gap-2">
                      {currentUser.isVerified && <span className="text-green-600 dark:text-green-400">{t('dashboard.verified')}</span>}
                      {!hasNif && <span className="text-yellow-600 dark:text-yellow-400">{t('dashboard.noNif')}</span>}
                      {currentUser.sellerDetails?.sellerType === 'shop' && `🏪 ${t('dashboard.shopType')}`}
                      {currentUser.sellerDetails?.sellerType === 'street' && `🚶 ${t('dashboard.streetType')}`}
                      {currentUser.sellerDetails?.sellerType === 'online' && `🌐 ${t('dashboard.onlineType')}`}
                    </p>
                 </div>

                 {/* Subscription Widget */}
                 <div className="bg-white/80 dark:bg-black/30 backdrop-blur-md p-4 rounded-xl border border-gray-200 dark:border-white/10 min-w-[220px]">
                    <div className="flex justify-between items-center text-xs mb-2">
                        <span className="text-gray-700 dark:text-blue-200 font-bold">{currentTier.label}</span>
                        <span className={`${isLimitReached ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'} font-bold`}>{currentCount} / {currentTier.max === null ? '∞' : currentTier.max}</span>
                    </div>
                    <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full origin-left transition-transform duration-700 ${
                            isLimitReached ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]' :
                            progressPercentage > 80 ? 'bg-gradient-to-r from-yellow-600 to-orange-400 shadow-[0_0_6px_rgba(234,179,8,0.3)]' :
                            progressPercentage > 50 ? 'bg-gradient-to-r from-gold-400 to-gold-600' :
                            'bg-gradient-to-r from-emerald-500 to-blue-400'
                          }`}
                          style={{ transform: `scaleX(${(currentTier.max === null ? 100 : Math.min(progressPercentage, 100)) / 100})` }}
                        ></div>
                    </div>
                    {isLimitReached && <p className="text-[10px] text-red-600 dark:text-red-300 mt-1.5">{t('dashboard.limitReached')}. <button onClick={() => navigate('/plans')} className="underline text-gold-600 dark:text-gold-400 bg-transparent border-none cursor-pointer p-0">{t('dashboard.upgradePlan')}</button></p>}
                    {daysRemaining !== null && isPaidTier && !isExpired && (
                      <p className={`text-[10px] mt-1.5 font-medium ${daysRemaining <= 7 ? 'text-red-600 dark:text-red-300' : daysRemaining <= 15 ? 'text-yellow-600 dark:text-yellow-300' : 'text-green-600 dark:text-green-300'}`}>
                        {daysRemaining} jour{daysRemaining > 1 ? 's' : ''} restant{daysRemaining > 1 ? 's' : ''}
                      </p>
                    )}
                 </div>
               </div>

               <div className="mt-5 flex flex-wrap gap-2">
                 {/* `!` prefix overrides the Button variant="secondary" defaults
                     (bg-gray-800 + text-white) which otherwise paint the text the
                     same colour as our custom backgrounds — the editShop button
                     was rendering as a white-on-white blank pill. */}
                 <Button size="sm" variant="secondary" className="!bg-gold-400 hover:!bg-gold-300 !border-gold-400 !text-gray-900 dark:!bg-white/10 dark:!border-white/20 dark:hover:!bg-white/20 dark:!text-white" onClick={() => setActiveTab('add_product')}>
                    {t('dashboard.addArticle')}
                 </Button>
                 <Button size="sm" variant="secondary" className="!bg-white !border-gray-200 hover:!bg-gray-50 !text-gray-700 dark:!bg-white/5 dark:!border-white/10 dark:hover:!bg-white/15 dark:!text-white/80" onClick={() => setActiveTab('shop')}>
                    {t('dashboard.editShop')}
                 </Button>
               </div>
            </div>
        </div>

        {/* Grace phase banner (R19) — replaces simple "Expired" alert */}
        {isExpired && isPaidTier && isInGrace && (
          <div className={`border rounded-xl p-4 flex items-start gap-3 ${
            downgradePhase === 1
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-500/30'
              : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-500/30'
          }`}>
            <span className="text-2xl">{downgradePhase === 1 ? '⏳' : '⚠️'}</span>
            <div className="flex-1">
              <p className={`text-sm font-bold ${downgradePhase === 1 ? 'text-amber-700 dark:text-amber-400' : 'text-orange-700 dark:text-orange-400'}`}>
                {downgradePhase === 1
                  ? t('dashboard.gracePh1Title', 'Période de grâce — encore {{days}} jour(s)', { days: graceDaysLeft })
                  : t('dashboard.gracePh2Title', 'Produits limités — encore {{days}} jour(s) avant suppression', { days: graceDaysLeft })}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {downgradePhase === 1
                  ? t('dashboard.gracePh1Body', 'Vos produits restent visibles. Renouvelez maintenant pour éviter leur masquage.')
                  : t('dashboard.gracePh2Body', 'Seuls 5 de vos produits sont encore visibles. Renouvelez pour les réactiver tous.')}
              </p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowRenewModal(true)} className="px-3 py-1.5 bg-gold-400 text-gray-900 text-xs font-bold rounded-lg hover:bg-gold-300">{t('dashboard.renewPlan')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite renouveler mon abonnement Nunulia.`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Expiration Alert (no grace phase) */}
        {isExpired && isPaidTier && !isInGrace && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div className="flex-1">
              <p className="text-sm text-red-700 dark:text-red-400 font-bold">{t('dashboard.subscriptionExpired')}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.expiredLimitMessage')}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowRenewModal(true)} className="px-3 py-1.5 bg-gold-400 text-gray-900 text-xs font-bold rounded-lg hover:bg-gold-300">{t('dashboard.renewPlan')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite renouveler mon abonnement Nunulia.`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Expiration Warning (< 7 days, urgent at <= 3 days) */}
        {showExpirationWarning && (
          <div className={`${showUrgentWarning ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-500/30' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-500/30'} border rounded-xl p-4 flex items-start gap-3`}>
            <span className="text-2xl">{showUrgentWarning ? '&#9888;' : '&#9200;'}</span>
            <div className="flex-1">
              <p className={`text-sm font-bold ${showUrgentWarning ? 'text-red-700 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                {showUrgentWarning ? 'URGENT — ' : ''}{t('dashboard.expiresIn', { days: daysRemaining })}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.renewMessage')}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowRenewModal(true)} className={`px-3 py-1.5 text-xs font-bold rounded-lg ${showUrgentWarning ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-gold-400 text-gray-900 hover:bg-gold-300'}`}>{t('dashboard.renewNow')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite renouveler mon abonnement Nunulia. Mon plan expire dans ${daysRemaining} jour(s).`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade Warning (free plan, 3+ products) */}
        {showUpgradeWarning && !isExpired && (
          <div className="bg-gold-50 dark:bg-gold-400/5 border border-gold-200 dark:border-gold-400/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">&#128640;</span>
            <div className="flex-1">
              <p className="text-sm text-gold-700 dark:text-gold-400 font-bold">{t('dashboard.upgradeTitle')}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.upgradeMessage', { count: currentCount })}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => navigate('/plans')} className="px-3 py-1.5 bg-gold-400 text-gray-900 text-xs font-bold rounded-lg hover:bg-gold-300">{t('dashboard.viewPlans')}</button>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi']}?text=Bonjour, je souhaite souscrire a un plan Nunulia.`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg">WhatsApp</a>
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

        {/* ── Buyer Requests Feature Banner ── */}
        <div
          onClick={() => setActiveTab('requests')}
          className="cursor-pointer relative overflow-hidden rounded-2xl border border-gold-400/40 bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-950/60 dark:via-gray-900 dark:to-gray-900 hover:border-gold-400/70 transition-all duration-300 group shadow-sm dark:shadow-none"
        >
          {/* Background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.18),transparent_60%)] pointer-events-none" />
          <div className="relative z-10 p-5">
            <div className="flex items-start justify-between gap-4">
              {/* Left: icon + title */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/30 to-gold-600/20 border border-gold-400/30 flex items-center justify-center text-2xl shrink-0">
                  🛒
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-gray-900 dark:text-white text-base">{t('dashboard.buyerRequestsCardTitle')}</h3>
                    {requestStats && requestStats.todayCount > 0 && (
                      <span className="text-[11px] bg-gold-400/20 text-gold-700 dark:text-gold-400 border border-gold-400/40 px-2 py-0.5 rounded-full font-bold animate-pulse shrink-0">
                        +{requestStats.todayCount} {t('dashboard.buyerRequestsToday')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1">{t('dashboard.buyerRequestsCardDesc')}</p>
                </div>
              </div>
              {/* Right: arrow */}
              <span className="text-gold-500/70 dark:text-gold-400/50 group-hover:text-gold-600 dark:group-hover:text-gold-400 group-hover:translate-x-1 transition-all text-xl shrink-0 mt-1">→</span>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-4 mb-4">
              {[
                { icon: '📍', label: t('dashboard.buyerRequestsFeat1') },
                { icon: '💬', label: t('dashboard.buyerRequestsFeat2') },
                { icon: '🔓', label: t('dashboard.buyerRequestsFeat3') },
              ].map(f => (
                <span key={f.label} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-400 bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/50 px-2.5 py-1 rounded-full">
                  <span>{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={e => { e.stopPropagation(); navigate('/demandes'); }}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-gold-400 hover:from-amber-400 hover:to-gold-300 text-gray-900 font-black rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30"
            >
              🔍 {t('dashboard.viewAllRequests')}
            </button>
          </div>
        </div>

        {/* ── My Subscription Card ── */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.mySubscription')}</h3>

          {/* Current plan info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                isPaidTier && !isExpired
                  ? 'bg-gold-400/20 text-gold-700 dark:text-gold-400'
                  : isExpired
                  ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}>
                {isPaidTier && !isExpired ? '★' : isExpired ? '!' : '○'}
              </div>
              <div>
                <p className="text-gray-900 dark:text-white font-bold text-sm">{currentTier.label}</p>
                <p className="text-gray-500 text-xs">
                  {currentTier.max === null
                    ? t('dashboard.subUnlimited')
                    : t('dashboard.subProductLimit', { max: currentTier.max })}
                </p>
              </div>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              isExpired
                ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                : isPaidTier
                ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {isExpired ? t('dashboard.subExpired') : isPaidTier ? t('dashboard.subActive') : t('dashboard.subFree')}
            </span>
          </div>

          {/* Expiration details (paid tier only) */}
          {isPaidTier && !isExpired && daysRemaining !== null && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">{t('dashboard.subExpiresOn')}</span>
              <span className={`text-xs font-bold ${daysRemaining <= 7 ? 'text-red-600 dark:text-red-400' : daysRemaining <= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                {currentUser.sellerDetails?.subscriptionExpiresAt
                  ? new Date(currentUser.sellerDetails.subscriptionExpiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—'} ({daysRemaining} {t('dashboard.subDays')})
              </span>
            </div>
          )}

          {/* Usage bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-600 dark:text-gray-400">{t('dashboard.subUsage')}</span>
              <span className={`font-bold ${isLimitReached ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{currentCount} / {currentTier.max === null ? '∞' : currentTier.max}</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full origin-left transition-transform duration-500 ${
                  isLimitReached ? 'bg-red-500' : progressPercentage > 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                }`}
                style={{ transform: `scaleX(${(currentTier.max === null ? 100 : Math.min(progressPercentage, 100)) / 100})` }}
              />
            </div>
          </div>

          {/* CTA button */}
          <div>
            {(() => {
              const resumable = subRequests.find(r => r.status === 'pending' && !r.transactionRef);
              if (resumable) {
                return (
                  <button
                    onClick={() => navigate('/plans')}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-bold rounded-xl transition-colors"
                  >
                    {t('dashboard.subCompleteRequest', 'Compléter ma demande de paiement')}
                  </button>
                );
              }
              const awaitingValidation = subRequests.some(r => r.status === 'pending_validation');
              if (awaitingValidation) {
                return (
                  <button disabled className="w-full py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-bold rounded-xl cursor-not-allowed flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-gray-400 dark:border-gray-500 border-t-gray-700 dark:border-t-gray-300 rounded-full animate-spin" />
                    {t('dashboard.subPendingRequest')}
                  </button>
                );
              }
              if (isExpired) {
                return <button onClick={() => setShowRenewModal(true)} className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-colors">{t('dashboard.subRenew')}</button>;
              }
              return <button onClick={() => navigate('/plans')} className="w-full py-2.5 bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-xs font-bold rounded-xl transition-colors">{isPaidTier ? t('dashboard.subChangePlan') : t('dashboard.subUpgrade')}</button>;
            })()}
          </div>

          {/* Request history */}
          {subRequests.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-600 dark:text-gray-500 uppercase tracking-wider mb-2">{t('dashboard.subHistory')}</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {subRequests.slice(0, 5).map(req => (
                  <div key={req.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        req.status === 'approved' ? 'bg-green-500' :
                        req.status === 'rejected' ? 'bg-red-500' :
                        req.status === 'pending_validation' ? 'bg-blue-500' :
                        'bg-yellow-500'
                      }`} />
                      <span className="text-gray-900 dark:text-white truncate">{req.planLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-medium ${
                        req.status === 'approved' ? 'text-green-600 dark:text-green-400' :
                        req.status === 'rejected' ? 'text-red-600 dark:text-red-400' :
                        req.status === 'pending_validation' ? 'text-blue-600 dark:text-blue-400' :
                        'text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {req.status === 'approved' ? t('dashboard.subApproved') :
                         req.status === 'rejected' ? t('dashboard.subRejected') :
                         req.status === 'pending_validation' ? t('dashboard.subValidating') :
                         t('dashboard.subPending')}
                      </span>
                      <span className="text-gray-500 dark:text-gray-600">{new Date(req.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>
              {subRequests.some(r => r.status === 'rejected' && r.rejectionReason) && (
                <div className="mt-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/20 rounded-lg p-2.5 space-y-2">
                  <p className="text-xs text-red-700 dark:text-red-400">
                    {t('dashboard.subLastRejection')}: {subRequests.find(r => r.status === 'rejected')?.rejectionReason}
                  </p>
                  <button
                    onClick={() => navigate('/plans')}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    {t('dashboard.resubmitRequest')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rejected products alert */}
        {myProducts.filter(p => p.status === 'rejected').length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm text-red-700 dark:text-red-400 font-bold">{t('dashboard.rejectedProducts', { count: myProducts.filter(p => p.status === 'rejected').length })}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.rejectedHint')}</p>
              <button onClick={() => { setActiveTab('products'); setProductStatusFilter('rejected'); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
                {t('dashboard.viewRejected')}
              </button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.quickActions')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: '➕', label: t('dashboard.addProduct'), action: () => setActiveTab('add_product') },
              { icon: '🎨', label: t('dashboard.myShopAction'), action: () => setActiveTab('shop') },
              { icon: '📦', label: t('dashboard.myProducts'), action: () => setActiveTab('products') },
              { icon: '📈', label: t('dashboard.viewAnalytics'), action: () => setActiveTab('analytics') },
              { icon: '💬', label: t('dashboard.contactAdmin'), action: contactAdmin },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 text-center transition-all group shadow-sm dark:shadow-none">
                <span className="text-2xl block mb-1 group-hover:scale-110 transition-transform">{item.icon}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Top products by views */}
        {myProducts.filter(p => p.status === 'approved' && p.views > 0).length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.topByViews')}</h3>
            <div className="space-y-2">
              {[...myProducts].filter(p => p.status === 'approved').sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg p-2.5">
                  <span className="text-xs font-bold text-gray-500 w-5 text-center">{i + 1}</span>
                  <img src={p.images[0] ? getOptimizedUrl(p.images[0], 40) : ''} alt="" loading="lazy" className="w-8 h-8 rounded-md object-cover bg-gray-200 dark:bg-gray-700" />
                  <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{p.title}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">👁 {p.views}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">❤️ {p.likesCount || 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );

  const renderAnalytics = () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const totalViews30 = analyticsData.filter(e => e.action === 'view').length;
    const totalContacts30 = analyticsData.filter(e => e.action === 'contact').length;
    const totalLikes30 = analyticsData.filter(e => e.action === 'like').length;

    // Per-product stats from activity
    const productStats: Record<string, { views: number; contacts: number; likes: number }> = {};
    analyticsData.forEach(e => {
      if (!productStats[e.productId]) productStats[e.productId] = { views: 0, contacts: 0, likes: 0 };
      if (e.action === 'view') productStats[e.productId].views++;
      else if (e.action === 'contact') productStats[e.productId].contacts++;
      else if (e.action === 'like') productStats[e.productId].likes++;
    });

    // Daily view counts for the chart (index 0 = 30 days ago, index 29 = today)
    const viewsByDay = Array.from({ length: 30 }, (_, i) => {
      const dayStart = now - (29 - i) * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      return analyticsData.filter(e => e.action === 'view' && e.createdAt >= dayStart && e.createdAt < dayEnd).length;
    });
    const maxDayViews = Math.max(...viewsByDay, 1);

    // Top 10 products sorted by 30-day views
    const topProducts = myProducts
      .filter(p => p.id)
      .map(p => ({ product: p, stats: productStats[p.id!] ?? { views: 0, contacts: 0, likes: 0 } }))
      .sort((a, b) => b.stats.views - a.stats.views)
      .slice(0, 10);
    const maxViews = topProducts[0]?.stats.views || 1;

    // X-axis date labels (5 evenly-spaced labels)
    const xLabels = [-29, -21, -14, -7, 0].map(offset => {
      const d = new Date(now + offset * DAY_MS);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });

    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.analyticsTitle')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.analyticsSubtitle')}</p>
        </div>

        {analyticsLoading ? (
          <div className="text-center py-16 text-gray-500 text-sm">{t('dashboard.loadingAnalytics')}</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: totalViews30, label: t('dashboard.analyticsViews'), color: 'text-blue-400' },
                { value: totalContacts30, label: t('dashboard.analyticsContacts'), color: 'text-green-400' },
                { value: totalLikes30, label: t('dashboard.analyticsLikes'), color: 'text-pink-400' },
              ].map(card => (
                <div key={card.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none p-4 rounded-2xl text-center">
                  <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
                  <p className="text-[10px] text-gray-500 mt-1 leading-tight">{card.label}</p>
                </div>
              ))}
            </div>

            {/* 30-day bar chart */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-5">
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t('dashboard.analyticsChart')}</p>
              {totalViews30 === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">{t('dashboard.analyticsNoData')}</div>
              ) : (
                <div className="w-full">
                  <svg viewBox={`0 0 ${30 * 8} 80`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
                    {viewsByDay.map((count, i) => {
                      const barH = count === 0 ? 2 : Math.max(4, (count / maxDayViews) * 70);
                      return (
                        <rect
                          key={i}
                          x={i * 8 + 1}
                          y={80 - barH}
                          width={6}
                          height={barH}
                          rx={1.5}
                          fill={count === 0 ? '#374151' : '#3b82f6'}
                          opacity={count === 0 ? 0.4 : 0.6 + 0.4 * (count / maxDayViews)}
                        />
                      );
                    })}
                  </svg>
                  <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                    {xLabels.map(label => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Per-product ranking */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{t('dashboard.analyticsTopProducts')}</p>
              </div>
              {topProducts.length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-sm">{t('dashboard.analyticsNoProducts')}</p>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700/30">
                  {topProducts.map(({ product, stats }) => (
                    <div key={product.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                        {product.images?.[0] && (
                          <img
                            src={getOptimizedUrl(product.images[0], 36)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{product.title}</p>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-[10px] text-blue-400">👁 {stats.views}</span>
                          <span className="text-[10px] text-green-400">💬 {stats.contacts}</span>
                          <span className="text-[10px] text-pink-400">❤️ {stats.likes}</span>
                        </div>
                      </div>
                      <div className="w-16 bg-gray-200 dark:bg-gray-700/60 h-1.5 rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className="h-full bg-blue-500 rounded-full origin-left transition-transform"
                          style={{ transform: `scaleX(${stats.views / maxViews})` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAddProduct = () => {
      // LOGIQUE DE BLOCAGE SI LIMITE ATTEINTE
      if (isLimitReached) {
          return (
            <div className="max-w-md mx-auto animate-fade-in py-10 text-center">
                <div className="bg-white dark:bg-gradient-to-b dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 rounded-3xl p-8 shadow-xl dark:shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
                    <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-gray-200 dark:border-gray-700 shadow-inner">
                        <span className="text-4xl">🔒</span>
                    </div>

                    <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{t('dashboard.limitReachedTitle')}</h2>

                    {!hasNif ? (
                         <div className="mb-6">
                            <p className="text-gray-700 dark:text-gray-300 text-sm mb-4">
                                {t('dashboard.noNifLimit')}
                            </p>
                            <Button onClick={() => setActiveTab('shop')} className="w-full bg-blue-600 text-white">
                                {t('dashboard.addNifNow')}
                            </Button>
                         </div>
                    ) : (
                        <div className="mb-6 space-y-3">
                            <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
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

                    <button onClick={() => setActiveTab('overview')} className="mt-4 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white underline">
                        {t('dashboard.backToDashboard')}
                    </button>
                </div>
            </div>
          );
      }

      return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setActiveTab('products')} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">{t('dashboard.backButton')}</button>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.addProductTitle')}</h2>
                <span className="ml-auto text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                    {t('dashboard.quota', { current: currentCount, max: currentTier.max === null ? '∞' : currentTier.max })}
                </span>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              {/* Form Column */}
              <div className="flex-1 min-w-0">
                <form onSubmit={handleAddProduct} className="space-y-6">
                  {/* Slow-network heads-up — appears only on 2G/slow-2g/Save-Data.
                      Tells the seller their submission will be safely queued
                      and synced when the connection improves, instead of them
                      watching a long upload bar and assuming a failure. */}
                  {isSlowNetwork && (
                    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-300">
                      <span className="text-xl leading-none mt-0.5">📶</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{t('dashboard.slowNetworkBanner')}</p>
                        <p className="text-xs text-amber-300/80 mt-0.5">{t('dashboard.slowNetworkHint')}</p>
                      </div>
                    </div>
                  )}

                  {/* Quality Score */}
                  <ProductQualityScore score={productScore} />

                  <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">{t('dashboard.basicInfo')}</h3>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.categoryLabel')}</label>
                          <select
                              required value={category} onChange={e => { setCategory(e.target.value); setSubCategory(''); }}
                              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
                          >
                              <option value="">{t('dashboard.selectPlaceholder')}</option>
                              {categoriesList.map(c => (
                                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                          </select>
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.subCategoryLabel')}</label>
                          <select
                              value={subCategory} onChange={e => setSubCategory(e.target.value)}
                              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
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
                      selectedCategory={category}
                      selectedSubCategory={subCategory}
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
                          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none min-h-[100px]"
                          placeholder={t('dashboard.descriptionPlaceholder')}
                        />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-6 space-y-4">
                     <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">{t('dashboard.priceAndImages')}</h3>

                     <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.priceLabel')}</label>
                          <input
                            required type="number" min="0.01" step="any" value={price} onChange={e => setPrice(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.currencyLabel')}</label>
                          <select
                            value={productCurrency}
                            onChange={e => setProductCurrency(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            {currencies.map(c => <option key={c.id} value={c.code}>{c.symbol} ({c.code})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.oldPrice')}</label>
                          <input
                            type="number" min="0" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="—"
                          />
                        </div>
                     </div>

                    {/* B2B Wholesale Toggle */}
                    <div className="border border-indigo-300 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/5 rounded-xl p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`relative w-11 h-6 rounded-full transition-colors ${isWholesale ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                          onClick={() => setIsWholesale(!isWholesale)}>
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isWholesale ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.wholesaleToggle')}</span>
                          <p className="text-xs text-gray-500">{t('dashboard.wholesaleHint')}</p>
                        </div>
                      </label>
                      {isWholesale && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.minOrder')}</label>
                            <input
                              type="number" min="2" value={minOrderQty} onChange={e => setMinOrderQty(e.target.value)}
                              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                              placeholder="10"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.wholesalePrice')}</label>
                            <input
                              type="number" min="0" step="any" value={wholesalePrice} onChange={e => setWholesalePrice(e.target.value)}
                              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                              placeholder="0"
                            />
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
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 text-sm p-3 rounded-xl">
                      {formError}
                    </div>
                  )}

                  {uploadProgress && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 text-sm p-3 rounded-xl flex items-center gap-2">
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('dashboard.shopCustomization')}</h2>

          <form onSubmit={handleSaveProfile} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-6">
              <div className="space-y-4">
                  {/* Logo / Image boutique */}
                  <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2">{t('dashboard.logoLabel')}</label>
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
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
                            className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:border-blue-500 transition-colors"
                          >
                            {t('dashboard.changeImage')}
                          </button>
                          <p className="text-[10px] text-gray-500 mt-1">{t('dashboard.imageHint')}</p>
                        </div>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.shopNameLabel')}</label>
                      <input
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:border-blue-500 outline-none"
                        value={shopProfile.name}
                        onChange={(e) => setShopProfile({...shopProfile, name: e.target.value})}
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.bioLabel')}</label>
                      <textarea
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:border-blue-500 outline-none min-h-[80px]"
                        value={shopProfile.bio}
                        onChange={(e) => setShopProfile({...shopProfile, bio: e.target.value})}
                        placeholder={t('dashboard.bioPlaceholder')}
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.whatsappLabel')}</label>
                      <input
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:border-blue-500 outline-none"
                        value={shopProfile.whatsapp}
                        onChange={(e) => setShopProfile({...shopProfile, whatsapp: e.target.value})}
                        placeholder="+257..."
                      />
                  </div>

                  {/* GPS — Capture automatique */}
                  <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-300 dark:border-blue-500/30 p-4 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-blue-700 dark:text-blue-300">{t('dashboard.gpsLabel')}</label>
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
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.locationUrlLabel')}</label>
                      <input
                          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:border-blue-500 outline-none"
                          value={shopProfile.locationUrl}
                          onChange={(e) => setShopProfile({...shopProfile, locationUrl: e.target.value})}
                          placeholder="https://maps.google.com/..."
                      />
                  </div>
                  
                  {/* TYPE DE VENTE */}
                  <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-2">{t('dashboard.sellingTypeLabel')}</label>
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
                                ? 'bg-blue-600/20 border-blue-500 text-blue-700 dark:text-white'
                                : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
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
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-2">{t('dashboard.shopPhotoLabel')}</label>
                      <div className="flex items-center gap-4">
                        <div className="relative w-24 h-16 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
                          {shopImagePreview ? (
                            <img src={shopImagePreview} alt="Boutique" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600 text-2xl">🏪</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <input ref={shopImageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleShopImageSelect} className="hidden" />
                          <button type="button" onClick={() => shopImageInputRef.current?.click()} className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:border-blue-500 transition-colors">
                            {shopImagePreview ? t('dashboard.changePhoto') : t('dashboard.addPhoto2')}
                          </button>
                          <p className="text-[10px] text-gray-500 mt-1">{t('dashboard.shopPhotoHint')}</p>
                        </div>
                      </div>
                  </div>

                  {/* CATÉGORIES */}
                  <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-2">{t('dashboard.categoriesLabel')}</label>
                      <div className="flex flex-wrap gap-2">
                        {firestoreCategories.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleShopCategory(c.name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                              shopProfile.categories.includes(c.name)
                                ? 'bg-gold-400 text-gray-900 border-gold-400 shadow-[0_2px_10px_rgba(245,200,66,0.35)]'
                                : 'bg-transparent text-gray-600 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            {c.icon} {c.name}
                          </button>
                        ))}
                      </div>
                  </div>

                  {/* ADRESSE */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700/50 p-4 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.addressLabel')}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Ville</label>
                          <select
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-900 dark:text-white text-sm focus:border-blue-500 outline-none"
                            value={shopProfile.province}
                            onChange={e => setShopProfile({ ...shopProfile, province: e.target.value, commune: e.target.value })}
                          >
                            <option value="">Sélectionnez votre ville</option>
                            {sellerCities.map(city => (
                              <option key={city} value={city}>{city}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Quartier / Adresse (optionnel)</label>
                          <input
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-900 dark:text-white text-sm focus:border-blue-500 outline-none"
                            value={shopProfile.quartier}
                            onChange={(e) => setShopProfile({...shopProfile, quartier: e.target.value})}
                            placeholder="Ex: Rohero, Av. de la Liberté"
                          />
                        </div>
                      </div>
                  </div>

                  {/* SECTION NIF & REGISTRE */}
                  <div className={`p-4 rounded-xl border ${!hasNif ? 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-500/30' : 'bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-500/30'}`}>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.nifLabel')}</label>
                          <input
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:border-blue-500 outline-none"
                            value={shopProfile.nif}
                            onChange={(e) => setShopProfile({...shopProfile, nif: e.target.value})}
                            placeholder={!hasNif ? t('dashboard.nifPlaceholder') : t('dashboard.nifRegistered')}
                          />
                          {!hasNif && <p className="text-xs text-red-400 mt-2">{t('dashboard.addNifHint')}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">{t('dashboard.registryLabel')}</label>
                          <input
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-900 dark:text-white focus:border-blue-500 outline-none"
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
    const nif = verifForm.nif.trim();
    const registry = verifForm.registryNumber.trim();
    const phone = verifForm.phone.trim();

    if (!phone) {
      toast(t('dashboard.verifyNeedPhone'), 'error');
      return;
    }
    if (!nif && !registry) {
      toast(t('dashboard.verifyNeedNifOrRegistry'), 'error');
      return;
    }

    setVerifSubmitting(true);
    try {
      const updates: Record<string, any> = {
        'sellerDetails.verificationStatus': 'pending',
      };
      if (nif)      updates['sellerDetails.nif'] = nif;
      if (registry) updates['sellerDetails.registryNumber'] = registry;
      if (phone && phone !== currentUser.sellerDetails?.phone) {
        updates['sellerDetails.phone'] = phone;
      }

      await updateUserProfile(currentUser.id, updates);
      setShowVerifModal(true);
    } catch {
      toast(t('dashboard.verifyRequestError'), 'error');
    } finally {
      setVerifSubmitting(false);
    }
  };

  const renderVerification = () => (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-6 pb-24 md:pb-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.verification')}</h2>

      {/* Statut actuel */}
      <div className={`p-5 rounded-2xl border ${
        verificationStatus === 'verified' ? 'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/30' :
        verificationStatus === 'pending' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30' :
        verificationStatus === 'rejected' ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30' :
        'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">
            {verificationStatus === 'verified' ? '✅' : verificationStatus === 'pending' ? '⏳' : verificationStatus === 'rejected' ? '❌' : '🔒'}
          </span>
          <div>
            <p className={`font-bold ${
              verificationStatus === 'verified' ? 'text-green-600 dark:text-green-400' :
              verificationStatus === 'pending' ? 'text-blue-600 dark:text-blue-400' :
              verificationStatus === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
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

      {/* Formulaire demande (affiché uniquement si non vérifié / non pending) */}
      {verificationStatus !== 'verified' && verificationStatus !== 'pending' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none">
          <div>
            <h3 className="text-gray-900 dark:text-white font-semibold">{t('dashboard.verifyFormTitle')}</h3>
            <p className="text-xs text-gray-500 mt-1">{t('dashboard.verifyFormSubtitle')}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1.5">
                {t('dashboard.verifyPhoneLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={verifForm.phone}
                onChange={(e) => setVerifForm(s => ({ ...s, phone: e.target.value }))}
                placeholder={t('dashboard.verifyPhonePlaceholder')}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1.5">
                {t('dashboard.verifyNifLabel')}
              </label>
              <input
                type="text"
                value={verifForm.nif}
                onChange={(e) => setVerifForm(s => ({ ...s, nif: e.target.value }))}
                placeholder={t('dashboard.verifyNifPlaceholder')}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1.5">
                {t('dashboard.verifyRegistryLabel')}
              </label>
              <input
                type="text"
                value={verifForm.registryNumber}
                onChange={(e) => setVerifForm(s => ({ ...s, registryNumber: e.target.value }))}
                placeholder={t('dashboard.verifyRegistryPlaceholder')}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed">
              {t('dashboard.verifyNumbersHint')}
            </p>
          </div>
        </div>
      )}

      {/* Documents optionnels — accélère la vérification */}
      {verificationStatus !== 'verified' && verificationStatus !== 'pending' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3 shadow-sm dark:shadow-none">
          <div>
            <h3 className="text-gray-900 dark:text-white font-semibold">{t('dashboard.verifyDocumentsOptional')}</h3>
            <p className="text-xs text-gray-500 mt-1">{t('dashboard.verifyDocumentsOptionalHint')}</p>
          </div>
          {currentUser.sellerDetails?.documents?.cniUrl && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <span className="text-xl">🪪</span>
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white font-medium">{t('dashboard.verifyCNI')}</p>
                <p className="text-xs text-green-400">{t('dashboard.verifyUploaded')}</p>
              </div>
              <a href={currentUser.sellerDetails.documents.cniUrl} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-blue-400 hover:underline">{t('dashboard.verifyView')}</a>
            </div>
          )}
          {currentUser.sellerDetails?.documents?.nifUrl && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <span className="text-xl">📄</span>
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white font-medium">NIF</p>
                <p className="text-xs text-green-400">{t('dashboard.verifyUploaded')}</p>
              </div>
              <a href={currentUser.sellerDetails.documents.nifUrl} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-blue-400 hover:underline">{t('dashboard.verifyView')}</a>
            </div>
          )}
          {!hasDocuments && (
            <p className="text-xs text-gray-500 italic">{t('dashboard.verifyNoDocuments')}</p>
          )}
        </div>
      )}

      {/* Documents déjà soumis — affichage compact pour vendeurs verifiés/pending */}
      {(verificationStatus === 'verified' || verificationStatus === 'pending') && hasDocuments && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3 shadow-sm dark:shadow-none">
          <h3 className="text-gray-900 dark:text-white font-semibold">{t('dashboard.verifyDocuments')}</h3>
          {currentUser.sellerDetails?.documents?.cniUrl && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <span className="text-xl">🪪</span>
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white font-medium">{t('dashboard.verifyCNI')}</p>
                <p className="text-xs text-green-400">{t('dashboard.verifyUploaded')}</p>
              </div>
              <a href={currentUser.sellerDetails.documents.cniUrl} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-blue-400 hover:underline">{t('dashboard.verifyView')}</a>
            </div>
          )}
        </div>
      )}

      {/* Bouton demander vérification */}
      {verificationStatus !== 'verified' && verificationStatus !== 'pending' && (
        <Button onClick={handleRequestVerification} disabled={verifSubmitting} className="w-full">
          {verifSubmitting ? t('common.loading') : t('dashboard.verifyRequest')}
        </Button>
      )}

      <VerificationRequestModal open={showVerifModal} onClose={() => setShowVerifModal(false)} />
    </div>
  );

  const renderBoost = () => {
    const approvedProducts = myProducts.filter(p => p.status === 'approved');
    const countryId = currentUser.sellerDetails?.countryId || 'bi';

    return (
      <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>⚡</span> {t('dashboard.boostTitle')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{t('dashboard.boostDesc')}</p>
        </div>

        {/* Comment ça marche */}
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{t('dashboard.boostHowTitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-700 dark:text-gray-400">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 font-black text-base">1</span>
              <span>{t('dashboard.boostStep1')}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-400 font-black text-base">2</span>
              <span>{t('dashboard.boostStep2')}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-400 font-black text-base">3</span>
              <span>{t('dashboard.boostStep3')}</span>
            </div>
          </div>
        </div>

        {/* Mes demandes en cours */}
        {boostRequests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.boostMyRequests')}</p>
            {boostRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-xl px-4 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{req.productTitle}</p>
                  <p className="text-xs text-gray-500">{new Date(req.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                  req.status === 'approved'           ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : req.status === 'pending_validation' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : req.status === 'rejected'           ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                }`}>
                  {req.status === 'approved'            ? t('dashboard.boostStatusActive')
                   : req.status === 'pending_validation' ? t('dashboard.boostStatusValidating')
                   : req.status === 'rejected'            ? t('dashboard.boostStatusRejected')
                   : t('dashboard.boostStatusPending')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Liste des produits éligibles */}
        {approvedProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-3xl mb-3">📦</p>
            <p className="text-sm">{t('dashboard.boostNoProducts')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.boostChooseProduct')}</p>
            {approvedProducts.map(product => {
              const isActive   = !!product.isBoosted && !!product.boostExpiresAt && product.boostExpiresAt > Date.now();
              const isPending  = boostRequests.some(
                r => r.productId === product.id && (r.status === 'pending' || r.status === 'pending_validation')
              );
              const thumb = product.images[0]
                ? getOptimizedUrl(product.images[0], 80)
                : null;

              return (
                <div
                  key={product.id}
                  className="flex items-center gap-4 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-4"
                >
                  {/* Thumbnail */}
                  {thumb ? (
                    <img src={thumb} alt={product.title} loading="lazy"
                      className="w-14 h-14 rounded-xl object-cover shrink-0 bg-gray-200 dark:bg-gray-700" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{product.title}</p>
                    <p className="text-xs text-gray-500">
                      {product.price.toLocaleString()} {product.currency || 'BIF'}
                    </p>
                    {isActive && (
                      <p className="text-xs text-amber-400 font-bold mt-0.5">
                        ⚡ {t('dashboard.boostActiveUntil', {
                          date: new Date(product.boostExpiresAt!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                        })}
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  {isPending ? (
                    <span className="text-xs text-yellow-400 font-bold bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20 whitespace-nowrap">
                      {t('dashboard.boostStatusPending')}
                    </span>
                  ) : (
                    <button
                      onClick={() => setBoostingProduct(product)}
                      className={`text-xs font-black px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                          : 'bg-amber-500 hover:bg-amber-400 text-gray-900 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40'
                      }`}
                    >
                      {isActive ? t('dashboard.boostRenew') : `⚡ ${t('dashboard.boostCta')}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal boost */}
        {boostingProduct && (
          <BoostProductModal
            isOpen
            onClose={() => setBoostingProduct(null)}
            product={boostingProduct}
            sellerCountryId={countryId}
            userId={currentUser.id}
            sellerName={currentUser.name}
            existingRequests={boostRequests}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 flex flex-col md:flex-row">
       <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 p-4">
           {/* ... Sidebar content same as before ... */}
           <div className="flex items-center gap-2 mb-8 px-2">
               <div className="w-8 h-8 bg-gradient-to-br from-gold-400 to-gold-600 rounded-lg"></div>
               <span className="font-black text-xl text-gray-900 dark:text-white tracking-tight">{t('dashboard.sellerSpace')}</span>
           </div>
           <div className="space-y-2 flex-1">
               <SidebarItem id="overview" icon="📊" label={t('dashboard.overview')} />
               <SidebarItem id="products" icon="📦" label={t('dashboard.inventory')} count={myProducts.length} />
               <SidebarItem id="analytics" icon="📈" label={t('dashboard.analytics')} />
               <SidebarItem id="boost" icon="⚡" label={t('dashboard.boost')} />
               <SidebarItem id="requests" icon="🛒" label={t('dashboard.buyerRequests')} count={requestStats?.todayCount || undefined} gold />
               <SidebarItem id="shop" icon="🎨" label={t('dashboard.myShop')} />
               <SidebarItem id="verification" icon="✅" label={t('dashboard.verification')} />
           </div>
           <div className="mb-4 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
               <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                   <span>{currentTier.label}</span>
                   <span className={isLimitReached ? "text-red-500 dark:text-red-400 font-bold" : "text-blue-600 dark:text-blue-400"}>{currentCount}/{currentTier.max || '∞'}</span>
               </div>
               <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                   <div className={`h-full ${isLimitReached ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(progressPercentage, 100)}%` }}></div>
               </div>
           </div>
           <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
               <button onClick={() => navigate('/')} className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                   <span>🚪</span> {t('dashboard.backToSite')}
               </button>
           </div>
       </aside>

       <div className="md:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
         {/* Header mobile */}
         <div className="p-3 px-4 flex justify-between items-center">
           <span className="font-black text-lg text-gray-900 dark:text-white">{t('dashboard.sellerSpace')}</span>
           <div className="flex items-center gap-2">
             <div className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
               <span className={`text-xs font-bold ${isLimitReached ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                 {currentCount}/{currentTier.max || '∞'}
               </span>
             </div>
             <LanguageSwitcher compact />
             <button
               onClick={() => navigate('/')}
               aria-label={t('dashboard.backToSite')}
               title={t('dashboard.backToSite')}
               className="flex items-center gap-1 min-h-[40px] px-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                 <path d="M15 18l-6-6 6-6" />
               </svg>
               <span className="text-xs font-semibold">{t('dashboard.exitShort')}</span>
             </button>
           </div>
         </div>
         {/* Onglets de navigation mobile — scroll horizontal */}
         <div className="flex overflow-x-auto gap-1 px-3 pb-2 scrollbar-none">
           {([
             { id: 'overview',      icon: '📊', label: t('dashboard.overview') },
             { id: 'products',      icon: '📦', label: t('dashboard.inventory') },
             { id: 'add_product',   icon: '➕', label: t('dashboard.newButton') },
             { id: 'analytics',     icon: '📈', label: t('dashboard.analytics') },
             { id: 'boost',         icon: '⚡', label: t('dashboard.boost') },
             { id: 'requests',      icon: '🔍', label: t('dashboard.buyerRequests') },
             { id: 'shop',          icon: '🎨', label: t('dashboard.myShop') },
             { id: 'verification',  icon: '✅', label: t('dashboard.verification') },
           ] as { id: Tab; icon: string; label: string }[]).map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id)}
               className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                 activeTab === tab.id
                   ? 'bg-gold-400 text-gray-900 border-gold-400 shadow-[0_2px_10px_rgba(245,200,66,0.35)]'
                   : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:text-gray-900 dark:hover:text-white'
               }`}
             >
               <span>{tab.icon}</span>
               <span>{tab.label}</span>
             </button>
           ))}
         </div>
       </div>

       <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-60px)] md:h-screen">
           {activeTab === 'overview' && renderOverview()}
           {activeTab === 'analytics' && renderAnalytics()}
           {activeTab === 'products' && (
               <div className="space-y-4 animate-fade-in">
                {/* Staleness banner — appears only when rendering from IDB cache
                    because the network fetch failed (offline / Firestore down).
                    Tells the seller WHY their list might not match what's in
                    Firestore right now and offers an explicit refresh path. */}
                {inventoryCachedAt !== null && inventoryFreshAt === null && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 text-xs">
                    <span className="text-base leading-none">📡</span>
                    <span className="flex-1 min-w-0">
                      {t('dashboard.inventoryStale', {
                        when: new Date(inventoryCachedAt).toLocaleString(undefined, {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        }),
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.myInventory')}</h2>
                    <div className="flex items-center gap-2">
                      {filteredProducts.length > 0 && (
                        <button
                          onClick={() => {
                            setBulkSelectMode(m => !m);
                            setSelectedProductIds(new Set());
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                            bulkSelectMode
                              ? 'bg-blue-600/20 border-blue-500/50 text-blue-600 dark:text-blue-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          {bulkSelectMode ? t('dashboard.bulkCancel') : t('dashboard.bulkSelect')}
                        </button>
                      )}
                      {!bulkSelectMode && (
                        <Button size="sm" onClick={() => setActiveTab('add_product')}>{t('dashboard.newButton')}</Button>
                      )}
                    </div>
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
                          ? 'bg-gold-400 text-gray-900 border-gold-400 shadow-[0_2px_10px_rgba(245,200,66,0.35)]'
                          : 'bg-transparent text-gray-600 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {/* Bulk action bar */}
                {bulkSelectMode && filteredProducts.length > 0 && (
                  <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none rounded-xl px-4 py-2.5">
                    <button
                      onClick={() => {
                        const allIds = filteredProducts.map(p => p.id).filter((id): id is string => Boolean(id));
                        const allSelected = allIds.every(id => selectedProductIds.has(id));
                        setSelectedProductIds(allSelected ? new Set() : new Set(allIds));
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
                    >
                      {filteredProducts.every(p => p.id && selectedProductIds.has(p.id))
                        ? t('dashboard.bulkDeselectAll')
                        : t('dashboard.bulkSelectAll')}
                    </button>
                    <span className="text-xs text-gray-500 flex-1">
                      {selectedProductIds.size > 0
                        ? t('dashboard.bulkSelected', { count: selectedProductIds.size })
                        : t('dashboard.bulkNoneSelected')}
                    </span>
                    {selectedProductIds.size > 0 && (
                      <button
                        onClick={handleBulkDelete}
                        className="text-xs font-bold px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                      >
                        🗑 {t('dashboard.bulkDeleteBtn', { count: selectedProductIds.size })}
                      </button>
                    )}
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-8 text-center text-gray-600 dark:text-gray-400">
                    <div className="text-4xl mb-3">📦</div>
                    <p className="font-medium text-gray-900 dark:text-white mb-1">{t('dashboard.noProducts')}</p>
                    <p className="text-sm">{productStatusFilter === 'all' ? t('dashboard.startAdding') : t('dashboard.noProductsInCategory')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProducts.map(product => {
                      const cur = product.currency || CURRENCY;
                      const isSelected = product.id ? selectedProductIds.has(product.id) : false;
                      return (
                      <div
                        key={product.id}
                        onClick={() => bulkSelectMode && product.id && toggleProductSelection(product.id)}
                        className={`bg-white dark:bg-gray-800/50 border rounded-xl p-4 space-y-2 transition-all shadow-sm dark:shadow-none ${
                          bulkSelectMode ? 'cursor-pointer' : ''
                        } ${
                          isSelected ? 'border-blue-500/60 bg-blue-50 dark:bg-blue-900/10' :
                          product.status === 'rejected' ? 'border-red-300 dark:border-red-800/40' :
                          product.status === 'pending' ? 'border-yellow-300 dark:border-yellow-800/30' :
                          'border-gray-200 dark:border-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {bulkSelectMode && (
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                              isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                            }`}>
                              {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
                            </div>
                          )}
                          <div className="relative flex-shrink-0">
                            <img
                              src={product.images[0] ? getOptimizedUrl(product.images[0], 80) : ''}
                              alt={product.title}
                              loading="lazy"
                              className="w-16 h-16 rounded-lg object-cover bg-gray-200 dark:bg-gray-700"
                            />
                            {product.images.length > 1 && (
                              <span className="absolute -bottom-1 -right-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-gray-300 dark:border-gray-600">
                                +{product.images.length - 1}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-gray-900 dark:text-white font-medium text-sm truncate">{product.title}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-blue-600 dark:text-blue-400 text-sm font-bold">{product.price.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-500">{cur}</span></p>
                              {product.originalPrice && product.originalPrice > product.price && (
                                <p className="text-gray-500 text-xs line-through">{product.originalPrice.toLocaleString('fr-FR')}</p>
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
                              {product.status === 'pending' && (
                                <span className="text-[10px] text-gray-500 italic">
                                  {t('dashboard.searchDelayHint')}
                                </span>
                              )}
                              {product.isPromoted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-400 border border-purple-800/30">{t('dashboard.statusSponsored')}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>👁 {product.views}</span>
                              <span>❤️ {product.likesCount || 0}</span>
                            </div>
                            {!bulkSelectMode && (
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                                title="Supprimer"
                              >
                                🗑️
                              </button>
                            )}
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
                            {(product.resubmitCount ?? 0) >= MAX_RESUBMIT_ATTEMPTS ? (
                              <p className="text-xs text-gray-500 italic">
                                {t('dashboard.resubmitLimitReached')}
                              </p>
                            ) : (
                              <>
                                <p className="text-[10px] text-gray-600">
                                  {t('dashboard.resubmitAttemptsLeft', {
                                    left: MAX_RESUBMIT_ATTEMPTS - (product.resubmitCount ?? 0),
                                    max: MAX_RESUBMIT_ATTEMPTS,
                                  })}
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openEditProduct(product)}
                                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-xs font-bold rounded-lg transition-colors"
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
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                )}
               </div>
           )}
           {activeTab === 'boost' && renderBoost()}
           {activeTab === 'add_product' && renderAddProduct()}
           {activeTab === 'shop' && renderShopSettings()}
           {activeTab === 'verification' && renderVerification()}
           {activeTab === 'requests' && (() => {
             const isEligible = canContactBuyer(currentUser.sellerDetails);
             return (
               <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
                 {/* Header */}
                 <div className="flex items-center justify-between">
                   <div>
                     <div className="flex items-center gap-2">
                       <h2 className="text-xl font-black text-gray-900 dark:text-white">{t('dashboard.buyerRequests')}</h2>
                       {requestStats && requestStats.todayCount > 0 && (
                         <span className="text-xs bg-gold-400/20 text-gold-400 border border-gold-400/40 px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                           {requestStats.todayCount} {t('dashboard.buyerRequestsToday')}
                         </span>
                       )}
                     </div>
                     <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.buyerRequestsDesc')}</p>
                   </div>
                   <button
                     onClick={() => navigate('/demandes')}
                     className="px-4 py-2 bg-gradient-to-r from-amber-500 to-gold-400 hover:from-amber-400 hover:to-gold-300 text-gray-900 font-black rounded-xl text-sm transition-all hover:scale-105 active:scale-95 shadow-md shadow-amber-900/30"
                   >
                     🔍 {t('dashboard.viewAllRequests')}
                   </button>
                 </div>

                 {/* Plan eligibility banner */}
                 {!isEligible ? (
                   <div className="relative overflow-hidden rounded-2xl border border-gold-400/40 bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-950/50 dark:via-gray-900 dark:to-gray-900 p-6 shadow-sm dark:shadow-none">
                     <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.15),transparent_60%)] pointer-events-none" />
                     <div className="relative z-10">
                       <div className="flex items-start gap-4 mb-5">
                         <div className="w-14 h-14 rounded-2xl bg-gold-400/15 dark:bg-gold-400/10 border border-gold-400/30 dark:border-gold-400/20 flex items-center justify-center text-3xl shrink-0">🔒</div>
                         <div>
                           <h3 className="text-gray-900 dark:text-white font-black text-lg">{t('requests.planGate.title')}</h3>
                           <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{t('requests.planGate.subtitle')}</p>
                         </div>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                         {[
                           { icon: '📋', label: t('dashboard.buyerRequestsFeat1') },
                           { icon: '💬', label: t('dashboard.buyerRequestsFeat2') },
                           { icon: '📈', label: t('dashboard.buyerRequestsFeat3') },
                         ].map(f => (
                           <div key={f.label} className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/40 rounded-xl p-3">
                             <span className="text-xl">{f.icon}</span>
                             <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{f.label}</span>
                           </div>
                         ))}
                       </div>
                       <div className="flex flex-col sm:flex-row gap-3">
                         <button
                           onClick={() => navigate('/plans')}
                           className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-gold-400 hover:from-amber-400 hover:to-gold-300 text-gray-900 font-black rounded-xl text-sm transition-all hover:scale-[1.01] shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30"
                         >
                           ⭐ {t('requests.planGate.cta')}
                         </button>
                         <button
                           onClick={() => navigate('/demandes')}
                           className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition-colors"
                         >
                           👁 {t('dashboard.buyerRequestsPreview')}
                         </button>
                       </div>
                     </div>
                   </div>
                 ) : (
                   <div className="relative overflow-hidden rounded-2xl border border-green-500/40 bg-gradient-to-br from-green-50 via-white to-white dark:from-green-950/30 dark:via-gray-900 dark:to-gray-900 p-6 shadow-sm dark:shadow-none">
                     <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,197,94,0.1),transparent_60%)] pointer-events-none" />
                     <div className="relative z-10">
                       <div className="flex items-start gap-4 mb-5">
                         <div className="w-14 h-14 rounded-2xl bg-green-500/15 dark:bg-green-500/10 border border-green-500/30 dark:border-green-500/20 flex items-center justify-center text-3xl shrink-0">✅</div>
                         <div>
                           <h3 className="text-gray-900 dark:text-white font-black text-lg">{t('dashboard.buyerRequestsUnlocked')}</h3>
                           <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{t('dashboard.buyerRequestsUnlockedDesc')}</p>
                         </div>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                         {[
                           { icon: '📋', label: t('dashboard.buyerRequestsFeat1') },
                           { icon: '💬', label: t('dashboard.buyerRequestsFeat2') },
                           { icon: '📈', label: t('dashboard.buyerRequestsFeat3') },
                         ].map(f => (
                           <div key={f.label} className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/40 rounded-xl p-3">
                             <span className="text-xl">{f.icon}</span>
                             <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{f.label}</span>
                           </div>
                         ))}
                       </div>
                       <button
                         onClick={() => navigate('/demandes')}
                         className="w-full py-3 bg-gradient-to-r from-amber-500 to-gold-400 hover:from-amber-400 hover:to-gold-300 text-gray-900 font-black rounded-xl text-sm transition-all hover:scale-[1.01] shadow-lg shadow-amber-900/30"
                       >
                         🔍 {t('dashboard.viewAllRequests')}
                       </button>
                     </div>
                   </div>
                 )}

                 {/* Stats row */}
                 {requestStats && (
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-4 text-center">
                       <p className="text-2xl font-black text-gold-400">{requestStats.todayCount}</p>
                       <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{t('dashboard.buyerRequestsStatToday')}</p>
                     </div>
                     <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none rounded-2xl p-4 text-center">
                       <p className="text-2xl font-black text-green-400">{requestStats.fulfilledCount}</p>
                       <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{t('dashboard.buyerRequestsStatFulfilled')}</p>
                     </div>
                   </div>
                 )}
               </div>
             );
           })()}
       </main>

       {/* Mobile Bottom Nav — All tabs visible with labels */}
       <div className="md:hidden fixed bottom-0 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 pb-safe z-50">
         <div className="flex justify-around items-center h-16">
           {([
             { id: 'overview' as Tab, icon: '📊', label: t('dashboard.mobileHome'), gold: false },
             { id: 'products' as Tab, icon: '📦', label: t('dashboard.mobileProducts'), gold: false },
             { id: 'add_product' as Tab, icon: '➕', label: t('dashboard.mobileAdd'), gold: false },
             { id: 'requests' as Tab, icon: '🛒', label: t('dashboard.mobileRequests'), gold: true },
             { id: 'shop' as Tab, icon: '🎨', label: t('dashboard.mobileShop'), gold: false },
           ]).map(item => (
             <button
               key={item.id}
               onClick={() => setActiveTab(item.id)}
               className={`flex flex-col items-center justify-center w-full h-full space-y-0.5 relative ${
                 activeTab === item.id
                   ? item.gold ? 'text-gold-600 dark:text-gold-400' : 'text-blue-600 dark:text-blue-400'
                   : item.gold ? 'text-amber-600' : 'text-gray-500'
               }`}
             >
               <span className={`text-lg transition-transform ${activeTab === item.id ? 'scale-110' : ''}`}>{item.icon}</span>
               <span className="text-[9px] font-medium">{item.label}</span>
               {item.gold && requestStats && requestStats.todayCount > 0 && activeTab !== item.id && (
                 <span className="absolute top-1 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-gold-400 ring-2 ring-white dark:ring-gray-900" />
               )}
             </button>
           ))}
         </div>
       </div>

       {/* Edit Rejected Product Modal */}
       {editingProduct && (
         <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingProduct(null)}>
           <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between">
               <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.editProductTitle')}</h3>
               <button onClick={() => setEditingProduct(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-xl">&times;</button>
             </div>

             {editingProduct.rejectionReason && (
               <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
                 <p className="text-xs text-red-400"><span className="font-bold">{t('dashboard.rejectionReason')}</span> {editingProduct.rejectionReason}</p>
               </div>
             )}

             <div>
               <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">Titre *</label>
               <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
             </div>

             <div className="grid grid-cols-2 gap-3">
               <div>
                 <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">Prix *</label>
                 <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">Categorie *</label>
                 <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-white outline-none">
                   <option value="">Choisir</option>
                   {firestoreCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                 </select>
               </div>
             </div>

             <div>
               <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">Description</label>
               <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-white outline-none focus:border-blue-500 resize-none" />
             </div>

             {/* Existing images */}
             {editImages.length > 0 && (
               <div>
                 <label className="block text-xs font-bold text-gray-400 mb-2">Images actuelles</label>
                 <div className="flex gap-2 flex-wrap">
                   {editImages.map((img, i) => (
                     <div key={i} className="relative w-16 h-16">
                       <img src={getOptimizedUrl(img, 80)} loading="lazy" className="w-full h-full object-cover rounded-lg" />
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
               <button onClick={() => editFileRef.current?.click()} className="w-full border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-3 text-sm text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors">
                 + Ajouter des images
               </button>
             </div>

             <div className="flex gap-3 pt-2">
               <button onClick={() => setEditingProduct(null)} className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
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

      {/* Renewal modal — inline, without navigating to /plans */}
      <RenewSubscriptionModal
        isOpen={showRenewModal}
        onClose={() => setShowRenewModal(false)}
        currentTierLabel={currentUser.sellerDetails?.tierLabel || ''}
        sellerCountryId={sellerCountryId}
        userId={currentUser.id}
        sellerName={currentUser.sellerDetails?.shopName || currentUser.name}
        existingRequests={subRequests}
      />
    </div>
  );
};

export default SellerDashboard;