/**
 * Brand dictionary for SmartTitleInput autocomplete.
 *
 * Structure:
 *   BRANDS_BY_SUBCATEGORY — precise match (takes priority when a subcategory is selected)
 *   BRANDS_BY_CATEGORY    — fallback when only the parent category is selected
 *
 * Keys must match:
 *   - Subcategory strings from INITIAL_CATEGORIES (constants.ts)
 *   - Category IDs from INITIAL_CATEGORIES (e.g. 'electronique-telephonie')
 *
 * An empty array means "no brand suggestions for this context" (food, agriculture…).
 * This is intentional — do not add brands to those categories.
 *
 * Maintenance: add new entries as you observe recurring misspellings in Firestore.
 */

// ── Subcategory-level (precise) ──────────────────────────────────────────────

export const BRANDS_BY_SUBCATEGORY: Record<string, string[]> = {

  // ── Électronique & Téléphonie ─────────────────────────────────────────────
  'Smartphones': [
    'Apple iPhone', 'Samsung Galaxy', 'Tecno', 'Infinix', 'Itel',
    'Huawei', 'Xiaomi', 'Redmi', 'Nokia', 'Oppo', 'Vivo',
    'Realme', 'OnePlus', 'Google Pixel', 'Motorola',
  ],
  'Accessoires Téléphone': [
    'Apple', 'Samsung', 'Anker', 'Baseus', 'Spigen', 'Xiaomi',
    'Ugreen', 'Belkin', 'Huawei',
  ],
  'Audio & Casques': [
    'JBL', 'Sony', 'Samsung', 'Apple AirPods', 'Anker Soundcore',
    'Jabra', 'Bose', 'Xiaomi', 'Haylou', 'QCY', 'Huawei FreeBuds',
    'Sennheiser', 'Marshall',
  ],
  'Ordinateurs Portables': [
    'HP', 'Dell', 'Lenovo', 'Asus', 'Acer',
    'Apple MacBook', 'Samsung', 'MSI', 'Toshiba', 'Huawei MateBook',
  ],
  'PC Bureau & Écrans': [
    'HP', 'Dell', 'Lenovo', 'Asus', 'Samsung', 'LG', 'Philips', 'Acer',
  ],
  'Tablettes': [
    'Apple iPad', 'Samsung Galaxy Tab', 'Lenovo', 'Huawei MatePad',
    'Amazon Fire', 'Xiaomi Pad',
  ],
  'TV & Home Cinéma': [
    'Samsung', 'LG', 'Sony', 'Hisense', 'TCL',
    'Skyworth', 'Panasonic', 'Philips', 'Sharp',
  ],
  'Photo & Vidéo': [
    'Canon', 'Nikon', 'Sony', 'Fujifilm', 'GoPro', 'DJI', 'Olympus',
  ],
  'Gaming & Consoles': [
    'PlayStation', 'Xbox', 'Nintendo Switch', 'Sony',
  ],
  'Imprimantes & Encre': [
    'HP', 'Canon', 'Epson', 'Brother', 'Samsung',
  ],
  'Composants PC': [
    'Intel', 'AMD', 'Nvidia', 'Kingston', 'Samsung', 'Western Digital', 'Seagate',
  ],
  'Stockage (USB/HDD/SSD)': [
    'Samsung', 'SanDisk', 'Kingston', 'Western Digital', 'Seagate',
    'Toshiba', 'Lexar',
  ],
  'Réseaux & Wifi': [
    'TP-Link', 'Huawei', 'Xiaomi', 'Cisco', 'Netgear', 'D-Link',
  ],
  'Drones': [
    'DJI', 'Parrot', 'Autel',
  ],
  'Maison Connectée': [
    'Xiaomi', 'Samsung SmartThings', 'Google Nest', 'Amazon Echo', 'TP-Link Kasa',
  ],
  'Électroménager léger': [
    'Samsung', 'LG', 'Philips', 'Moulinex', 'Brandt', 'Midea', 'Hisense', 'Bosch',
  ],

  // ── Mode & Accessoires ────────────────────────────────────────────────────
  'Chaussures': [
    'Nike', 'Adidas', 'Puma', 'New Balance', 'Converse', 'Vans',
    'Reebok', 'Under Armour', 'Jordan', 'Timberland', 'Fila',
  ],
  'Montres': [
    'Casio', 'Samsung Galaxy Watch', 'Apple Watch', 'Huawei Watch',
    'Seiko', 'Swatch', 'Tissot', 'Rolex',
  ],
  'Sacs à main & Bagages': [
    'Louis Vuitton', 'Gucci', 'Michael Kors', 'Prada',
    'Chanel', 'Coach', 'Samsonite',
  ],
  'Lunettes de soleil': [
    'Ray-Ban', 'Oakley', 'Gucci', 'Police', 'Versace',
  ],
  'Homme': [
    'Zara', 'H&M', 'Lacoste', 'Ralph Lauren', 'Tommy Hilfiger',
    'Calvin Klein', "Levi's", 'Gucci', 'Armani',
  ],
  'Femme': [
    'Zara', 'H&M', 'Shein', 'Gucci', 'Chanel', 'Versace',
    'Ralph Lauren', 'Calvin Klein',
  ],
  'Enfant': [
    'Zara Kids', 'H&M Kids', 'Nike Kids', 'Adidas Kids',
  ],

  // ── Beauté & Santé ────────────────────────────────────────────────────────
  'Soins Visage': [
    'Nivea', "L'Oréal Paris", 'Garnier', 'Neutrogena', 'Dove',
    'Vaseline', 'Olay', "Pond's", 'Clean & Clear', 'Cetaphil',
    'Vichy', "La Roche-Posay",
  ],
  'Soins du Corps': [
    'Nivea', 'Vaseline', 'Dove', 'Jergens', "Palmer's",
    'Carotone', 'Glow & Lovely', 'Caro White', 'Shea Moisture',
  ],
  'Produits Capillaires': [
    'Pantene', 'Head & Shoulders', 'Dove', 'TRESemmé', 'Garnier Fructis',
    'Dark & Lovely', 'Cantu', 'ORS Olive Oil', "Africa's Best",
    'SoftSheen-Carson', 'Kerastase',
  ],
  'Huiles Naturelles': [
    "L'Occitane", 'Shea Moisture', 'Bio Oil', 'Moroccanoil',
  ],
  'Parfums': [
    'Dior', 'Chanel', 'Versace', 'Hugo Boss', 'Armani', 'Lacoste',
    'Axe', 'Yves Saint Laurent', 'Calvin Klein', 'Guerlain',
    'Gucci', 'Paco Rabanne', 'Davidoff',
  ],
  'Maquillage': [
    'MAC', 'Maybelline', "L'Oréal", 'NYX', 'Fenty Beauty',
    'Black Opal', 'CoverGirl', 'Rimmel', 'e.l.f.',
  ],
  'Hygiène & Santé': [
    'Colgate', 'Oral-B', 'Dove', 'Nivea', 'Dettol',
    'Lifebuoy', 'Always', 'Kotex',
  ],
  'Barbe & Homme': [
    'Gillette', 'Wilkinson', 'Nivea Men', 'Old Spice', 'Braun',
  ],
  'Onglerie & Vernis': [
    'OPI', 'Sally Hansen', "Essie", 'China Glaze',
  ],
  'Compléments alimentaires': [
    'Centrum', 'Nature Made', 'Nutrilite', 'GNC',
  ],

  // ── Maison & Cuisine ──────────────────────────────────────────────────────
  'Petit électroménager': [
    'Samsung', 'LG', 'Philips', 'Moulinex', 'Brandt',
    'Midea', 'Hisense', 'Bosch', 'Tefal', 'Kenwood',
  ],

  // ── Auto & Moto ───────────────────────────────────────────────────────────
  'Pièces détachées': [
    'Toyota', 'Honda', 'Suzuki', 'Yamaha', 'Nissan',
    'Peugeot', 'Kia', 'Hyundai', 'Mercedes-Benz', 'BMW',
  ],
  'Accessoires': [
    'Toyota', 'Honda', 'Suzuki', 'Bosch', 'Hella', '3M',
  ],
  'Pneus': [
    'Michelin', 'Bridgestone', 'Goodyear', 'Continental',
    'Pirelli', 'Dunlop', 'Yokohama',
  ],
};

