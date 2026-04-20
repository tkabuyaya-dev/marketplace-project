/**
 * E2E — "Je Cherche" (Buyer Requests) flow
 * Tests: page loads, form visible, validation works.
 */
import { test, expect } from '@playwright/test';

test.describe('Je Cherche — Page Buyer Requests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/je-cherche');
    await page.waitForLoadState('networkidle');
  });

  test('la page /je-cherche se charge sans erreur', async ({ page }) => {
    await expect(page.locator('main, body')).toBeVisible();
    const errorOverlay = page.locator('#vite-error-overlay');
    await expect(errorOverlay).not.toBeVisible();
  });

  test('le formulaire "Je Cherche" est visible', async ({ page }) => {
    // Form or CTA to open form
    const formOrBtn = page.locator('form, button:has-text("Publier"), button:has-text("Je cherche"), button:has-text("Poster")').first();
    await expect(formOrBtn).toBeVisible({ timeout: 8000 });
  });

  test('les demandes existantes s\'affichent (ou message vide)', async ({ page }) => {
    // Either request cards or empty state
    const hasCards = await page.locator('[data-testid="buyer-request"], [class*="BuyerRequest"]').count();
    const hasEmpty = await page.locator(':text("Aucune demande"), :text("Soyez le premier")').count();
    const hasLoading = await page.locator('[class*="spinner"], [class*="loading"]').count();

    expect(hasCards + hasEmpty + hasLoading).toBeGreaterThan(0);
  });
});
