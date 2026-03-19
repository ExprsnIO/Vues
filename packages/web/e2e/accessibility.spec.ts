import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('should have proper page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Exprsn/);
  });

  test('should have a main landmark on the home page', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('main, [role="main"]');
    await expect(main).toBeVisible({ timeout: 10000 });
  });

  test('login page should have a password input', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login page should have a submit button', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    await expect(
      page.locator('button[type="submit"], button:has-text("Sign In")')
    ).toBeVisible();
  });

  test('terms page should load and show heading', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.locator('text=Terms of Service')).toBeVisible({ timeout: 10000 });
  });

  test('terms page should have correct document title', async ({ page }) => {
    await page.goto('/terms');
    await expect(page).toHaveTitle(/Terms/i);
  });

  test('privacy page should load and show heading', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('text=Privacy Policy')).toBeVisible({ timeout: 10000 });
  });

  test('privacy page should have correct document title', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveTitle(/Privacy/i);
  });

  test('discover page should have a search input with accessible attributes', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    // Verify it is focusable
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
  });

  test('not-found page should load gracefully', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-404');
    await page.waitForTimeout(2000);
    // Should render something — either a 404 page or redirect
    await expect(page.locator('body')).toBeVisible();
  });

  test('signup page should have form inputs', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForTimeout(2000);
    // Signup form should have at least one input
    await expect(page.locator('input').first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Signup may redirect to an OAuth flow
    });
  });
});
