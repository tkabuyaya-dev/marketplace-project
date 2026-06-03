/**
 * NUNULIA — WhatsApp Business — Source de vérité unique.
 *
 * Tous les liens WhatsApp NUNULIA officiels doivent passer par `buildWaUrl`.
 * Les liens user↔user (acheteur→vendeur, vendeur→acheteur, admin→user)
 * passent aussi par `buildWaUrl(message, { phone })` pour cohérence.
 *
 * En cas de changement du numéro officiel :
 *   1. Modifier ce fichier (frontend PWA)
 *   2. Modifier `functions/src/config.ts` → `STUDIO_DEFAULT_WHATSAPP`
 *      (backend = bundle séparé, pas d'import cross-package)
 *   3. Mettre à jour Firestore `appSettings/studio.whatsappNumber`
 *      (override CF lu en priorité, sans redéploiement)
 *   4. Mettre à jour le compte WhatsApp Business (SIM, profil, lien court)
 */

export const NUNULIA_WHATSAPP = {
  /** Format E.164 — affichage humain, validation, profils légaux */
  e164: '+25761653000',
  /** Format wa.me (chiffres seuls) — construction des liens */
  waMe: '25761653000',
  /** Email officiel — référence croisée pour CGU / Privacy / Safety */
  email: 'contact@nunulia.com',
} as const;

/**
 * Builder unique pour TOUS les liens WhatsApp.
 *   - `buildWaUrl()` ......................... numéro NUNULIA, sans message
 *   - `buildWaUrl(msg)` ...................... numéro NUNULIA + message
 *   - `buildWaUrl(msg, { phone })` ........... numéro dynamique (user↔user)
 *
 * Le message est URL-encodé automatiquement. Le `phone` accepte n'importe
 * quel format (avec +, espaces, tirets) : seuls les chiffres sont conservés.
 */
export function buildWaUrl(message?: string, opts?: { phone?: string }): string {
  const digits = opts?.phone
    ? opts.phone.replace(/[^0-9]/g, '')
    : NUNULIA_WHATSAPP.waMe;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
