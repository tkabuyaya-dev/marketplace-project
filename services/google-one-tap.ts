/**
 * Google Identity Services (One Tap) — overlay natif, zéro popup/redirect.
 *
 * Flux : GIS prompt → JWT credential → signInWithCredential(Firebase) → FirebaseUser
 * Fallback : si One Tap indisponible (WebView, cooldown, user dismiss), retourne null.
 */

import { captureMessage } from './sentry';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const ONE_TAP_TIMEOUT_MS = 5000;

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;
    el.defer = true;
    el.onload = () => { scriptLoaded = true; resolve(); };
    el.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(el);
  });

  return scriptLoading;
}

export interface OneTapResult {
  credential: string;
}

/**
 * Show Google One Tap prompt. Returns the JWT credential string or null if
 * the user dismissed / One Tap is unavailable.
 */
export async function promptOneTap(): Promise<OneTapResult | null> {
  if (!CLIENT_ID) return null;

  try {
    await loadGisScript();
  } catch {
    return null;
  }

  const google = (window as any).google;
  if (!google?.accounts?.id) return null;

  return new Promise<OneTapResult | null>((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const done = (val: OneTapResult | null) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(val);
    };

    // FedCM safety net: on recent Chrome, isNotDisplayed/isSkippedMoment/
    // isDismissedMoment return false silently, so the notification callback
    // never resolves. Without this timeout, the button stays in loading state
    // forever. The success path (initialize.callback) still fires via FedCM.
    timeoutId = setTimeout(() => {
      captureMessage('[OneTap] Timeout after 5s — falling back to popup', 'warning');
      done(null);
    }, ONE_TAP_TIMEOUT_MS);

    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response: any) => {
        if (response.credential) {
          done({ credential: response.credential });
        } else {
          done(null);
        }
      },
      auto_select: true,
      cancel_on_tap_outside: false,
      itp_support: true,
    });

    google.accounts.id.prompt((notification: any) => {
      // Diagnostic logging — helps debug One Tap failures on mobile
      if (notification.isNotDisplayed()) {
        console.warn('[OneTap] Not displayed. Reason:', notification.getNotDisplayedReason());
        done(null);
      } else if (notification.isSkippedMoment()) {
        console.warn('[OneTap] Skipped. Reason:', notification.getSkippedReason());
        done(null);
      } else if (notification.isDismissedMoment()) {
        console.warn('[OneTap] Dismissed. Reason:', notification.getDismissedReason());
        done(null);
      }
    });
  });
}

export function cancelOneTap(): void {
  try {
    const google = (window as any).google;
    google?.accounts?.id?.cancel();
  } catch {}
}

/**
 * Render a Google-branded sign-in button via GIS (google.accounts.id.renderButton).
 *
 * Pourquoi ce flux vs signInWithPopup :
 *   - `signInWithPopup` sur Android Chrome ouvre un nouvel onglet sur
 *     `/__/auth/handler` que le navigateur refuse de fermer via `window.close()`
 *     → onglet blanc orphelin bloquant.
 *   - `renderButton` reste dans le même contexte : au clic, Google affiche le
 *     sélecteur de compte en overlay inline, retourne un JWT via `callback`.
 *     Pas d'onglet, pas de popup, pas de `window.close()`.
 *
 * Le JWT est ensuite passé à `signInWithCredential(auth, GoogleAuthProvider.credential(jwt))`
 * côté appelant.
 *
 * Retourne une fonction de cleanup qui annule les prompts en cours.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (credential: string) => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  if (!CLIENT_ID) {
    onError?.(new Error('VITE_GOOGLE_CLIENT_ID missing'));
    return () => {};
  }

  try {
    await loadGisScript();
  } catch (e) {
    onError?.(e as Error);
    return () => {};
  }

  const google = (window as any).google;
  if (!google?.accounts?.id) {
    onError?.(new Error('Google Identity Services unavailable'));
    return () => {};
  }

  // NOTE: `initialize()` partage son callback avec `prompt()` (One Tap). Ici on
  // override pour ce flow bouton. auto_select reste true pour cohérence avec le
  // guardrail One Tap (n'affecte pas le flow bouton qui exige toujours un clic).
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response: any) => {
      if (response?.credential) {
        onCredential(response.credential);
      } else {
        onError?.(new Error('No credential in GIS response'));
      }
    },
    auto_select: true,
    cancel_on_tap_outside: false,
    itp_support: true,
  });

  container.innerHTML = '';
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'filled_blue',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: 280,
  });

  return () => {
    try { google.accounts.id.cancel(); } catch {}
  };
}
