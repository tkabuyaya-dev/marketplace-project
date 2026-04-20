import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Tailwind compilé via PostCSS (pas de CDN)
import './i18n'; // Initialize i18next before React renders
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { initSentry } from './services/sentry';
import { initAppCheck } from './firebase-config';
import { migrateLocalStorage } from './utils/migrate-storage';

// Migrate localStorage keys from AuraBuja → Nunulia (one-time, for existing users)
migrateLocalStorage();

// Initialize Sentry after first user interaction (removes it from critical path).
// Errors in the first ~5s before interaction are rare — this trade-off is worth
// the 419 KiB chunk being excluded from the initial parse/evaluate.
const _sentryEvents = ['click', 'scroll', 'keydown', 'touchstart', 'pointerdown'];
const _initSentryOnce = () => {
  _sentryEvents.forEach(e => window.removeEventListener(e, _initSentryOnce));
  initSentry();
};
_sentryEvents.forEach(e => window.addEventListener(e, _initSentryOnce, { once: true, passive: true }));
// Fallback: init after 5s regardless (catches non-interactive page loads)
setTimeout(() => {
  _sentryEvents.forEach(e => window.removeEventListener(e, _initSentryOnce));
  initSentry();
}, 5000);

// App Check: chargé en lazy après le premier rendu (App Check met les
// requêtes en file d'attente — un léger délai est sans risque)
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => initAppCheck());
} else {
  setTimeout(() => initAppCheck(), 1000);
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root introuvable');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
// Service Worker: register with graceful update strategy.
// New SW is activated only when the user is idle (page hidden or no interaction
// for 30s). This avoids reloading in the middle of a checkout or product upload.
import { registerSW } from 'virtual:pwa-register';
const updateSW = registerSW({
  onNeedRefresh() {
    // New SW waiting — reload when page is hidden (user switched tabs/apps)
    // or after 30s of no user interaction. Never interrupts active sessions.
    const doUpdate = () => {
      updateSW(true); // force SW activation + reload
    };

    if (document.hidden) {
      // User already switched away — update immediately
      doUpdate();
      return;
    }

    // Wait for page to go hidden (tab switch, app switch, phone lock)
    const onHide = () => {
      document.removeEventListener('visibilitychange', onHide);
      doUpdate();
    };
    document.addEventListener('visibilitychange', onHide);

    // Safety fallback: update after 30s of waiting regardless
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      doUpdate();
    }, 30_000);
  },
});
