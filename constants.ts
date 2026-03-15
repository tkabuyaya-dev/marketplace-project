import { Product, User, ThemeColors, Category, SubscriptionTier, Country, MarketplaceId } from './types';

export const CURRENCY = 'FBu';
export const LOW_STOCK_THRESHOLD = 5;

// --- MARKETPLACES PHYSIQUES DE BUJUMBURA ---
export interface MarketplaceInfo {
  id: MarketplaceId;
  name: string;
  icon: string;
  color: string;       // Tailwind bg class
  borderColor: string;  // Tailwind border class
  textColor: string;    // Tailwind text class
}

export const MARKETPLACES: MarketplaceInfo[] = [
  { id: 'bata',         name: 'Marché de Bata',        icon: '🟠', color: 'bg-orange-600',  borderColor: 'border-orange-500', textColor: 'text-orange-400' },
  { id: 'kamenge',      name: 'Marché de Kamenge',      icon: '🟢', color: 'bg-green-600',   borderColor: 'border-green-500',  textColor: 'text-green-400' },
  { id: 'centre-ville', name: 'Marché du Centre Ville', icon: '🔵', color: 'bg-blue-600',    borderColor: 'border-blue-500',   textColor: 'text-blue-400' },
  { id: 'kinama',       name: 'Marché de Kinama',       icon: '🟣', color: 'bg-purple-600',  borderColor: 'border-purple-500', textColor: 'text-purple-400' },
  { id: 'autres',       name: 'Autres / Non localisé',  icon: '⚪', color: 'bg-gray-600',    borderColor: 'border-gray-500',   textColor: 'text-gray-400' },
];

export const getMarketplaceInfo = (id: MarketplaceId): MarketplaceInfo =>
  MARKETPLACES.find(m => m.id === id) || MARKETPLACES[4];

export const PROVINCES_BURUNDI = [
  'Bubanza', 'Bujumbura Mairie', 'Bujumbura Rural', 'Bururi', 'Cankuzo', 
  'Cibitoke', 'Gitega', 'Karuzi', 'Kayanza', 'Kirundo', 'Makamba', 
  'Muramvya', 'Muyinga', 'Mwaro', 'Ngozi', 'Rumonge', 'Rutana', 'Ruyigi'
];

// --- PAYS SUPPORTÉS (Extensible par Admin) ---
export const INITIAL_COUNTRIES: Country[] = [
    { id: 'bi', name: 'Burundi', code: 'BI', currency: 'FBu', flag: '🇧🇮', isActive: true },
    { id: 'cd', name: 'RDC', code: 'CD', currency: 'FC', flag: '🇨🇩', isActive: true },
    { id: 'rw', name: 'Rwanda', code: 'RW', currency: 'FRw', flag: '🇷🇼', isActive: true },
    { id: 'ug', name: 'Ouganda', code: 'UG', currency: 'USh', flag: '🇺🇬', isActive: true },
];

export const THEME: ThemeColors = {
  primary: 'blue',
  accent: 'cyan',
  gradient: 'from-blue-500 to-cyan-400',
  heroGradient: 'from-blue-950 via-indigo-900 to-slate-900',
};

// --- THEME CLASSES STATIQUES (Tailwind JIT ne compile pas les interpolations dynamiques) ---
export const TC = {
  bg600: 'bg-blue-600',
  bg500: 'bg-blue-500',
  bg500_10: 'bg-blue-500/10',
  text400: 'text-blue-400',
  text500: 'text-blue-500',
  text400_70: 'text-blue-400/70',
  border500: 'border-blue-500',
  border500_50: 'border-blue-500/50',
  border500_20: 'border-blue-500/20',
  shadowLg: 'shadow-lg shadow-blue-500/25',
  hoverBorder: 'hover:border-blue-500/50',
  hoverShadow: 'hover:shadow-blue-900/20',
} as const;

// --- SUBSCRIPTION TIERS (Business Model) ---
// Modifiable par l'admin
export const INITIAL_SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { id: 'free', min: 0, max: 3, price: 0, label: 'Découverte (Gratuit)', requiresNif: false },
  { id: 'starter', min: 4, max: 8, price: 15000, label: 'Starter', requiresNif: false },
  { id: 'pro', min: 9, max: 15, price: 45000, label: 'Business Pro', requiresNif: true },
  { id: 'elite', min: 16, max: 50, price: 100000, label: 'Élite', requiresNif: true },
  { id: 'unlimited', min: 51, max: null, price: 250000, label: 'Grossiste Illimité', requiresNif: true },
];

// --- USERS MOCK ---
export const MOCK_ADMIN: User = {
  id: 'admin1',
  name: 'Admin AuraBuja',
  email: 'admin@aurabuja.bi',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
  isVerified: true,
  role: 'admin',
  joinDate: 1609459200000
};

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Jean Ndayishimiye',
  email: 'jean@gmail.com',
  avatar: 'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?auto=format&fit=crop&w=200&q=80',
  isVerified: false,
  role: 'buyer', // IMPORTANT: Doit être 'buyer' pour voir le formulaire
  whatsapp: '25779000000',
  joinDate: 1640995200000,
  productCount: 0 
};

