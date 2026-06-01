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

export const PROVINCES_TANZANIA = [
  'Dar es Salaam', 'Arusha', 'Mwanza', 'Mbeya', 'Dodoma',
  'Morogoro', 'Tanga', 'Kilimanjaro', 'Tabora', 'Kigoma',
  'Kagera', 'Mara', 'Iringa', 'Rukwa', 'Singida',
];

export const PROVINCES_KENYA = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret',
  'Thika', 'Malindi', 'Kitale', 'Garissa', 'Kakamega',
];

export const PROVINCES_OUGANDA = [
  'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbarara',
  'Gulu', 'Mbale', 'Lira', 'Masaka', 'Entebbe',
];

/** Lookup provinces by country ID */
export const PROVINCES_BY_COUNTRY: Record<string, string[]> = {
  bi: PROVINCES_BURUNDI,
  cd: PROVINCES_RDC,
  rw: PROVINCES_RWANDA,
  tz: PROVINCES_TANZANIA,
  ke: PROVINCES_KENYA,
  ug: PROVINCES_OUGANDA,
};

// --- PAYS SUPPORTÉS — Région des Grands Lacs ---
export const INITIAL_COUNTRIES: Country[] = [
    { id: 'bi', name: 'Burundi',  code: 'BI', currency: 'FBu', flag: '🇧🇮', isActive: true },
    { id: 'cd', name: 'RDC',      code: 'CD', currency: 'FC',  flag: '🇨🇩', isActive: true },
    { id: 'rw', name: 'Rwanda',   code: 'RW', currency: 'FRw', flag: '🇷🇼', isActive: true },
    // Pays scaffolded — désactivés par défaut. Activation via Firestore admin.
    // Configs supportées (cities, dial code, payment, pricing) ci-dessous.
    { id: 'tz', name: 'Tanzanie', code: 'TZ', currency: 'TSh', flag: '🇹🇿', isActive: false },
    { id: 'ke', name: 'Kenya',    code: 'KE', currency: 'KSh', flag: '🇰🇪', isActive: false },
    { id: 'ug', name: 'Ouganda',  code: 'UG', currency: 'USh', flag: '🇺🇬', isActive: false },
];

/**
 * Mapping de secours id → emoji drapeau.
 * Utilisé quand le doc Firestore countries/{id} a un `flag` invalide
 * (ex: créé à la main avec "rw" au lieu de "🇷🇼"). Garantit qu'on
 * n'affiche jamais un code à 2 lettres dans l'UI.
 */
const COUNTRY_FLAG_FALLBACK: Record<string, string> = {
  bi: '🇧🇮', cd: '🇨🇩', rw: '🇷🇼', tz: '🇹🇿', ke: '🇰🇪', ug: '🇺🇬',
};

/**
 * Retourne le drapeau emoji d'un pays — robuste aux docs Firestore mal seedés.
 * Si `country.flag` ne contient PAS de Regional Indicator Symbol (U+1F1E6 → U+1F1FF),
 * on tombe sur la table de secours. Évite l'affichage de "rw" en texte brut.
 */
export function getCountryFlag(country: { id: string; flag?: string } | null | undefined): string {
  if (!country) return '🌍';
  const f = country.flag || '';
  // Test la présence d'au moins un caractère Regional Indicator Symbol
  if (/[\u{1F1E6}-\u{1F1FF}]/u.test(f)) return f;
  return COUNTRY_FLAG_FALLBACK[country.id] || '🏳️';
}

// --- DEVISES — Grands Lacs + USD international ---
export const INITIAL_CURRENCIES: Currency[] = [
  { id: 'BIF', code: 'BIF', name: 'Franc Burundais',   symbol: 'FBu', countryId: 'bi',   isActive: true  },
  { id: 'CDF', code: 'CDF', name: 'Franc Congolais',   symbol: 'FC',  countryId: 'cd',   isActive: true  },
  { id: 'RWF', code: 'RWF', name: 'Franc Rwandais',    symbol: 'FRw', countryId: 'rw',   isActive: true  },
  { id: 'USD', code: 'USD', name: 'Dollar Américain',  symbol: '$',   countryId: 'intl', isActive: true  },
  // Devises scaffolded — désactivées par défaut. Activation via Firestore admin.
  { id: 'TZS', code: 'TZS', name: 'Shilling Tanzanien', symbol: 'TSh', countryId: 'tz', isActive: false },
  { id: 'KES', code: 'KES', name: 'Shilling Kényan',    symbol: 'KSh', countryId: 'ke', isActive: false },
  { id: 'UGX', code: 'UGX', name: 'Shilling Ougandais', symbol: 'USh', countryId: 'ug', isActive: false },
];

export const THEME: ThemeColors = {
  primary: 'gold',
  accent: 'amber',
  gradient: 'from-gold-400 to-gold-600',
  heroGradient: 'from-gray-950 via-gold-950 to-gray-950',
};

// --- THEME CLASSES STATIQUES (Tailwind JIT ne compile pas les interpolations dynamiques) ---
export const TC = {
  bg400:        'bg-gold-400',
  bg500:        'bg-gold-500',
  bg400_10:     'bg-gold-400/10',
  bg950:        'bg-gold-950',
  text400:      'text-gold-400',
  text400_70:   'text-gold-400/70',
  border400:    'border-gold-400',
  border400_50: 'border-gold-400/50',
  border400_20: 'border-gold-400/20',
  shadowLg:     'shadow-lg shadow-gold-400/20',
  hoverBorder:  'hover:border-gold-400/50',
  hoverShadow:  'hover:shadow-gold-900/20',
} as const;

