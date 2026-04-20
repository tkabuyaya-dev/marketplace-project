/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/**
 * Injects <link rel="preload" as="style"> for the main CSS chunk.
 * This tells the browser to start downloading CSS in parallel with HTML parsing,
 * reducing render-blocking time by ~200-400ms on slow connections.
 */
function cssPreloadPlugin(): Plugin {
  return {
    name: 'css-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Find the generated CSS filename and inject a preload hint
        const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/);
        if (!cssMatch) return html;
        const cssHref = cssMatch[1];
        const preload = `<link rel="preload" as="style" href="${cssHref}" />`;
        return html.replace('<head>', `<head>\n    ${preload}`);
      },
    },
  };
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30000,
    hookTimeout: 60000,
    teardownTimeout: 10000,
  },
  plugins: [
    react(),
    cssPreloadPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      filename: 'sw.js',
      manifest: {
        name: 'Nunulia — Marketplace',
        short_name: 'Nunulia',
        description: 'Le marketplace Tech & Beauté de Bujumbura',
        theme_color: '#0b0f19',
        background_color: '#0b0f19',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        categories: ['shopping', 'business'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/node_modules/**', 'sw.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          // ── Cloudinary product images ──────────────────────────────────
          // CacheFirst: serve from cache instantly, network only on cache miss.
          // 1000 entries / 60 days — generous for a marketplace with many products.
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          // ── Unsplash (fallback placeholder images) ─────────────────────
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unsplash-images',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          // ── Google Fonts ───────────────────────────────────────────────
          // StaleWhileRevalidate: show cached font immediately, update in background
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            }
          },
          // ── Google Maps ────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/maps\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maps-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          // ── Firebase Auth & OAuth: explicitly excluded ─────────────────
          // Firebase SDK handles its own token caching via IndexedDB.
          // Caching auth responses causes stale tokens → silent auth failures.
          // (no rule = NetworkOnly by default, which is correct)
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//, /^\/_/, /\/[^/?]+\.[^/]+$/],
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Forme fonctionnelle: plus fiable que la forme objet pour Rollup/Vite 6.
        // Reçoit le chemin complet du module et retourne le nom du chunk cible.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // React ecosystem — séparé du code applicatif pour cache long terme
          if (
            id.includes('/react-dom/') ||
            (id.includes('/react/') && !id.includes('/react-router') && !id.includes('/react-i18next'))
          ) {
            return 'react-vendor';
          }
          if (id.includes('/scheduler/')) return 'react-vendor';

          // Routing
          if (id.includes('/react-router') || id.includes('/@remix-run/')) {
            return 'router-vendor';
          }

          // Internationalisation
          if (
            id.includes('/i18next/') ||
            id.includes('/react-i18next/') ||
            id.includes('/i18next-browser-languagedetector/')
          ) {
            return 'i18n-vendor';
          }

          // Firebase: découpé par sous-module pour granularité maximale
          if (id.includes('/firebase/')) {
            if (id.includes('/firestore/') || id.includes('@firebase/firestore')) {
              return 'firebase-firestore';
            }
            if (
              id.includes('/functions/') ||
              id.includes('/app-check/') ||
              id.includes('@firebase/functions') ||
              id.includes('@firebase/app-check')
            ) {
              // Chargés en lazy — seront dans des chunks séparés au besoin
              return 'firebase-extra';
            }
            // firebase/app, firebase/auth et utilitaires partagés
            return 'firebase-core';
          }

          // Sentry: chargé en lazy via requestIdleCallback
          if (id.includes('@sentry/')) return 'sentry-vendor';

          // Blurhash: petit mais utile de garder séparé
          if (id.includes('/blurhash/')) return 'blurhash';
        },
      }
    },
    target: 'es2020',
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    sourcemap: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
  },
  server: {
    port: 3000,
    host: true,
  }
});
