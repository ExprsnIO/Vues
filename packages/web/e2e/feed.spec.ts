import { test, expect } from '@playwright/test';
import { login, waitForFeed } from './helpers';

test.describe('Video Feed', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load the home feed', async ({ page }) => {
    await page.goto('/');
    // Wait for content to load
    await page.waitForTimeout(3000);

    // Should have video content or feed container
    const feedContent = page.locator('.snap-feed, [class*="feed"], main');
    await expect(feedContent).toBeVisible();
  });

  test('should navigate to discover page', async ({ page }) => {
    await page.goto('/discover');
    // Should show search input
    await expect(page.locator('input[placeholder*="Search"], input[type="search"]')).toBeVisible({ timeout: 10000 });
  });

  test('should search for content', async ({ page }) => {
    await page.goto('/discover');
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
    await searchInput.fill('coding');
    await searchInput.press('Enter');

    // Wait for results
    await page.waitForTimeout(2000);
  });

  test('should view notifications', async ({ page }) => {
    await page.goto('/notifications');
    // Page should load without error
    await page.waitForTimeout(2000);
    await expect(page.locator('main, [class*="notification"]')).toBeVisible();
  });
});
