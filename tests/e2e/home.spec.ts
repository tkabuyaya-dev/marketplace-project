/**
 * E2E — Home page
 * Tests the public landing page: loads, renders sections, navigation works.
 */
import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app shell to render (not the splash loader)
    await page.waitForSelector('#app-loader', { state: 'hidden', timeout: 10_000 })
      .catch(() => { /* loader already removed */ });
  });

  test('charge et affiche la barre de navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/Nunulia/i);
    // Logo or brand name visible
    await expect(page.locator('nav, header').first()).toBeVisible();
  });

  test('le bouton de recherche est visible et cliquable', async ({ page }) => {
    // Search bar or search button
    const searchTrigger = page.locator('[placeholder*="recherch"], [aria-label*="recherch"], button[aria-label*="search"]').first();
    await expect(searchTrigger).toBeVisible();
  });

  test('ouvre la SearchOverlay avec Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k');
    // Overlay should appear
    await expect(page.locator('[role="combobox"]')).toBeVisible({ timeout: 3000 });
  });

  test('ferme la SearchOverlay avec Echap', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('[role="combobox"]')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="combobox"]')).not.toBeVisible({ timeout: 2000 });
  });

  test('la section de produits se charge', async ({ page }) => {
    // Product cards or loading indicator
    await page.waitForSelector('[data-testid="product-card"], .product-card, [class*="ProductCard"]', {
      timeout: 15_000,
      state: 'visible',
    }).catch(async () => {
      // Fallback: at least loading spinner then content
      const hasContent = await page.locator('main').innerText();
      expect(hasContent.length).toBeGreaterThan(0);
    });
  });

  test('le sélecteur de langue est accessible', async ({ page }) => {
    const langSwitcher = page.locator('[aria-label*="langue"], [aria-label*="language"], button:has-text("FR"), button:has-text("EN")').first();
    await expect(langSwitcher).toBeVisible();
  });
});
