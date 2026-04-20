import { Product, User, ThemeColors, Category, SubscriptionTier, Country, Currency, PaymentMethod, SubscriptionPricing, BoostPricing } from './types';

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

/** Lookup provinces by country ID — Grands Lacs region only */
export const PROVINCES_BY_COUNTRY: Record<string, string[]> = {
  bi: PROVINCES_BURUNDI,
  cd: PROVINCES_RDC,
  rw: PROVINCES_RWANDA,
};

// --- PAYS SUPPORTÉS — Région des Grands Lacs ---
export const INITIAL_COUNTRIES: Country[] = [
    { id: 'bi', name: 'Burundi', code: 'BI', currency: 'FBu', flag: '🇧🇮', isActive: true },
    { id: 'cd', name: 'RDC',     code: 'CD', currency: 'FC',  flag: '🇨🇩', isActive: true },
    { id: 'rw', name: 'Rwanda',  code: 'RW', currency: 'FRw', flag: '🇷🇼', isActive: true },
];

// --- DEVISES — Grands Lacs + USD international ---
export const INITIAL_CURRENCIES: Currency[] = [
  { id: 'BIF', code: 'BIF', name: 'Franc Burundais',  symbol: 'FBu', countryId: 'bi',   isActive: true },
  { id: 'CDF', code: 'CDF', name: 'Franc Congolais',  symbol: 'FC',  countryId: 'cd',   isActive: true },
  { id: 'RWF', code: 'RWF', name: 'Franc Rwandais',   symbol: 'FRw', countryId: 'rw',   isActive: true },
  { id: 'USD', code: 'USD', name: 'Dollar Américain', symbol: '$',   countryId: 'intl', isActive: true },
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
    { name: 'Lumicash',      number: '68 515 135',         icon: '📱' },
    { name: 'Ecocash',       number: '68 515 135',         icon: '📱' },
    { name: 'Bancobu / BCB', number: 'Contactez via WhatsApp', icon: '🏦' },
  ],
  cd: [
    { name: 'Airtel Money',  number: '+243 979 055 933',   icon: '📱' },
    { name: 'Orange Money',  number: '+243 979 055 933',   icon: '📱' },
    { name: 'M-Pesa',        number: '+243 979 055 933',   icon: '📱' },
  ],
  rw: [
    { name: 'MTN MoMo',      number: 'Contactez support',  icon: '📱' },
    { name: 'Airtel Money',  number: 'Contactez support',  icon: '📱' },
  ],
};

// --- SUPPORT WHATSAPP PAR PAYS ---
export const SUPPORT_WHATSAPP: Record<string, string> = {
  bi: '+25768515135',
  cd: '+243979055933',
  rw: '+25768515135',
};

// --- PRIX D'ABONNEMENT PAR PAYS (defaults — admin peut modifier via Firestore) ---
export const DEFAULT_SUBSCRIPTION_PRICING: Record<string, SubscriptionPricing> = {
  bi: { prices: { starter: 15000, pro: 45000, elite: 100000, unlimited: 250000 }, currency: 'BIF' },
  cd: { prices: { starter: 5,     pro: 15,    elite: 30,     unlimited: 75     }, currency: 'USD' },
  rw: { prices: { starter: 5000,  pro: 15000, elite: 30000,  unlimited: 75000  }, currency: 'RWF' },
};

