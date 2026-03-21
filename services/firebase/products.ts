/**
 * AURABUJA — Products Service (Read + Write)
 */

import {
  Product, ProductStatus, SearchFilters, MarketplaceId,
} from '../../types';
import { generateUniqueSlug } from '../../utils/slug';
import {
  db, auth, collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, increment,
  runTransaction, writeBatch, COLLECTIONS, PRODUCTS_PAGE_SIZE, MAX_SEARCH_RESULTS,
  docToProduct,
} from './constants';
import type { QueryDocumentSnapshot } from './constants';

/** Returns true if this product doc should be hidden from public views */
const isHiddenProduct = (data: any): boolean =>
  !!data.sellerSuspended || !!data.countryDeactivated;

// ── Read ──

export const getProducts = async (
  category: string = 'all',
  lastDoc?: QueryDocumentSnapshot,
  pageSize: number = PRODUCTS_PAGE_SIZE,
  marketplace?: MarketplaceId,
  countryId?: string
): Promise<{ products: Product[]; lastDoc: QueryDocumentSnapshot | null }> => {
  if (!db) return { products: [], lastDoc: null };

  const productsRef = collection(db, COLLECTIONS.PRODUCTS);
  const constraints: any[] = [
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];

  if (countryId) constraints.splice(1, 0, where('countryId', '==', countryId));
  if (marketplace) constraints.splice(1, 0, where('marketplace', '==', marketplace));
  if (category !== 'all') constraints.splice(1, 0, where('category', '==', category));
  if (lastDoc) constraints.push(startAfter(lastDoc));

  const q = query(productsRef, ...constraints);
  const snap = await getDocs(q);

  const products = snap.docs
    .filter(d => !isHiddenProduct(d.data()))
    .map(d => docToProduct(d.data(), d.id));
  const newLastDoc = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;

  return { products, lastDoc: newLastDoc };
};

export const getProductBySlugOrId = async (slugOrId: string): Promise<Product | null> => {
  if (!db) return null;

  const slugQuery = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('slug', '==', slugOrId),
    where('status', '==', 'approved'),
    limit(1)
  );
  const slugSnap = await getDocs(slugQuery);
  if (!slugSnap.empty) {
    const d = slugSnap.docs[0];
    if (isHiddenProduct(d.data())) return null;
    return docToProduct(d.data(), d.id);
  }

  try {
    const docSnap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, slugOrId));
    if (docSnap.exists() && docSnap.data().status === 'approved' && !isHiddenProduct(docSnap.data())) {
      return docToProduct(docSnap.data(), docSnap.id);
    }
  } catch { /* Invalid ID */ }

  return null;
};

export const getProductsByIds = async (ids: string[]): Promise<Product[]> => {
  if (!db || ids.length === 0) return [];

  const products: Product[] = [];
  const batches = [];
  for (let i = 0; i < ids.length; i += 30) {
    batches.push(ids.slice(i, i + 30));
  }

  for (const batch of batches) {
    const q = query(
      collection(db, COLLECTIONS.PRODUCTS),
      where('status', '==', 'approved'),
      where('__name__', 'in', batch)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      if (!isHiddenProduct(d.data())) products.push(docToProduct(d.data(), d.id));
    });
  }

  const productMap = new Map(products.map(p => [p.id, p]));
  return ids.map(id => productMap.get(id)).filter(Boolean) as Product[];
};

export const getProductsByCategory = async (
  category: string,
  excludeId?: string,
  maxResults: number = 12
): Promise<Product[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('status', '==', 'approved'),
    where('category', '==', category),
    orderBy('views', 'desc'),
    limit(maxResults + 1)
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter(d => !isHiddenProduct(d.data()))
    .map(d => docToProduct(d.data(), d.id))
    .filter(p => p.id !== excludeId)
    .slice(0, maxResults);
};

