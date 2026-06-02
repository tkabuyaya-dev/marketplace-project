/**
 * NUNULIA — Photo Studio sessionId (Cloud Functions copy)
 *
 * ⚠️ MUST stay in sync with utils/sessionId.ts (frontend). Toute modification
 * de l'alphabet ou de la longueur doit être appliquée dans les deux fichiers.
 * Le frontend ne peut pas importer ce module et inversement (build TS séparé,
 * cf. functions/tsconfig.json "include": ["src"]).
 *
 * Alphabet sans ambigüité visuelle : pas de 0/O, 1/I/l. 32^6 ≈ 1 milliard.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 6;

/**
 * Génère un sessionId 6 chars depuis l'alphabet sans ambigüité.
 * Utilise crypto.randomBytes (CSPRNG Node — disponible sans import sur runtime).
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(LENGTH);
  // Node 18+ : globalThis.crypto.getRandomValues est disponible
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback ultra-conservateur — ne devrait jamais être atteint sur runtime Node 22.
    for (let i = 0; i < LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isValidSessionId(input: unknown): input is string {
  if (typeof input !== "string") return false;
  if (input.length !== LENGTH) return false;
  for (let i = 0; i < input.length; i++) {
    if (!ALPHABET.includes(input[i])) return false;
  }
  return true;
}