// --- PRIX BOOST PAR PAYS (defaults — admin peut modifier via Firestore collection boostPricing) ---
// Équivalent ~1 USD partout. Modifiable dans Firebase Console : boostPricing/{countryId}
export const DEFAULT_BOOST_PRICING: Record<string, BoostPricing> = {
  bi: { amount: 5000, currency: 'BIF' },
  cd: { amount: 2500, currency: 'CDF' },
  rw: { amount: 1000, currency: 'RWF' },
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

// --- CATÉGORIES UNIFIÉES (14 catégories + sous-catégories) ---
// Ordered by priority — Electronique, Mode, Beauté first, then the rest
// ⚠️ Ne jamais modifier id/slug — ce sont des clés étrangères dans les produits Firestore et Algolia.
//    Seuls name, icon et subCategories peuvent évoluer librement.
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
      'Réseaux & Wifi', 'Drones', 'Maison Connectée',
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
    // ⚠️ slug 'restaurant' conservé — les produits existants l'utilisent
    // Renommé "Restauration & Traiteur" pour inclure les traiteurs/jus à emporter
    id: 'restaurant',
    name: 'Restauration & Traiteur',
    icon: '🍽️',
    slug: 'restaurant',
    order: 4,
    subCategories: [
      'Plats locaux', 'Grillades & Brochettes', 'Fast-food',
      'Pizzeria', 'Pâtisserie & Boulangerie', 'Boissons & Jus frais',
      'Buffet & Traiteur', 'Cuisine africaine', 'Cuisine internationale',
      'Cafétéria & Salon de thé', // Renommé pour éviter la confusion avec "Café & Thé" (produit)
      'Livraison repas',
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
    // ⚠️ slug 'maison-cuisine' conservé
    // Renommé "Maison & Décoration", électroménager rapatrié ici (doublon supprimé dans Électronique)
    id: 'maison-cuisine',
    name: 'Maison & Décoration',
    icon: '🏠',
    slug: 'maison-cuisine',
    order: 6,
    subCategories: [
      'Ustensiles de cuisine', 'Vaisselle & Arts de la table',
      'Électroménager', // Anciennement "Petit électroménager" — seule occurrence, doublon supprimé
      'Mobilier & Meubles', 'Décoration & Objets déco', 'Literie & Textiles maison',
      'Luminaires & Éclairage', 'Jardinage & Plantes',
    ],
  },
  {
    id: 'bebe-enfants',
    name: 'Bébé & Enfants',
    icon: '👶',
    slug: 'bebe-enfants',
    order: 7,
    subCategories: [
      'Vêtements bébé & enfant', 'Alimentation bébé',
      'Poussettes & Transport', 'Soins & Hygiène bébé',
      'Jouets', 'Jouets éducatifs & Éveil',
      'Accessoires scolaires',
    ],
  },
  {
    id: 'sport-loisirs',
    name: 'Sport & Loisirs',
    icon: '⚽',
    slug: 'sport-loisirs',
    order: 8,
    subCategories: [
      'Équipements sportifs', 'Vélos & Trottinettes',
      'Chasse & Pêche', 'Camping & Randonnée', 'Jeux & Loisirs',
    ],
  },
  {
    id: 'education-fournitures',
    name: 'Éducation & Fournitures',
    icon: '📚',
    slug: 'education-fournitures',
    order: 9,
    subCategories: [
      'Livres scolaires & universitaires', 'Fournitures scolaires',
      'Papeterie & Bureau', 'Jeux éducatifs',
    ],
  },
  {
    id: 'construction-btp',
    name: 'Construction & BTP',
    icon: '🏗️',
    slug: 'construction-btp',
    order: 10,
    subCategories: [
      'Matériaux de construction', 'Ciment & Béton',
      'Peinture & Enduit', 'Menuiserie & Bois',
      'Outils & Machines', 'Quincaillerie',
      'Plomberie & Sanitaires', 'Électricité & Câblage',
    ],
  },
  {
    id: 'auto-moto',
    name: 'Auto & Moto',
    icon: '🚗',
    slug: 'auto-moto',
    order: 11,
    subCategories: [
      'Véhicules (Vente)', 'Motos & Vélos',
      'Pièces détachées', 'Accessoires auto & moto',
      'Pneus', 'Huiles & Lubrifiants', 'Batteries',
      'Entretien & Réparation',
    ],
  },
  {
    id: 'energie-solaire',
    name: 'Énergie & Solaire',
    icon: '☀️',
    slug: 'energie-solaire',
    order: 12,
    subCategories: [
      'Panneaux solaires', 'Batteries & Onduleurs',
      'Groupes électrogènes', 'Pièces détachées groupes électrogènes',
      'Ampoules & LED', 'Câbles & Prises',
    ],
  },
  {
    id: 'agriculture-elevage',
    name: 'Agriculture & Élevage',
    icon: '🌾',
    slug: 'agriculture-elevage',
    order: 13,
    subCategories: ['Semences', 'Engrais', 'Outils agricoles', 'Produits vétérinaires'],
  },
  {
    id: 'services',
    name: 'Services',
    icon: '🔧',
    slug: 'services',
    order: 14,
    // Services = prestations humaines uniquement (pas de vente de matériel)
    // Matériaux → Construction & BTP | Pièces tech → Électronique | Vêtements cousus → Mode
    subCategories: [
      'Réparation électroménager', 'Informatique & Dépannage',
      'Couture sur commande', 'Coiffure & Salon de beauté',
      'Plomberie', 'Électricité',
      'Transport & Déménagement', 'Livraison',
      'Événementiel & Photographie',
    ],
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