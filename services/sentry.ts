/**
 * NUNULIA — Sentry Error Monitoring (Lazy-loaded)
 *
 * Sentry SDK (~100KB) is loaded AFTER the app shell renders,
 * so it doesn't block the initial paint on slow connections.
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Copy the DSN to .env.local: VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 * 3. Errors are automatically captured in production
 */

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const IS_PRODUCTION = import.meta.env.VITE_APP_ENV !== 'development';

// Lazy-loaded Sentry module — null until initialized
let Sentry: typeof import('@sentry/react') | null = null;
let initPromise: Promise<void> | null = null;

export function initSentry(): void {
  if (!SENTRY_DSN) {
    if (!IS_PRODUCTION) {
      console.info('ℹ️ Sentry non configuré (pas de DSN). Erreurs loguées en console uniquement.');
    }
    return;
  }

  if (import.meta.env.VITE_APP_ENV === 'development') {
    console.info('ℹ️ Sentry désactivé en dev. Erreurs en console uniquement.');
    return;
  }

  // Defer loading until after first paint
  initPromise = new Promise<void>((resolve) => {
    const load = () => {
      import('@sentry/react').then((mod) => {
        Sentry = mod;
        try {
          mod.init({
            dsn: SENTRY_DSN,
            environment: IS_PRODUCTION ? 'production' : 'development',
            release: `nunulia@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
            tracesSampleRate: IS_PRODUCTION ? 0.2 : 1.0,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
            integrations: [
              mod.browserTracingIntegration(),
              mod.replayIntegration({
                maskAllText: false,
                blockAllMedia: false,
              }),
            ],
            transport: (options) => {
              const transport = mod.makeFetchTransport(options);
              return {
                ...transport,
                send: async (envelope) => {
                  try {
                    return await transport.send(envelope);
                  } catch {
                    return { statusCode: 0 } as any;
                  }
                },
              };
            },
            beforeSend(event) {
              if (event.exception?.values?.some(v =>
                v.value?.includes('dynamically imported module') ||
                v.value?.includes('Chunk load failed')
              )) {
                return null;
              }
              if (event.exception?.values?.some(v =>
                v.value?.includes('Failed to fetch') ||
                v.value?.includes('NetworkError')
              )) {
                return null;
              }
              return event;
            },
            denyUrls: [
              /extensions\//i,
              /^chrome:\/\//i,
              /^moz-extension:\/\//i,
            ],
          });
        } catch {
          // Sentry init failed — continue without monitoring
        }
        resolve();
      }).catch(() => {
        resolve(); // Don't block app if Sentry fails to load
      });
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(load);
    } else {
      setTimeout(load, 2000);
    }
  });
}

/** Wait for Sentry to be loaded (for use in other lazy functions) */
async function ensureSentry(): Promise<typeof import('@sentry/react') | null> {
  if (initPromise) await initPromise;
  return Sentry;
}

/** Tag the current user for error context */
export function setSentryUser(userId: string, email: string, role: string): void {
  if (!SENTRY_DSN) return;
  ensureSentry().then((s) => s?.setUser({ id: userId, email, role }));
}

/** Clear user context on logout */
export function clearSentryUser(): void {
  if (!SENTRY_DSN) return;
  ensureSentry().then((s) => s?.setUser(null));
}

/** Manually capture an error with context */
export function captureError(error: unknown, context?: Record<string, any>): void {
  if (!SENTRY_DSN) {
    console.error('[Sentry would capture]', error, context);
    return;
  }
  ensureSentry().then((s) => {
    if (!s) return;
    if (context) s.setContext('extra', context);
    s.captureException(error);
  });
}

/** Capture a custom message */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!SENTRY_DSN) return;
  ensureSentry().then((s) => s?.captureMessage(message, level));
}

// Re-export for components that import { Sentry } directly
export { Sentry };
