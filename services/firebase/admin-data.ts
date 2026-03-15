/**
 * AURABUJA — Admin Data Services (Categories, Tiers, Countries, Banners, Seeder)
 */

import {
  Category, SubscriptionTier, Country,
} from '../../types';
import { INITIAL_CATEGORIES, INITIAL_SUBSCRIPTION_TIERS, INITIAL_COUNTRIES } from '../../constants';
import {
  db, collection, doc, addDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, writeBatch, COLLECTIONS,
} from './constants';

// ── Categories ──

export const getCategories = async (): Promise<Category[]> => {
  if (!db) return INITIAL_CATEGORIES;

  const snap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));

  if (snap.empty) {
    await seedInitialData();
    return INITIAL_CATEGORIES;
  }

  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
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
  if (snap.empty) return INITIAL_COUNTRIES;

  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Country));
};

export const addCountry = async (country: Country): Promise<void> => {
  if (!db) return;
  await setDoc(doc(db, COLLECTIONS.COUNTRIES, country.id), country);
};

export const updateCountry = async (id: string, updates: Partial<Country>): Promise<void> => {
  if (!db) return;
  await updateDoc(doc(db, COLLECTIONS.COUNTRIES, id), updates);
};

export const deleteCountry = async (id: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTIONS.COUNTRIES, id));
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

// ── Seeder ──

const seedInitialData = async (): Promise<void> => {
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

  await batch.commit();
  console.info('Données initiales seedées en Firestore');
};
