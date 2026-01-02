import { test, expect } from '@playwright/test';

/**
 * Dispute Management E2E Tests
 * ============================
 * Tests the demo gateway flow for dispute functionality
 * 
 * Note: Protected pages that make tRPC calls require OAuth authentication.
 * These tests focus on the demo gateway flow and basic page structure.
 */

test.describe('Disputes via Demo Gateway', () => {
  test.beforeEach(async ({ page }) => {
    // Go to demo page first
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should show dispute feature in technician card', async ({ page }) => {
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Check for dispute feature in technician card
    await expect(page.locator('text=Dispute Findings')).toBeVisible();
  });

  test('should allow technician demo login', async ({ page }) => {
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Click Technician card to login
    await page.locator('text=Field Technician').click();
    
    // Should set demo role
    const role = await page.evaluate(() => localStorage.getItem('demo_user_role'));
    expect(role).toBe('technician');
  });
});

test.describe('Dispute Workflow', () => {
  test('demo gateway should show role-specific features', async ({ page }) => {
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Admin card should have different features than technician
    await expect(page.locator('text=Admin / QA Lead')).toBeVisible();
    await expect(page.locator('text=Field Technician')).toBeVisible();
  });
});

test.describe('Dispute Detail View', () => {
  test('demo gateway should display properly', async ({ page }) => {
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Page should be visible
    await expect(page.locator('text=Job Sheet QA')).toBeVisible();
  });
});
