import { Product, User, ThemeColors, Category, SubscriptionTier, Country, Currency, PaymentMethod, SubscriptionPricing } from './types';

export const CURRENCY = 'FBu'; // legacy default — use Currency system for multi-currency
export const LOW_STOCK_THRESHOLD = 5;

export const PROVINCES_BURUNDI = [
  'Bubanza', 'Bujumbura Mairie', 'Bujumbura Rural', 'Bururi', 'Cankuzo',
  'Cibitoke', 'Gitega', 'Karuzi', 'Kayanza', 'Kirundo', 'Makamba',
  'Muramvya', 'Muyinga', 'Mwaro', 'Ngozi', 'Rumonge', 'Rutana', 'Ruyigi'
];

export const PROVINCES_RDC = [
  'Bas-Uélé', 'Équateur', 'Haut-Katanga', 'Haut-Lomami', 'Haut-Uélé',
  'Ituri', 'Kasaï', 'Kasaï Central', 'Kasaï Oriental', 'Kinshasa',
  'Kongo Central', 'Kwango', 'Kwilu', 'Lomami', 'Lualaba', 'Mai-Ndombe',
  'Maniema', 'Mongala', 'Nord-Kivu', 'Nord-Ubangi', 'Sankuru',
  'Sud-Kivu', 'Sud-Ubangi', 'Tanganyika', 'Tshopo', 'Tshuapa'
];

export const PROVINCES_RWANDA = [
  'Kigali', 'Est', 'Nord', 'Ouest', 'Sud'
];

export const PROVINCES_UGANDA = [
  'Central', 'Eastern', 'Northern', 'Western', 'Kampala'
];

export const PROVINCES_TANZANIE = [
  'Dar es Salaam', 'Dodoma', 'Arusha', 'Mwanza', 'Zanzibar',
  'Mbeya', 'Morogoro', 'Tanga', 'Kagera', 'Kigoma',
  'Kilimanjaro', 'Iringa', 'Mara', 'Mtwara', 'Tabora',
  'Lindi', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Singida',
  'Geita', 'Katavi', 'Njombe', 'Simiyu', 'Songwe',
  'Pemba North', 'Pemba South', 'Unguja North', 'Unguja South',
];

export const PROVINCES_KENYA = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu',
  'Kiambu', 'Machakos', 'Kajiado', 'Kilifi', 'Kwale',
  'Nyeri', 'Murang\'a', 'Kakamega', 'Bungoma', 'Nandi',
  'Kericho', 'Bomet', 'Trans-Nzoia', 'Laikipia', 'Embu',
  'Meru', 'Tharaka-Nithi', 'Makueni', 'Kitui', 'Taita-Taveta',
  'Lamu', 'Tana River', 'Garissa', 'Wajir', 'Mandera',
  'Marsabit', 'Isiolo', 'Samburu', 'Turkana', 'West Pokot',
  'Baringo', 'Elgeyo-Marakwet', 'Nyandarua', 'Kirinyaga',
  'Nyamira', 'Kisii', 'Homa Bay', 'Migori', 'Siaya',
  'Vihiga', 'Busia', 'Narok',
];

/** Lookup provinces by country ID */
export const PROVINCES_BY_COUNTRY: Record<string, string[]> = {
  bi: PROVINCES_BURUNDI,
  cd: PROVINCES_RDC,
  rw: PROVINCES_RWANDA,
  ug: PROVINCES_UGANDA,
  tz: PROVINCES_TANZANIE,
  ke: PROVINCES_KENYA,
};

// --- PAYS SUPPORTÉS (Extensible par Admin) ---
export const INITIAL_COUNTRIES: Country[] = [
    { id: 'bi', name: 'Burundi', code: 'BI', currency: 'FBu', flag: '🇧🇮', isActive: true },
    { id: 'cd', name: 'RDC', code: 'CD', currency: 'FC', flag: '🇨🇩', isActive: true },
    { id: 'rw', name: 'Rwanda', code: 'RW', currency: 'FRw', flag: '🇷🇼', isActive: true },
    { id: 'ug', name: 'Ouganda', code: 'UG', currency: 'USh', flag: '🇺🇬', isActive: true },
    { id: 'tz', name: 'Tanzanie', code: 'TZ', currency: 'TZS', flag: '🇹🇿', isActive: true },
    { id: 'ke', name: 'Kenya', code: 'KE', currency: 'KES', flag: '🇰🇪', isActive: true },
];

