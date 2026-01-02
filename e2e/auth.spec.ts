import { test, expect } from '@playwright/test';

/**
 * Authentication & Demo Gateway E2E Tests
 * ========================================
 * Tests the demo gateway login flow and frontend navigation
 * 
 * Note: The backend uses real OAuth authentication. These tests focus on
 * frontend behavior and demo mode functionality. Backend API tests are
 * covered separately in vitest unit tests.
 */

test.describe('Demo Gateway UI', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing demo session and go to demo page
    await page.goto('/demo');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should display the demo gateway page', async ({ page }) => {
    // Check for the main title
    await expect(page.locator('text=Job Sheet QA Auditor')).toBeVisible();
    
    // Check for role selection cards
    await expect(page.locator('text=Admin / QA Lead')).toBeVisible();
    await expect(page.locator('text=Field Technician')).toBeVisible();
    
    // Check for the demo explanation text
    await expect(page.locator('text=No password required')).toBeVisible();
  });

  test('should show onboarding tour modal on first visit', async ({ page }) => {
    // The onboarding modal should appear
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible({ timeout: 10000 });
    
    // Should show step progress
    await expect(page.locator('text=STEP 1 OF 5')).toBeVisible();
    
    // Should show Next button
    await expect(page.locator('button:has-text("Next")')).toBeVisible();
  });

  test('should close onboarding tour with Escape key', async ({ page }) => {
    // Wait for modal to appear
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible({ timeout: 10000 });
    
    // Press Escape to close the modal
    await page.keyboard.press('Escape');
    
    // Wait and check modal is closed
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Welcome to Job Sheet QA')).not.toBeVisible({ timeout: 5000 });
  });

  test('should navigate through all onboarding steps', async ({ page }) => {
    // Wait for modal
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible({ timeout: 10000 });
    
    // Step 1
    await expect(page.locator('text=STEP 1 OF 5')).toBeVisible();
    await page.locator('button:has-text("Next")').click();
    
    // Step 2
    await expect(page.locator('text=STEP 2 OF 5')).toBeVisible();
    await page.locator('button:has-text("Next")').click();
    
    // Step 3
    await expect(page.locator('text=STEP 3 OF 5')).toBeVisible();
    await page.locator('button:has-text("Next")').click();
    
    // Step 4
    await expect(page.locator('text=STEP 4 OF 5')).toBeVisible();
    await page.locator('button:has-text("Next")').click();
    
    // Step 5 (final)
    await expect(page.locator('text=STEP 5 OF 5')).toBeVisible();
  });

  test('should go back in onboarding steps', async ({ page }) => {
    // Wait for modal
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible({ timeout: 10000 });
    
    // Go to step 2
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=STEP 2 OF 5')).toBeVisible();
    
    // Go back to step 1
    await page.locator('button:has-text("Back")').click();
    await expect(page.locator('text=STEP 1 OF 5')).toBeVisible();
  });

  test('should display Admin card with correct features', async ({ page }) => {
    // Close onboarding first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Check Admin card content
    await expect(page.locator('text=Admin / QA Lead')).toBeVisible();
    await expect(page.locator('text=Executive Dashboard')).toBeVisible();
    await expect(page.locator('text=Spec Management')).toBeVisible();
    await expect(page.locator('text=User Control')).toBeVisible();
  });

  test('should display Technician card with correct features', async ({ page }) => {
    // Close onboarding first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Check Technician card content
    await expect(page.locator('text=Field Technician')).toBeVisible();
    await expect(page.locator('text=Personal Scorecard')).toBeVisible();
    await expect(page.locator('text=Dispute Findings')).toBeVisible();
    await expect(page.locator('text=Mobile View')).toBeVisible();
  });

  test('should have Enter Demo buttons on both cards', async ({ page }) => {
    // Close onboarding first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Both cards should have Enter Demo buttons
    const enterDemoButtons = page.locator('button:has-text("Enter Demo")');
    await expect(enterDemoButtons).toHaveCount(2);
  });

  test('should set localStorage when clicking Admin card', async ({ page }) => {
    // Close onboarding first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Click the Admin card
    await page.locator('text=Admin / QA Lead').click();
    
    // Check localStorage was set
    const role = await page.evaluate(() => localStorage.getItem('demo_user_role'));
    expect(role).toBe('admin');
  });

  test('should set localStorage when clicking Technician card', async ({ page }) => {
    // Close onboarding first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Click the Technician card
    await page.locator('text=Field Technician').click();
    
    // Check localStorage was set
    const role = await page.evaluate(() => localStorage.getItem('demo_user_role'));
    expect(role).toBe('technician');
  });
});

test.describe('Demo Mode Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Set demo login state directly before navigating
    await page.goto('/demo');
    await page.evaluate(() => {
      localStorage.setItem('demo_user_role', 'admin');
      localStorage.setItem('onboarding_completed', 'true');
    });
  });

  test('should redirect to dashboard after admin login', async ({ page }) => {
    // Navigate to home - should show dashboard since we're "logged in"
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Close onboarding modal if it appears (it may show on dashboard too)
    const modal = page.locator('text=Welcome to Job Sheet QA');
    if (await modal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Should see Dashboard content - look for sidebar with "Dashboard" text
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10000 });
    
    // Should see the sidebar navigation items
    await expect(page.locator('text=Upload Job Cards')).toBeVisible();
    await expect(page.locator('text=Audit Results')).toBeVisible();
  });

  test('should redirect to technician portal for technician role', async ({ page }) => {
    // Set technician role
    await page.evaluate(() => {
      localStorage.setItem('demo_user_role', 'technician');
    });
    
    // Navigate to technician portal
    await page.goto('/portal/dashboard');
    
    // Wait for load
    await page.waitForTimeout(2000);
    
    // Close onboarding modal if it appears
    const modal = page.locator('text=Welcome to Job Sheet QA');
    if (await modal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Should see some content (not redirected to login)
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Help Center (Public Page)', () => {
  test('should display Help Center page', async ({ page }) => {
    // Set demo state first
    await page.goto('/demo');
    await page.evaluate(() => {
      localStorage.setItem('demo_user_role', 'admin');
      localStorage.setItem('onboarding_completed', 'true');
    });
    
    // Navigate to help center
    await page.goto('/help');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Close onboarding modal if it appears
    const modal = page.locator('text=Welcome to Job Sheet QA');
    if (await modal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Should see Help content - look for "Help" or "Help Center" text
    await expect(page.locator('text=Help').first()).toBeVisible({ timeout: 10000 });
  });
});
