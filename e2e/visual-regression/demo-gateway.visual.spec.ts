import { test, expect } from '@playwright/test';
import { waitForPageStable, closeModals, prepareForScreenshot } from './helpers';

/**
 * Demo Gateway Visual Regression Tests
 * =====================================
 * Visual regression tests for the Demo Gateway page
 */

test.describe('Demo Gateway Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh state
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('demo gateway page - full view', async ({ page }) => {
    // Close onboarding modal first
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('demo-gateway-full.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('demo gateway page - with onboarding modal', async ({ page }) => {
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    // Capture with onboarding modal visible
    await expect(page).toHaveScreenshot('demo-gateway-onboarding.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('demo gateway - admin card', async ({ page }) => {
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    const adminCard = page.locator('text=Admin / QA Lead').locator('..');
    await expect(adminCard).toHaveScreenshot('demo-gateway-admin-card.png', {
      animations: 'disabled',
    });
  });

  test('demo gateway - technician card', async ({ page }) => {
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    const techCard = page.locator('text=Field Technician').locator('..');
    await expect(techCard).toHaveScreenshot('demo-gateway-technician-card.png', {
      animations: 'disabled',
    });
  });

  test('demo gateway - header section', async ({ page }) => {
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    const header = page.locator('text=Job Sheet QA Auditor').first();
    await expect(header).toHaveScreenshot('demo-gateway-header.png', {
      animations: 'disabled',
    });
  });
});

test.describe('Demo Gateway Responsive Visual Regression', () => {
  test('demo gateway - tablet view', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('demo-gateway-tablet.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('demo gateway - mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('demo-gateway-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
