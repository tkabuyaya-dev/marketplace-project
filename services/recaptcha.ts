/**
 * AURABUJA — reCAPTCHA v3 Client Service
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

  // Wait for grecaptcha to be ready
  if (!window.grecaptcha) {
    console.warn('[reCAPTCHA] Script not loaded — skipping verification');
    return true;
  }

  try {
    const token = await new Promise<string>((resolve, reject) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(SITE_KEY, { action })
          .then(resolve)
          .catch(reject);
      });
    });

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
    // On network error, allow the action (don't block legitimate users)
    return true;
  }
}
