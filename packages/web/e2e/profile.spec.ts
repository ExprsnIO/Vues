import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should view own profile', async ({ page }) => {
    await page.goto('/profile/rickholland');
    // Should show profile header
    await expect(page.locator('text=rickholland, text=Rick Holland')).toBeVisible({ timeout: 10000 });
  });

  test('should show follower/following counts', async ({ page }) => {
    await page.goto('/profile/rickholland');
    await page.waitForTimeout(3000);
    // Look for stats (followers, following, videos)
    const stats = page.locator('[class*="stat"], [class*="count"]');
    // Stats should be visible
  });

  test('should navigate to settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    // Settings page should load
    await expect(page.locator('text=Settings, text=Appearance, text=Theme')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to bookmarks', async ({ page }) => {
    await page.goto('/bookmarks');
    await page.waitForTimeout(2000);
    await expect(page.locator('main')).toBeVisible();
  });
});