// --- CATÉGORIES UNIFIÉES (10 catégories + sous-catégories) ---
export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'electronique-telephonie',
    name: 'Électronique & Téléphonie',
    icon: '📱',
    slug: 'electronique-telephonie',
    subCategories: [
      'Smartphones', 'Accessoires Téléphone', 'Audio & Casques',
      'Ordinateurs Portables', 'PC Bureau & Écrans', 'Tablettes',
      'TV & Home Cinéma', 'Photo & Vidéo', 'Gaming & Consoles',
      'Imprimantes & Encre', 'Composants PC', 'Stockage (USB/HDD/SSD)',
      'Réseaux & Wifi', 'Drones', 'Maison Connectée', 'Électroménager léger',
    ],
  },
  {
    id: 'mode-accessoires',
    name: 'Mode & Accessoires',
    icon: '👗',
    slug: 'mode-accessoires',
    subCategories: [
      'Homme', 'Femme', 'Enfant', 'Chaussures',
      'Sacs à main & Bagages', 'Montres', 'Bijoux & Joaillerie',
      'Lunettes de soleil', 'Ceintures & Portefeuilles',
      'Mode africaine (pagne, couture locale)',
    ],
  },
  {
    id: 'maison-cuisine',
    name: 'Maison & Cuisine',
    icon: '🏠',
    slug: 'maison-cuisine',
    subCategories: ['Ustensiles', 'Décoration', 'Literie', 'Petit électroménager'],
  },
  {
    id: 'supermarche-alimentaire',
    name: 'Supermarché & Produits alimentaires',
    icon: '🛒',
    slug: 'supermarche-alimentaire',
    subCategories: [
      'Produits secs (riz, farine, pâtes)', 'Boissons (jus, sodas, eau)',
      'Produits locaux (haricots, manioc, bananes)', 'Produits importés',
      'Huiles & Condiments', 'Conserves & Sauces', 'Produits laitiers',
      'Snacks & Biscuits', 'Épices & Assaisonnements', 'Café & Thé',
    ],
  },
  {
    id: 'beaute-sante',
    name: 'Beauté & Santé',
    icon: '💄',
    slug: 'beaute-sante',
    subCategories: [
      'Maquillage', 'Soins Visage', 'Soins du Corps',
      'Produits Capillaires', 'Huiles Naturelles', 'Parfums',
      'Hygiène & Santé', 'Barbe & Homme', 'Onglerie & Vernis',
      'Matériel Salon/Spa', 'Produits naturels africains',
      'Compléments alimentaires', 'Bien-être & Relaxation',
    ],
  },
  {
    id: 'bebe-enfants',
    name: 'Bébé & Enfants',
    icon: '👶',
    slug: 'bebe-enfants',
    subCategories: ['Vêtements', 'Jouets', 'Accessoires scolaires'],
  },
  {
    id: 'construction-btp',
    name: 'Construction & BTP',
    icon: '🏗️',
    slug: 'construction-btp',
    subCategories: ['Matériaux', 'Outils', 'Quincaillerie'],
  },
  {
    id: 'auto-moto',
    name: 'Auto & Moto',
    icon: '🚗',
    slug: 'auto-moto',
    subCategories: ['Pièces détachées', 'Accessoires', 'Pneus'],
  },
  {
    id: 'agriculture-elevage',
    name: 'Agriculture & Élevage',
    icon: '🌾',
    slug: 'agriculture-elevage',
    subCategories: ['Semences', 'Engrais', 'Outils agricoles', 'Produits vétérinaires'],
  },
  {
    id: 'services',
    name: 'Services',
    icon: '🔧',
    slug: 'services',
    subCategories: ['Réparation électroménager', 'Livraison', 'Couture', 'Plomberie', 'Électricité'],
  },
];

// --- PRODUCTS MOCK ---
export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    title: 'Samsung Galaxy S24 Ultra',
    price: 3500000,
    originalPrice: 3800000,
    description: 'Le dernier Samsung Galaxy S24 Ultra avec AI intégrée. 512GB stockage.',
    images: ['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=800&q=80'],
    category: 'electronique-telephonie',
    subCategory: 'Smartphones',
    rating: 4.9,
    reviews: 124,
    seller: { id: 's1', name: 'TechStore BJA', email:'tech@store.bi', avatar: 'https://images.unsplash.com/photo-1589156280159-27698a70f29e?auto=format&fit=crop&w=200&q=80', isVerified: true, role: 'seller', joinDate: 1600000000000, whatsapp: '257123456', productCount: 12 },
    isPromoted: true,
    status: 'approved',
    views: 1250,
    reports: 0,
    createdAt: Date.now() - 10000000
  },
  {
    id: 'p_pending_1',
    title: 'iPhone 15 Pro Max (Copie)',
    price: 300000,
    description: 'Bonne copie Android qui ressemble à iOS.',
    images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80'],
    category: 'electronique-telephonie',
    subCategory: 'Smartphones',
    rating: 0,
    reviews: 0,
    seller: {
        id: 's_demo_pending',
        name: 'Vendeur Test',
        email: 'test@vendeur.bi',
        avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=200&q=80',
        isVerified: false,
        role: 'seller',
        joinDate: Date.now()
    },
    status: 'pending',
    views: 0,
    reports: 0,
    createdAt: Date.now()
  }
];