export const getTrendingProducts = async (maxResults: number = 12): Promise<Product[]> => {
  if (!db) return [];

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const q = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('status', '==', 'approved'),
    where('createdAt', '>=', new Date(twoWeeksAgo)),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  const products = snap.docs
    .filter(d => !isHiddenProduct(d.data()))
    .map(d => docToProduct(d.data(), d.id));

  const now = Date.now();
  const scored = products.map(p => {
    const hoursOld = (now - p.createdAt) / (1000 * 60 * 60);
    const recencyBonus = Math.max(0, 100 - hoursOld);
    const score = (p.views || 0) * 1 + (p.likesCount || 0) * 3 + recencyBonus;
    return { product: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(s => s.product);
};

export const getPopularProducts = async (maxResults: number = 12): Promise<Product[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('status', '==', 'approved'),
    orderBy('views', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter(d => !isHiddenProduct(d.data()))
    .map(d => docToProduct(d.data(), d.id));
};

export const getAllProductsForAdmin = async (
  status?: ProductStatus,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ products: Product[]; lastDoc: QueryDocumentSnapshot | null }> => {
  if (!db) return { products: [], lastDoc: null };

  const constraints: any[] = [orderBy('createdAt', 'desc'), limit(50)];
  if (status) constraints.unshift(where('status', '==', status));
  if (lastDoc) constraints.push(startAfter(lastDoc));

  const q = query(collection(db, COLLECTIONS.PRODUCTS), ...constraints);
  const snap = await getDocs(q);

  return {
    products: snap.docs.map(d => docToProduct(d.data(), d.id)),
    lastDoc: snap.docs.length === 50 ? snap.docs[snap.docs.length - 1] : null,
  };
};

export const searchProducts = async (
  queryText: string,
  filters?: SearchFilters
): Promise<Product[]> => {
  if (!db || queryText.trim().length < 2) return [];

  const q = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('status', '==', 'approved'),
    where('titleLower', '>=', queryText.toLowerCase()),
    where('titleLower', '<=', queryText.toLowerCase() + '\uf8ff'),
    limit(MAX_SEARCH_RESULTS)
  );

  const snap = await getDocs(q);
  let results = snap.docs
    .filter(d => !isHiddenProduct(d.data()))
    .map(d => docToProduct(d.data(), d.id));

  if (filters?.minPrice !== undefined) results = results.filter(p => p.price >= filters.minPrice!);
  if (filters?.maxPrice !== undefined) results = results.filter(p => p.price <= filters.maxPrice!);
  if (filters?.category) results = results.filter(p => p.category === filters.category);

  if (filters?.sort === 'price_asc') results.sort((a, b) => a.price - b.price);
  if (filters?.sort === 'price_desc') results.sort((a, b) => b.price - a.price);
  if (filters?.sort === 'newest') results.sort((a, b) => b.createdAt - a.createdAt);

  return results;
};

// ── Write ──

export const addProduct = async (productData: Partial<Product>): Promise<Product> => {
  if (!db || !auth?.currentUser) throw new Error('Non authentifié');

  const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid));
  if (!userSnap.exists()) throw new Error('Profil introuvable');

  const userData = userSnap.data();
  if (userData.role !== 'seller' && userData.role !== 'admin') {
    throw new Error(`Rôle insuffisant: votre rôle Firestore est "${userData.role}". Vous devez compléter l'inscription vendeur.`);
  }

  // ── Subscription validation (defense in depth — Firestore rules also enforce this) ──
  const sellerDetails = userData.sellerDetails || {};
  const maxProducts = sellerDetails.maxProducts ?? 5;
  const productCount = userData.productCount ?? 0;
  const expiresAt = sellerDetails.subscriptionExpiresAt;
  const isPaidTier = maxProducts > 5;

  // If paid tier is expired, enforce free tier limit
  const effectiveLimit = (isPaidTier && expiresAt && Date.now() > expiresAt) ? 5 : maxProducts;

  if (productCount >= effectiveLimit) {
    throw new Error(
      isPaidTier && expiresAt && Date.now() > expiresAt
        ? 'Votre abonnement a expiré. Renouvelez votre plan pour publier plus de produits.'
        : `Limite de produits atteinte (${effectiveLimit} max). Passez au plan supérieur.`
    );
  }

  const title = (productData.title || '').trim();
  const slug = generateUniqueSlug(title);

  const newProduct = {
    title,
    slug,
    titleLower:      title.toLowerCase(),
    price:           productData.price || 0,
    originalPrice:   productData.originalPrice || null,
    currency:        productData.currency || null,
    description:     (productData.description || '').trim(),
    images:          productData.images || [],
    category:        productData.category || '',
    subCategory:     productData.subCategory || '',
    status:          'pending' as ProductStatus,
    isPromoted:      false,
    views:           0,
    likesCount:      0,
    reports:         0,
    rating:          0,
    reviews:         0,
    sellerId:        auth.currentUser.uid,
    sellerName:      userData.name || '',
    sellerEmail:     userData.email || '',
    sellerAvatar:    userData.avatar || '',
    sellerIsVerified: userData.isVerified || false,
    sellerWhatsapp:  userData.whatsapp || null,
    countryId:       userData.sellerDetails?.countryId || null,
    marketplace:     userData.sellerDetails?.marketplace || null,
    createdAt:       serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.PRODUCTS), newProduct);
    await updateDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid), {
      productCount: increment(1),
    });
    return docToProduct(newProduct, docRef.id);
  } catch (err: any) {
    console.error('[addProduct] Échec addDoc/updateDoc:', err.code, err.message);
    throw err;
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  if (!db || !auth?.currentUser) return;
  await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, productId));
  await updateDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid), {
    productCount: increment(-1),
  });
};

export const updateProductStatus = async (
  productId: string,
  status: ProductStatus,
  rejectionReason?: string
): Promise<void> => {
  if (!db) return;
  const data: Record<string, any> = { status };
  if (status === 'rejected' && rejectionReason) data.rejectionReason = rejectionReason;
  if (status === 'approved') data.rejectionReason = '';
  await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), data);
};

export const resubmitProduct = async (productId: string): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), {
    status: 'pending',
    resubmittedAt: Date.now(),
  });
};

export const updateProduct = async (
  productId: string,
  data: Partial<Pick<Product, 'title' | 'description' | 'price' | 'originalPrice' | 'category' | 'subCategory' | 'images'>>
): Promise<void> => {
  if (!db) return;
  const updateData: Record<string, any> = { ...data };
  if (data.title) updateData.titleLower = data.title.toLowerCase();
  await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), updateData);
};

export const incrementProductViews = async (productId: string): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), { views: increment(1) });
};

export const getSellerProducts = async (sellerId: string): Promise<Product[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('sellerId', '==', sellerId),
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter(d => !isHiddenProduct(d.data()))
    .map(d => docToProduct(d.data(), d.id));
};

export const getSellerAllProducts = async (sellerId: string): Promise<Product[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.PRODUCTS),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToProduct(d.data(), d.id));
};
