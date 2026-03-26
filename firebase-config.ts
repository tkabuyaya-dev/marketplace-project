/**
 * AURABUJA — Firebase Configuration (Production-Grade)
 *
 * Architecture:
 * - Firestore v9 modular API avec persistance IndexedDB (offline support)
 * - Auth persistante via localStorage (reconnexion automatique)
 * - Multi-tab safe via firestore persistenceSettings
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getFunctions, Functions } from 'firebase/functions';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'firebase/app-check';

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
let functions: Functions;

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
  functions = getFunctions(app, 'europe-west1');

  // App Check: Protects Firebase services against bot abuse
  // Only initialize if explicitly enabled AND key is configured
  // To enable: set VITE_ENABLE_APP_CHECK=true in .env.local after configuring
  // a valid reCAPTCHA v3 key for your domain in Google Cloud Console
  const appCheckKey = env.VITE_RECAPTCHA_V3_SITE_KEY;
  const appCheckEnabled = env.VITE_ENABLE_APP_CHECK === 'true';
  if (appCheckKey && appCheckEnabled) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // Already initialized (HMR) — safe to ignore
    }
  } else if (env.VITE_APP_ENV === 'development' && appCheckEnabled) {
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

  if (env.VITE_APP_ENV === 'development') {
    console.info('✅ Firebase connecté au projet:', firebaseConfig.projectId);
  }
} else {
  console.warn('⚠️ Firebase non configuré. Vérifiez votre fichier .env.local');
}

export { db, auth, functions, isConfigured };
