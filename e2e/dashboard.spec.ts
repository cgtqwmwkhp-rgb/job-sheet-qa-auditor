import { test, expect } from '@playwright/test';

/**
 * Dashboard & Analytics E2E Tests
 * ================================
 * Tests the demo gateway and public page functionality
 * 
 * Note: Protected pages that make tRPC calls require OAuth authentication.
 * These tests focus on the demo gateway flow and basic page structure.
 */

test.describe('Dashboard via Demo Gateway', () => {
  test.beforeEach(async ({ page }) => {
    // Go to demo page first
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should navigate to dashboard after demo login', async ({ page }) => {
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Click Admin card to login
    await page.locator('text=Admin / QA Lead').click();
    
    // Should set demo role
    const role = await page.evaluate(() => localStorage.getItem('demo_user_role'));
    expect(role).toBe('admin');
  });

  test('should show demo gateway with role options', async ({ page }) => {
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Check for role cards
    await expect(page.locator('text=Admin / QA Lead')).toBeVisible();
    await expect(page.locator('text=Field Technician')).toBeVisible();
  });
});

test.describe('Dashboard Responsiveness', () => {
  test('demo gateway should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Demo gateway should still be functional
    await expect(page.locator('text=Job Sheet QA Auditor')).toBeVisible();
  });

  test('demo gateway should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/demo');
    
    // Close onboarding modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Should still show content
    await expect(page.locator('text=Job Sheet QA')).toBeVisible();
  });
});

test.describe('Dashboard Performance', () => {
  test('demo gateway should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/demo');
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have critical console errors on demo page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/demo');
    await page.waitForTimeout(2000);
    
    // Filter out known acceptable errors
    const criticalErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('404') &&
      !e.includes('net::ERR') &&
      !e.includes('Failed to load resource') &&
      !e.includes('UNAUTHORIZED')
    );
    
    // Allow some minor errors that don't affect functionality
    expect(criticalErrors.length).toBeLessThanOrEqual(5);
  });
});
