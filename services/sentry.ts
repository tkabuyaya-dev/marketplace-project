/**
 * NUNULIA — Sentry Error Monitoring
 *
 * Initializes Sentry for production error tracking.
 * Only active when VITE_SENTRY_DSN is configured.
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Copy the DSN to .env.local: VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 * 3. Errors are automatically captured in production
 */

import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const IS_PRODUCTION = import.meta.env.VITE_APP_ENV !== 'development';

export function initSentry(): void {
  if (!SENTRY_DSN) {
    if (!IS_PRODUCTION) {
      console.info('ℹ️ Sentry non configuré (pas de DSN). Erreurs loguées en console uniquement.');
    }
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: IS_PRODUCTION ? 'production' : 'development',
      release: `nunulia@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,

      // Performance: sample 20% of transactions in production
      tracesSampleRate: IS_PRODUCTION ? 0.2 : 1.0,

      // Session replay: capture 10% of sessions, 100% on error
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],

      // Silence transport errors (invalid DSN, 403, etc.)
      transport: (options) => {
        const transport = Sentry.makeFetchTransport(options);
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

      // Filter out noisy errors
      beforeSend(event) {
        // Ignore chunk load failures (handled by lazyRetry)
        if (event.exception?.values?.some(v =>
          v.value?.includes('dynamically imported module') ||
          v.value?.includes('Chunk load failed')
        )) {
          return null;
        }
        // Ignore network errors (transient)
        if (event.exception?.values?.some(v =>
          v.value?.includes('Failed to fetch') ||
          v.value?.includes('NetworkError')
        )) {
          return null;
        }
        return event;
      },

      // Don't send events from dev tools
      denyUrls: [
        /extensions\//i,
        /^chrome:\/\//i,
        /^moz-extension:\/\//i,
      ],
    });
  } catch {
    // Sentry init failed — continue without monitoring
  }
}

/** Tag the current user for error context */
export function setSentryUser(userId: string, email: string, role: string): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser({ id: userId, email, role });
}

/** Clear user context on logout */
export function clearSentryUser(): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

/** Manually capture an error with context */
export function captureError(error: unknown, context?: Record<string, any>): void {
  if (!SENTRY_DSN) {
    console.error('[Sentry would capture]', error, context);
    return;
  }
  if (context) {
    Sentry.setContext('extra', context);
  }
  Sentry.captureException(error);
}

/** Capture a custom message */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!SENTRY_DSN) return;
  Sentry.captureMessage(message, level);
}

export { Sentry };
