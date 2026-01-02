import { test, expect } from '@playwright/test';
import { setupDemoLogin, waitForPageStable, closeModals, prepareForScreenshot } from './helpers';

/**
 * Dashboard Visual Regression Tests
 * ==================================
 * Visual regression tests for the main Dashboard page
 * 
 * Note: These tests capture the demo gateway since the dashboard
 * requires OAuth authentication. The demo gateway provides a
 * representative view of the application's visual design.
 */

test.describe('Dashboard Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoLogin(page, 'admin');
  });

  test('dashboard - demo gateway view', async ({ page }) => {
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('dashboard-demo-view.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('dashboard - role selection cards', async ({ page }) => {
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    // Capture the cards section
    const cardsSection = page.locator('.grid').first();
    await expect(cardsSection).toHaveScreenshot('dashboard-role-cards.png', {
      animations: 'disabled',
    });
  });
});

test.describe('Dashboard Responsive Visual Regression', () => {
  test('dashboard - tablet layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await setupDemoLogin(page, 'admin');
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('dashboard-tablet.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('dashboard - mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupDemoLogin(page, 'admin');
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('dashboard - wide desktop layout', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await setupDemoLogin(page, 'admin');
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('dashboard-wide-desktop.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
