/**
 * AURABUJA — Admin Data Services (Categories, Tiers, Countries, Banners, Seeder)
 */

import {
  Category, SubscriptionTier, Country, Marketplace, Currency,
} from '../../types';
import { INITIAL_CATEGORIES, INITIAL_SUBSCRIPTION_TIERS, INITIAL_COUNTRIES, INITIAL_CURRENCIES, MARKETPLACES } from '../../constants';
import {
  db, collection, doc, addDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, writeBatch, COLLECTIONS,
} from './constants';

// ── Categories ──

export const getCategories = async (): Promise<Category[]> => {
  if (!db) return INITIAL_CATEGORIES;

  const snap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));

  if (snap.empty) {
    await seedInitialData();
    return INITIAL_CATEGORIES;
  }

  const cats = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
  cats.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return cats;
};

export const addCategory = async (category: Omit<Category, 'id'>): Promise<Category> => {
  if (!db) throw new Error('Firebase non initialisé');
  const id = category.slug || category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  await setDoc(doc(db, COLLECTIONS.CATEGORIES, id), { ...category, id });
  return { id, ...category };
};

export const deleteCategory = async (id: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
};

// ── Subscription Tiers ──

export const getSubscriptionTiers = async (): Promise<SubscriptionTier[]> => {
  if (!db) return INITIAL_SUBSCRIPTION_TIERS;

  const snap = await getDocs(collection(db, COLLECTIONS.SUBSCRIPTION_TIERS));
  if (snap.empty) return INITIAL_SUBSCRIPTION_TIERS;

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as SubscriptionTier))
    .sort((a, b) => a.min - b.min);
};

export const updateSubscriptionTiers = async (tiers: SubscriptionTier[]): Promise<void> => {
  if (!db) return;

  const batch = writeBatch(db);
  tiers.forEach(tier => {
    const ref = doc(db, COLLECTIONS.SUBSCRIPTION_TIERS, tier.id);
    batch.set(ref, tier, { merge: true });
  });
  await batch.commit();
};

// ── Countries ──

export const getCountries = async (): Promise<Country[]> => {
  if (!db) return INITIAL_COUNTRIES;

  const snap = await getDocs(collection(db, COLLECTIONS.COUNTRIES));
  if (snap.empty) {
    // Seed all countries on first access
    const batch = writeBatch(db);
    INITIAL_COUNTRIES.forEach(c => batch.set(doc(db, COLLECTIONS.COUNTRIES, c.id), { ...c }));
    await batch.commit();
    return INITIAL_COUNTRIES;
  }

  // Additive sync: add any missing countries (e.g. Tanzania added later)
  const existing = new Set(snap.docs.map(d => d.id));
  const missing = INITIAL_COUNTRIES.filter(c => !existing.has(c.id));
  if (missing.length > 0) {
    try {
      const batch = writeBatch(db);
      missing.forEach(c => batch.set(doc(db, COLLECTIONS.COUNTRIES, c.id), { ...c }));
      await batch.commit();
    } catch {
      // Write may fail for non-admin users — that's OK, admin will sync on next visit
    }
    // Always return the full list (including missing ones from constants)
    return [...snap.docs.map(d => ({ id: d.id, ...d.data() } as Country)), ...missing];
  }

  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Country));
};

export const addCountry = async (country: Country): Promise<void> => {
  if (!db) return;
  await setDoc(doc(db, COLLECTIONS.COUNTRIES, country.id), country);
};

export const updateCountry = async (id: string, updates: Partial<Country>): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.COUNTRIES, id), updates);

  // When toggling isActive, batch-update all products from this country
  if (updates.isActive !== undefined) {
    const productsQuery = query(
      collection(db, COLLECTIONS.PRODUCTS),
      where('countryId', '==', id)
    );
    const snap = await getDocs(productsQuery);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.update(d.ref, { countryDeactivated: !updates.isActive });
      });
      await batch.commit();
    }
  }
};

export const deleteCountry = async (id: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.COUNTRIES, id));
};

// ── Marketplaces ──

export const getMarketplaces = async (): Promise<Marketplace[]> => {
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTIONS.MARKETPLACES));
  if (snap.empty) {
    // Seed from constants on first access
    await seedMarketplaces();
    return MARKETPLACES.map(m => ({
      ...m, cityId: 'bujumbura', countryId: 'bi', isActive: true,
    }));
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Marketplace));
};

export const getMarketplacesByCountry = async (countryId: string): Promise<Marketplace[]> => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.MARKETPLACES),
    where('countryId', '==', countryId),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);
  if (snap.empty && countryId === 'bi') {
    await seedMarketplaces();
    return MARKETPLACES.map(m => ({
      ...m, cityId: 'bujumbura', countryId: 'bi', isActive: true,
    }));
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Marketplace));
};

