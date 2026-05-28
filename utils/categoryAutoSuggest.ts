/**
 * NUNULIA — Smart Category Auto-Suggester
 *
 * À partir du titre tapé par l'acheteur, on devine la catégorie la plus probable
 * et on l'affiche en suggestion dorée AU-DESSUS du grid de tiles.
 *
 * Stratégie : dictionnaire multilingue (FR + Kirundi + Kinyarwanda + Swahili).
 * Match : longest keyword wins, min 4 chars pour éviter les faux positifs.
 *
 * Si aucun match → null → le buyer voit le grid sans suggestion (ou tape "Je ne sais pas
 * trop" → l'IA backend prend le relais via la CF onBuyerRequestMatch).
 */

/** Slug réservé — l'acheteur dit "Je ne sais pas trop" → IA backend décide. */
export const HELP_CATEGORY_SLUG = '_help';

/**
 * Dictionnaire keyword → category slug.
 *
 * Couverture cible : 90% des demandes typées au Burundi/Rwanda/RDC dans l'une des
 * 4 langues majoritaires. Le reste est rattrapé côté backend par Claude Haiku
 * (multilingue natif).
 *
 * Convention :
 * - Tout en minuscules, sans accents (le matcher normalise pareil)
 * - Mots ≥ 4 caractères pour éviter les faux matchs
 * - Ordre indifférent — le matcher prend le plus long
 */
