import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Tailwind compilé via PostCSS (pas de CDN)
import './i18n'; // Initialize i18next before React renders
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { initSentry } from './services/sentry';

// Initialize Sentry before React renders (captures early errors)
initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root introuvable');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
// Note: Le Service Worker est enregistré automatiquement par VitePWA (vite.config.ts)