// --- SUBSCRIPTION TIERS (Business Model — refonte 2026-06) ---
// Découverte : 5 produits gratuit
// Vendeur    : 25 produits, sans contact client
// Pro        : 100 produits, contact client EXCLUSIF + badge Pro + priorité recherche
// Grossiste  : Illimité, contact client + badge Grossiste + priorité + NIF requis
// La source de vérité des features est utils/planFeatures.ts (PLAN_FEATURES).
export const INITIAL_SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { id: 'free',      min: 0, max: 5,    label: 'Découverte', requiresNif: false },
  { id: 'vendeur',   min: 1, max: 25,   label: 'Vendeur',    requiresNif: false },
  { id: 'pro',       min: 1, max: 100,  label: 'Pro',        requiresNif: false },
  { id: 'grossiste', min: 1, max: null, label: 'Grossiste',  requiresNif: true  },
];
export const FREE_TIER_WARNING_AT = 3; // Show upgrade warning when reaching this count on free plan

// --- OFFRE FONDATEURS (landing page /devenir-vendeur) ---
// Total de places: 100. Mettre à jour cette valeur manuellement à mesure que les inscriptions arrivent.
// TODO: brancher sur Firestore (collection config/foundersOffer) une fois la collection créée côté admin.
export const FOUNDERS_SPOTS_TOTAL = 100;
export const FOUNDERS_SPOTS_REMAINING = 67;

// --- PAYMENT METHODS PAR PAYS ---
// ⚠️ Pays "scaffolded" (tz, ke, ug) : placeholders à remplacer par les vrais
// numéros opérateurs avant d'activer le pays en Firestore.
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
  // Placeholders Tanzania — à compléter avant activation
  tz: [
    { name: 'M-Pesa',        number: 'Contactez support',  icon: '📱' },
    { name: 'Airtel Money',  number: 'Contactez support',  icon: '📱' },
    { name: 'Tigo Pesa',     number: 'Contactez support',  icon: '📱' },
  ],
  // Placeholders Kenya
  ke: [
    { name: 'M-Pesa',        number: 'Contactez support',  icon: '📱' },
    { name: 'Airtel Money',  number: 'Contactez support',  icon: '📱' },
  ],
  // Placeholders Ouganda
  ug: [
    { name: 'MTN MoMo',      number: 'Contactez support',  icon: '📱' },
    { name: 'Airtel Money',  number: 'Contactez support',  icon: '📱' },
  ],
};

// --- SUPPORT WHATSAPP PAR PAYS ---
// ⚠️ Pays scaffolded : fallback sur le support BI tant que numéro local non fourni.
export const SUPPORT_WHATSAPP: Record<string, string> = {
  bi: '+25768515135',
  cd: '+243979055933',
  rw: '+25768515135',
  tz: '+25768515135', // PLACEHOLDER — remplacer par un numéro WhatsApp TZ
  ke: '+25768515135', // PLACEHOLDER — remplacer par un numéro WhatsApp KE
  ug: '+25768515135', // PLACEHOLDER — remplacer par un numéro WhatsApp UG
};

// --- PRIX D'ABONNEMENT PAR PAYS (defaults — admin peut modifier via Firestore) ---
// Prix mensuels (base). Les prix trimestriels (-10%) et annuels (-25%) sont
// calculés dynamiquement par getPeriodPrice() dans PlansPage.
// Keys : 'vendeur' / 'pro' / 'grossiste' (post-refonte). Le tier 'free' est
// toujours gratuit donc absent de la table.
export const DEFAULT_SUBSCRIPTION_PRICING: Record<string, SubscriptionPricing> = {
  bi: { prices: { vendeur: 9900,  pro: 29000, grossiste: 75000 }, currency: 'BIF' },
  cd: { prices: { vendeur: 6000,  pro: 19000, grossiste: 42000 }, currency: 'CDF' },
  rw: { prices: { vendeur: 2500,  pro: 7800,  grossiste: 17000 }, currency: 'RWF' },
  tz: { prices: { vendeur: 4500,  pro: 15500, grossiste: 34000 }, currency: 'TZS' },
  // Placeholders scaffolded — à ajuster aux marchés réels avant activation
  ke: { prices: { vendeur: 650,   pro: 2000,  grossiste: 5000   }, currency: 'KES' },
  ug: { prices: { vendeur: 18500, pro: 55500, grossiste: 140000 }, currency: 'UGX' },
};

// --- PRIX BOOST PAR PAYS (defaults — admin peut modifier via Firestore collection boostPricing) ---
// Équivalent ~1 USD partout. Modifiable dans Firebase Console : boostPricing/{countryId}
export const DEFAULT_BOOST_PRICING: Record<string, BoostPricing> = {
  bi: { amount: 5000, currency: 'BIF' },
  cd: { amount: 2500, currency: 'CDF' },
  rw: { amount: 1000, currency: 'RWF' },
  tz: { amount: 2600, currency: 'TZS' },
  ke: { amount: 130,  currency: 'KES' },
  ug: { amount: 3700, currency: 'UGX' },
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