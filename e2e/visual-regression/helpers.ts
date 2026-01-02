import { Page, expect } from '@playwright/test';

/**
 * Visual Regression Test Helpers
 * ==============================
 * Utility functions for consistent visual regression testing
 */

/**
 * Wait for page to be fully loaded and stable
 * This ensures animations are complete and content is rendered
 */
export async function waitForPageStable(page: Page, timeout = 5000): Promise<void> {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle', { timeout });
  
  // Wait for any animations to complete
  await page.waitForTimeout(500);
  
  // Ensure no loading spinners are visible
  const loadingSpinners = page.locator('.animate-spin, [data-loading="true"]');
  const spinnerCount = await loadingSpinners.count();
  if (spinnerCount > 0) {
    await loadingSpinners.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

/**
 * Setup demo login state for visual tests
 */
export async function setupDemoLogin(page: Page, role: 'admin' | 'technician' = 'admin'): Promise<void> {
  // Navigate to demo page first
  await page.goto('/demo');
  
  // Set localStorage for demo mode
  await page.evaluate((userRole) => {
    localStorage.setItem('demo_user_role', userRole);
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('demo_user_name', userRole === 'admin' ? 'Sarah Connor' : 'John Smith');
    localStorage.setItem('demo_user_email', userRole === 'admin' ? 'sarah@example.com' : 'john@example.com');
  }, role);
}

/**
 * Close any modals that might be blocking the view
 */
export async function closeModals(page: Page): Promise<void> {
  // Try to close onboarding modal using Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  
  // Try to close any other modals
  const closeButtons = page.locator('[data-slot="dialog-close"], [aria-label="Close"]');
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    const button = closeButtons.nth(i);
    if (await button.isVisible()) {
      await button.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

/**
 * Prepare page for screenshot by hiding dynamic content
 */
export async function prepareForScreenshot(page: Page): Promise<void> {
  // Hide elements that change frequently (timestamps, random IDs, etc.)
  await page.addStyleTag({
    content: `
      /* Hide dynamic timestamps */
      [data-testid="timestamp"], .timestamp, time {
        visibility: hidden !important;
      }
      
      /* Hide loading indicators */
      .animate-spin, .animate-pulse {
        animation: none !important;
      }
      
      /* Disable all transitions */
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
      
      /* Hide cursor/caret */
      * {
        caret-color: transparent !important;
      }
    `
  });
  
  // Wait for styles to apply
  await page.waitForTimeout(100);
}

/**
 * Take a full-page screenshot with consistent settings
 */
export async function takeFullPageScreenshot(
  page: Page, 
  name: string,
  options: { mask?: string[]; clip?: { x: number; y: number; width: number; height: number } } = {}
): Promise<void> {
  await waitForPageStable(page);
  await prepareForScreenshot(page);
  
  // Build mask locators if provided
  const maskLocators = options.mask?.map(selector => page.locator(selector)) || [];
  
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask: maskLocators,
    animations: 'disabled',
    caret: 'hide',
    ...(options.clip && { clip: options.clip }),
  });
}

/**
 * Take a component screenshot
 */
export async function takeComponentScreenshot(
  page: Page,
  selector: string,
  name: string,
  options: { mask?: string[] } = {}
): Promise<void> {
  await waitForPageStable(page);
  await prepareForScreenshot(page);
  
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  
  const maskLocators = options.mask?.map(s => page.locator(s)) || [];
  
  await expect(element).toHaveScreenshot(`${name}.png`, {
    mask: maskLocators,
    animations: 'disabled',
    caret: 'hide',
  });
}

/**
 * Standard page test setup
 */
export async function setupPageTest(page: Page, path: string, role: 'admin' | 'technician' = 'admin'): Promise<void> {
  await setupDemoLogin(page, role);
  await page.goto(path);
  await closeModals(page);
  await waitForPageStable(page);
}
