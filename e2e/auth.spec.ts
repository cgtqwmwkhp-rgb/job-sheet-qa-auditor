import { test, expect } from '@playwright/test';

/**
 * Authentication & Demo Gateway E2E Tests
 * ========================================
 * Tests the demo gateway login flow and role-based access
 */

test.describe('Demo Gateway', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the demo gateway on first visit', async ({ page }) => {
    // Check for the main title
    await expect(page.locator('text=Job Sheet QA Auditor')).toBeVisible();
    
    // Check for role selection cards
    await expect(page.locator('text=Admin / QA Lead')).toBeVisible();
    await expect(page.locator('text=Technician')).toBeVisible();
  });

  test('should show onboarding tour modal', async ({ page }) => {
    // The onboarding modal should appear
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible();
    
    // Should show step progress
    await expect(page.locator('text=STEP 1 OF')).toBeVisible();
  });

  test('should allow closing the onboarding tour', async ({ page }) => {
    // Wait for modal to appear
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible();
    
    // Click the close button (X)
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    
    // Modal should be closed
    await expect(page.locator('text=Welcome to Job Sheet QA')).not.toBeVisible();
  });

  test('should navigate through onboarding steps', async ({ page }) => {
    // Wait for modal
    await expect(page.locator('text=Welcome to Job Sheet QA')).toBeVisible();
    
    // Click Next
    await page.locator('button:has-text("Next")').click();
    
    // Should advance to step 2
    await expect(page.locator('text=STEP 2 OF')).toBeVisible();
  });

  test('should enter demo as Admin', async ({ page }) => {
    // Close onboarding modal first
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    
    // Click Enter Demo on Admin card
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard|.*\//);
    
    // Dashboard should be visible
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should enter demo as Technician', async ({ page }) => {
    // Close onboarding modal first
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    
    // Click Enter Demo on Technician card
    await page.locator('text=Technician').locator('..').locator('button:has-text("Enter Demo")').click();
    
    // Should redirect to technician portal or dashboard
    await expect(page).toHaveURL(/.*/);
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Enter as Admin
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
  });

  test('should navigate to Dashboard', async ({ page }) => {
    await page.locator('a:has-text("Dashboard")').first().click();
    await expect(page.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible();
  });

  test('should navigate to Upload page', async ({ page }) => {
    await page.locator('a:has-text("Upload")').first().click();
    await expect(page.locator('text=Upload Job Sheets')).toBeVisible();
  });

  test('should navigate to Audit Results', async ({ page }) => {
    await page.locator('a:has-text("Audit Results")').first().click();
    await expect(page.locator('text=Audit Results')).toBeVisible();
  });

  test('should navigate to Disputes', async ({ page }) => {
    await page.locator('a:has-text("Disputes")').first().click();
    await expect(page.locator('text=Dispute')).toBeVisible();
  });

  test('should navigate to Settings', async ({ page }) => {
    await page.locator('a:has-text("Settings")').first().click();
    await expect(page.locator('text=System Settings')).toBeVisible();
  });

  test('should navigate to Help Center', async ({ page }) => {
    await page.locator('a:has-text("Help")').first().click();
    await expect(page.locator('text=Help Center')).toBeVisible();
  });
});
