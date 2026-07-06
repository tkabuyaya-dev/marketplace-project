/**
 * NUNULIA — Validation de numéros de téléphone par pays
 *
 * Centralisé : un seul lieu où définir, par pays :
 *  - le préfixe international (+257, +250...)
 *  - le nombre EXACT de chiffres attendus APRÈS le préfixe
 *  - un exemple visuel pour les placeholders
 *
 * Référence ITU 2026 (vérifié pour les 6 pays Grands Lacs + East Africa) :
 *  - 🇧🇮 Burundi   : +257 + 8 chiffres
 *  - 🇷🇼 Rwanda    : +250 + 9 chiffres
 *  - 🇨🇩 RDC       : +243 + 9 chiffres
 *  - 🇹🇿 Tanzanie  : +255 + 9 chiffres
 *  - 🇰🇪 Kenya     : +254 + 9 chiffres
 *  - 🇺🇬 Ouganda   : +256 + 9 chiffres
 *
 * Politique d'input strict :
 *  - L'utilisateur saisit UNIQUEMENT les chiffres locaux (pas de + ni de pays)
 *  - Si l'utilisateur tape un 0 en tête (ex: 079... au lieu de 79...) on le retire
 *    silencieusement — c'est l'erreur la plus fréquente, on la corrige sans frustrer
 *  - On retire tout ce qui n'est pas un chiffre (espaces, tirets, parenthèses)
 */

export interface PhoneSpec {
  dialCode: string;        // ex: "+257"
  digits: number;          // nombre exact de chiffres locaux requis
  placeholder: string;     // ex: "79 12 34 56"
  flag: string;            // pour les hints visuels
}

export const PHONE_SPECS: Record<string, PhoneSpec> = {
  bi: { dialCode: '+257', digits: 8, placeholder: '79 12 34 56',  flag: '🇧🇮' },
  rw: { dialCode: '+250', digits: 9, placeholder: '78 123 4567',  flag: '🇷🇼' },
  cd: { dialCode: '+243', digits: 9, placeholder: '99 123 4567',  flag: '🇨🇩' },
  tz: { dialCode: '+255', digits: 9, placeholder: '75 412 3456',  flag: '🇹🇿' },
  ke: { dialCode: '+254', digits: 9, placeholder: '71 234 5678',  flag: '🇰🇪' },
  ug: { dialCode: '+256', digits: 9, placeholder: '77 123 4567',  flag: '🇺🇬' },
};

const FALLBACK_SPEC: PhoneSpec = PHONE_SPECS.bi;

export function getPhoneSpec(countryId: string): PhoneSpec {
  return PHONE_SPECS[countryId] || FALLBACK_SPEC;
}

/**
 * Nettoie une saisie utilisateur : ne garde que les chiffres,
 * retire un éventuel 0 en tête (erreur fréquente : "079..." au lieu de "79...").
 * Ne retire PAS si l'utilisateur saisit déjà l'indicatif international par erreur
 * (ex: "+25779..." ou "25779...") — ces cas sont rares et détecter le préfixe
 * ajouterait de la complexité ambiguë.
 */
export function normalizeLocalDigits(raw: string): string {
  let cleaned = (raw || '').replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  return cleaned;
}

export interface PhoneValidationResult {
  valid: boolean;
  digits: string;            // chiffres normalisés
  required: number;          // nb requis pour ce pays
  missing: number;           // > 0 si trop court (digits manquants)
  extra: number;             // > 0 si trop long (digits en trop)
  fullNumber: string;        // dialCode + digits (ex: "+25779123456")
}

/**
 * Valide un numéro local pour un pays donné.
 * Retourne un objet riche : { valid, missing, extra, fullNumber, ... }
 * Le formulaire peut ainsi afficher "il manque X chiffres" en temps réel.
 */
export function validatePhone(countryId: string, raw: string): PhoneValidationResult {
  const spec = getPhoneSpec(countryId);
  const digits = normalizeLocalDigits(raw);
  const required = spec.digits;
  const missing = Math.max(0, required - digits.length);
  const extra = Math.max(0, digits.length - required);
  const valid = digits.length === required;
  return {
    valid,
    digits,
    required,
    missing,
    extra,
    fullNumber: spec.dialCode + digits,
  };
}

/**
 * Convertit un numéro stocké (quel que soit son format historique) en chiffres
 * E.164 prêts pour un lien wa.me — SANS le « + ».
 *
 * POURQUOI : `sellerWhatsapp` est un snapshot figé à la publication du produit.
 * Des données legacy (ou d'anciennes versions de l'app) ont pu stocker le numéro
 * en LOCAL, sans indicatif pays (ex: "69119242" au lieu de "+25769119242").
 * wa.me sur 8 chiffres → WhatsApp répond « numéro non valide ». On rajoute donc
 * l'indicatif du pays quand le numéro stocké est purement local.
 *
 * Retourne `null` si aucune interprétation plausible n'est possible.
 */
export function toWhatsAppDigits(raw: string, countryId?: string): string | null {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;

  // Déjà international : commence par un indicatif connu ET longueur cohérente
  // (indicatif + nombre exact de chiffres locaux). Le test de longueur évite
  // qu'un numéro local commençant par les mêmes chiffres qu'un indicatif soit
  // pris à tort pour un international.
  for (const spec of Object.values(PHONE_SPECS)) {
    const cc = spec.dialCode.slice(1); // "+257" → "257"
    if (digits.startsWith(cc) && digits.length === cc.length + spec.digits) {
      return digits;
    }
  }

  // Sinon on suppose un numéro LOCAL → on préfixe avec l'indicatif du pays.
  const spec = getPhoneSpec(countryId || 'bi');
  const cc = spec.dialCode.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1); // "079..." → "79..."
  if (digits.length === spec.digits) return cc + digits;

  // Cas ambigu (longueur inattendue) : si ça ressemble déjà à un E.164 plausible
  // (10–15 chiffres) on tente tel quel, sinon on abandonne proprement.
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/**
 * Format d'affichage léger : "79 12 34 56" — uniquement pour l'aperçu après saisie.
 * Pas un input mask : la saisie reste libre, on n'interfère pas avec le curseur.
 */
export function formatPhoneDisplay(countryId: string, digits: string): string {
  const spec = getPhoneSpec(countryId);
  const clean = normalizeLocalDigits(digits);
  if (spec.digits === 8) {
    // BI : XX XX XX XX
    return clean.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  // 9 chiffres : XX XXX XXXX
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)} ${clean.slice(2)}`;
  return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`;
}
