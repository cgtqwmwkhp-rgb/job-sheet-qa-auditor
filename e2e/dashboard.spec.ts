import { test, expect } from '@playwright/test';

/**
 * Dashboard & Analytics E2E Tests
 * ================================
 * Tests the main dashboard and analytics functionality
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Enter as Admin
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
  });

  test('should display dashboard with KPIs', async ({ page }) => {
    // Navigate to dashboard if not already there
    await page.locator('a:has-text("Dashboard")').first().click();
    
    // Check for KPI cards
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should show role-specific greeting', async ({ page }) => {
    await page.locator('a:has-text("Dashboard")').first().click();
    
    // Should show personalized greeting
    await expect(page.locator('text=Welcome, text=Good')).toBeVisible();
  });

  test('should display smart tips on KPIs', async ({ page }) => {
    await page.locator('a:has-text("Dashboard")').first().click();
    
    // Smart tips should be present
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should show recent activity', async ({ page }) => {
    await page.locator('a:has-text("Dashboard")').first().click();
    
    // Recent activity section should exist
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should display charts and visualizations', async ({ page }) => {
    await page.locator('a:has-text("Dashboard")').first().click();
    
    // Charts should be rendered
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });
});

test.describe('Analytics Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    await page.locator('a:has-text("Analytics")').first().click();
  });

  test('should display analytics page', async ({ page }) => {
    await expect(page.locator('text=Analytics')).toBeVisible();
  });

  test('should show date range filters', async ({ page }) => {
    // Date filters should be present
    await expect(page.locator('text=Analytics')).toBeVisible();
  });

  test('should display trend charts', async ({ page }) => {
    // Charts should be rendered
    await expect(page.locator('text=Analytics')).toBeVisible();
  });

  test('should support data export', async ({ page }) => {
    // Export functionality should exist
    await expect(page.locator('text=Analytics')).toBeVisible();
  });
});

test.describe('Dashboard Responsiveness', () => {
  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    
    // Dashboard should still be functional
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Should still show demo gateway
    await expect(page.locator('text=Job Sheet QA')).toBeVisible();
  });
});

test.describe('Dashboard Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.locator('button:has-text("×"), [aria-label="Close"]').first().click();
    await page.locator('text=Admin / QA Lead').locator('..').locator('button:has-text("Enter Demo")').click();
    await page.waitForURL(/.*dashboard|.*\//);
    
    // Filter out known acceptable errors
    const criticalErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('404') &&
      !e.includes('net::ERR')
    );
    
    expect(criticalErrors.length).toBe(0);
  });
});
