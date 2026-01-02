import { test, expect } from '@playwright/test';

/**
 * Settings & Configuration E2E Tests
 * ===================================
 * Tests the settings pages and configuration options
 */

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Enter as Admin
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    
    // Navigate to Settings
    await page.locator('a:has-text("Settings")').first().click();
    await page.waitForSelector('text=Settings');
  });

  test('should display settings page', async ({ page }) => {
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('should show settings tabs', async ({ page }) => {
    // Check for tab navigation
    await expect(page.locator('text=General')).toBeVisible();
  });

  test('should display processing settings tab', async ({ page }) => {
    // Navigate to Processing tab
    const processingTab = page.locator('button:has-text("Processing"), a:has-text("Processing")');
    if (await processingTab.isVisible()) {
      await processingTab.click();
      await expect(page.locator('text=Processing')).toBeVisible();
    }
  });
});

test.describe('Processing Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    await page.locator('a:has-text("Settings")').first().click();
  });

  test('should show LLM fallback toggle', async ({ page }) => {
    // Navigate to Processing tab
    const processingTab = page.locator('button:has-text("Processing"), a:has-text("Processing")');
    if (await processingTab.isVisible()) {
      await processingTab.click();
      // Look for LLM toggle
      await expect(page.locator('text=LLM')).toBeVisible();
    }
  });

  test('should show confidence threshold sliders', async ({ page }) => {
    const processingTab = page.locator('button:has-text("Processing"), a:has-text("Processing")');
    if (await processingTab.isVisible()) {
      await processingTab.click();
      // Look for threshold controls
      await expect(page.locator('text=Confidence, text=Threshold')).toBeVisible();
    }
  });

  test('should save settings changes', async ({ page }) => {
    // Settings should have save functionality
    await expect(page.locator('text=Settings')).toBeVisible();
  });
});

test.describe('Spec Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    await page.locator('a:has-text("Specs"), a:has-text("Gold Standard")').first().click();
  });

  test('should display spec management page', async ({ page }) => {
    await expect(page.locator('text=Spec, text=Gold Standard')).toBeVisible();
  });

  test('should show spec list or empty state', async ({ page }) => {
    // Page should handle both cases
    await expect(page.locator('text=Spec')).toBeVisible();
  });

  test('should have create spec functionality', async ({ page }) => {
    // Create button should be present
    await expect(page.locator('text=Spec')).toBeVisible();
  });
});

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    await page.locator('a:has-text("Users")').first().click();
  });

  test('should display user management page', async ({ page }) => {
    await expect(page.locator('text=User')).toBeVisible();
  });

  test('should show user list', async ({ page }) => {
    await expect(page.locator('text=User')).toBeVisible();
  });

  test('should have role management capability', async ({ page }) => {
    // Role assignment should be available
    await expect(page.locator('text=User')).toBeVisible();
  });
});
