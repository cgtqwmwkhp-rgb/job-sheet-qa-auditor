import { test, expect } from '@playwright/test';
import { waitForPageStable, prepareForScreenshot } from './helpers';

/**
 * UI Components Visual Regression Tests
 * ======================================
 * Visual regression tests for common UI components
 * Tests are run against the demo gateway page which showcases
 * the application's design system.
 */

test.describe('UI Components Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
  });

  test('button - primary style', async ({ page }) => {
    await prepareForScreenshot(page);
    
    const primaryButton = page.locator('button:has-text("Enter Demo")').first();
    await expect(primaryButton).toHaveScreenshot('button-primary.png', {
      animations: 'disabled',
    });
  });

  test('card - role selection card', async ({ page }) => {
    await prepareForScreenshot(page);
    
    const card = page.locator('[class*="card"]').first();
    if (await card.isVisible()) {
      await expect(card).toHaveScreenshot('card-role-selection.png', {
        animations: 'disabled',
      });
    }
  });

  test('typography - heading styles', async ({ page }) => {
    await prepareForScreenshot(page);
    
    const heading = page.locator('h1, h2').first();
    await expect(heading).toHaveScreenshot('typography-heading.png', {
      animations: 'disabled',
    });
  });

  test('icon - feature icons', async ({ page }) => {
    await prepareForScreenshot(page);
    
    const iconContainer = page.locator('svg').first();
    if (await iconContainer.isVisible()) {
      await expect(iconContainer).toHaveScreenshot('icon-feature.png', {
        animations: 'disabled',
      });
    }
  });
});

test.describe('Modal Components Visual Regression', () => {
  test('onboarding modal - step 1', async ({ page }) => {
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    // Capture the onboarding modal
    const modal = page.locator('[role="dialog"], [data-slot="dialog"]').first();
    if (await modal.isVisible()) {
      await expect(modal).toHaveScreenshot('modal-onboarding-step1.png', {
        animations: 'disabled',
      });
    }
  });

  test('onboarding modal - navigation buttons', async ({ page }) => {
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitForPageStable(page);
    await prepareForScreenshot(page);
    
    // Capture the modal navigation area
    const modalFooter = page.locator('button:has-text("Next")').locator('..');
    if (await modalFooter.isVisible()) {
      await expect(modalFooter).toHaveScreenshot('modal-navigation.png', {
        animations: 'disabled',
      });
    }
  });
});

test.describe('Color Theme Visual Regression', () => {
  test('light theme - demo gateway', async ({ page }) => {
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    
    // Ensure light theme
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    });
    
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('theme-light.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('dark theme - demo gateway', async ({ page }) => {
    await page.goto('/demo');
    await page.keyboard.press('Escape');
    await waitForPageStable(page);
    
    // Ensure dark theme
    await page.evaluate(() => {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    });
    
    await prepareForScreenshot(page);
    
    await expect(page).toHaveScreenshot('theme-dark.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
