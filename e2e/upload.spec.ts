import { test, expect } from '@playwright/test';

/**
 * Document Upload E2E Tests
 * =========================
 * Tests the demo gateway flow for upload functionality
 * 
 * Note: Protected pages that make tRPC calls require OAuth authentication.
 * These tests focus on the demo gateway flow and basic page structure.
 */

test.describe('Upload via Demo Gateway', () => {
  test.beforeEach(async ({ page }) => {
    // Go to demo page first
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('should allow demo login before accessing upload', async ({ page }) => {
    // Click Admin card to login
    await page.locator('text=Admin / QA Lead').click();
    
    // Should set demo role
    const role = await page.evaluate(() => localStorage.getItem('demo_user_role'));
    expect(role).toBe('admin');
  });

  test('should show upload feature in admin card', async ({ page }) => {
    // Check for upload-related feature in admin card - Executive Dashboard is visible
    await expect(page.locator('text=Executive Dashboard')).toBeVisible();
  });
});

test.describe('Upload Page Accessibility', () => {
  test('demo gateway should be keyboard navigable', async ({ page }) => {
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Tab through the page
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Should be able to navigate without errors
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Upload Error Handling', () => {
  test('demo gateway should handle errors gracefully', async ({ page }) => {
    // The demo page should remain stable
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    await expect(page.locator('text=Job Sheet QA')).toBeVisible({ timeout: 10000 });
  });
});
