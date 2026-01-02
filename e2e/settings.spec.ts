import { test, expect } from '@playwright/test';

/**
 * Settings & Configuration E2E Tests
 * ===================================
 * Tests the demo gateway flow for settings functionality
 * 
 * Note: Protected pages that make tRPC calls require OAuth authentication.
 * These tests focus on the demo gateway flow and basic page structure.
 */

test.describe('Settings via Demo Gateway', () => {
  test.beforeEach(async ({ page }) => {
    // Go to demo page first
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('should show spec management feature in admin card', async ({ page }) => {
    // Check for spec management feature
    await expect(page.locator('text=Spec Management')).toBeVisible();
  });

  test('should show user control feature in admin card', async ({ page }) => {
    // Check for user control feature
    await expect(page.locator('text=User Control')).toBeVisible();
  });
});

test.describe('Processing Settings', () => {
  test('demo gateway should show admin features', async ({ page }) => {
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Admin card should have settings-related features
    await expect(page.locator('text=Executive Dashboard')).toBeVisible();
  });
});

test.describe('Spec Management', () => {
  test('demo gateway should display spec management feature', async ({ page }) => {
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Check for spec management
    await expect(page.locator('text=Spec Management')).toBeVisible();
  });
});

test.describe('User Management', () => {
  test('demo gateway should display user control feature', async ({ page }) => {
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Check for user control
    await expect(page.locator('text=User Control')).toBeVisible();
  });
});
