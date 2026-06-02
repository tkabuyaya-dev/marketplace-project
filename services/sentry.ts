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
            // ── Bandwidth & quota guards (Africa 2G/3G optimization) ──
            // Performance traces : DISABLED on Home/listing pages — they generated
            // 4 envelopes/session in the audit live (2026-05-26) without any real
            // error. Re-enable to 0.05–0.1 once we have a Sentry Team plan and want
            // performance metrics. tracePropagationTargets keeps tracing OFF unless
            // an upstream service explicitly requests it.
            tracesSampleRate: 0,
            // Session replays : DISABLED. Only capture on actual errors.
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 1.0,
            integrations: [
              mod.replayIntegration({
                maskAllText: false,
                blockAllMedia: false,
              }),
            ],
            // Drop auto-breadcrumbs that aren't useful for debugging marketplace
            // bugs — clicks, navigation, console.* generate ~80% of the noise
            // and rarely help diagnose real issues.
            beforeBreadcrumb(breadcrumb) {
              if (breadcrumb.category === 'ui.click') return null;
              if (breadcrumb.category === 'ui.input') return null;
              if (breadcrumb.category === 'navigation') return null;
              if (breadcrumb.category === 'console') return null;
              return breadcrumb;
            },
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

/**
 * Add a custom breadcrumb (category 'studio', 'payment', etc.).
 * The auto-breadcrumbs from ui.click/ui.input/console/navigation are filtered out
 * by beforeBreadcrumb above — only explicit calls like this one stay in the trail.
 * Useful to leave a forensic trace when an error is captured later.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!SENTRY_DSN) return;
  ensureSentry().then((s) => {
    s?.addBreadcrumb({
      category,
      message,
      level: 'info',
      timestamp: Date.now() / 1000,
      data,
    });
  });
}

// Re-export for components that import { Sentry } directly
export { Sentry };
