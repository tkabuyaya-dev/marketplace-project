import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutGrid, Package, BarChart2, Zap, ShoppingCart, Palette, ShieldCheck,
  Plus, RefreshCw, Lock, Sparkles, Crown, Camera, Check, Eye, ChevronDown,
  Clock, Upload, X, Menu, MapPin, ArrowRight, ArrowUp, ArrowDown, Trash2,
  Star, MoreHorizontal, Wifi, BadgeCheck,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Product, User, ProductStatus, Category, Currency, SubscriptionRequest, BoostRequest } from '../types';
import { addProduct, getSellerProducts, getSellerAllProducts, deleteProduct, syncProductCount, getCategories, updateUserProfile, resubmitProduct, editAndResubmitProduct, getActiveCurrencies, subscribeToMyRequests, getProductActivityLast30Days, ActivityEntry, MAX_RESUBMIT_ATTEMPTS, subscribeToMyBoostRequests, getBuyerRequestStats, canContactBuyer } from '../services/firebase';
import { BoostProductModal } from '../components/BoostProductModal';
import { uploadImages, uploadImage, getOptimizedUrl, UploadError } from '../services/cloudinary';
import { probeConnectivity } from '../utils/connectivity';
import { generateBlurhash } from '../utils/blurhash';
import { INITIAL_SUBSCRIPTION_TIERS, CURRENCY, FREE_TIER_WARNING_AT } from '../constants';
import { buildWaUrl } from '../config/whatsapp.config';
import { CITIES_BY_COUNTRY } from '../data/locations';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useCategories } from '../hooks/useCategories';
import { useProductScore } from '../hooks/useProductScore';
import { compressImages } from '../utils/imageCompressor';
import { generateAIDescription } from '../services/firebase/ai-description';
import { getSubscriptionStatus } from '../utils/subscription';
import { planIdFromLabel } from '../utils/planFeatures';
import { SmartImageUpload } from '../components/SmartImageUpload';
import { SmartTitleInput } from '../components/SmartTitleInput';
import { VoiceCaptureButton } from '../components/VoiceCaptureButton';
import type { VoiceListingResult, VoiceListingError } from '../services/firebase/voice-listing';
import { DealConfirmCard } from '../components/DealConfirmCard';
import { ProductQualityScore } from '../components/ProductQualityScore';
import { ProductPreview } from '../components/ProductPreview';
import { RenewSubscriptionModal } from '../components/RenewSubscriptionModal';
import { VerificationRequestModal } from '../components/VerificationRequestModal';
import { useOfflineQueue, type OfflineDraft, type SyncResult } from '../hooks/useOfflineQueue';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { getInventoryFromIDB, saveInventoryToIDB } from '../services/inventoryIdb';
import { PhotoStudioCard } from '../components/dashboard/PhotoStudioCard';
import { NotificationEnableBanner } from '../components/NotificationEnableBanner';

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

  // Un vendeur Découverte (ou au tier non résolu) n'a rien à « renouveler » :
  // on l'envoie choisir un plan sur /plans (upgrade). Tout vendeur expiré
  // finit en Découverte à J+3 (pipeline subscriptionLifecycle) — sans ce
  // guard, le modal aboutissait à « Renouveler — Gratuit, 0 BIF » et la CF
  // refusait (bug remonté 2026-07-10).
  const openRenewFlow = () => {
    const currentPlanId = planIdFromLabel(currentUser.sellerDetails?.tierLabel);
    if (!currentPlanId || currentPlanId === 'free') {
      navigate('/plans');
      return;
    }
    setShowRenewModal(true);
  };

  const [showVerifModal, setShowVerifModal] = useState(false);
  const [verifForm, setVerifForm] = useState({
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
      // Un refus des règles Firestore (permission-denied) est PERMANENT : réessayer
      // ne le lèvera jamais tant que la cause (suspension, abonnement, cooldown,
      // champ invalide) n'est pas levée. On le tague `permanent` pour que la file
      // arrête l'auto-retry et affiche la vraie raison, au lieu du trompeur
      // « Vérifiez votre connexion ».
      const raw = String(err?.message || err);
      const isPermission =
        err?.code === 'permission-denied' ||
        /insufficient permissions|permission-denied/i.test(raw);
      if (isPermission) {
        const e: any = new Error(t('dashboard.syncPermissionDenied'));
        e.permanent = true;
        throw e;
      }
      throw new Error(`Sauvegarde Firestore: ${raw}`);
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
  // Brouillons en échec PERMANENT (refus règles) : le hint « vérifiez la connexion »
  // serait faux — on affiche une consigne actionnable à la place.
  const hasBlockedDraft = useMemo(() => offlineQueue.some(d => d.blocked), [offlineQueue]);

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
  // État pour la génération IA de description
  const [descGenLoading, setDescGenLoading] = useState(false);
  const [descGuessedFields, setDescGuessedFields] = useState<string[]>([]);
  const [descQuota, setDescQuota] = useState<{ used: number; limit: number; isPro: boolean } | null>(null);
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

  const hasNif = currentUser.sellerDetails?.hasNif === true;
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

  const handleGenerateDescription = useCallback(async () => {
    if (!title.trim()) {
      toast(t('dashboard.generateTitleFirst'), 'error');
      return;
    }
    if (!category) {
      toast(t('dashboard.generateCategoryFirst'), 'error');
      return;
    }
    setDescGenLoading(true);
    const res = await generateAIDescription({
      title,
      categorySlug: category,
      countryId: currentUser?.sellerDetails?.countryId,
      shopName: currentUser?.sellerDetails?.shopName || currentUser?.name,
    });
    setDescGenLoading(false);

    if (res.ok === false) {
      // Toujours mettre le fallback template pour ne JAMAIS bloquer le vendeur
      setDesc(res.fallback);
      setDescGuessedFields([]);
      const err = res.error;
      if (err.kind === 'quota_exceeded') {
        setDescQuota({ used: err.quotaUsed, limit: err.quotaLimit, isPro: false });
        toast(t('dashboard.descriptionQuotaExceeded'), 'error');
      } else if (err.kind === 'service_unavailable') {
        toast(t('dashboard.descriptionFallbackTemplate'), 'info');
      } else if (err.kind === 'unauthenticated') {
        toast(t('dashboard.descriptionAuthRequired'), 'error');
      }
      return;
    }
    // res.ok === true
    setDesc(res.data.description);
    setDescGuessedFields(res.data.guessedFields);
    setDescQuota({
      used: res.data.quotaUsed,
      limit: res.data.quotaLimit,
      isPro: res.data.isPro,
    });
    toast(
      res.data.cached
        ? t('dashboard.descriptionGeneratedCached')
        : t('dashboard.descriptionGenerated'),
      'success',
    );
  }, [title, category, currentUser, toast, t]);

  // ── Voice-first listing : pré-remplissage depuis une note vocale ──────────
  // On n'écrase JAMAIS de façon destructive : titre/prix/catégorie remplacent
  // les champs ciblés (intention explicite du vendeur), mais la description
  // n'est posée que si elle est encore vide pour ne pas effacer un texte saisi.
  const handleVoiceResult = useCallback((data: VoiceListingResult) => {
    const f = data.fields;
    if (!f.title) {
      // Transcription inintelligible (ex: kirundi mal capté) → on n'écrase rien.
      toast(t('dashboard.voiceNotUnderstood'), 'info');
      return;
    }
    setTitle(f.title);
    if (f.price != null) setPrice(String(f.price));

    if (f.categorySlug && categoriesList.some(c => c.id === f.categorySlug)) {
      setCategory(f.categorySlug);
      // Sous-catégorie seulement si elle correspond à une option valide du select.
      const subs = categoriesList.find(c => c.id === f.categorySlug)?.subCategories || [];
      if (f.subCategory && subs.includes(f.subCategory)) {
        setSubCategory(f.subCategory);
      }
    }

    if (f.descriptionSeed) {
      setDesc(prev => (prev.trim() ? prev : f.descriptionSeed as string));
    }

    toast(t('dashboard.voicePrefilled'), 'success');
  }, [categoriesList, toast, t]);

  const handleVoiceError = useCallback((error: VoiceListingError) => {
    switch (error.kind) {
      case 'quota_exceeded':
        toast(t('dashboard.voiceQuotaExceeded'), 'error');
        break;
      case 'unauthenticated':
        toast(t('dashboard.descriptionAuthRequired'), 'error');
        break;
      case 'invalid_input':
        // mic_permission | too_short | autre → message générique non bloquant.
        toast(
          error.message === 'mic_permission'
            ? t('dashboard.voiceMicDenied')
            : t('dashboard.voiceTryAgain'),
          'info',
        );
        break;
      default:
        toast(t('dashboard.voiceUnavailable'), 'info');
    }
  }, [toast, t]);

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

      // Generate BlurHash from first image (instant placeholder for 2G/3G/offline).
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

  // --- SUB-COMPONENTS (design system: light-only) ---

  /** WhatsApp glyph — kept as inline SVG (no lucide equivalent). */
  const WhatsAppIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.5 3.5A11 11 0 003.4 17l-1.4 5 5.1-1.3A11 11 0 1020.5 3.5zm-8.5 18a9.4 9.4 0 01-4.8-1.3l-.3-.2-3 .8.8-2.9-.2-.3a9.5 9.5 0 1115.5-7.4 9.5 9.5 0 01-8 11.3zm5.4-7.1c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7 0a7.8 7.8 0 01-2.3-1.4 8.7 8.7 0 01-1.6-2c-.2-.3 0-.5.1-.6l.5-.6.3-.5a.5.5 0 000-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 00-.9.4 3.7 3.7 0 00-1.1 2.7 6.4 6.4 0 001.3 3.4 14.7 14.7 0 005.7 5 19 19 0 001.9.7 4.6 4.6 0 002.1.1 3.4 3.4 0 002.2-1.5 2.8 2.8 0 00.2-1.5c-.1-.1-.3-.2-.6-.4z" />
    </svg>
  );

  /** Auto-coloured progress bar (thresholds: 50/80/95). */
  const Progress = ({ value, height = 6 }: { value: number; height?: number }) => {
    const v = Math.max(0, Math.min(100, value));
    let color = '#10B981';
    if (v >= 95) color = '#EF4444';
    else if (v >= 80) color = '#F97316';
    else if (v >= 50) color = '#F5C842';
    return (
      <div className="w-full rounded-full bg-black/[0.06] overflow-hidden" style={{ height }}>
        <div className="h-full rounded-full" style={{ width: v + '%', background: color, transition: 'width 700ms ease-out' }} />
      </div>
    );
  };

  /** Tier label pill. */
  const TierBadge = ({ label }: { label: string }) => {
    const key = label.toLowerCase();
    let bg = '#F4F5F7', fg = '#5C6370';
    // Legacy 'starter' → couleur Vendeur (bleu) ; legacy 'elite' → couleur Pro (ambre)
    if (key.includes('vendeur') || key.includes('starter')) { bg = '#EFF6FF'; fg = '#1D4ED8'; }
    else if (key.includes('grossiste') || key.includes('illim') || key.includes('unlimited')) { bg = '#EEF2FF'; fg = '#3730A3'; }
    else if (key.includes('pro') || key.includes('elite') || key.includes('élite')) { bg = '#FFFBEB'; fg = '#92400E'; }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-semibold leading-none" style={{ background: bg, color: fg }}>
        {label}
      </span>
    );
  };

  /** Sidebar / drawer nav item — gold active pill, optional badge. */
  const NavItem = ({ id, icon: IconCmp, label, count, gold, onAfter }: {
    id: Tab; icon: React.ComponentType<{ size?: number }>; label: string; count?: number; gold?: boolean; onAfter?: () => void;
  }) => {
    const active = activeTab === id;
    let cls = 'group flex items-center gap-3 px-3 h-11 rounded-[12px] text-[13.5px] font-semibold transition active:scale-[0.97] transition-transform w-full text-left ';
    let style: React.CSSProperties | undefined;
    if (active) {
      cls += 'text-ink';
      style = { background: '#F5C842', boxShadow: '0 4px 14px rgba(245,200,66,0.40), inset 0 1px 0 rgba(255,255,255,0.4)' };
    } else if (gold) {
      cls += 'text-goldDeep';
      style = { background: 'linear-gradient(135deg, rgba(245,200,66,0.10), rgba(245,200,66,0.04))', border: '1px solid rgba(245,200,66,0.25)' };
    } else {
      cls += 'text-ink2 hover:bg-[rgba(245,200,66,0.08)] hover:text-ink';
    }
    return (
      <button onClick={() => { setActiveTab(id); onAfter?.(); }} className={cls} style={style}>
        <span className="shrink-0"><IconCmp size={18} /></span>
        <span className="flex-1 truncate">{label}</span>
        {typeof count === 'number' && count > 0 && (
          <span className={`px-1.5 min-w-[20px] h-[20px] rounded-full text-[11px] font-bold inline-flex items-center justify-center ${
            active ? 'bg-black/15 text-ink' : (gold ? 'bg-gold-400 text-ink' : 'bg-ink/10 text-ink')
          }`}>{count}</span>
        )}
      </button>
    );
  };

  /** Mobile chip rail item. */
  const Chip = ({ id, label, count, gold }: { id: Tab; label: string; count?: number; gold?: boolean }) => {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap transition active:scale-[0.97] transition-transform ${
          active
            ? (gold ? 'bg-gold-400 text-ink shadow-gold' : 'bg-ink text-white')
            : 'bg-white text-ink2 border border-black/[0.08] hover:bg-canvas'
        }`}
      >
        {label}
        {typeof count === 'number' && count > 0 && (
          <span className={`px-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold inline-flex items-center justify-center ${active ? 'bg-black/15 text-ink' : 'bg-ink/10 text-ink'}`}>
            {count}
          </span>
        )}
      </button>
    );
  };

  /** Stat card — title / big value / trend pill. */
  const StatCard = ({ label, value, sub, trend, trendDir = 'up', gold }: {
    label: string; value: React.ReactNode; sub?: string; trend?: string; trendDir?: 'up' | 'down'; gold?: boolean;
  }) => (
    <div
      className={`bg-white rounded-card border shadow-card hover:-translate-y-px hover:shadow-cardHover transition-all p-4 sm:p-5 ${gold ? 'border-gold-400/40' : 'border-black/[0.07]'}`}
      style={gold ? { background: 'linear-gradient(135deg,#FFFDF4,#FFF3D0)', borderColor: 'rgba(245,200,66,0.35)' } : undefined}
    >
      <div className="text-[12px] font-semibold text-ink2 uppercase tracking-wide">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-[28px] sm:text-[32px] font-black leading-none text-ink">{value}</div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-[12px] font-semibold mb-0.5 ${trendDir === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
            {trendDir === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {trend}
          </div>
        )}
      </div>
      {sub && <div className="mt-1 text-[12.5px] text-ink2">{sub}</div>}
    </div>
  );

  /** Section heading. */
  const SectionTitle = ({ children, sub, right }: { children: React.ReactNode; sub?: string; right?: React.ReactNode }) => (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-[15px] font-black tracking-tight text-ink">{children}</h2>
        {sub && <div className="text-[12.5px] text-ink2 mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );

  // --- VIEWS ---

  const contactAdmin = () => {
    window.open(
      buildWaUrl('Bonjour, je suis vendeur sur NUNULIA et j\'ai besoin d\'aide.'),
      '_blank',
      'noopener,noreferrer',
    );
  };

  const renderOverview = () => {
    const firstName = currentUser.name.split(' ')[0];
    const totalViews = myProducts.reduce((sum, p) => sum + (p.views || 0), 0);
    const activeCount = myProducts.filter(p => p.status === 'approved').length;
    const pendingCount = myProducts.filter(p => p.status === 'pending').length;
    const tierMaxLabel = currentTier.max === null ? '∞' : currentTier.max;
    const resumable = subRequests.find(r => r.status === 'pending' && !r.transactionRef);
    const awaitingValidation = subRequests.some(r => r.status === 'pending_validation');
    const topByViews = [...myProducts]
      .filter(p => p.status === 'approved' && (p.views || 0) > 0)
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 4);

    return (
    <div className="space-y-5 animate-fadein">
        {/* Activation push — sans token FCM, aucune notif système (demande client,
            approbation produit, etc.) n'arrive sur le téléphone du seller. */}
        <NotificationEnableBanner />

        {/* Offline Queue Banner — auto-syncs in background; manual button forces a retry. */}
        {queueCount > 0 && (
          <div
            className="rounded-card border overflow-hidden"
            style={{
              background: failedDrafts.length > 0
                ? 'linear-gradient(135deg,#FEF2F2 0%, #FEE2E2 100%)'
                : 'linear-gradient(135deg,#FFF7E6 0%, #FFEFD2 100%)',
              borderColor: failedDrafts.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(217,119,6,0.25)',
            }}
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: failedDrafts.length > 0 ? '#FECACA' : '#FDE68A', color: failedDrafts.length > 0 ? '#B91C1C' : '#B45309' }}
                >
                  {failedDrafts.length > 0 ? <X size={16} /> : <Upload size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className={`text-[14px] font-black ${failedDrafts.length > 0 ? 'text-red-800' : 'text-amber-900'}`}>
                        {failedDrafts.length > 0
                          ? t('dashboard.syncError', { count: failedDrafts.length })
                          : t('dashboard.offlineQueue', { count: queueCount })}
                      </div>
                      <div className={`text-[12.5px] mt-0.5 ${failedDrafts.length > 0 ? 'text-red-700/80' : 'text-amber-800/80'}`}>
                        {failedDrafts.length > 0
                          ? (hasBlockedDraft ? t('dashboard.syncBlockedHint') : t('dashboard.syncErrorHint'))
                          : syncing
                          ? t('dashboard.syncing')
                          : t('dashboard.willSyncOnline')}
                      </div>
                    </div>
                    <button
                      onClick={() => sync({ force: true })}
                      disabled={syncing}
                      className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov disabled:opacity-50"
                      style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
                    >
                      <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                      {syncing ? t('dashboard.syncing') : failedDrafts.length > 0 ? t('dashboard.retrySync') : t('dashboard.syncNow')}
                    </button>
                  </div>

                  {/* Per-draft status rows — surface live progress AND lastError */}
                  <div className="mt-3 space-y-2.5">
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
                      if (hasFailed) statusLabel = t('dashboard.syncStatusFailed');
                      else if (isUploading) statusLabel = t('dashboard.syncStageUploading', { current: uploaded + 1, total }) || `Photo ${uploaded + 1}/${total}`;
                      else if (isSaving) statusLabel = t('dashboard.syncStageSaving') || 'Sauvegarde...';
                      else if (syncing) statusLabel = t('dashboard.syncStatusPending');
                      else statusLabel = t('dashboard.syncStatusWaiting');

                      return (
                        <div key={draft.id}>
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <span className={`text-[12.5px] font-semibold truncate ${hasFailed ? 'text-red-800' : 'text-amber-900'}`}>
                              {(draft.data.title as string | undefined) || t('dashboard.syncDraftNoTitle')}
                            </span>
                            <span className={`text-[11px] font-bold shrink-0 ${hasFailed ? 'text-red-600' : 'text-amber-800'}`} title={statusLabel}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className={`h-1.5 rounded-full overflow-hidden ${hasFailed ? 'bg-red-200/70' : 'bg-amber-200/70'}`}>
                            <div
                              className="h-full transition-all duration-300 ease-out"
                              style={{ width: `${isActive && total > 0 ? (isSaving ? 100 : pct) : hasFailed ? 100 : 0}%`, background: hasFailed ? '#DC2626' : '#D97706' }}
                            />
                          </div>
                          {hasFailed && draft.lastError && (
                            <span className="block mt-1 text-[10.5px] text-red-600/80 truncate" title={draft.lastError}>
                              {draft.lastError}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Welcome Banner / Hero */}
        <div
          className="bg-white rounded-card border shadow-card overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#FFFDF4 0%, #FFF8E1 50%, #FFFFFF 100%)', borderColor: 'rgba(245,200,66,0.25)' }}
        >
          <div className="p-5 sm:p-7">
            <div className="flex flex-col md:flex-row md:items-start gap-5 md:gap-6">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="shrink-0">
                  {currentUser.avatar ? (
                    <img
                      src={getOptimizedUrl(currentUser.avatar, 112)}
                      alt=""
                      className="w-14 h-14 rounded-full object-cover"
                      style={{ boxShadow: '0 0 0 2.5px #F5C842, 0 2px 8px rgba(0,0,0,0.08)' }}
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full inline-flex items-center justify-center font-black text-[22px]"
                      style={{ background: '#FFE8B0', color: '#7A4B00', boxShadow: '0 0 0 2.5px #F5C842, 0 2px 8px rgba(0,0,0,0.08)' }}
                    >
                      {(currentUser.sellerDetails?.shopName || currentUser.name).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight leading-tight text-ink">
                      {currentUser.sellerDetails?.shopName || currentUser.name}
                    </h1>
                    {currentUser.isVerified && (
                      <span className="inline-flex items-center gap-1 px-1.5 h-[22px] rounded-full bg-emerald-500/10 text-emerald-600 text-[11.5px] font-semibold">
                        <Check size={11} /> {t('dashboard.verified')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-black/[0.07] text-[11.5px] font-semibold text-ink2">
                      {currentUser.sellerDetails?.sellerType === 'shop' && `🏪 ${t('dashboard.shopType')}`}
                      {currentUser.sellerDetails?.sellerType === 'street' && `🚶 ${t('dashboard.streetType')}`}
                      {(!currentUser.sellerDetails?.sellerType || currentUser.sellerDetails?.sellerType === 'online') && `🌐 ${t('dashboard.onlineType')}`}
                    </span>
                    {(currentUser.sellerDetails?.commune || currentUser.sellerDetails?.province) && (
                      <span className="text-[12.5px] text-ink2 inline-flex items-center gap-1">
                        <MapPin size={12} /> {[currentUser.sellerDetails?.commune, currentUser.sellerDetails?.province].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[13.5px] text-ink2 leading-relaxed max-w-[48ch]">
                    {t('dashboard.welcomeGreeting', { name: firstName, defaultValue: `Bonjour ${firstName} — voici l'état de votre boutique aujourd'hui.` })}
                  </p>
                </div>
              </div>

              {/* Subscription mini card */}
              <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-4 w-full md:w-[300px] shrink-0" style={{ background: 'rgba(255,255,255,0.85)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TierBadge label={currentTier.label} />
                    <span className="text-[12px] font-semibold text-ink2">{t('dashboard.mySubscription')}</span>
                  </div>
                  {daysRemaining !== null && isPaidTier && !isExpired && (
                    <span className="text-[11.5px] font-bold text-ink2">{daysRemaining} j</span>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <div className={`text-[22px] font-black tabular-nums leading-none ${isLimitReached ? 'text-red-500' : 'text-ink'}`}>
                    {currentCount}<span className="text-ink2 font-semibold">/{tierMaxLabel}</span>
                  </div>
                  <div className="text-[11.5px] text-ink2 mb-0.5">{t('dashboard.statProducts')}</div>
                </div>
                <div className="mt-2">
                  <Progress value={currentTier.max === null ? 100 : Math.min(progressPercentage, 100)} />
                </div>
                <button
                  onClick={() => (isExpired ? openRenewFlow() : navigate('/plans'))}
                  className="mt-3 w-full h-9 rounded-input bg-ink text-white text-[12.5px] font-semibold active:scale-[0.97] transition-transform hover:bg-black inline-flex items-center justify-center gap-1.5"
                >
                  {isExpired ? t('dashboard.subRenew') : isPaidTier ? t('dashboard.subChangePlan') : t('dashboard.subUpgrade')} <ArrowRight size={12} />
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <button
                onClick={() => setActiveTab('add_product')}
                className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov"
                style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
              >
                <Plus size={16} /> {t('dashboard.addArticle')}
              </button>
              <button
                onClick={() => setActiveTab('shop')}
                className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-white text-ink font-semibold text-[14px] border border-black/[0.08] active:scale-[0.97] transition-transform hover:bg-canvas"
              >
                <Palette size={16} /> {t('dashboard.editShop')}
              </button>
            </div>
          </div>
        </div>

        {/* Grace phase banner (R19) — replaces simple "Expired" alert */}
        {isExpired && isPaidTier && isInGrace && (
          <div
            className="rounded-card border p-4 flex items-start gap-3"
            style={{
              background: downgradePhase === 1 ? 'linear-gradient(135deg,#FFFBE6,#FFFFFF)' : 'linear-gradient(135deg,#FFF3E0,#FFFFFF)',
              borderColor: downgradePhase === 1 ? 'rgba(217,119,6,0.25)' : 'rgba(234,88,12,0.25)',
            }}
          >
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
              <Clock size={16} />
            </div>
            <div className="flex-1">
              <p className={`text-[14px] font-black ${downgradePhase === 1 ? 'text-amber-900' : 'text-orange-800'}`}>
                {downgradePhase === 1
                  ? t('dashboard.gracePh1Title', 'Période de grâce — encore {{days}} jour(s)', { days: graceDaysLeft })
                  : t('dashboard.gracePh2Title', 'Produits limités — encore {{days}} jour(s) avant suppression', { days: graceDaysLeft })}
              </p>
              <p className="text-[12.5px] text-ink2 mt-1">
                {downgradePhase === 1
                  ? t('dashboard.gracePh1Body', 'Vos produits restent visibles. Renouvelez maintenant pour éviter leur masquage.')
                  : t('dashboard.gracePh2Body', 'Seuls 5 de vos produits sont encore visibles. Renouvelez pour les réactiver tous.')}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openRenewFlow()} className="px-3.5 h-9 rounded-input bg-gold-400 text-ink text-[12.5px] font-bold active:scale-[0.97] transition-transform hover:bg-goldHov">{t('dashboard.renewPlan')}</button>
                <a href={buildWaUrl('Bonjour, je souhaite renouveler mon abonnement NUNULIA.')} target="_blank" rel="noopener noreferrer" className="px-3.5 h-9 rounded-input text-white text-[12.5px] font-bold inline-flex items-center gap-1.5" style={{ background: '#25D366' }}><WhatsAppIcon size={13} /> WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Expiration Alert (no grace phase) */}
        {isExpired && isPaidTier && !isInGrace && (
          <div className="rounded-card border p-4 flex items-start gap-3" style={{ background: 'linear-gradient(135deg,#FEF2F2,#FFFFFF)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-600">
              <X size={16} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] text-red-800 font-black">{t('dashboard.subscriptionExpired')}</p>
              <p className="text-[12.5px] text-ink2 mt-1">{t('dashboard.expiredLimitMessage')}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openRenewFlow()} className="px-3.5 h-9 rounded-input bg-gold-400 text-ink text-[12.5px] font-bold active:scale-[0.97] transition-transform hover:bg-goldHov">{t('dashboard.renewPlan')}</button>
                <a href={buildWaUrl('Bonjour, je souhaite renouveler mon abonnement NUNULIA.')} target="_blank" rel="noopener noreferrer" className="px-3.5 h-9 rounded-input text-white text-[12.5px] font-bold inline-flex items-center gap-1.5" style={{ background: '#25D366' }}><WhatsAppIcon size={13} /> WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Expiration Warning (< 7 days, urgent at <= 3 days) */}
        {showExpirationWarning && (
          <div
            className="rounded-card border p-4 flex items-start gap-3"
            style={{
              background: showUrgentWarning ? 'linear-gradient(135deg,#FEF2F2,#FFFFFF)' : 'linear-gradient(135deg,#FFFBE6,#FFFFFF)',
              borderColor: showUrgentWarning ? 'rgba(239,68,68,0.25)' : 'rgba(217,119,6,0.25)',
            }}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${showUrgentWarning ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
              <Clock size={16} />
            </div>
            <div className="flex-1">
              <p className={`text-[14px] font-black ${showUrgentWarning ? 'text-red-800' : 'text-amber-900'}`}>
                {showUrgentWarning ? 'URGENT — ' : ''}{t('dashboard.expiresIn', { days: daysRemaining })}
              </p>
              <p className="text-[12.5px] text-ink2 mt-1">{t('dashboard.renewMessage')}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openRenewFlow()} className={`px-3.5 h-9 rounded-input text-[12.5px] font-bold active:scale-[0.97] transition-transform ${showUrgentWarning ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-gold-400 text-ink hover:bg-goldHov'}`}>{t('dashboard.renewNow')}</button>
                <a href={buildWaUrl(`Bonjour, je souhaite renouveler mon abonnement NUNULIA. Mon plan expire dans ${daysRemaining} jour(s).`)} target="_blank" rel="noopener noreferrer" className="px-3.5 h-9 rounded-input text-white text-[12.5px] font-bold inline-flex items-center gap-1.5" style={{ background: '#25D366' }}><WhatsAppIcon size={13} /> WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade Warning (free plan, 3+ products) */}
        {showUpgradeWarning && !isExpired && (
          <div className="rounded-card border p-4 flex items-start gap-3" style={{ background: 'linear-gradient(135deg,#FFFDF4,#FFF3D0)', borderColor: 'rgba(245,200,66,0.30)' }}>
            <div className="w-9 h-9 rounded-full bg-gold-400/20 flex items-center justify-center shrink-0 text-goldDeep">
              <Sparkles size={16} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] text-goldDeep font-black">{t('dashboard.upgradeTitle')}</p>
              <p className="text-[12.5px] text-ink2 mt-1">{t('dashboard.upgradeMessage', { count: currentCount })}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => navigate('/plans')} className="px-3.5 h-9 rounded-input bg-gold-400 text-ink text-[12.5px] font-bold active:scale-[0.97] transition-transform hover:bg-goldHov">{t('dashboard.viewPlans')}</button>
                <a href={buildWaUrl('Bonjour, je souhaite souscrire à un plan NUNULIA.')} target="_blank" rel="noopener noreferrer" className="px-3.5 h-9 rounded-input text-white text-[12.5px] font-bold inline-flex items-center gap-1.5" style={{ background: '#25D366' }}><WhatsAppIcon size={13} /> WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <StatCard label={t('dashboard.statProducts')} value={activeCount} sub={t('dashboard.published')} trend={String(myProducts.length)} />
            <StatCard label={t('dashboard.statTotalViews')} value={totalViews.toLocaleString('fr-FR')} sub={t('dashboard.allListings')} />
            <StatCard label={t('dashboard.statTotalLikes')} value={myProducts.reduce((sum, p) => sum + (p.likesCount || 0), 0)} sub={t('dashboard.allListings')} />
            <StatCard label={t('dashboard.statPending')} value={pendingCount} sub={t('dashboard.adminValidation')} gold />
        </div>

        {/* ── Photo Studio Card (Phase 6) ── */}
        <PhotoStudioCard />

        {/* ── Réseau B2B Feature Banner ── */}
        <div
          className="rounded-card border shadow-card overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#0F1923 0%, #1A2632 100%)', borderColor: 'rgba(245,158,11,0.30)' }}
        >
          <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex-1">
              <div
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(245,158,11,0.20)', color: '#FCD34D' }}
              >
                🌍 {t('dashboard.b2bBadge')}
              </div>
              <h3 className="mt-2 text-[20px] sm:text-[22px] font-black tracking-tight leading-snug text-white">
                {t('dashboard.b2bCardTitle')}
              </h3>
              <p className="mt-1.5 text-[13.5px] text-white/75 max-w-[56ch]">
                {t('dashboard.b2bCardDesc')}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  t('dashboard.b2bFeat1'),
                  t('dashboard.b2bFeat2'),
                  t('dashboard.b2bFeat3'),
                ].map(label => (
                  <span key={label} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-white/85 bg-white/8 border border-white/15 px-2.5 py-1 rounded-full">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => navigate('/reseau')}
              className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-amber-500 text-gray-900 font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-amber-400 w-full md:w-auto md:px-5"
              style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,158,11,0.45)' }}
            >
              {t('dashboard.b2bCta')}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ── Buyer Requests Feature Banner ── */}
        <div
          className="rounded-card border shadow-card overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#FFFDF4 0%, #FFF3D0 100%)', borderColor: 'rgba(245,200,66,0.30)' }}
        >
          <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex-1">
              <div
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(245,200,66,0.20)', color: '#92400E' }}
              >
                <Star size={11} /> {t('dashboard.opportunityBadge', { defaultValue: 'Opportunité' })}
              </div>
              <h3 className="mt-2 text-[20px] sm:text-[22px] font-black tracking-tight leading-snug text-ink">
                {t('dashboard.buyerRequestsCardTitle')}
              </h3>
              <p className="mt-1.5 text-[13.5px] text-ink2 max-w-[56ch]">{t('dashboard.buyerRequestsCardDesc')}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  t('dashboard.buyerRequestsFeat1'),
                  t('dashboard.buyerRequestsFeat2'),
                  t('dashboard.buyerRequestsFeat3'),
                ].map(label => (
                  <span key={label} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink2 bg-white border border-black/[0.07] px-2.5 py-1 rounded-full">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => setActiveTab('requests')}
              className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov w-full md:w-auto md:px-5"
              style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
            >
              {requestStats && requestStats.todayCount > 0
                ? `+${requestStats.todayCount} ${t('dashboard.buyerRequestsToday')}`
                : t('dashboard.viewAllRequests')}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ── My Subscription Card ── */}
        <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5 space-y-4">
          <SectionTitle>{t('dashboard.mySubscription')}</SectionTitle>

          {/* Current plan info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center ${
                isPaidTier && !isExpired ? 'bg-gold-400/20 text-goldDeep'
                  : isExpired ? 'bg-red-500/15 text-red-600'
                  : 'bg-canvas text-ink2'
              }`}>
                {isPaidTier && !isExpired ? <Crown size={18} /> : isExpired ? <X size={18} /> : <Star size={18} />}
              </div>
              <div>
                <p className="text-ink font-black text-[14px]">{currentTier.label}</p>
                <p className="text-ink2 text-[12px]">
                  {currentTier.max === null ? t('dashboard.subUnlimited') : t('dashboard.subProductLimit', { max: currentTier.max })}
                </p>
              </div>
            </div>
            <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full ${
              isExpired ? 'bg-red-500/15 text-red-600'
                : isPaidTier ? 'bg-emerald-500/15 text-emerald-600'
                : 'bg-canvas text-ink2'
            }`}>
              {isExpired ? t('dashboard.subExpired') : isPaidTier ? t('dashboard.subActive') : t('dashboard.subFree')}
            </span>
          </div>

          {/* Expiration details (paid tier only) */}
          {isPaidTier && !isExpired && daysRemaining !== null && (
            <div className="bg-canvas rounded-input p-3 flex items-center justify-between">
              <span className="text-[12px] text-ink2">{t('dashboard.subExpiresOn')}</span>
              <span className={`text-[12px] font-bold ${daysRemaining <= 7 ? 'text-red-600' : daysRemaining <= 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {currentUser.sellerDetails?.subscriptionExpiresAt
                  ? new Date(currentUser.sellerDetails.subscriptionExpiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—'} ({daysRemaining} {t('dashboard.subDays')})
              </span>
            </div>
          )}

          {/* Usage bar */}
          <div>
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-ink2">{t('dashboard.subUsage')}</span>
              <span className={`font-bold ${isLimitReached ? 'text-red-600' : 'text-ink'}`}>{currentCount} / {tierMaxLabel}</span>
            </div>
            <Progress value={currentTier.max === null ? 100 : Math.min(progressPercentage, 100)} />
          </div>

          {/* CTA button */}
          <div>
            {resumable ? (
              <button
                onClick={() => navigate('/plans')}
                className="w-full h-11 rounded-input bg-gold-400 hover:bg-goldHov text-ink text-[13px] font-bold active:scale-[0.97] transition-transform"
              >
                {t('dashboard.subCompleteRequest', 'Compléter ma demande de paiement')}
              </button>
            ) : awaitingValidation ? (
              <button disabled className="w-full h-11 rounded-input bg-canvas text-ink2 text-[13px] font-bold cursor-not-allowed flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-muted border-t-ink2 rounded-full animate-spin" />
                {t('dashboard.subPendingRequest')}
              </button>
            ) : isExpired ? (
              <button onClick={() => openRenewFlow()} className="w-full h-11 rounded-input bg-red-600 hover:bg-red-500 text-white text-[13px] font-bold active:scale-[0.97] transition-transform">{t('dashboard.subRenew')}</button>
            ) : (
              <button onClick={() => navigate('/plans')} className="w-full h-11 rounded-input bg-ink hover:bg-black text-white text-[13px] font-bold active:scale-[0.97] transition-transform">{isPaidTier ? t('dashboard.subChangePlan') : t('dashboard.subUpgrade')}</button>
            )}
          </div>

          {/* Request history */}
          {subRequests.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-ink2 uppercase tracking-wider mb-2">{t('dashboard.subHistory')}</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {subRequests.slice(0, 5).map(req => (
                  <div key={req.id} className="flex items-center justify-between bg-canvas rounded-input p-2.5 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        req.status === 'approved' ? 'bg-emerald-500' :
                        req.status === 'rejected' ? 'bg-red-500' :
                        req.status === 'pending_validation' ? 'bg-blue-500' :
                        'bg-amber-500'
                      }`} />
                      <span className="text-ink truncate">{req.planLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-medium ${
                        req.status === 'approved' ? 'text-emerald-600' :
                        req.status === 'rejected' ? 'text-red-600' :
                        req.status === 'pending_validation' ? 'text-blue-600' :
                        'text-amber-600'
                      }`}>
                        {req.status === 'approved' ? t('dashboard.subApproved') :
                         req.status === 'rejected' ? t('dashboard.subRejected') :
                         req.status === 'pending_validation' ? t('dashboard.subValidating') :
                         t('dashboard.subPending')}
                      </span>
                      <span className="text-muted">{new Date(req.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>
              {subRequests.some(r => r.status === 'rejected' && r.rejectionReason) && (
                <div className="mt-2 rounded-input p-2.5 space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                  <p className="text-[12px] text-red-700">
                    {t('dashboard.subLastRejection')}: {subRequests.find(r => r.status === 'rejected')?.rejectionReason}
                  </p>
                  <button
                    onClick={() => navigate('/plans')}
                    className="w-full h-9 rounded-input bg-gold-400 hover:bg-goldHov text-ink text-[12px] font-bold active:scale-[0.97] transition-transform"
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
          <div className="rounded-card border p-4 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' }}>
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-600">
              <X size={16} />
            </div>
            <div>
              <p className="text-[14px] text-red-800 font-black">{t('dashboard.rejectedProducts', { count: myProducts.filter(p => p.status === 'rejected').length })}</p>
              <p className="text-[12.5px] text-ink2 mt-1">{t('dashboard.rejectedHint')}</p>
              <button onClick={() => { setActiveTab('products'); setProductStatusFilter('rejected'); }} className="text-[12px] font-bold text-goldDeep hover:underline mt-1.5">
                {t('dashboard.viewRejected')}
              </button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <SectionTitle sub={t('dashboard.quickActionsSub', { defaultValue: 'Raccourcis vers les actions les plus fréquentes' })}>{t('dashboard.quickActions')}</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Plus, label: t('dashboard.addProduct'), action: () => setActiveTab('add_product') },
              { icon: Palette, label: t('dashboard.myShopAction'), action: () => setActiveTab('shop') },
              { icon: Zap, label: t('dashboard.viewAnalytics'), action: () => setActiveTab('boost') },
              { icon: WhatsAppIcon, label: t('dashboard.contactAdmin'), action: contactAdmin },
            ].map(item => {
              const IconCmp = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="bg-white rounded-card border border-black/[0.07] shadow-card hover:-translate-y-px hover:shadow-cardHover transition-all p-4 text-left active:scale-[0.97]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-canvas text-goldDeep">
                      <IconCmp size={16} />
                    </div>
                    <ArrowRight size={16} className="ml-auto text-ink2" />
                  </div>
                  <div className="mt-3 text-[13.5px] font-black text-ink">{item.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top products by views */}
        {topByViews.length > 0 && (
          <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5">
            <SectionTitle sub={t('dashboard.topByViewsSub', { defaultValue: 'Vos plus performants ce mois' })}>{t('dashboard.topByViews')}</SectionTitle>
            <div className="space-y-2.5">
              {topByViews.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <img
                    src={p.images[0] ? getOptimizedUrl(p.images[0], 80) : ''}
                    alt=""
                    loading="lazy"
                    className="w-10 h-10 rounded-[10px] object-cover bg-canvas shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{p.title}</div>
                    <div className="text-[11.5px] text-ink2">{(p.views || 0).toLocaleString('fr-FR')} {t('dashboard.analyticsViews')}</div>
                  </div>
                  {i === 0 ? <Crown size={16} className="text-gold-400" /> : <span className="text-[11px] font-bold text-muted">#{i + 1}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Network footer */}
        <div className="flex items-center justify-center gap-2 text-[11.5px] text-muted pt-1 pb-2">
          <span className="inline-flex items-center gap-1.5">
            <Wifi size={12} />
            {networkQuality === 'slow' ? t('dashboard.slowNetworkBanner') : t('dashboard.networkConnected', { defaultValue: 'Connecté' })}
          </span>
        </div>
    </div>
    );
  };

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
      <div className="space-y-5 animate-fadein">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-ink">{t('dashboard.analyticsTitle')}</h1>
          <div className="text-[13px] text-ink2 mt-1">{t('dashboard.analyticsSubtitle')}</div>
        </div>

        {analyticsLoading ? (
          <div className="text-center py-16 text-ink2 text-sm">{t('dashboard.loadingAnalytics')}</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3.5">
              <StatCard label={t('dashboard.analyticsViews')} value={totalViews30} />
              <StatCard label={t('dashboard.analyticsContacts')} value={totalContacts30} />
              <StatCard label={t('dashboard.analyticsLikes')} value={totalLikes30} />
            </div>

            {/* 30-day bar chart */}
            <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5">
              <SectionTitle sub={t('dashboard.analyticsChartSub', { defaultValue: 'Vues quotidiennes sur 30 jours' })}>
                {t('dashboard.analyticsChart')}
              </SectionTitle>
              {totalViews30 === 0 ? (
                <div className="text-center py-8 text-ink2 text-sm">{t('dashboard.analyticsNoData')}</div>
              ) : (
                <div className="w-full">
                  <div className="h-[180px] flex items-end gap-[3px]">
                    {viewsByDay.map((count, i) => {
                      const h = count === 0 ? 1.5 : Math.max(4, (count / maxDayViews) * 100);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end">
                          <div
                            className="w-full rounded-t-[5px]"
                            style={{
                              height: h + '%',
                              background: count === 0 ? '#EEF0F4' : 'linear-gradient(180deg,#F5C842,#E8A800)',
                              transition: 'height 700ms ease-out',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted font-medium mt-2">
                    {xLabels.map(label => (
                      <span key={label} className="tabular-nums">{label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Per-product ranking */}
            <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5">
              <SectionTitle sub={t('dashboard.analyticsTopProductsSub', { defaultValue: 'Classement par nombre de vues sur 30 jours' })}>
                {t('dashboard.analyticsTopProducts')}
              </SectionTitle>
              {topProducts.length === 0 ? (
                <p className="text-center py-8 text-ink2 text-sm">{t('dashboard.analyticsNoProducts')}</p>
              ) : (
                <div className="space-y-1">
                  {topProducts.map(({ product, stats }, i) => {
                    const ratio = stats.views / maxViews;
                    return (
                      <div key={product.id} className="grid grid-cols-[24px_44px_1fr_auto] items-center gap-3 py-2 border-b border-black/[0.04] last:border-b-0">
                        <div className="flex items-center justify-center">
                          {i === 0 ? <Crown size={18} className="text-gold-400" /> : <span className="text-[12px] font-black text-muted tabular-nums">#{i + 1}</span>}
                        </div>
                        <div className="w-11 h-11 rounded-[10px] overflow-hidden bg-canvas shrink-0">
                          {product.images?.[0] && (
                            <img src={getOptimizedUrl(product.images[0], 80)} alt="" loading="lazy" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold text-ink truncate">{product.title}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 rounded-full bg-black/[0.05] overflow-hidden flex-1 max-w-[200px]">
                              <div className="h-full" style={{ width: (ratio * 100) + '%', background: 'linear-gradient(90deg,#F5C842,#E8A800)', transition: 'width 700ms ease-out' }} />
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[14px] font-black text-ink tabular-nums">{stats.views}</div>
                          <div className="text-[10.5px] text-ink2 font-medium uppercase tracking-wide">{t('dashboard.analyticsViews')}</div>
                        </div>
                      </div>
                    );
                  })}
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
            <div className="max-w-md mx-auto animate-fadein py-10 text-center">
                <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(90deg,#EF4444,#F97316,#EF4444)' }} />
                    <div className="w-20 h-20 bg-canvas rounded-full flex items-center justify-center mx-auto mb-6 text-ink2">
                        <Lock size={36} />
                    </div>

                    <h2 className="text-[22px] font-black text-ink mb-2">{t('dashboard.limitReachedTitle')}</h2>

                    <div className="mb-6 space-y-3">
                        <p className="text-ink2 mb-4 text-[13.5px] leading-relaxed">
                            {t('dashboard.usedSlots', { max: currentTier.max, label: currentTier.label })}
                        </p>
                        <a
                          href={buildWaUrl(`Bonjour, je souhaite passer à un plan supérieur sur NUNULIA. Mon plan actuel : ${currentTier.label}.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full h-11 rounded-input text-white font-semibold text-[14px] active:scale-[0.97] transition-transform"
                          style={{ background: '#25D366' }}
                        >
                          <WhatsAppIcon size={16} /> {t('dashboard.whatsappUpgrade')}
                        </a>
                    </div>

                    <button onClick={() => setActiveTab('overview')} className="mt-4 text-[12.5px] font-semibold text-ink2 hover:text-ink underline">
                        {t('dashboard.backToDashboard')}
                    </button>
                </div>
            </div>
          );
      }

      const selectCls = 'w-full h-11 pl-3.5 pr-9 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink appearance-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none';
      const inputCls = 'w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none';

      return (
        <div className="animate-fadein">
            <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-[24px] font-black tracking-tight text-ink">{t('dashboard.addProductTitle')}</h1>
                  <div className="text-[13px] text-ink2 mt-1">{t('dashboard.addProductSub', { defaultValue: "Renseignez votre annonce. Elle sera publiée dès validation." })}</div>
                </div>
                <span className="text-[12px] font-bold text-ink2 bg-canvas px-2.5 h-8 inline-flex items-center rounded-input border border-black/[0.06]">
                    {t('dashboard.quota', { current: currentCount, max: currentTier.max === null ? '∞' : currentTier.max })}
                </span>
            </div>

            {isSlowNetwork && (
              <div className="mb-4 rounded-card border p-3.5 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#FFF7E6,#FFFFFF)', borderColor: 'rgba(217,119,6,0.25)' }}>
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <Wifi size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-amber-900">{t('dashboard.slowNetworkBanner')}</div>
                  <div className="text-[12px] text-amber-800/80">{t('dashboard.slowNetworkHint')}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
              {/* Form Column */}
              <div className="min-w-0">
                <form onSubmit={handleAddProduct} className="space-y-4">
                  {/* Quality Score (real component) */}
                  <ProductQualityScore score={productScore} />

                  <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5 space-y-4">
                    <SectionTitle>{t('dashboard.basicInfo')}</SectionTitle>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                       <label className="block">
                          <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.categoryLabel')}</span>
                          <div className="relative">
                            <select required value={category} onChange={e => { setCategory(e.target.value); setSubCategory(''); }} className={selectCls}>
                                <option value="">{t('dashboard.selectPlaceholder')}</option>
                                {categoriesList.map(c => (
                                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink2" />
                          </div>
                       </label>
                       <label className="block">
                          <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.subCategoryLabel')}</span>
                          <div className="relative">
                            <select value={subCategory} onChange={e => setSubCategory(e.target.value)} disabled={!category} className={`${selectCls} disabled:opacity-50`}>
                                <option value="">{t('dashboard.selectPlaceholder')}</option>
                                {(categoriesList.find(c => c.id === category)?.subCategories || []).map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink2" />
                          </div>
                       </label>
                    </div>

                    {/* Voice-first listing : décrire le produit à la voix → pré-remplissage IA.
                        Bouton aligné à droite ; le libellé « Nom du produit » est déjà
                        rendu par SmartTitleInput juste en dessous (pas de doublon). */}
                    <div className="flex items-center justify-end mb-1">
                      <VoiceCaptureButton
                        onResult={handleVoiceResult}
                        onError={handleVoiceError}
                        countryId={currentUser?.sellerDetails?.countryId}
                        disabled={isLimitReached}
                        label={t('dashboard.voiceDescribe')}
                      />
                    </div>

                    {/* Smart Title Input with autocomplete (real component) */}
                    <SmartTitleInput
                      value={title}
                      onChange={setTitle}
                      existingProducts={myProducts}
                      categories={categoriesList}
                      onSuggestionSelect={handleSuggestionSelect}
                      selectedCategory={category}
                      selectedSubCategory={subCategory}
                    />

                    {/* Description avec génération IA */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12.5px] font-semibold text-ink2">{t('dashboard.detailedDescription')}</span>
                          <button
                            type="button"
                            onClick={handleGenerateDescription}
                            disabled={descGenLoading}
                            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-goldDeep active:scale-[0.97] transition-transform px-2.5 py-1 rounded-full disabled:opacity-60 disabled:cursor-wait"
                            style={{ background: 'rgba(245,200,66,0.15)' }}
                          >
                            {descGenLoading ? (
                              <>
                                <span className="w-3 h-3 border-[1.5px] border-goldDeep border-t-transparent rounded-full animate-spin" />
                                {t('dashboard.generatingDescription')}
                              </>
                            ) : (
                              <>
                                <Sparkles size={11} /> {t('dashboard.generateDescription')}
                              </>
                            )}
                          </button>
                        </div>
                        <textarea
                          required value={desc} onChange={e => setDesc(e.target.value)}
                          className="w-full px-3.5 py-3 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted transition resize-y min-h-[110px] focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none"
                          placeholder={t('dashboard.descriptionPlaceholder')}
                        />
                        {/* Specs devinées par l'IA — à vérifier */}
                        {descGuessedFields.length > 0 && (
                          <div
                            className="mt-2 p-2.5 rounded-lg text-[11.5px] leading-relaxed"
                            style={{ background: 'rgba(245,200,66,0.10)', border: '1px solid rgba(245,200,66,0.30)' }}
                          >
                            <div className="flex items-start gap-1.5 text-goldDeep font-semibold mb-1">
                              <span>🔍</span>
                              <span>{t('dashboard.aiGuessedHeader')}</span>
                            </div>
                            <ul className="space-y-0.5 ml-5 text-ink2">
                              {descGuessedFields.map((field, i) => (
                                <li key={i} className="list-disc">{field}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* Compteur de quota IA */}
                        {descQuota && (
                          <div className="mt-1.5 text-[10.5px] text-muted text-right">
                            {descQuota.isPro
                              ? t('dashboard.aiQuotaPro')
                              : t('dashboard.aiQuotaCount', { used: descQuota.used, limit: descQuota.limit })}
                          </div>
                        )}
                    </div>
                  </div>

                  <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5 space-y-4">
                     <SectionTitle>{t('dashboard.priceAndImages')}</SectionTitle>

                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.priceLabel')}</span>
                          <input required type="number" min="0.01" step="any" value={price} onChange={e => setPrice(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                        </label>
                        <label className="block">
                          <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.currencyLabel')}</span>
                          <div className="relative">
                            <select value={productCurrency} onChange={e => setProductCurrency(e.target.value)} className={selectCls}>
                              {currencies.map(c => <option key={c.id} value={c.code}>{c.symbol} ({c.code})</option>)}
                            </select>
                            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink2" />
                          </div>
                        </label>
                        <label className="block">
                          <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.oldPrice')}</span>
                          <input type="number" min="0" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="—" />
                        </label>
                     </div>

                    {/* B2B Wholesale Toggle */}
                    <div className="rounded-input border border-black/[0.08] bg-canvas p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[13.5px] font-semibold text-ink">{t('dashboard.wholesaleToggle')}</span>
                          <p className="text-[12px] text-ink2">{t('dashboard.wholesaleHint')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsWholesale(!isWholesale)}
                          aria-pressed={isWholesale}
                          className={`relative w-10 h-6 rounded-full transition active:scale-[0.97] shrink-0 ${isWholesale ? 'bg-gold-400' : 'bg-black/[0.15]'}`}
                        >
                          <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition" style={{ transform: isWholesale ? 'translateX(16px)' : 'translateX(0)' }} />
                        </button>
                      </div>
                      {isWholesale && (
                        <div className="grid grid-cols-2 gap-3 pt-1 animate-fadein">
                          <label className="block">
                            <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.minOrder')}</span>
                            <input type="number" min="2" value={minOrderQty} onChange={e => setMinOrderQty(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="10" />
                          </label>
                          <label className="block">
                            <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.wholesalePrice')}</span>
                            <input type="number" min="0" step="any" value={wholesalePrice} onChange={e => setWholesalePrice(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Smart Image Upload (real component) */}
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
                    <div className="rounded-input p-3 text-[13px] font-medium" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#B91C1C' }}>
                      {formError}
                    </div>
                  )}

                  {uploadProgress && (
                    <div className="rounded-input p-3 text-[13px] font-medium flex items-center gap-2" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.20)', color: '#1D4ED8' }}>
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      {uploadProgress}
                    </div>
                  )}

                  {/* Mobile Preview Toggle (real component) */}
                  <div className="lg:hidden">
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

                  {/* Desktop submit row */}
                  <div className="hidden lg:flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('products')}
                      className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-white text-ink font-semibold text-[14px] border border-black/[0.08] active:scale-[0.97] transition-transform hover:bg-canvas"
                    >
                      {t('dashboard.cancelButton')}
                    </button>
                    <button
                      type="submit"
                      disabled={loading || compressing}
                      className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov disabled:opacity-60"
                      style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
                    >
                      <Upload size={16} />
                      {loading ? t('dashboard.publishing') : compressing ? t('dashboard.optimizing') : t('dashboard.publishNow')}
                    </button>
                  </div>

                  {/* Mobile sticky submit — positionné au-dessus de la bottom nav (h-16 = 64px) */}
                  <div className="lg:hidden fixed left-0 right-0 z-30 px-4 pt-3 pb-3 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
                    <div className="bg-white rounded-card border border-black/[0.07] shadow-cardHover p-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('products')}
                        className="inline-flex items-center justify-center px-4 h-12 rounded-input bg-canvas text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform"
                      >
                        {t('dashboard.cancelButton')}
                      </button>
                      <button
                        type="submit"
                        disabled={loading || compressing}
                        className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov disabled:opacity-60"
                        style={{ boxShadow: '0 6px 16px rgba(245,200,66,0.35)' }}
                      >
                        <Upload size={16} />
                        {loading ? t('dashboard.publishing') : compressing ? t('dashboard.optimizing') : t('dashboard.publishNow')}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Desktop Preview Sidebar (real component) */}
              <div className="hidden lg:block">
                <div className="sticky top-5">
                  <div className="text-[11px] font-bold text-muted uppercase tracking-[0.14em] mb-2 px-1">
                    {t('dashboard.livePreview', { defaultValue: 'Aperçu en direct' })}
                  </div>
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

  const renderShopSettings = () => {
    const fieldInputCls = 'w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none';
    const fieldSelectCls = 'w-full h-11 pl-3.5 pr-9 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink appearance-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none';
    return (
      <form onSubmit={handleSaveProfile} className="animate-fadein space-y-5 pb-28 lg:pb-5">
          <div>
            <h1 className="text-[24px] font-black tracking-tight text-ink">{t('dashboard.shopCustomization')}</h1>
            <div className="text-[13px] text-ink2 mt-1">{t('dashboard.shopCustomizationSub', { defaultValue: 'Personnalisez votre vitrine. Ces informations sont visibles par tous les acheteurs.' })}</div>
          </div>

          {/* IDENTITY */}
          <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5 space-y-4">
              <SectionTitle>{t('dashboard.logoLabel')}</SectionTitle>
              <div className="flex items-center gap-4">
                <img
                  src={avatarPreview || '/icons/icon-192.png'}
                  alt=""
                  className="w-20 h-20 rounded-card object-cover bg-canvas border border-black/[0.07] shrink-0"
                />
                <div className="flex-1">
                  <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarSelect} className="hidden" />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-input bg-canvas text-ink text-[13px] font-bold active:scale-[0.97] transition-transform hover:bg-black/[0.06]"
                  >
                    <Camera size={14} /> {t('dashboard.changeImage')}
                  </button>
                  <p className="text-[11.5px] text-muted mt-1.5">{t('dashboard.imageHint')}</p>
                </div>
              </div>

              <label className="block">
                <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.shopNameLabel')}</span>
                <input className={fieldInputCls} value={shopProfile.name} onChange={(e) => setShopProfile({ ...shopProfile, name: e.target.value })} />
              </label>

              <label className="block">
                <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.bioLabel')}</span>
                <textarea
                  className="w-full px-3.5 py-3 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted transition resize-y min-h-[90px] focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none"
                  value={shopProfile.bio}
                  onChange={(e) => setShopProfile({ ...shopProfile, bio: e.target.value })}
                  placeholder={t('dashboard.bioPlaceholder')}
                />
              </label>
          </div>

          {/* CONTACT & LOCATION */}
          <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5 space-y-4">
              <SectionTitle sub={t('dashboard.contactSub', { defaultValue: 'Comment les acheteurs vous trouvent et vous contactent.' })}>
                {t('dashboard.whatsappLabel')}
              </SectionTitle>

              <label className="block">
                <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.whatsappLabel')}</span>
                <input className={fieldInputCls} value={shopProfile.whatsapp} onChange={(e) => setShopProfile({ ...shopProfile, whatsapp: e.target.value })} placeholder="+257..." />
              </label>

              {/* GPS — Capture automatique */}
              <div className="rounded-input border border-black/[0.08] bg-canvas p-4 space-y-3">
                  <span className="text-[12.5px] font-semibold text-ink2">{t('dashboard.gpsLabel')}</span>
                  <button
                    type="button"
                    onClick={captureGPS}
                    disabled={gpsLoading}
                    className={`w-full flex items-center justify-center gap-2 h-11 rounded-input font-bold text-[13.5px] active:scale-[0.97] transition-transform ${
                      shopProfile.gps ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-ink hover:bg-black text-white'
                    }`}
                  >
                    {gpsLoading ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('dashboard.capturingGps')}</>
                    ) : shopProfile.gps ? (
                      <><MapPin size={15} /> {t('dashboard.gpsCaptured')} ({shopProfile.gps.lat.toFixed(4)}, {shopProfile.gps.lng.toFixed(4)})</>
                    ) : (
                      <><MapPin size={15} /> {t('dashboard.captureGps')}</>
                    )}
                  </button>
                  <p className="text-[11.5px] text-muted">{t('dashboard.gpsHint')}</p>
              </div>

              <label className="block">
                <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.locationUrlLabel')}</span>
                <input className={fieldInputCls} value={shopProfile.locationUrl} onChange={(e) => setShopProfile({ ...shopProfile, locationUrl: e.target.value })} placeholder="https://maps.google.com/..." />
              </label>

              {/* TYPE DE VENTE */}
              <div>
                  <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.sellingTypeLabel')}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {([
                      { value: 'shop' as const, icon: '🏪', label: t('dashboard.fixedShop') },
                      { value: 'street' as const, icon: '🚶', label: t('dashboard.ambulant') },
                      { value: 'online' as const, icon: '🌐', label: t('dashboard.online') },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setShopProfile({ ...shopProfile, sellerType: opt.value })}
                        className={`text-left rounded-input p-3.5 border-2 transition active:scale-[0.97] ${
                          shopProfile.sellerType === opt.value ? 'border-gold-400 bg-gold-400/[0.08]' : 'border-black/[0.08] hover:bg-canvas'
                        }`}
                      >
                        <div className="text-[22px] leading-none">{opt.icon}</div>
                        <div className="mt-2 text-[13.5px] font-bold text-ink">{opt.label}</div>
                      </button>
                    ))}
                  </div>
              </div>

              {/* PHOTO DE LA BOUTIQUE */}
              <div>
                  <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.shopPhotoLabel')}</span>
                  <div className="flex items-center gap-4">
                    <div className="relative w-24 h-16 rounded-input overflow-hidden border border-black/[0.07] bg-canvas shrink-0">
                      {shopImagePreview ? (
                        <img src={shopImagePreview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted text-2xl">🏪</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <input ref={shopImageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleShopImageSelect} className="hidden" />
                      <button
                        type="button"
                        onClick={() => shopImageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-4 h-10 rounded-input bg-canvas text-ink text-[13px] font-bold active:scale-[0.97] transition-transform hover:bg-black/[0.06]"
                      >
                        <Camera size={14} /> {shopImagePreview ? t('dashboard.changePhoto') : t('dashboard.addPhoto2')}
                      </button>
                      <p className="text-[11.5px] text-muted mt-1.5">{t('dashboard.shopPhotoHint')}</p>
                    </div>
                  </div>
              </div>

              {/* ADRESSE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.addressLabel')}</span>
                  <div className="relative">
                    <select
                      className={fieldSelectCls}
                      value={shopProfile.province}
                      onChange={e => setShopProfile({ ...shopProfile, province: e.target.value, commune: e.target.value })}
                    >
                      <option value="">{t('dashboard.selectCity', { defaultValue: 'Sélectionnez votre ville' })}</option>
                      {sellerCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink2" />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">{t('dashboard.quartierLabel', { defaultValue: 'Quartier / Adresse (optionnel)' })}</span>
                  <input
                    className={fieldInputCls}
                    value={shopProfile.quartier}
                    onChange={(e) => setShopProfile({ ...shopProfile, quartier: e.target.value })}
                    placeholder="Ex: Rohero, Av. de la Liberté"
                  />
                </label>
              </div>
          </div>

          {/* CATEGORIES */}
          <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5">
              <SectionTitle sub={t('dashboard.categoriesSub', { defaultValue: 'Elles aident les acheteurs à vous trouver.' })}>
                {t('dashboard.categoriesLabel')}
              </SectionTitle>
              <div className="flex flex-wrap gap-2">
                {firestoreCategories.map(c => {
                  const on = shopProfile.categories.includes(c.name);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleShopCategory(c.name)}
                      className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12.5px] font-bold transition active:scale-[0.97] border ${
                        on ? 'text-ink shadow-gold border-transparent' : 'bg-white text-ink2 border-black/[0.08] hover:bg-canvas'
                      }`}
                      style={on ? { background: '#F5C842' } : undefined}
                    >
                      {on && <Check size={12} />}
                      {c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
          </div>

          {/* SAVE */}
          <div className="flex items-center justify-end sticky bottom-0 py-3 -mx-4 md:-mx-8 px-4 md:px-8 bg-canvas/90 backdrop-blur border-t border-black/[0.05]">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov disabled:opacity-60"
              style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
            >
              <Check size={16} />
              {savingProfile ? t('dashboard.saving') : t('dashboard.saveChanges')}
            </button>
          </div>
      </form>
    );
  };

  const verificationStatus = currentUser.sellerDetails?.verificationStatus || 'none';

  const handleRequestVerification = async () => {
    const phone = verifForm.phone.trim();

    if (!phone) {
      toast(t('dashboard.verifyNeedPhone'), 'error');
      return;
    }

    setVerifSubmitting(true);
    try {
      const updates: Record<string, any> = {
        'sellerDetails.verificationStatus': 'pending',
      };
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

  const renderVerification = () => {
    const verifInputCls = 'w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none';
    const showForm = verificationStatus !== 'verified' && verificationStatus !== 'pending';
    return (
    <div className="animate-fadein space-y-5">
      <div>
        <h1 className="text-[24px] font-black tracking-tight text-ink">{t('dashboard.verification')}</h1>
        <div className="text-[13px] text-ink2 mt-1">{t('dashboard.verificationSub', { defaultValue: 'Le badge vérifié rassure les acheteurs et augmente vos ventes.' })}</div>
      </div>

      {/* STATUS HERO */}
      {verificationStatus === 'verified' ? (
        <div className="bg-white rounded-card border shadow-card p-6 sm:p-7 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, #FFFFFF 60%)', borderColor: 'rgba(16,185,129,0.30)' }}>
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.20), transparent 70%)' }} />
          <div className="relative flex items-start gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#34D399,#10B981)', boxShadow: '0 10px 30px rgba(16,185,129,0.40)' }}>
              <Check size={26} />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.15)', color: '#065F46' }}>
                {t('dashboard.verifyStatusVerified')}
              </div>
              <h2 className="mt-2 text-[22px] sm:text-[26px] font-black tracking-tight leading-tight text-ink">{t('dashboard.verifyStatusVerified')}</h2>
              <p className="mt-2 text-[13.5px] text-ink2 max-w-[60ch]">{t('dashboard.verifyStatusVerifiedDesc')}</p>
            </div>
          </div>
        </div>
      ) : verificationStatus === 'pending' ? (
        <div className="bg-white rounded-card border shadow-card p-6 overflow-hidden" style={{ background: 'linear-gradient(135deg,#FFFBE6,#FFFFFF)', borderColor: 'rgba(217,119,6,0.25)' }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-amber-700 bg-amber-100 shrink-0">
              <Clock size={24} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-ink">{t('dashboard.verifyStatusPending')}</h2>
              <p className="mt-1 text-[13px] text-ink2">{t('dashboard.verifyStatusPendingDesc')}</p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="bg-white rounded-card border shadow-card p-6 overflow-hidden"
          style={{
            background: verificationStatus === 'rejected' ? 'linear-gradient(135deg,#FEF2F2,#FFFFFF)' : '#FFFFFF',
            borderColor: verificationStatus === 'rejected' ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0.07)',
          }}
        >
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${verificationStatus === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-canvas text-ink2'}`}>
              {verificationStatus === 'rejected' ? <X size={24} /> : <Lock size={24} />}
            </div>
            <div>
              <h2 className={`text-[20px] font-black ${verificationStatus === 'rejected' ? 'text-red-800' : 'text-ink'}`}>
                {verificationStatus === 'rejected' ? t('dashboard.verifyStatusRejected') : t('dashboard.verifyStatusNone')}
              </h2>
              <p className="mt-1 text-[13px] text-ink2">
                {verificationStatus === 'rejected'
                  ? currentUser.sellerDetails?.verificationNote || t('dashboard.verifyStatusRejectedDesc')
                  : t('dashboard.verifyStatusNoneDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* BENEFITS */}
      <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5">
        <SectionTitle sub={t('dashboard.verifyBenefitsSub', { defaultValue: 'Pourquoi se vérifier auprès de NUNULIA' })}>
          {t('dashboard.verifyBenefitsTitle', { defaultValue: 'Avantages du badge vérifié' })}
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            { icon: BadgeCheck, t: t('dashboard.verifyBenefit1Title', { defaultValue: 'Badge vérifié visible' }), d: t('dashboard.verifyBenefit1Desc', { defaultValue: 'Apparaît sur toutes vos annonces et votre profil public.' }), c: '#10B981' },
            { icon: BarChart2, t: t('dashboard.verifyBenefit2Title', { defaultValue: 'Meilleur classement' }), d: t('dashboard.verifyBenefit2Desc', { defaultValue: 'Vos produits remontent plus haut dans les résultats.' }), c: '#F5C842' },
            { icon: Star, t: t('dashboard.verifyBenefit3Title', { defaultValue: '+38% de confiance' }), d: t('dashboard.verifyBenefit3Desc', { defaultValue: 'Les acheteurs achètent plus chez les vendeurs vérifiés.' }), c: '#8B5CF6' },
          ].map((b, i) => {
            const IconCmp = b.icon;
            return (
              <div key={i} className="rounded-card border border-black/[0.06] p-4 bg-canvas/40">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white" style={{ background: b.c }}>
                  <IconCmp size={16} />
                </div>
                <div className="mt-3 text-[14px] font-black text-ink">{b.t}</div>
                <div className="text-[12.5px] text-ink2 mt-1 leading-relaxed">{b.d}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Formulaire demande (affiché uniquement si non vérifié / non pending) */}
      {showForm && (
        <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5 space-y-4">
          <SectionTitle sub={t('dashboard.verifyFormSubtitle')}>{t('dashboard.verifyFormTitle')}</SectionTitle>

          <label className="block">
            <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">
              {t('dashboard.verifyPhoneLabel')} <span className="text-red-500">*</span>
            </span>
            <input
              type="tel"
              value={verifForm.phone}
              onChange={(e) => setVerifForm(s => ({ ...s, phone: e.target.value }))}
              placeholder={t('dashboard.verifyPhonePlaceholder')}
              className={verifInputCls}
            />
          </label>

          <p className="text-[11.5px] text-muted leading-relaxed">{t('dashboard.verifyContactHint', { defaultValue: 'Notre équipe vous contactera sur WhatsApp pour finaliser la vérification (visite de votre boutique si nécessaire).' })}</p>
        </div>
      )}

      {/* Bouton demander vérification */}
      {showForm && (
        <button
          onClick={handleRequestVerification}
          disabled={verifSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov disabled:opacity-60"
          style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
        >
          <ShieldCheck size={16} />
          {verifSubmitting ? t('common.loading') : t('dashboard.verifyRequest')}
        </button>
      )}

      {/* WHATSAPP SUPPORT */}
      <div className="bg-white rounded-card border shadow-card p-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, rgba(37,211,102,0.07),#FFFFFF)', borderColor: 'rgba(37,211,102,0.20)' }}>
        <div className="w-11 h-11 rounded-[12px] flex items-center justify-center text-white shrink-0" style={{ background: '#25D366' }}>
          <WhatsAppIcon size={20} />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-black text-ink">{t('dashboard.verifySupportTitle', { defaultValue: 'Une question sur votre vérification ?' })}</div>
          <div className="text-[12.5px] text-ink2">{t('dashboard.verifySupportDesc', { defaultValue: "Notre équipe répond en moins d'une heure." })}</div>
        </div>
        <button
          onClick={contactAdmin}
          className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input text-white font-semibold text-[14px] active:scale-[0.97] transition-transform shrink-0"
          style={{ background: '#25D366', boxShadow: '0 6px 16px rgba(37,211,102,0.30)' }}
        >
          <WhatsAppIcon size={16} /> {t('dashboard.contactSupport', { defaultValue: 'Contacter le support' })}
        </button>
      </div>

      <VerificationRequestModal open={showVerifModal} onClose={() => setShowVerifModal(false)} />
    </div>
    );
  };

  const renderBoost = () => {
    const approvedProducts = myProducts.filter(p => p.status === 'approved');
    const countryId = currentUser.sellerDetails?.countryId || 'bi';

    return (
      <div className="space-y-5 animate-fadein">
        {/* HERO */}
        <div className="bg-white rounded-card border shadow-card p-6 sm:p-7 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.10) 0%, #FFFFFF 60%)', borderColor: 'rgba(0,0,0,0.07)' }}>
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%)' }} />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 text-white" style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)', boxShadow: '0 8px 24px rgba(139,92,246,0.40)' }}>
              <Zap size={22} />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(139,92,246,0.12)', color: '#5B21B6' }}>
                {t('dashboard.boostBadge', { defaultValue: 'Visibilité Premium' })}
              </div>
              <h1 className="mt-2 text-[24px] sm:text-[28px] font-black tracking-tight leading-tight text-ink">{t('dashboard.boostTitle')}</h1>
              <p className="mt-2 text-[13.5px] text-ink2 leading-relaxed max-w-[60ch]">{t('dashboard.boostDesc')}</p>
            </div>
          </div>
        </div>

        {/* Comment ça marche */}
        <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-5">
          <SectionTitle>{t('dashboard.boostHowTitle')}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {[t('dashboard.boostStep1'), t('dashboard.boostStep2'), t('dashboard.boostStep3')].map((step, i) => (
              <div key={i} className="rounded-card border border-black/[0.06] p-4 bg-canvas/40">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-[13px]" style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)' }}>{i + 1}</div>
                <div className="mt-2.5 text-[12.5px] text-ink2 leading-relaxed">{step}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mes demandes en cours */}
        {boostRequests.length > 0 && (
          <div>
            <SectionTitle sub={t('dashboard.boostActiveSub', { defaultValue: 'Vos campagnes en cours' })} right={<span className="text-[11.5px] font-bold text-ink2">{boostRequests.length}</span>}>
              {t('dashboard.boostMyRequests')}
            </SectionTitle>
            <div className="space-y-3">
              {boostRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between bg-white rounded-card border border-black/[0.07] shadow-card px-4 py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-ink truncate">{req.productTitle}</p>
                    <p className="text-[11.5px] text-ink2">{new Date(req.createdAt).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                    req.status === 'approved' ? 'bg-emerald-500/15 text-emerald-600'
                    : req.status === 'pending_validation' ? 'bg-blue-500/15 text-blue-600'
                    : req.status === 'rejected' ? 'bg-red-500/15 text-red-600'
                    : 'bg-amber-500/15 text-amber-600'
                  }`}>
                    {req.status === 'approved' ? t('dashboard.boostStatusActive')
                     : req.status === 'pending_validation' ? t('dashboard.boostStatusValidating')
                     : req.status === 'rejected' ? t('dashboard.boostStatusRejected')
                     : t('dashboard.boostStatusPending')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liste des produits éligibles */}
        {approvedProducts.length === 0 ? (
          <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-10 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-canvas flex items-center justify-center text-ink2 mb-3"><Package size={28} /></div>
            <div className="text-[14px] text-ink2">{t('dashboard.boostNoProducts')}</div>
          </div>
        ) : (
          <div>
            <SectionTitle sub={t('dashboard.boostChooseSub', { defaultValue: 'Sélectionnez un produit pour lancer une campagne.' })}>
              {t('dashboard.boostChooseProduct')}
            </SectionTitle>
            <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-2">
              <div className="divide-y divide-black/[0.05]">
                {approvedProducts.map(product => {
                  const isActive = !!product.isBoosted && !!product.boostExpiresAt && product.boostExpiresAt > Date.now();
                  const isPending = boostRequests.some(
                    r => r.productId === product.id && (r.status === 'pending' || r.status === 'pending_validation')
                  );
                  const thumb = product.images[0] ? getOptimizedUrl(product.images[0], 80) : null;

                  return (
                    <div key={product.id} className="flex items-center gap-3 p-3">
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" className="w-12 h-12 rounded-[10px] object-cover shrink-0 bg-canvas" />
                      ) : (
                        <div className="w-12 h-12 rounded-[10px] bg-canvas shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold text-ink truncate">{product.title}</p>
                        <p className="text-[12px] text-ink2">{product.price.toLocaleString('fr-FR')} {product.currency || 'BIF'}</p>
                        {isActive && (
                          <p className="text-[11.5px] font-bold mt-0.5" style={{ color: '#7C3AED' }}>
                            ⚡ {t('dashboard.boostActiveUntil', {
                              date: new Date(product.boostExpiresAt!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                            })}
                          </p>
                        )}
                      </div>
                      {isPending ? (
                        <span className="text-[11.5px] text-amber-600 font-bold bg-amber-500/10 px-3 py-1.5 rounded-full whitespace-nowrap">
                          {t('dashboard.boostStatusPending')}
                        </span>
                      ) : (
                        <button
                          onClick={() => setBoostingProduct(product)}
                          className="h-9 px-3.5 rounded-input text-white text-[12.5px] font-bold active:scale-[0.97] transition-transform inline-flex items-center gap-1.5"
                          style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)', boxShadow: '0 4px 12px rgba(139,92,246,0.35)' }}
                        >
                          <Zap size={13} /> {isActive ? t('dashboard.boostRenew') : t('dashboard.boostCta')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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

  // Nav items shared by desktop sidebar + mobile drawer + chip rail.
  const NAV_ITEMS: { id: Tab; icon: React.ComponentType<{ size?: number }>; label: string; count?: number; gold?: boolean }[] = [
    { id: 'overview',     icon: LayoutGrid,  label: t('dashboard.overview') },
    { id: 'products',     icon: Package,     label: t('dashboard.inventory'), count: myProducts.length },
    { id: 'analytics',    icon: BarChart2,   label: t('dashboard.analytics') },
    { id: 'boost',        icon: Zap,         label: t('dashboard.boost') },
    { id: 'requests',     icon: ShoppingCart,label: t('dashboard.buyerRequests'), count: requestStats?.todayCount, gold: true },
    { id: 'shop',         icon: Palette,     label: t('dashboard.myShop') },
    { id: 'verification', icon: ShieldCheck, label: t('dashboard.verification') },
  ];

  const renderProducts = () => (
    <div className="space-y-4 animate-fadein">
      {/* Staleness banner — appears only when rendering from IDB cache
          because the network fetch failed (offline / Firestore down). */}
      {inventoryCachedAt !== null && inventoryFreshAt === null && (
        <div className="flex items-center gap-2 rounded-input px-3 py-2 text-[12px]" style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', color: '#92400E' }}>
          <Wifi size={14} className="shrink-0" />
          <span className="flex-1 min-w-0">
            {t('dashboard.inventoryStale', {
              when: new Date(inventoryCachedAt).toLocaleString(undefined, {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              }),
            })}
          </span>
        </div>
      )}

      {/* Sticky sub-header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-[24px] font-black tracking-tight text-ink">
          {t('dashboard.myInventory')} <span className="text-ink2 font-bold">({myProducts.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          {filteredProducts.length > 0 && (
            <button
              onClick={() => { setBulkSelectMode(m => !m); setSelectedProductIds(new Set()); }}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-input text-[12.5px] font-semibold border transition active:scale-[0.97] ${
                bulkSelectMode ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-black/[0.08] hover:bg-canvas'
              }`}
            >
              <Check size={14} /> {bulkSelectMode ? t('dashboard.bulkCancel') : t('dashboard.bulkSelect')}
            </button>
          )}
          {!bulkSelectMode && (
            <button
              onClick={() => setActiveTab('add_product')}
              className="inline-flex items-center justify-center gap-2 px-4 h-9 rounded-input bg-gold-400 text-ink font-semibold text-[13px] active:scale-[0.97] transition-transform hover:bg-goldHov"
              style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
            >
              <Plus size={15} /> {t('dashboard.newButton')}
            </button>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {([
          { value: 'all' as const, label: t('dashboard.all'), count: myProducts.length },
          { value: 'approved' as const, label: t('dashboard.approved'), count: myProducts.filter(p => p.status === 'approved').length },
          { value: 'pending' as const, label: t('dashboard.pendingStatus'), count: myProducts.filter(p => p.status === 'pending').length },
          { value: 'rejected' as const, label: t('dashboard.rejected'), count: myProducts.filter(p => p.status === 'rejected').length },
          { value: 'inactive' as const, label: t('dashboard.inactiveStatus'), count: myProducts.filter(p => p.status === 'inactive').length },
        ]).map(tab => {
          const active = productStatusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setProductStatusFilter(tab.value)}
              className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap transition active:scale-[0.97] ${
                active ? 'bg-ink text-white' : 'bg-white text-ink2 border border-black/[0.08] hover:bg-canvas'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold inline-flex items-center justify-center ${active ? 'bg-black/15 text-white' : 'bg-ink/10 text-ink'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {bulkSelectMode && filteredProducts.length > 0 && (
        <div className="flex items-center gap-3 bg-white rounded-card border border-black/[0.07] shadow-card px-4 py-2.5">
          <button
            onClick={() => {
              const allIds = filteredProducts.map(p => p.id).filter((id): id is string => Boolean(id));
              const allSelected = allIds.every(id => selectedProductIds.has(id));
              setSelectedProductIds(allSelected ? new Set() : new Set(allIds));
            }}
            className="text-[12px] text-goldDeep font-bold hover:underline"
          >
            {filteredProducts.every(p => p.id && selectedProductIds.has(p.id))
              ? t('dashboard.bulkDeselectAll')
              : t('dashboard.bulkSelectAll')}
          </button>
          <span className="text-[12px] text-ink2 flex-1">
            {selectedProductIds.size > 0
              ? t('dashboard.bulkSelected', { count: selectedProductIds.size })
              : t('dashboard.bulkNoneSelected')}
          </span>
          {selectedProductIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 h-9 rounded-input bg-red-600 hover:bg-red-500 text-white active:scale-[0.97] transition-transform"
            >
              <Trash2 size={14} /> {t('dashboard.bulkDeleteBtn', { count: selectedProductIds.size })}
            </button>
          )}
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-10 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-canvas flex items-center justify-center text-ink2 mb-3"><Package size={28} /></div>
          <div className="text-[16px] font-black text-ink">{t('dashboard.noProducts')}</div>
          <div className="text-[13px] text-ink2 mt-1">{productStatusFilter === 'all' ? t('dashboard.startAdding') : t('dashboard.noProductsInCategory')}</div>
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
                className={`bg-white rounded-card border shadow-card overflow-hidden transition-all ${bulkSelectMode ? 'cursor-pointer' : 'hover:-translate-y-px hover:shadow-cardHover'} ${
                  isSelected ? 'border-gold-400' : 'border-black/[0.07]'
                }`}
              >
                <div className="p-3 sm:p-4 flex items-start gap-3 sm:gap-4">
                  {bulkSelectMode && (
                    <button
                      type="button"
                      className={`mt-2 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-gold-400 border-gold-400' : 'border-black/20 bg-white'}`}
                    >
                      {isSelected && <Check size={12} />}
                    </button>
                  )}
                  <div className="relative shrink-0">
                    <img
                      src={product.images[0] ? getOptimizedUrl(product.images[0], 160) : ''}
                      alt=""
                      loading="lazy"
                      className="w-20 h-20 sm:w-[88px] sm:h-[88px] rounded-[12px] object-cover bg-canvas"
                    />
                    {product.images.length > 1 && (
                      <span className="absolute -bottom-1 -right-1 bg-white text-ink2 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-black/[0.07] shadow-sm">
                        +{product.images.length - 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14.5px] font-semibold text-ink leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {product.title}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="text-[16px] font-black text-ink tabular-nums">{product.price.toLocaleString('fr-FR')} <span className="text-[12px] text-ink2 font-semibold">{cur}</span></span>
                          {product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-[12px] text-muted line-through tabular-nums">{product.originalPrice.toLocaleString('fr-FR')}</span>
                          )}
                          {product.status === 'approved' && (
                            <span className="text-[11.5px] text-ink2 inline-flex items-center gap-1"><Eye size={11} /> {product.views || 0}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold leading-none ${
                          product.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' :
                          product.status === 'pending' ? 'bg-amber-500/10 text-amber-600' :
                          'bg-red-500/10 text-red-600'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {product.status === 'approved' ? t('dashboard.statusActive') : product.status === 'pending' ? t('dashboard.statusPending') : t('dashboard.statusRejected')}
                        </span>
                        {!bulkSelectMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }}
                            className="w-8 h-8 rounded-full hover:bg-canvas inline-flex items-center justify-center text-ink2 hover:text-red-500 active:scale-[0.97] transition"
                            title={t('common.delete', { defaultValue: 'Supprimer' })}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    {product.status === 'pending' && (
                      <div className="mt-1.5 text-[11px] text-muted italic">{t('dashboard.searchDelayHint')}</div>
                    )}
                    {product.isPromoted && (
                      <span className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{ background: 'rgba(139,92,246,0.10)', color: '#7C3AED' }}>
                        {t('dashboard.statusSponsored')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Rejection reason + edit & resubmit buttons */}
                {product.status === 'rejected' && (
                  <div className="border-t border-black/[0.06] p-3 sm:p-4" style={{ background: 'rgba(239,68,68,0.04)' }}>
                    {product.rejectionReason && (
                      <p className="text-[12.5px] text-red-700">
                        <span className="font-bold">{t('dashboard.rejectionReason')}</span> {product.rejectionReason}
                      </p>
                    )}
                    {(product.resubmitCount ?? 0) >= MAX_RESUBMIT_ATTEMPTS ? (
                      <p className="text-[12px] text-muted italic mt-2">{t('dashboard.resubmitLimitReached')}</p>
                    ) : (
                      <>
                        <p className="text-[11px] text-ink2 mt-2">
                          {t('dashboard.resubmitAttemptsLeft', {
                            left: MAX_RESUBMIT_ATTEMPTS - (product.resubmitCount ?? 0),
                            max: MAX_RESUBMIT_ATTEMPTS,
                          })}
                        </p>
                        <div className="flex gap-2 mt-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditProduct(product); }}
                            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-input bg-gold-400 text-ink text-[12px] font-bold active:scale-[0.97] transition-transform hover:bg-goldHov"
                          >
                            {t('dashboard.editAndResubmit')} <ArrowRight size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleResubmit(product.id); }}
                            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-input bg-white text-ink text-[12px] font-bold border border-black/[0.08] active:scale-[0.97] transition-transform hover:bg-canvas"
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
  );

  const renderRequests = () => {
    const isEligible = canContactBuyer(currentUser.sellerDetails);
    return (
      <div className="space-y-5 animate-fadein">
        {/* Header */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(245,200,66,0.18)', color: '#92400E' }}>
              <Star size={11} /> {t('dashboard.opportunityBadge', { defaultValue: 'Opportunités acheteurs' })}
            </div>
            <h1 className="mt-2 text-[24px] font-black tracking-tight text-ink">{t('dashboard.buyerRequests')}</h1>
            <div className="text-[13px] text-ink2 mt-1">{t('dashboard.buyerRequestsDesc')}</div>
          </div>
          <button
            onClick={() => navigate('/demandes')}
            className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov"
            style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
          >
            {t('dashboard.viewAllRequests')} <ArrowRight size={16} />
          </button>
        </div>

        {/* Stats */}
        {requestStats && (
          <div className="bg-white rounded-card border shadow-card p-5 overflow-hidden relative" style={{ background: 'linear-gradient(135deg,#FFFDF4 0%,#FFF8E1 100%)', borderColor: 'rgba(245,200,66,0.30)' }}>
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,200,66,0.25), transparent 70%)' }} />
            <div className="grid grid-cols-2 gap-4 relative">
              <div>
                <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider">{t('dashboard.buyerRequestsStatToday')}</div>
                <div className="text-[40px] font-black leading-none text-ink tabular-nums mt-1">{requestStats.todayCount}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider">{t('dashboard.buyerRequestsStatFulfilled')}</div>
                <div className="text-[40px] font-black leading-none text-ink tabular-nums mt-1">{requestStats.fulfilledCount}</div>
              </div>
            </div>
          </div>
        )}

        {/* Plan eligibility banner */}
        {!isEligible ? (
          <div className="bg-white rounded-card border shadow-card p-6 overflow-hidden relative" style={{ background: 'linear-gradient(135deg,#FFFDF4 0%,#FFFFFF 70%)', borderColor: 'rgba(245,200,66,0.30)' }}>
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,200,66,0.22), transparent 70%)' }} />
            <div className="relative">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gold-400/15 border border-gold-400/30 flex items-center justify-center text-goldDeep shrink-0"><Lock size={26} /></div>
                <div>
                  <h3 className="text-ink font-black text-[18px]">{t('requests.planGate.title')}</h3>
                  <p className="text-ink2 text-[13px] mt-1">{t('requests.planGate.subtitle')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {[t('dashboard.buyerRequestsFeat1'), t('dashboard.buyerRequestsFeat2'), t('dashboard.buyerRequestsFeat3')].map(label => (
                  <div key={label} className="flex items-center gap-2.5 bg-canvas border border-black/[0.06] rounded-input p-3">
                    <span className="text-[13px] text-ink2 font-medium">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/plans')}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov"
                  style={{ boxShadow: '0 6px 16px rgba(245,200,66,0.35)' }}
                >
                  <Crown size={16} /> {t('requests.planGate.cta')}
                </button>
                <button
                  onClick={() => navigate('/demandes')}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-input bg-white text-ink font-semibold text-[14px] border border-black/[0.08] active:scale-[0.97] transition-transform hover:bg-canvas"
                >
                  <Eye size={16} /> {t('dashboard.buyerRequestsPreview')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-card border shadow-card p-6 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%,#FFFFFF 70%)', borderColor: 'rgba(16,185,129,0.30)' }}>
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18), transparent 70%)' }} />
            <div className="relative">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 shrink-0"><Check size={26} /></div>
                <div>
                  <h3 className="text-ink font-black text-[18px]">{t('dashboard.buyerRequestsUnlocked')}</h3>
                  <p className="text-ink2 text-[13px] mt-1">{t('dashboard.buyerRequestsUnlockedDesc')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {[t('dashboard.buyerRequestsFeat1'), t('dashboard.buyerRequestsFeat2'), t('dashboard.buyerRequestsFeat3')].map(label => (
                  <div key={label} className="flex items-center gap-2.5 bg-canvas border border-black/[0.06] rounded-input p-3">
                    <span className="text-[13px] text-ink2 font-medium">{label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/demandes')}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov"
                style={{ boxShadow: '0 6px 16px rgba(245,200,66,0.35)' }}
              >
                {t('dashboard.viewAllRequests')} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-canvas">
       {/* Desktop sidebar */}
       <aside className="hidden md:flex flex-col w-[256px] shrink-0 h-screen sticky top-0 bg-white border-r border-black/[0.06]">
           <div className="px-5 pt-5 pb-4">
             <div className="flex items-center gap-2.5">
               <div
                 className="w-9 h-9 rounded-[10px] flex items-center justify-center font-black text-[18px] text-white"
                 style={{ background: 'linear-gradient(135deg,#F5C842 0%, #E8A800 55%, #B07410 100%)', boxShadow: '0 4px 14px rgba(245,200,66,0.45), inset 0 1px 0 rgba(255,255,255,0.35)', letterSpacing: '-0.04em' }}
               >N</div>
               <div className="leading-tight">
                 <div className="text-[15px] font-black tracking-tight text-ink">NUNULIA</div>
                 <div className="text-[10.5px] font-semibold text-ink2 -mt-0.5 tracking-[0.14em] uppercase">{t('dashboard.sellerSpace')}</div>
               </div>
             </div>
           </div>

           <nav className="px-3 flex-1 overflow-y-auto">
             <div className="flex flex-col gap-1">
               {NAV_ITEMS.map(it => (
                 <NavItem key={it.id} id={it.id} icon={it.icon} label={it.label} count={it.count} gold={it.gold} />
               ))}
             </div>
             <div className="mt-4 mb-3 px-3 text-[10.5px] font-bold text-muted uppercase tracking-[0.14em]">{t('dashboard.actionLabel', { defaultValue: 'Action' })}</div>
             <button
               onClick={() => setActiveTab('add_product')}
               className="w-full flex items-center gap-2.5 px-3 h-11 rounded-[12px] text-[13.5px] font-semibold active:scale-[0.97] transition-transform"
               style={{ background: activeTab === 'add_product' ? '#E8A800' : '#F5C842', color: '#111318', boxShadow: '0 6px 16px rgba(245,200,66,0.40), inset 0 1px 0 rgba(255,255,255,0.4)' }}
             >
               <Plus size={18} /> {t('dashboard.addArticle')}
             </button>
           </nav>

           <div className="p-3 border-t border-black/[0.06]">
             <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-3.5">
               <div className="flex items-center justify-between mb-1.5">
                 <div className="flex items-center gap-1.5">
                   <TierBadge label={currentTier.label} />
                 </div>
                 <span className={`text-[12px] font-black tabular-nums ${isLimitReached ? 'text-red-500' : 'text-ink'}`}>
                   {currentCount}<span className="text-ink2 font-semibold">/{currentTier.max === null ? '∞' : currentTier.max}</span>
                 </span>
               </div>
               <Progress value={currentTier.max === null ? 100 : Math.min(progressPercentage, 100)} />
             </div>
             <button
               onClick={() => navigate('/')}
               className="mt-3 w-full h-10 rounded-input text-[13px] font-semibold text-ink2 hover:bg-canvas active:scale-[0.97] transition inline-flex items-center justify-center gap-1.5"
             >
               <ArrowRight size={14} className="rotate-180" /> {t('dashboard.backToSite')}
             </button>
           </div>
       </aside>

       <div className="flex-1 min-w-0 flex flex-col">
         {/* Mobile header */}
         <header className="md:hidden sticky top-0 z-30 bg-white border-b border-black/[0.06]">
           <div className="h-14 flex items-center justify-between px-4">
             <div className="flex items-center gap-2.5">
               <div className="w-8 h-8 rounded-[8px] flex items-center justify-center font-black text-[14px] text-white" style={{ background: 'linear-gradient(135deg,#F5C842,#B07410)', boxShadow: '0 2px 8px rgba(245,200,66,0.40)' }}>N</div>
               <div className="leading-tight">
                 <div className="text-[13px] font-black tracking-tight text-ink">{t('dashboard.sellerSpace')}</div>
                 <div className="text-[10px] text-ink2 font-semibold -mt-0.5 truncate max-w-[140px]">{currentUser.sellerDetails?.shopName || currentUser.name}</div>
               </div>
             </div>
             <div className="flex items-center gap-2">
               <TierBadge label={currentTier.label} />
               <LanguageSwitcher compact />
               <button
                 onClick={() => navigate('/')}
                 aria-label={t('dashboard.backToSite')}
                 className="w-9 h-9 rounded-input bg-canvas inline-flex items-center justify-center text-ink2 active:scale-[0.97] transition-transform"
               >
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                   <path d="M15 18l-6-6 6-6" />
                 </svg>
               </button>
             </div>
           </div>
           <div className="px-4 pb-3 overflow-x-auto no-scrollbar">
             <div className="flex gap-2 w-max">
               {NAV_ITEMS.map(it => (
                 <Chip key={it.id} id={it.id} label={it.label} count={it.count} gold={it.gold} />
               ))}
               <Chip id="add_product" label={t('dashboard.newButton')} gold />
             </div>
           </div>
         </header>

         <main
           id="main-scroll"
           className={`flex-1 px-4 md:px-8 py-4 md:py-8 ${activeTab === 'add_product' ? 'pb-48 md:pb-8' : 'pb-24 md:pb-10'}`}
           style={{ maxWidth: 1180, width: '100%', marginInline: 'auto' }}
         >
           {/* Deal Loop : carte de confirmation de vente (si arrivé via ?deal=) */}
           <DealConfirmCard />
           {activeTab === 'overview' && renderOverview()}
           {activeTab === 'analytics' && renderAnalytics()}
           {activeTab === 'products' && renderProducts()}
           {activeTab === 'boost' && renderBoost()}
           {activeTab === 'add_product' && renderAddProduct()}
           {activeTab === 'shop' && renderShopSettings()}
           {activeTab === 'verification' && renderVerification()}
           {activeTab === 'requests' && renderRequests()}
         </main>
       </div>

       {/* Mobile Bottom Nav — All tabs visible with labels */}
       <div className="md:hidden fixed bottom-0 w-full bg-white/95 backdrop-blur-xl border-t border-black/[0.06] pb-safe z-40">
         <div className="flex justify-around items-center h-16">
           {([
             { id: 'overview' as Tab, icon: LayoutGrid, label: t('dashboard.mobileHome'), gold: false },
             { id: 'products' as Tab, icon: Package, label: t('dashboard.mobileProducts'), gold: false },
             { id: 'add_product' as Tab, icon: Plus, label: t('dashboard.mobileAdd'), gold: false },
             { id: 'requests' as Tab, icon: ShoppingCart, label: t('dashboard.mobileRequests'), gold: true },
             { id: 'shop' as Tab, icon: Palette, label: t('dashboard.mobileShop'), gold: false },
           ]).map(item => {
             const IconCmp = item.icon;
             const active = activeTab === item.id;
             return (
               <button
                 key={item.id}
                 onClick={() => setActiveTab(item.id)}
                 className={`flex flex-col items-center justify-center w-full h-full gap-0.5 relative transition ${
                   active
                     ? item.gold ? 'text-goldDeep' : 'text-ink'
                     : 'text-ink2 hover:text-ink'
                 }`}
               >
                 <IconCmp size={20} />
                 <span className="text-[9.5px] font-semibold">{item.label}</span>
                 {item.gold && requestStats && requestStats.todayCount > 0 && !active && (
                   <span className="absolute top-1.5 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-gold-400 ring-2 ring-white" />
                 )}
                 {active && <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full bg-gold-400" />}
               </button>
             );
           })}
         </div>
       </div>

       {/* Edit Rejected Product Modal */}
       {editingProduct && (
         <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-4 animate-fadein" style={{ background: 'rgba(15,15,20,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setEditingProduct(null)}>
           <div className="bg-white rounded-modal w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-cardHover" onClick={e => e.stopPropagation()}>
             <div className="p-5 flex items-center justify-between border-b border-black/[0.06]">
               <h3 className="text-[16px] font-black text-ink">{t('dashboard.editProductTitle')}</h3>
               <button onClick={() => setEditingProduct(null)} className="w-8 h-8 rounded-full hover:bg-canvas inline-flex items-center justify-center text-ink2"><X size={16} /></button>
             </div>

             <div className="p-5 space-y-4">
               {editingProduct.rejectionReason && (
                 <div className="rounded-input p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                   <p className="text-[12.5px] text-red-700"><span className="font-bold">{t('dashboard.rejectionReason')}</span> {editingProduct.rejectionReason}</p>
                 </div>
               )}

               <label className="block">
                 <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">Titre <span className="text-red-500">*</span></span>
                 <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none" />
               </label>

               <div className="grid grid-cols-2 gap-3">
                 <label className="block">
                   <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">Prix <span className="text-red-500">*</span></span>
                   <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink tabular-nums transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none" />
                 </label>
                 <label className="block">
                   <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">Catégorie <span className="text-red-500">*</span></span>
                   <div className="relative">
                     <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full h-11 pl-3.5 pr-9 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink appearance-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none">
                       <option value="">Choisir</option>
                       {firestoreCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                     </select>
                     <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink2" />
                   </div>
                 </label>
               </div>

               <label className="block">
                 <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">Description</span>
                 <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full px-3.5 py-3 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink transition resize-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none" />
               </label>

               {/* Existing images */}
               {editImages.length > 0 && (
                 <div>
                   <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">Images actuelles</span>
                   <div className="flex gap-2 flex-wrap">
                     {editImages.map((img, i) => (
                       <div key={i} className="relative w-16 h-16">
                         <img src={getOptimizedUrl(img, 80)} loading="lazy" className="w-full h-full object-cover rounded-input bg-canvas" alt="" />
                         <button onClick={() => removeEditExistingImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] flex items-center justify-center"><X size={10} /></button>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               {/* New images */}
               {editNewPreviews.length > 0 && (
                 <div>
                   <span className="text-[12.5px] font-semibold text-ink2 mb-1.5 block">Nouvelles images</span>
                   <div className="flex gap-2 flex-wrap">
                     {editNewPreviews.map((src, i) => (
                       <div key={i} className="relative w-16 h-16">
                         <img src={src} className="w-full h-full object-cover rounded-input" alt="" />
                         <button onClick={() => removeEditNewImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] flex items-center justify-center"><X size={10} /></button>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               <div>
                 <input ref={editFileRef} type="file" accept="image/*" multiple onChange={handleEditNewImages} className="hidden" />
                 <button
                   onClick={() => editFileRef.current?.click()}
                   className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-input text-ink2 hover:text-ink text-[13px] font-semibold transition active:scale-[0.97]"
                   style={{ border: '2px dashed rgba(0,0,0,0.10)' }}
                 >
                   <Plus size={14} /> {t('dashboard.addPhoto2', { defaultValue: 'Ajouter des images' })}
                 </button>
               </div>

               <div className="flex gap-3 pt-2">
                 <button
                   onClick={() => setEditingProduct(null)}
                   className="flex-1 inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-white text-ink font-semibold text-[14px] border border-black/[0.08] active:scale-[0.97] transition-transform hover:bg-canvas"
                 >
                   {t('common.cancel')}
                 </button>
                 <button
                   onClick={handleSaveEdit}
                   disabled={editLoading}
                   className="flex-1 inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov disabled:opacity-60"
                   style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
                 >
                   {editLoading ? t('common.loading') : t('dashboard.editAndResubmit')}
                 </button>
               </div>
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