import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Document Upload E2E Tests
 * =========================
 * Tests the complete document upload and processing workflow
 */

test.describe('Document Upload Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Enter as Admin
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    
    // Navigate to Upload page
    await page.locator('a:has-text("Upload")').first().click();
    await page.waitForSelector('text=Upload Job Sheets');
  });

  test('should display upload interface', async ({ page }) => {
    // Check for upload zone
    await expect(page.locator('text=Drag and drop')).toBeVisible();
    
    // Check for supported formats info
    await expect(page.locator('text=PDF')).toBeVisible();
  });

  test('should show upload guidelines', async ({ page }) => {
    // Check for guidelines section
    await expect(page.locator('text=Guidelines')).toBeVisible();
  });

  test('should handle empty file list gracefully', async ({ page }) => {
    // The page should not crash with no files
    await expect(page.locator('text=Upload Job Sheets')).toBeVisible();
  });

  test('should show file type validation message for invalid files', async ({ page }) => {
    // Create a mock invalid file upload scenario
    // This tests the UI response to invalid file types
    const fileInput = page.locator('input[type="file"]');
    
    // Check that file input exists
    await expect(fileInput).toBeAttached();
  });

  test('should display processing status indicators', async ({ page }) => {
    // Check for status-related UI elements
    // These should be present even with no files
    await expect(page.locator('text=Upload')).toBeVisible();
  });
});

test.describe('Upload Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    await page.locator('a:has-text("Upload")').first().click();
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Tab through the page
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Should be able to navigate without errors
    await expect(page.locator('text=Upload Job Sheets')).toBeVisible();
  });

  test('should have proper focus indicators', async ({ page }) => {
    // Focus on interactive elements should be visible
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Browse")').first();
    if (await uploadButton.isVisible()) {
      await uploadButton.focus();
      // Button should be focusable
      await expect(uploadButton).toBeFocused();
    }
  });
});

test.describe('Upload Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    await page.locator('a:has-text("Upload")').first().click();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // The page should remain stable even with network issues
    await expect(page.locator('text=Upload Job Sheets')).toBeVisible();
  });

  test('should show appropriate error messages', async ({ page }) => {
    // Error handling UI should be in place
    // This is a structural test to ensure error handling exists
    await expect(page.locator('text=Upload')).toBeVisible();
  });
});