export const addMarketplace = async (marketplace: Omit<Marketplace, 'id'> & { id?: string }): Promise<Marketplace> => {
  if (!db) throw new Error('Firebase non initialisé');
  const id = marketplace.id || marketplace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const data = { ...marketplace, id };
  await setDoc(doc(db, COLLECTIONS.MARKETPLACES, id), data);
  return data as Marketplace;
};

export const updateMarketplace = async (id: string, updates: Partial<Marketplace>): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.MARKETPLACES, id), updates);
};

export const deleteMarketplace = async (id: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.MARKETPLACES, id));
};

const seedMarketplaces = async (): Promise<void> => {
  if (!db) return;
  const batch = writeBatch(db);
  MARKETPLACES.forEach(mp => {
    const data: Marketplace = {
      ...mp, cityId: 'bujumbura', countryId: 'bi', isActive: true,
    };
    batch.set(doc(db, COLLECTIONS.MARKETPLACES, mp.id), data);
  });
  await batch.commit();
};

// ── Banners ──

export type BannerActionType = 'none' | 'external' | 'category' | 'product' | 'page';

export interface BannerData {
  id?: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaActionType: BannerActionType;
  ctaAction: string;
  isActive: boolean;
  order: number;
}

export const getBanners = async (): Promise<BannerData[]> => {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, COLLECTIONS.BANNERS), orderBy('order', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BannerData));
};

export const addBanner = async (data: Omit<BannerData, 'id'>): Promise<BannerData> => {
  if (!db) throw new Error('Firebase non initialisé');
  const docRef = await addDoc(collection(db, COLLECTIONS.BANNERS), data);
  return { id: docRef.id, ...data };
};

export const updateBanner = async (id: string, updates: Partial<BannerData>): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.BANNERS, id), updates);
};

export const deleteBanner = async (id: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.BANNERS, id));
};

// ── Currencies ──

export const getCurrencies = async (): Promise<Currency[]> => {
  if (!db) return INITIAL_CURRENCIES;
  const snap = await getDocs(collection(db, COLLECTIONS.CURRENCIES));
  if (snap.empty) {
    await seedCurrencies();
    return INITIAL_CURRENCIES;
  }
  // Additive sync: add any missing currencies from INITIAL_CURRENCIES
  const existing = new Set(snap.docs.map(d => d.id));
  const missing = INITIAL_CURRENCIES.filter(c => !existing.has(c.id));
  if (missing.length > 0) {
    try {
      const batch = writeBatch(db);
      missing.forEach(cur => batch.set(doc(db, COLLECTIONS.CURRENCIES, cur.id), { ...cur }));
      await batch.commit();
    } catch {
      // Write may fail for non-admin users — admin will sync on next visit
    }
    return [...snap.docs.map(d => ({ id: d.id, ...d.data() } as Currency)), ...missing];
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Currency));
};

export const getActiveCurrencies = async (): Promise<Currency[]> => {
  const all = await getCurrencies();
  return all.filter(c => c.isActive);
};

export const updateCurrency = async (id: string, updates: Partial<Currency>): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.CURRENCIES, id), updates);
};

const seedCurrencies = async (): Promise<void> => {
  if (!db) return;
  const batch = writeBatch(db);
  INITIAL_CURRENCIES.forEach(cur => {
    batch.set(doc(db, COLLECTIONS.CURRENCIES, cur.id), { ...cur });
  });
  await batch.commit();
};

// ── Subscription Expiration ──

export const renewSubscription = async (userId: string, days: number = 30): Promise<void> => {
  if (!db) return;
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    'sellerDetails.subscriptionExpiresAt': expiresAt,
  });
};

export const downgradeToFree = async (userId: string): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    'sellerDetails.maxProducts': 5,
    'sellerDetails.tierLabel': 'Gratuit',
    'sellerDetails.subscriptionExpiresAt': null,
  });
};

// ── Seeder ──

export const seedInitialData = async (): Promise<void> => {
  if (!db) return;

  const batch = writeBatch(db);

  INITIAL_CATEGORIES.forEach(cat => {
    batch.set(doc(db, COLLECTIONS.CATEGORIES, cat.id), { ...cat });
  });

  INITIAL_SUBSCRIPTION_TIERS.forEach(tier => {
    batch.set(doc(db, COLLECTIONS.SUBSCRIPTION_TIERS, tier.id), { ...tier });
  });

  INITIAL_COUNTRIES.forEach(country => {
    batch.set(doc(db, COLLECTIONS.COUNTRIES, country.id), { ...country });
  });

  INITIAL_CURRENCIES.forEach(cur => {
    batch.set(doc(db, COLLECTIONS.CURRENCIES, cur.id), { ...cur });
  });

  await batch.commit();
  console.info('Données initiales seedées en Firestore');
};
