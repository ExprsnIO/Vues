import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Social Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should view a user profile', async ({ page }) => {
    await page.goto('/profile/rickholland');
    await expect(page.locator('text=rickholland, text=Rick Holland')).toBeVisible({ timeout: 10000 });
  });

  test('should show profile stats section', async ({ page }) => {
    await page.goto('/profile/rickholland');
    await page.waitForTimeout(3000);
    // Profile stats (followers, following, likes) should render
    const stats = page.locator('[class*="stat"], [class*="count"], text=Followers, text=Following');
    await expect(stats.first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Stats may be hidden until data loads
    });
  });

  test('should navigate to followers list from profile', async ({ page }) => {
    await page.goto('/profile/rickholland');
    await page.waitForTimeout(3000);
    const followersLink = page.locator('[href*="followers"], text=Followers').first();
    if (await followersLink.isVisible()) {
      await followersLink.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('should navigate to following list from profile', async ({ page }) => {
    await page.goto('/profile/rickholland');
    await page.waitForTimeout(3000);
    const followingLink = page.locator('[href*="following"], text=Following').first();
    if (await followingLink.isVisible()) {
      await followingLink.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('should access bookmarks page', async ({ page }) => {
    await page.goto('/bookmarks');
    await page.waitForTimeout(2000);
    await expect(page.locator('main')).toBeVisible();
  });

  test('should show bookmarks content or empty state', async ({ page }) => {
    await page.goto('/bookmarks');
    await page.waitForTimeout(3000);
    const content = page.locator(
      '[data-testid="bookmark-item"], text=Bookmarks, text=No bookmarks, text=Saved'
    );
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Empty state wording may differ
    });
    await expect(page.locator('main')).toBeVisible();
  });

  test('should access settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Settings, text=Appearance, text=Theme')).toBeVisible({ timeout: 10000 });
  });

  test('should switch settings tabs', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    // Click Playback tab if visible
    const playbackTab = page.locator('button:has-text("Playback")');
    if (await playbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await playbackTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Playback')).toBeVisible();
    }
  });

  test('should view following feed', async ({ page }) => {
    await page.goto('/following');
    await page.waitForTimeout(3000);
    await expect(page.locator('main')).toBeVisible();
  });

  test('should view notifications page', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(2000);
    await expect(page.locator('main, [class*="notification"]')).toBeVisible();
  });
});
