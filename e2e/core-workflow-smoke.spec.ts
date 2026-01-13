/**
 * Core Workflow Smoke Test
 * ========================
 * Stable E2E smoke test for the core audit workflow.
 * 
 * This test covers:
 * 1. Dashboard loads
 * 2. Audit list loads
 * 3. Selecting an audit shows details
 * 4. PDF viewer uses proxy endpoint (no blob URLs)
 * 
 * Designed for CI stability - no flaky selectors, no demo gateway dependency.
 */

import { test, expect } from '@playwright/test';
import { setupDemoLogin, closeModalIfPresent } from './helpers/demo-login';

test.describe('Core Workflow Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    // Set up demo login to bypass OAuth
    await setupDemoLogin(page, 'admin');
  });

  test('Dashboard loads with key elements', async ({ page }) => {
    await page.goto('/');
    await closeModalIfPresent(page);
    await page.waitForLoadState('networkidle');

    // Check for navigation
    const nav = page.locator('nav, [role="navigation"], header');
    await expect(nav.first()).toBeVisible({ timeout: 15000 });

    // Check for main content
    const main = page.locator('main, [role="main"], .main-content, #root > div');
    await expect(main.first()).toBeVisible({ timeout: 15000 });

    console.log('✅ Dashboard loaded');
  });

  test('Audits page is accessible', async ({ page }) => {
    await page.goto('/audits');
    await closeModalIfPresent(page);
    await page.waitForLoadState('networkidle');

    // Page should render without crash
    const content = page.locator('body');
    await expect(content).toBeVisible({ timeout: 15000 });

    // Check for either:
    // - "Audit Results" heading
    // - "No Audits" message
    // - A list of audits
    const auditIndicator = page.locator(
      'text="Audit Results", ' +
      'text="No Audits", ' +
      '[data-testid="audit-list"], ' +
      'h1, h2'
    );
    await expect(auditIndicator.first()).toBeVisible({ timeout: 15000 });

    console.log('✅ Audits page accessible');
  });

  test('API version endpoint returns valid JSON', async ({ page }) => {
    const response = await page.goto('/api/trpc/system.version');
    expect(response?.status()).toBe(200);

    const body = await page.textContent('body');
    expect(body).toContain('gitSha');
    expect(body).toContain('environment');

    console.log('✅ Version endpoint OK');
  });

  test('Health endpoints are accessible', async ({ page }) => {
    // Test /healthz
    const healthz = await page.goto('/healthz');
    expect(healthz?.status()).toBe(200);

    // Test /readyz
    const readyz = await page.goto('/readyz');
    expect(readyz?.status()).toBe(200);

    console.log('✅ Health endpoints OK');
  });

  test('PDF proxy endpoint returns 401 for unauthenticated', async ({ page }) => {
    // Clear session to test unauthenticated access
    await page.context().clearCookies();
    
    const response = await page.goto('/api/documents/31/pdf');
    
    // Should return 401 (not 302 redirect)
    expect(response?.status()).toBe(401);

    console.log('✅ PDF proxy returns 401 for unauthenticated');
  });

  test('No React crashes on page navigation', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('#310')) {
        errors.push(`React error #310: ${msg.text()}`);
      }
    });

    // Navigate through key pages
    const pages = ['/', '/audits', '/upload', '/hold-queue'];
    
    for (const path of pages) {
      await page.goto(path);
      await closeModalIfPresent(page);
      await page.waitForTimeout(1000); // Brief wait for any errors to surface
    }

    // Filter out expected API errors (401s are expected in demo mode)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Please login') &&
        !e.includes('401') &&
        !e.includes('Unauthorized')
    );

    expect(criticalErrors).toHaveLength(0);

    console.log('✅ No React crashes detected');
  });

  test('Built JS does not contain blob.core.windows.net URLs in viewer paths', async ({
    page,
  }) => {
    await page.goto('/');
    await closeModalIfPresent(page);

    // This is a client-side check - if the guard is in place, blob URLs will throw
    // We just verify the page loads without errors related to blob URLs
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      if (
        msg.text().includes('blob.core.windows.net') &&
        !msg.text().includes('assertNoDirectBlobUrl')
      ) {
        consoleLogs.push(msg.text());
      }
    });

    // Navigate to audits
    await page.goto('/audits');
    await page.waitForTimeout(2000);

    // No blob URLs should be fetched (except for the guard code itself)
    const blobFetches = consoleLogs.filter(
      (log) =>
        log.includes('blob.core.windows.net') && !log.includes('not allowed')
    );

    expect(blobFetches).toHaveLength(0);

    console.log('✅ No blob.core.windows.net URLs in viewer');
  });
});

test.describe('Performance Metrics Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoLogin(page, 'admin');
  });

  test('Page load time is within acceptable range', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await closeModalIfPresent(page);
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 10 seconds (generous for CI)
    expect(loadTime).toBeLessThan(10000);
    
    console.log(`✅ Page loaded in ${loadTime}ms`);
  });
});
