import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Tailwind compilé via PostCSS (pas de CDN)
import './i18n'; // Initialize i18next before React renders
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { initSentry } from './services/sentry';
import { migrateLocalStorage } from './utils/migrate-storage';

// Migrate localStorage keys from AuraBuja → Nunulia (one-time, for existing users)
migrateLocalStorage();

// Initialize Sentry before React renders (captures early errors)
initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root introuvable');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
// Service Worker: auto-reload when a new version is deployed
// Ensures users always get the latest JS after firebase deploy
import { registerSW } from 'virtual:pwa-register';
registerSW({
  onNeedRefresh() {
    // New SW available — reload immediately to get latest code
    window.location.reload();
  },
});
