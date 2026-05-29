/**
 * NUNULIA — Description Templates (per category)
 *
 * Generates structured product descriptions from title + category.
 * 100% client-side, no API calls.
 */

const TEMPLATES: Record<string, (title: string, price?: string) => string> = {
  'tech': (t, p) =>
    `${t}\n\nProduit electronique disponible sur Nunulia.\n\nCaracteristiques :\n- Etat : [Neuf / Occasion]\n- Garantie : [Oui / Non]\n- Accessoires inclus : [Chargeur, cable...]\n\nContactez le vendeur pour plus de details sur les specifications techniques.${p ? `\n\nPrix : ${p}` : ''}`,

  'fashion': (t, p) =>
    `${t}\n\nArticle de mode disponible sur Nunulia.\n\nDetails :\n- Taille : [S / M / L / XL]\n- Couleur : [Preciser]\n- Matiere : [Coton, polyester...]\n- Etat : [Neuf / Porte une fois / Occasion]\n\nLivraison possible. Contactez le vendeur.${p ? `\n\nPrix : ${p}` : ''}`,

  'beauty': (t, p) =>
    `${t}\n\nProduit de beaute disponible sur Nunulia.\n\nInformations :\n- Type : [Soin, maquillage, parfum...]\n- Marque : [Preciser]\n- Contenance : [ml / g]\n- Date d'expiration : [Preciser]\n\nProduit authentique. Contactez le vendeur pour les details.${p ? `\n\nPrix : ${p}` : ''}`,

  'home': (t, p) =>
    `${t}\n\nArticle pour la maison disponible sur Nunulia.\n\nDetails :\n- Dimensions : [Preciser]\n- Materiau : [Bois, metal, plastique...]\n- Etat : [Neuf / Occasion]\n- Couleur : [Preciser]\n\nLivraison disponible selon la zone.${p ? `\n\nPrix : ${p}` : ''}`,

  'food': (t, p) =>
    `${t}\n\nProduit alimentaire disponible sur Nunulia.\n\nInformations :\n- Quantite : [kg / litres / pieces]\n- Origine : [Locale / Importee]\n- Conservation : [Frais / Sec / Congele]\n- Date limite : [Preciser]\n\nCommandez et recuperez chez le vendeur.${p ? `\n\nPrix : ${p}` : ''}`,

  'auto': (t, p) =>
    `${t}\n\nPiece / vehicule disponible sur Nunulia.\n\nSpecifications :\n- Marque : [Preciser]\n- Modele compatible : [Preciser]\n- Etat : [Neuf / Occasion]\n- Annee : [Preciser]\n\nContactez le vendeur pour essai ou verification.${p ? `\n\nPrix : ${p}` : ''}`,

  'services': (t, p) =>
    `${t}\n\nService professionnel disponible sur Nunulia.\n\nDetails :\n- Type : [Preciser le service]\n- Zone couverte : [Bujumbura, tout le pays...]\n- Disponibilite : [Lundi-Vendredi, 7j/7...]\n- Experience : [X annees]\n\nContactez directement pour un devis personnalise.${p ? `\n\nA partir de : ${p}` : ''}`,

  'default': (t, p) =>
    `${t}\n\nProduit disponible sur Nunulia Marketplace.\n\nDetails :\n- Etat : [Neuf / Occasion]\n- Disponibilite : Immediate\n\nContactez le vendeur pour plus d'informations et pour organiser la livraison ou le retrait.${p ? `\n\nPrix : ${p}` : ''}`,
};

// Map category slugs (les 17 actuels) vers les 7 templates disponibles.
// Les slugs non listés tombent sur 'default'. Ce fallback ne sert que si l'IA est down.
const CATEGORY_MAP: Record<string, string> = {
  // Templates spécifiques
  'electronique-telephonie': 'tech',
  'mode-accessoires':        'fashion',
  'beaute-sante':            'beauty',
  'restaurant':              'food',
  'supermarche-alimentaire': 'food',
  'maison-cuisine':          'home',
  'auto-moto':               'auto',
  'services':                'services',
  // Slugs qui retombent sur le template générique (acceptable en V1)
  'bebe-enfants':            'default',
  'sport-loisirs':           'default',
  'education-fournitures':   'default',
  'construction-btp':        'default',
  'energie-solaire':         'default',
  'agriculture-elevage':     'default',
  'immobilier':              'default',
  'emploi-recrutement':      'default',
  'evenements-ceremonies':   'default',
};

/**
 * Generate a structured description template from title and category.
 */
export function generateDescription(
  title: string,
  categoryId: string,
  price?: string,
): string {
  const key = CATEGORY_MAP[categoryId.toLowerCase()] || 'default';
  const template = TEMPLATES[key] || TEMPLATES['default'];
  return template(title.trim(), price);
}