// ── Category-level fallback ───────────────────────────────────────────────────
// Shown when no subcategory is selected yet.
// Should be the most common/generic brands for that category.

export const BRANDS_BY_CATEGORY: Record<string, string[]> = {
  'electronique-telephonie': [
    'Apple iPhone', 'Samsung', 'Tecno', 'Infinix', 'Itel',
    'Huawei', 'Xiaomi', 'HP', 'Dell', 'Lenovo', 'Sony', 'LG',
    'JBL', 'Hisense', 'TCL', 'Canon', 'Nokia',
  ],
  'mode-accessoires': [
    'Nike', 'Adidas', 'Puma', 'Zara', 'H&M', 'Lacoste',
    'Casio', 'Converse', 'New Balance', "Levi's",
  ],
  'beaute-sante': [
    'Nivea', "L'Oréal Paris", 'Garnier', 'Dove', 'Vaseline',
    'Pantene', 'Dior', 'Chanel', 'Maybelline', 'Dettol',
  ],
  'maison-cuisine': [
    'Samsung', 'LG', 'Philips', 'Moulinex', 'Tefal', 'Bosch', 'Midea',
  ],
  'auto-moto': [
    'Toyota', 'Honda', 'Suzuki', 'Yamaha', 'BMW',
    'Mercedes-Benz', 'Peugeot', 'Nissan', 'Michelin', 'Bridgestone',
  ],

  // Categories with no brand concept — intentionally empty
  'restaurant':               [],
  'supermarche-alimentaire':  [],
  'bebe-enfants':             [],
  'construction-btp':         [],
  'agriculture-elevage':      [],
  'services':                 [],
};

// ── Public helper ─────────────────────────────────────────────────────────────

/**
 * Returns the relevant brand list for a given category/subcategory context.
 * Subcategory takes priority over category-level fallback.
 * Returns an empty array when no brands apply (food, agriculture, etc.).
 */
export function getBrandsForContext(
  categoryId?: string,
  subCategory?: string,
): string[] {
  if (subCategory) {
    const sub = BRANDS_BY_SUBCATEGORY[subCategory];
    if (sub !== undefined) return sub;
  }
  if (categoryId) {
    return BRANDS_BY_CATEGORY[categoryId] ?? [];
  }
  return [];
}
