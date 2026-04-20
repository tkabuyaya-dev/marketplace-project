/**
 * NUNULIA — Firebase Configuration (Production-Grade)
 *
 * Architecture:
 * - Firestore v9 modular API avec persistance IndexedDB (offline support)
 * - Auth persistante via localStorage (reconnexion automatique)
 * - Multi-tab safe via firestore persistenceSettings
 *
 * Performance:
 * - firebase/functions et firebase/app-check sont chargés en lazy
 *   → ils ne font pas partie du bundle initial (~50 kB gzip économisés)
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const env = import.meta.env;

const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
  measurementId:     env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

if (isConfigured) {
  // Évite la double initialisation lors du HMR Vite
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

  // Firestore v9 moderne: persistance multi-onglets (remplace enableIndexedDbPersistence dépréciée)
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch {
    // Si déjà initialisé (HMR), récupérer l'instance existante
    db = getFirestore(app);
  }

  auth = getAuth(app);
  // Force localStorage pour la persistance auth — évite l'erreur "missing initial state"
  // causée par sessionStorage inaccessible sur iOS/Android (ITP, storage partitioning)
  setPersistence(auth, browserLocalPersistence).catch(() => {});

  if (env.VITE_APP_ENV === 'development') {
    console.info('✅ Firebase connecté au projet:', firebaseConfig.projectId);
  }
} else {
  console.warn('⚠️ Firebase non configuré. Vérifiez votre fichier .env.local');
}

// ─── Lazy: firebase/functions ──────────────────────────────────────────────────
// Chargé uniquement à la première invocation d'une Cloud Function.
// Évite ~40 kB dans le bundle initial (utilisé seulement par DeleteAccountModal).

import type { Functions } from 'firebase/functions';
let _functions: Functions | undefined;

// ⚠️  region 'europe-west1' : doit correspondre au déploiement de submitBuyerRequest
// dans functions/src/submit-buyer-request.ts. Ne pas changer l'un sans l'autre.
export async function getFirebaseFunctions(): Promise<Functions | null> {
  if (!isConfigured) return null;
  if (_functions) return _functions;
  const { getFunctions } = await import('firebase/functions');
  _functions = getFunctions(app!, 'europe-west1');
  return _functions;
}

// ─── Lazy: firebase/app-check ─────────────────────────────────────────────────
// Initialisé après le premier rendu de l'app (App Check met les requêtes
// en file d'attente en interne — un léger délai est sans risque).
// N'est chargé que si VITE_ENABLE_APP_CHECK=true.

export async function initAppCheck(): Promise<void> {
  if (!isConfigured || !app) return;
  const appCheckKey = env.VITE_RECAPTCHA_V3_SITE_KEY;
  const appCheckEnabled = env.VITE_ENABLE_APP_CHECK === 'true';

  if (!appCheckEnabled) return;

  const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');

  if (appCheckKey) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // Already initialized (HMR) — safe to ignore
    }
  } else if (env.VITE_APP_ENV === 'development') {
    // Debug mode: set FIREBASE_APPCHECK_DEBUG_TOKEN=true in browser console
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('DUMMY_KEY_FOR_DEBUG'),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // Already initialized (HMR)
    }
  }
}

export { db, auth, isConfigured };
