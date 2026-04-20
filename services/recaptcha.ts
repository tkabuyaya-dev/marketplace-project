/**
 * NUNULIA — reCAPTCHA v3 Client Service
 *
 * Executes reCAPTCHA v3 invisibly on sensitive actions (login, seller registration)
 * and verifies the token server-side via the verifyRecaptcha Cloud Function.
 */

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || '';
const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL || '';

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

/**
 * Load reCAPTCHA v3 script on demand.
 * Call this when the user opens a protected form — NOT at module import time.
 * badge=hidden: suppresses the floating reCAPTCHA widget (must disclose usage in UI instead).
 * hl=fr: French UI labels.
 */
let recaptchaLoaded = false;
export function loadRecaptchaScript(): void {
  if (recaptchaLoaded || !SITE_KEY || typeof document === 'undefined') return;
  recaptchaLoaded = true;

  const script = document.createElement('script');
  script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}&badge=hidden&hl=fr`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/**
 * Execute reCAPTCHA v3 and verify the token server-side.
 * Returns true if the user passes, false otherwise.
 *
 * In development (no site key), always returns true.
 */
export async function verifyRecaptcha(action: string): Promise<boolean> {
  // Skip in development if no site key configured
  if (!SITE_KEY) {
    console.warn('[reCAPTCHA] No site key — skipping verification (dev mode)');
    return true;
  }

  // Ensure script is loaded (idempotent — no-op if already loaded)
  loadRecaptchaScript();

  // Wait for grecaptcha to be ready
  if (!window.grecaptcha) {
    console.warn('[reCAPTCHA] Script not loaded — skipping verification');
    return true;
  }

  try {
    // iOS Safari (ITP) and ad-blockers can prevent grecaptcha.ready() from ever
    // firing. We race against a 5-second timeout so the form never freezes.
    const token = await Promise.race([
      new Promise<string>((resolve, reject) => {
        window.grecaptcha.ready(() => {
          window.grecaptcha.execute(SITE_KEY, { action })
            .then(resolve)
            .catch(reject);
        });
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('reCAPTCHA timeout')), 5000),
      ),
    ]);

    // Verify server-side
    const response = await fetch(`${FUNCTIONS_BASE}/verifyRecaptcha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    });

    const data = await response.json();
    return data.success === true;
  } catch (err) {
    console.error('[reCAPTCHA] Verification error:', err);
    // On network error / timeout / iOS ITP block: allow the action (don't block legitimate users)
    return true;
  }
}