const KEYWORDS: Record<string, string[]> = {
  'electronique-telephonie': [
    // FR
    'telephone', 'portable', 'smartphone', 'tablette', 'ordinateur', 'laptop',
    'television', 'ecran', 'casque', 'ecouteur', 'chargeur', 'cable', 'powerbank',
    'batterie', 'enceinte', 'projecteur', 'console', 'manette',
    // Marques
    'iphone', 'samsung', 'tecno', 'itel', 'infinix', 'huawei', 'xiaomi', 'oppo',
    'nokia', 'lenovo', 'macbook', 'ipad', 'galaxy', 'redmi', 'honor',
    // Kirundi / Kinyarwanda
    'telefone', 'mudasobwa', 'amashanyarazi',
    // Swahili
    'simu', 'kompyuta', 'redio', 'televisheni',
  ],

  'mode-accessoires': [
    // FR
    'robe', 'chemise', 'chemisier', 'pantalon', 'jupe', 'short', 'jean', 'jeans',
    'tshirt', 'tee-shirt', 'pull', 'pull-over', 'veste', 'manteau', 'blouson',
    'costume', 'tailleur', 'cravate', 'ceinture', 'chaussure', 'chaussures',
    'sandale', 'basket', 'sneaker', 'talon', 'escarpin', 'mocassin', 'botte',
    'sac', 'pochette', 'portefeuille', 'sacoche', 'montre', 'bracelet',
    'collier', 'bague', 'boucle', 'lunettes', 'chapeau', 'casquette', 'foulard',
    'echarpe', 'gants', 'culotte', 'soutien-gorge', 'pagne', 'boubou',
    // Kirundi / Kinyarwanda
    'impuzu', 'inkweto', 'agakoti', 'ikoti', 'ikanzu', 'imyenda', 'umupira',
    // Swahili
    'nguo', 'viatu', 'mavazi', 'kofia', 'mkoba',
  ],

  'beaute-sante': [
    // FR
    'parfum', 'eau de toilette', 'creme', 'lotion', 'rouge a levres', 'rouge',
    'mascara', 'fond de teint', 'poudre', 'fard', 'vernis', 'shampoing',
    'shampooing', 'apres-shampoing', 'gel', 'huile', 'masque', 'serum',
    'savon', 'deodorant', 'dentifrice', 'brosse a dents', 'perruque', 'meche',
    'tresse', 'extension', 'medicament', 'vitamine', 'complement',
    // Marques
    'chanel', 'dior', 'gucci', 'guerlain', 'venesime', 'lancome', 'nivea',
    // Kirundi / Kinyarwanda
    'isabune', 'amavuta', 'umuti', 'imisatsi',
    // Swahili
    'sabuni', 'mafuta', 'dawa', 'manukato',
  ],

  'restaurant': [
    // FR
    'restaurant', 'traiteur', 'repas', 'plat', 'menu', 'cuisine', 'livraison',
    'commande', 'buffet', 'mariage', 'fete', 'anniversaire', 'cocktail',
    'gateau', 'patisserie', 'boulangerie', 'pain', 'sandwich', 'pizza',
    'brochette', 'poulet', 'poisson', 'viande', 'frites', 'jus', 'cafe',
    // Kirundi / Kinyarwanda
    'ibiryo', 'inyama', 'inkoko', 'amafi',
    // Swahili
    'chakula', 'chai', 'nyama', 'samaki', 'mkate',
  ],

  'supermarche-alimentaire': [
    // FR
    'epicerie', 'supermarche', 'courses', 'riz', 'haricot', 'farine', 'sucre',
    'sel', 'huile', 'tomate', 'oignon', 'pomme de terre', 'patate',
    'banane', 'mangue', 'orange', 'ananas', 'avocat', 'igname', 'manioc',
    'lait', 'yaourt', 'fromage', 'beurre', 'oeuf', 'oeufs', 'biscuit',
    'chocolat', 'bonbon', 'eau minerale', 'jus', 'biere', 'soda',
    // Kirundi / Kinyarwanda
    'umuceri', 'ibitumbula', 'ibijumba', 'ibijuva', 'amazi', 'amata',
    // Swahili
    'mchele', 'maharagwe', 'unga', 'sukari', 'chumvi', 'maziwa',
  ],

  'maison-cuisine': [
    // FR
    'meuble', 'meubles', 'canape', 'fauteuil', 'chaise', 'table', 'lit',
    'matelas', 'armoire', 'commode', 'etagere', 'bibliotheque', 'tapis',
    'rideau', 'rideaux', 'couette', 'drap', 'oreiller', 'coussin',
    'cuisiniere', 'gaziniere', 'four', 'micro-onde', 'frigo', 'refrigerateur',
    'congelateur', 'casserole', 'poele', 'marmite', 'assiette', 'verre',
    'tasse', 'fourchette', 'couteau', 'cuillere', 'decoration',
    // Kirundi / Kinyarwanda
    'intebe', 'imeza', 'igitanda', 'inkono', 'amasahane',
    // Swahili
    'kiti', 'meza', 'kitanda', 'jiko', 'sufuria', 'sahani',
  ],

  'bebe-enfants': [
    // FR
    'bebe', 'enfant', 'enfants', 'biberon', 'couche', 'couches', 'poussette',
    'berceau', 'doudou', 'peluche', 'jouet', 'jouets', 'jeu', 'puzzle',
    'lego', 'poupee', 'voiture jouet', 'velo enfant', 'tetine', 'lait bebe',
    'tirelire', 'cartable', 'cahier ecole',
    // Kirundi / Kinyarwanda
    'umwana', 'abana', 'amata yumwana',
    // Swahili
    'mtoto', 'watoto', 'maziwa ya mtoto',
  ],

  'sport-loisirs': [
    // FR
    'sport', 'football', 'foot', 'basketball', 'basket', 'volleyball', 'tennis',
    'rugby', 'velo', 'bicyclette', 'natation', 'piscine', 'fitness',
    'musculation', 'halteres', 'tapis de course', 'survetement', 'jogging',
    'gymnastique', 'yoga', 'randonnee', 'camping', 'tente', 'guitare',
    'piano', 'instrument', 'livre', 'roman', 'magazine',
    // Kirundi / Kinyarwanda
    'umupira', 'ikinamico',
    // Swahili
    'mpira', 'baiskeli', 'kitabu', 'michezo',
  ],

  'education-fournitures': [
    // FR
    'cahier', 'cahiers', 'stylo', 'crayon', 'gomme', 'regle', 'calculatrice',
    'sac a dos', 'cartable', 'classeur', 'agenda', 'manuel', 'livre scolaire',
    'dictionnaire', 'bible', 'coran', 'formation', 'cours', 'tutorat',
    'professeur', 'repetition', 'inscription', 'universite', 'ecole',
    // Kirundi / Kinyarwanda
    'igitabo', 'amafaranga yo kwiga', 'ishuri',
    // Swahili
    'kitabu', 'kalamu', 'shule', 'masomo',
  ],

  'construction-btp': [
    // FR
    'ciment', 'brique', 'briques', 'sable', 'gravier', 'fer', 'fer a beton',
    'tole', 'tuile', 'planche', 'bois construction', 'peinture', 'carrelage',
    'beton', 'parpaing', 'plomberie', 'tuyau', 'robinet', 'evier',
    'douche', 'wc', 'toilette', 'electricien', 'macon', 'plombier',
    'menuisier', 'soudure', 'echafaudage',
    // Kirundi / Kinyarwanda
    'amabuye', 'imisozi', 'ibyumba',
    // Swahili
    'saruji', 'mawe', 'mchanga', 'mbao',
  ],

  'auto-moto': [
    // FR
    'voiture', 'auto', 'automobile', 'moto', 'motocyclette', 'velomoteur',
    'camion', 'camionnette', 'bus', 'minibus', 'taxi', 'pickup',
    'pneu', 'pneus', 'jante', 'batterie auto', 'huile moteur', 'pare-brise',
    'phare', 'feu', 'retroviseur', 'embrayage', 'frein', 'freins',
    'amortisseur', 'echappement', 'reservoir', 'carburateur', 'pompe',
    // Marques
    'toyota', 'nissan', 'mercedes', 'bmw', 'honda', 'suzuki', 'yamaha',
    'kawasaki', 'noah', 'rav4', 'corolla', 'probox', 'hilux',
    // Kirundi / Kinyarwanda
    'imodoka', 'pikipiki',
    // Swahili
    'gari', 'pikipiki', 'lori', 'basi',
  ],

  'energie-solaire': [
    // FR
    'panneau solaire', 'panneaux', 'solaire', 'photovoltaique', 'onduleur',
    'batterie solaire', 'lampe solaire', 'kit solaire', 'energie solaire',
    'generateur', 'groupe electrogene', 'inverter', 'chauffe-eau solaire',
    'pompe solaire', 'eclairage', 'ampoule led', 'led',
    // Kirundi / Kinyarwanda
    'izuba',
    // Swahili
    'sola', 'jua', 'umeme',
  ],

  'agriculture-elevage': [
    // FR
    'semence', 'semences', 'graine', 'graines', 'engrais', 'pesticide',
    'tracteur', 'houe', 'machette', 'arrosoir', 'serre agricole',
    'volaille', 'poule', 'coq', 'poussin', 'oeuf de couvee',
    'vache', 'bovin', 'chevre', 'mouton', 'porc', 'cochon', 'lapin',
    'aliment betail', 'mais', 'sorgho', 'haricots',
    // Kirundi / Kinyarwanda
    'inka', 'ihene', 'intama', 'ingurube', 'imbuto', 'ifumbire', 'urusoso',
    // Swahili
    'mbegu', 'mbolea', 'ng\'ombe', 'mbuzi', 'kondoo', 'kuku',
  ],

  'services': [
    // FR
    'reparation', 'reparer', 'depannage', 'installation', 'pose', 'demenagement',
    'transport', 'livraison express', 'coursier', 'menage', 'nettoyage',
    'lessive', 'pressing', 'lavage auto', 'lavage voiture', 'mecanicien',
    'electricien', 'plombier', 'soudeur', 'couturier', 'couture',
    'coiffure', 'coiffeur', 'manucure', 'massage', 'photographe',
    'photographie', 'video', 'mariage organisation', 'evenement',
    'comptable', 'avocat', 'consultant', 'formation professionnelle',
    'cours particulier', 'baby-sitting', 'garde enfant', 'jardinage',
    // Kirundi / Kinyarwanda
    'gusana', 'gukoresha',
    // Swahili
    'usafi', 'kurekebisha', 'usafiri',
  ],
};

/** Strip accents (NFD normalization) — needed for FR matching. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Suggère une catégorie en analysant le titre.
 *
 * @returns slug de catégorie ou null si aucun match suffisamment fort.
 *
 * Algo : pour chaque mot-clé du dictionnaire, vérifie s'il apparaît comme
 * sous-chaîne du titre normalisé. Le mot-clé LE PLUS LONG gagne (ex: si
 * "samsung galaxy" et "galaxy" matchent tous deux, on prend le 1er → plus
 * spécifique). Minimum 4 caractères pour éviter "the", "for", etc.
 */
export function suggestCategory(title: string): string | null {
  const trimmed = (title || '').trim();
  if (trimmed.length < 3) return null;

  const norm = normalize(trimmed);
  let bestSlug: string | null = null;
  let bestLen = 0;

  for (const [slug, words] of Object.entries(KEYWORDS)) {
    for (const word of words) {
      if (word.length < 4) continue;
      if (norm.includes(word) && word.length > bestLen) {
        bestSlug = slug;
        bestLen = word.length;
      }
    }
  }

  return bestSlug;
}