// --- DEVISES (Admin-managed via Firestore, seeded from here) ---
export const INITIAL_CURRENCIES: Currency[] = [
  { id: 'BIF', code: 'BIF', name: 'Franc Burundais',       symbol: 'FBu', countryId: 'bi',   isActive: true },
  { id: 'CDF', code: 'CDF', name: 'Franc Congolais',       symbol: 'FC',  countryId: 'cd',   isActive: true },
  { id: 'RWF', code: 'RWF', name: 'Franc Rwandais',        symbol: 'FRw', countryId: 'rw',   isActive: true },
  { id: 'UGX', code: 'UGX', name: 'Shilling Ougandais',    symbol: 'USh', countryId: 'ug',   isActive: true },
  { id: 'TZS', code: 'TZS', name: 'Shilling Tanzanien',    symbol: 'TZS', countryId: 'tz',   isActive: true },
  { id: 'USD', code: 'USD', name: 'Dollar Américain',       symbol: '$',   countryId: 'intl', isActive: true },
  { id: 'KES', code: 'KES', name: 'Shilling Kényan',        symbol: 'KES', countryId: 'ke',   isActive: true },
];

export const THEME: ThemeColors = {
  primary: 'gold',
  accent: 'amber',
  gradient: 'from-gold-400 to-gold-600',
  heroGradient: 'from-gray-950 via-gold-950 to-gray-950',
};

// --- THEME CLASSES STATIQUES (Tailwind JIT ne compile pas les interpolations dynamiques) ---
export const TC = {
  bg600: 'bg-gold-400',
  bg500: 'bg-gold-500',
  bg500_10: 'bg-gold-400/10',
  bg950: 'bg-gold-950',
  text400: 'text-gold-400',
  text500: 'text-gold-400',
  text400_70: 'text-gold-400/70',
  border400: 'border-gold-400',
  border500: 'border-gold-400',
  border500_50: 'border-gold-400/50',
  border500_20: 'border-gold-400/20',
  shadowLg: 'shadow-lg shadow-gold-400/20',
  hoverBorder: 'hover:border-gold-400/50',
  hoverShadow: 'hover:shadow-gold-900/20',
} as const;

// --- SUBSCRIPTION TIERS (Business Model) ---
// Free: 0-5 produits (gratuit) — alerte à 3 produits pour encourager upgrade
// Starter: 6-15 — payant, 30 jours renouvelable
// Pro+: payant, 30 jours renouvelable, NIF requis
export const INITIAL_SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { id: 'free', min: 0, max: 5, label: 'Découverte (Gratuit)', requiresNif: false },
  { id: 'starter', min: 6, max: 15, label: 'Starter', requiresNif: false },
  { id: 'pro', min: 16, max: 30, label: 'Business Pro', requiresNif: true },
  { id: 'elite', min: 31, max: 50, label: 'Élite', requiresNif: true },
  { id: 'unlimited', min: 51, max: null, label: 'Grossiste Illimité', requiresNif: true },
];
export const FREE_TIER_WARNING_AT = 3; // Show upgrade warning when reaching this count on free plan

// --- PAYMENT METHODS PAR PAYS ---
export const PAYMENT_METHODS: Record<string, PaymentMethod[]> = {
  bi: [
    { name: 'Lumicash', number: '68 515 135', icon: '📱' },
    { name: 'Ecocash', number: '68 515 135', icon: '📱' },
    { name: 'Bancobu / BCB', number: 'Contactez via WhatsApp', icon: '🏦' },
  ],
  cd: [
    { name: 'Airtel Money', number: '+243 979 055 933', icon: '📱' },
    { name: 'Orange Money', number: '+243 979 055 933', icon: '📱' },
    { name: 'M-Pesa', number: '+243 979 055 933', icon: '📱' },
  ],
  rw: [
    { name: 'MTN MoMo', number: 'Contactez support', icon: '📱' },
    { name: 'Airtel Money', number: 'Contactez support', icon: '📱' },
  ],
  ug: [
    { name: 'MTN MoMo', number: 'Contactez support', icon: '📱' },
    { name: 'Airtel Money', number: 'Contactez support', icon: '📱' },
  ],
  tz: [
    { name: 'M-Pesa', number: 'Contactez support', icon: '📱' },
    { name: 'Tigo Pesa', number: 'Contactez support', icon: '📱' },
  ],
  ke: [
    { name: 'M-Pesa', number: 'Contactez support', icon: '📱' },
  ],
};

// --- SUPPORT WHATSAPP PAR PAYS ---
export const SUPPORT_WHATSAPP: Record<string, string> = {
  bi: '+25768515135',
  cd: '+243979055933',
  rw: '+25768515135',  // fallback BI
  ug: '+25768515135',  // fallback BI
  tz: '+25768515135',  // fallback BI
  ke: '+25768515135',  // fallback BI
};

