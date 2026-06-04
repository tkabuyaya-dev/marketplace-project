/**
 * NUNULIA — Device fingerprint client (PWA)
 *
 * Génère un identifiant 16 chars stable pour un (navigateur, appareil). Utilisé
 * comme deuxième axe de rate-limit pour les buyer requests (en plus du numéro
 * WhatsApp). Persistance prioritaire IndexedDB → localStorage fallback :
 *  - IndexedDB survit aux nettoyages cookies/cache "léger"
 *  - localStorage = persistance bonus pour les navigateurs où IDB échoue
 *  - Si les deux échouent, on recalcule à chaque fois — même valeur tant que
 *    les caractéristiques navigateur n'ont pas changé.
 *
 * NB : Pas un identifiant cryptographiquement sécurisé. Un attaquant motivé
 * peut le contourner (Tor, navigateur jetable, modif User-Agent). Mais ça
 * bloque 95 % des abuseurs amateurs et révèle les patterns évidents.
 */

const DB_NAME = 'nunulia-device';
const STORE_NAME = 'fingerprint';
const KEY = 'deviceId';
const LS_KEY = 'nunulia_device_id_v1';

let cached: string | null = null;
let pending: Promise<string> | null = null;

/**
 * Hash 32-bit DJB2 → base36 → 16 chars. Stable et compact.
 * Pas crypto-secure : usage anti-spam, pas anti-forge.
 */
function hash16(input: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1) ^ c;
    h2 = ((h2 << 5) + h2) ^ c;
    h1 = h1 & 0xffffffff;
    h2 = h2 & 0xffffffff;
  }
  const part1 = Math.abs(h1).toString(36).padStart(7, '0').slice(0, 8);
  const part2 = Math.abs(h2).toString(36).padStart(7, '0').slice(0, 8);
  return (part1 + part2).slice(0, 16);
}

/** Caractéristiques stables du navigateur — base du fingerprint. */
function gatherSignals(): string {
  const parts: string[] = [];
  try {
    parts.push(navigator.userAgent || '');
    parts.push(navigator.language || '');
    parts.push(String(navigator.hardwareConcurrency ?? 0));
    parts.push(String(navigator.maxTouchPoints ?? 0));
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    // platform retiré : déprécié, certaines plateformes le bloquent
  } catch {
    parts.push('fallback');
  }
  return parts.join('|');
}

/** Tente d'ouvrir IndexedDB. Retourne null si indispo. */
function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // Safari ITP peut bloquer ouverture — timeout 800 ms
      setTimeout(() => resolve(null), 800);
    } catch {
      resolve(null);
    }
  });
}

async function readFromIdb(db: IDBDatabase): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY);
      req.onsuccess = () => {
        const val = req.result;
        resolve(typeof val === 'string' && val.length === 16 ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeToIdb(db: IDBDatabase, value: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function readFromLs(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return typeof v === 'string' && v.length === 16 ? v : null;
  } catch {
    return null;
  }
}

function writeToLs(value: string): void {
  try { localStorage.setItem(LS_KEY, value); } catch { /* quota */ }
}

/**
 * Retourne le deviceId, en le générant si nécessaire. Idempotent : appels
 * répétés renvoient la même valeur (cache mémoire après le premier appel).
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    // 1) Tente IDB
    const db = await openIdb();
    if (db) {
      const fromIdb = await readFromIdb(db);
      if (fromIdb) {
        // Mirror vers localStorage pour redondance
        writeToLs(fromIdb);
        cached = fromIdb;
        return fromIdb;
      }
    }

    // 2) Tente localStorage
    const fromLs = readFromLs();
    if (fromLs) {
      // Mirror vers IDB si possible
      if (db) await writeToIdb(db, fromLs);
      cached = fromLs;
      return fromLs;
    }

    // 3) Génère depuis le fingerprint navigateur
    const id = hash16(gatherSignals());
    if (db) await writeToIdb(db, id);
    writeToLs(id);
    cached = id;
    return id;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/**
 * Snapshot des métadonnées navigateur envoyées à la CF avec la soumission.
 * Permet à l'admin de voir, dans le dossier d'enquête, les caractéristiques
 * de l'appareil au moment de la création (user-agent, langue, timezone).
 */
export function getDeviceSnapshot(): {
  deviceId: Promise<string>;
  userAgent: string;
  language: string;
  timezone: string;
  screenSize: string;
} {
  let userAgent = '';
  let language = '';
  let timezone = '';
  let screenSize = '';
  try {
    userAgent = (navigator.userAgent || '').slice(0, 200);
    language = navigator.language || '';
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    screenSize = `${screen.width}x${screen.height}`;
  } catch { /* SSR fallback */ }

  return {
    deviceId: getDeviceId(),
    userAgent,
    language,
    timezone,
    screenSize,
  };
}
