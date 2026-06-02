/**
 * NUNULIA — Studio Watermark Helper
 *
 * Applique un overlay watermark Cloudinary URL-side (zéro stockage neuf,
 * zéro coût marginal — Cloudinary fait la transformation à la volée).
 *
 * Stratégie gradient par plan (élévation visuelle du badge) :
 *   - Free / Vendeur : logo blanc 60% opacité, taille standard
 *   - Pro            : logo doré 70% opacité, légèrement plus grand
 *   - Grossiste      : logo diamant 75% opacité, taille premium
 *
 * Pré-requis Phase 7 (à uploader sur Cloudinary AVANT activation prod) :
 *   - asset `studio/logo_white`  (PNG transparent ~200×80)
 *   - asset `studio/logo_gold`   (PNG transparent ~200×80)
 *   - asset `studio/logo_diamond` (PNG transparent ~200×80)
 *
 * En attendant que les logos soient uploadés (Phase 7), `getWatermarkedUrl()`
 * agit comme un PASS-THROUGH : retourne l'URL inchangée. Aucune erreur, aucun
 * placeholder cassé — les photos Studio s'affichent normalement sans
 * watermark, comme n'importe quelle autre photo produit.
 *
 * Pour activer Phase 7 : ajouter les publicIds dans WATERMARK_LOGOS ci-dessous.
 */

import { PlanId } from '../types';

/**
 * publicId Cloudinary des assets watermark par plan. Vides tant que les
 * assets ne sont pas uploadés — la fonction tombe en pass-through.
 *
 * Mise à jour Phase 7 :
 *   free:     'studio/logo_white',
 *   vendeur:  'studio/logo_white',
 *   pro:      'studio/logo_gold',
 *   grossiste:'studio/logo_diamond',
 */
const WATERMARK_LOGOS: Record<PlanId, string> = {
  free:      '',
  vendeur:   '',
  pro:       '',
  grossiste: '',
};

/** Paramètres visuels par plan (opacité + largeur en px). */
const WATERMARK_STYLE: Record<PlanId, { opacity: number; width: number }> = {
  free:      { opacity: 60, width: 180 },
  vendeur:   { opacity: 60, width: 180 },
  pro:       { opacity: 70, width: 200 },
  grossiste: { opacity: 75, width: 220 },
};

/**
 * Applique le watermark Cloudinary sur une URL produit Studio.
 *
 * Pass-through si :
 *   - URL non-Cloudinary
 *   - Plan inconnu
 *   - Logo non configuré pour ce plan (Phase 7 pas encore activée)
 *   - URL malformée (pas de segment `/upload/`)
 *
 * @param cloudinaryUrl — URL Cloudinary native (avec ou sans transformations existantes)
 * @param plan — plan du vendeur au moment de la publication (snapshot dans products.viaStudio)
 * @returns URL avec overlay watermark, ou URL d'origine si pas applicable
 *
 * @example
 *   const watermarked = getWatermarkedUrl(product.images[0], 'pro');
 *   <img src={watermarked} alt={...} />
 */
export function getWatermarkedUrl(cloudinaryUrl: string, plan: PlanId): string {
  if (!cloudinaryUrl) return cloudinaryUrl;
  if (!cloudinaryUrl.includes('cloudinary.com')) return cloudinaryUrl;

  const logoId = WATERMARK_LOGOS[plan];
  if (!logoId) return cloudinaryUrl; // Phase 7 pas encore activée — pass-through

  // Injection dans le segment de transformations Cloudinary.
  // Format final : .../upload/<existing-transforms>/l_<logoId>,o_<opacity>,g_south_east,w_<width>/<rest>
  const parts = cloudinaryUrl.split('/upload/');
  if (parts.length !== 2) return cloudinaryUrl; // URL malformée

  const style = WATERMARK_STYLE[plan];
  // Cloudinary remplace les "/" du publicId par ":" dans la transformation overlay.
  const safeLogoId = logoId.replace(/\//g, ':');
  const overlay = `l_${safeLogoId},o_${style.opacity},g_south_east,w_${style.width}`;

  return `${parts[0]}/upload/${overlay}/${parts[1]}`;
}

/**
 * true si le watermark est actuellement configuré pour ce plan (utile pour
 * conditional rendering d'un badge "📸 Studio" si on ne veut afficher le
 * marker que quand le watermark visuel est aussi présent).
 *
 * Tant que Phase 7 n'est pas livrée, retourne `false` pour tous les plans.
 */
export function hasWatermark(plan: PlanId): boolean {
  return !!WATERMARK_LOGOS[plan];
}
