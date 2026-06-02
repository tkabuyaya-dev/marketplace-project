/**
 * NUNULIA — Photo Studio sessionId utilities
 *
 * SessionId = 6 caractères tirés d'un alphabet sans ambigüité visuelle
 * (pas de 0/O, 1/I/l). Permet à un vendeur de recopier son ID au téléphone
 * sans erreur même sur un petit écran 240px.
 *
 * Espace = 32^6 ≈ 1,07 milliard. À 1000 sessions/jour pendant 10 ans (3,6 M),
 * probabilité de collision sur une nouvelle session ≈ 3.4e-3. La CF
 * photo-session-create.ts retry 3 fois en cas de collision (transaction).
 *
 * Note : ce module est utilisable côté front ET côté CFs (pas de dépendance
 * DOM/Firebase). Doublonner ailleurs serait une erreur.
 */

import { STUDIO_SESSION_ID_ALPHABET, STUDIO_SESSION_ID_LENGTH } from '../constants';

/**
 * Génère un sessionId aléatoire de 6 caractères depuis l'alphabet Studio.
 * Utilise crypto.getRandomValues (CSPRNG) — disponible sur tous navigateurs
 * modernes et Node 19+.
 */
export function generateSessionId(): string {
  const alphabet = STUDIO_SESSION_ID_ALPHABET;
  const length = STUDIO_SESSION_ID_LENGTH;
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : null;

  // CSPRNG path — chemin nominal
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) {
      // Modulo simple — biais théorique (256 % 32 = 0) → distribution uniforme
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  // Fallback Math.random (environnement legacy — ne devrait jamais arriver
  // en prod ; gardé pour ne pas crasher en SSR/test exotique).
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Valide qu'une chaîne est un sessionId Studio bien formé.
 * Utile dans les Rules CFs et dans la page /studio/:id avant tout fetch.
 */
export function isValidSessionId(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  if (input.length !== STUDIO_SESSION_ID_LENGTH) return false;
  for (let i = 0; i < input.length; i++) {
    if (!STUDIO_SESSION_ID_ALPHABET.includes(input[i])) return false;
  }
  return true;
}

/**
 * Normalise un sessionId saisi à la main (upper-case + trim) — l'utilisateur
 * peut taper en minuscules ou avec un espace avant/après ; on accepte si la
 * forme normalisée est valide.
 */
export function normalizeSessionId(input: string): string | null {
  const cleaned = input.trim().toUpperCase();
  return isValidSessionId(cleaned) ? cleaned : null;
}