// --- PRIX D'ABONNEMENT PAR PAYS (defaults — admin peut modifier via Firestore) ---
export const DEFAULT_SUBSCRIPTION_PRICING: Record<string, SubscriptionPricing> = {
  bi: { prices: { starter: 15000, pro: 45000, elite: 100000, unlimited: 250000 }, currency: 'BIF' },
  cd: { prices: { starter: 5, pro: 15, elite: 30, unlimited: 75 }, currency: 'USD' },
  rw: { prices: { starter: 5000, pro: 15000, elite: 30000, unlimited: 75000 }, currency: 'RWF' },
  ug: { prices: { starter: 20000, pro: 60000, elite: 120000, unlimited: 300000 }, currency: 'UGX' },
  tz: { prices: { starter: 10000, pro: 30000, elite: 60000, unlimited: 150000 }, currency: 'TZS' },
  ke: { prices: { starter: 500, pro: 1500, elite: 3000, unlimited: 7500 }, currency: 'KES' },
};

// --- USERS MOCK ---
export const MOCK_ADMIN: User = {
  id: 'admin1',
  name: 'Admin Nunulia',
  email: 'admin@nunulia.com',
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
// Ordered by priority — Electronique, Mode, Beauté first, then the rest
export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'electronique-telephonie',
    name: 'Électronique & Téléphonie',
    icon: '📱',
    slug: 'electronique-telephonie',
    order: 1,
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
    order: 2,
    subCategories: [
      'Homme', 'Femme', 'Enfant', 'Chaussures',
      'Sacs à main & Bagages', 'Montres', 'Bijoux & Joaillerie',
      'Lunettes de soleil', 'Ceintures & Portefeuilles',
      'Mode africaine (pagne, couture locale)',
    ],
  },
  {
    id: 'beaute-sante',
    name: 'Beauté & Santé',
    icon: '💄',
    slug: 'beaute-sante',
    order: 3,
    subCategories: [
      'Maquillage', 'Soins Visage', 'Soins du Corps',
      'Produits Capillaires', 'Huiles Naturelles', 'Parfums',
      'Hygiène & Santé', 'Barbe & Homme', 'Onglerie & Vernis',
      'Matériel Salon/Spa', 'Produits naturels africains',
      'Compléments alimentaires', 'Bien-être & Relaxation',
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    icon: '🍽️',
    slug: 'restaurant',
    order: 4,
    subCategories: [
      'Plats locaux', 'Grillades & Brochettes', 'Fast-food',
      'Pizzeria', 'Pâtisserie & Boulangerie', 'Boissons & Jus frais',
      'Buffet & Traiteur', 'Cuisine africaine', 'Cuisine internationale',
      'Café & Salon de thé', 'Livraison repas',
    ],
  },
  {
    id: 'supermarche-alimentaire',
    name: 'Supermarché & Produits alimentaires',
    icon: '🛒',
    slug: 'supermarche-alimentaire',
    order: 5,
    subCategories: [
      'Produits secs (riz, farine, pâtes)', 'Boissons (jus, sodas, eau)',
      'Produits locaux (haricots, manioc, bananes)', 'Produits importés',
      'Huiles & Condiments', 'Conserves & Sauces', 'Produits laitiers',
      'Snacks & Biscuits', 'Épices & Assaisonnements', 'Café & Thé',
    ],
  },
  {
    id: 'maison-cuisine',
    name: 'Maison & Cuisine',
    icon: '🏠',
    slug: 'maison-cuisine',
    order: 6,
    subCategories: ['Ustensiles', 'Décoration', 'Literie', 'Petit électroménager'],
  },
  {
    id: 'bebe-enfants',
    name: 'Bébé & Enfants',
    icon: '👶',
    slug: 'bebe-enfants',
    order: 7,
    subCategories: ['Vêtements', 'Jouets', 'Accessoires scolaires'],
  },
  {
    id: 'construction-btp',
    name: 'Construction & BTP',
    icon: '🏗️',
    slug: 'construction-btp',
    order: 8,
    subCategories: ['Matériaux', 'Outils', 'Quincaillerie'],
  },
  {
    id: 'auto-moto',
    name: 'Auto & Moto',
    icon: '🚗',
    slug: 'auto-moto',
    order: 9,
    subCategories: ['Pièces détachées', 'Accessoires', 'Pneus'],
  },
  {
    id: 'agriculture-elevage',
    name: 'Agriculture & Élevage',
    icon: '🌾',
    slug: 'agriculture-elevage',
    order: 10,
    subCategories: ['Semences', 'Engrais', 'Outils agricoles', 'Produits vétérinaires'],
  },
  {
    id: 'services',
    name: 'Services',
    icon: '🔧',
    slug: 'services',
    order: 11,
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