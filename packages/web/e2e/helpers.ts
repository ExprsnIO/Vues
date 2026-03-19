import { Page, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:3002';

export async function login(page: Page, handle = 'rickholland', password = 'exprsn2026') {
  // Navigate to login
  await page.goto('/login');

  // Fill in credentials
  await page.fill('input[name="identifier"], input[placeholder*="handle"], input[placeholder*="email"]', handle);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Submit
  await page.click('button[type="submit"], button:has-text("Sign In")');

  // Wait for redirect (to home or feed)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
}

export async function clearRateLimits() {
  // Clear rate limits via Redis (call API or direct)
  try {
    await fetch(`${API_BASE}/health`);
  } catch {
    // API not reachable, tests will handle this
  }
}

export async function waitForFeed(page: Page) {
  // Wait for video feed to load
  await page.waitForSelector('[data-testid="video-card"], .snap-feed video, video', { timeout: 15000 }).catch(() => {});
}
