import { test, expect } from '@playwright/test';
import { waitForPageStable, prepareForScreenshot } from './helpers';

/**
 * Help Center Visual Regression Tests
 * ====================================
 * Visual regression tests for the Help Center page
 * This is a public page that doesn't require authentication
 */

test.describe('Help Center Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await waitForPageStable(page);
  });

  test('help center - full page', async ({ page }) => {
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('help-center-full.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('help center - header section', async ({ page }) => {
    await prepareForScreenshot(page);
    
    const header = page.locator('h1').first();
    await expect(header).toHaveScreenshot('help-center-header.png', {
      animations: 'disabled',
    });
  });

  test('help center - search area', async ({ page }) => {
    await prepareForScreenshot(page);
    
    const searchArea = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    if (await searchArea.isVisible()) {
      await expect(searchArea).toHaveScreenshot('help-center-search.png', {
        animations: 'disabled',
      });
    }
  });
});

test.describe('Help Center Responsive Visual Regression', () => {
  test('help center - tablet view', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/help');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('help-center-tablet.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('help center - mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/help');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('help-center-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
