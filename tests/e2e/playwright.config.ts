import { defineConfig, devices } from '@playwright/test';

/**
 * NUNULIA — Playwright E2E Configuration
 * Tests run against the local dev server (npm run dev) or the staging URL.
 *
 * Usage:
 *   npx playwright test             (local, headless)
 *   npx playwright test --headed    (visible browser)
 *   BASE_URL=https://staging.nunulia.com npx playwright test
 */
export default defineConfig({
  testDir: './',
  testMatch: '**/*.spec.ts',
  fullyParallel: false, // Sequential — avoids Firestore read conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,

  reporter: [
    ['list'],
    ['html', { outputFolder: '../../test-results/e2e', open: 'never' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // PWA — no service worker caching during tests
    serviceWorkers: 'block',
    // Simulate African mid-range mobile (primary market)
    ...devices['Pixel 5'],
    locale: 'fr-FR',
  },

  projects: [
    {
      name: 'Mobile Chrome (fr)',
      use: { ...devices['Pixel 5'], locale: 'fr-FR' },
    },
    {
      name: 'Desktop Chrome (fr)',
      use: { ...devices['Desktop Chrome'], locale: 'fr-FR', viewport: { width: 1280, height: 720 } },
    },
  ],

  // Start dev server automatically if not already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
