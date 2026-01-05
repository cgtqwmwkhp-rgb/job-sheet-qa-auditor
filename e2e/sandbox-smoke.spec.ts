/**
 * Sandbox UI Smoke Test
 * =====================
 * Lightweight UI smoke test for sandbox verification.
 * 
 * Purpose: Verify that key UI elements are present and the application is functional.
 * 
 * This test is:
 * - Opt-in (NOT part of the default CI test suite)
 * - Non-blocking (failures are warnings, not hard failures)
 * - Screenshot-free (no visual assertions)
 * 
 * Run with: pnpm exec playwright test e2e/sandbox-smoke.spec.ts
 * 
 * Prerequisites:
 * - Sandbox server running: ./scripts/sandbox-start.sh
 * - Fixtures available: docs/testing/sandbox-fixtures/
 */

import { test, expect } from '@playwright/test';
import { setupDemoLogin, closeModalIfPresent } from './helpers/demo-login';
import * as path from 'path';
import * as fs from 'fs';

// Fixture paths (relative to project root)
const FIXTURE_DIR = 'docs/testing/sandbox-fixtures';
const FIXTURE_PASS = path.join(FIXTURE_DIR, 'fixture_pass.json');
const FIXTURE_FAIL = path.join(FIXTURE_DIR, 'fixture_fail_missing_field.json');

test.describe('Sandbox UI Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    // Set up demo login to bypass OAuth
    await setupDemoLogin(page, 'admin');
  });

  test('Dashboard loads and key elements are present', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Close any modal that might be blocking
    await closeModalIfPresent(page);
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check for key dashboard elements (using flexible selectors)
    // These selectors are intentionally broad to avoid brittleness
    
    // 1. Main navigation should be present
    const nav = page.locator('nav, [role="navigation"], header');
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
    
    // 2. Main content area should be present
    const main = page.locator('main, [role="main"], .main-content, #root > div');
    await expect(main.first()).toBeVisible({ timeout: 10000 });
    
    // 3. Check for any heading (h1, h2, h3)
    const heading = page.locator('h1, h2, h3');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Dashboard loaded successfully');
  });

  test('Upload page is accessible', async ({ page }) => {
    // Navigate to upload page (try common paths)
    const uploadPaths = ['/upload', '/new', '/create', '/'];
    
    let uploadFound = false;
    for (const uploadPath of uploadPaths) {
      await page.goto(uploadPath);
      await closeModalIfPresent(page);
      
      // Look for upload-related elements
      const uploadElement = page.locator(
        'input[type="file"], ' +
        'button:has-text("Upload"), ' +
        '[data-testid="upload"], ' +
        '.upload-zone, ' +
        '.dropzone'
      );
      
      if (await uploadElement.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        uploadFound = true;
        console.log(`✅ Upload element found at ${uploadPath}`);
        break;
      }
    }
    
    // This is a soft assertion - we log but don't fail
    if (!uploadFound) {
      console.log('⚠️ Upload element not found on common paths (may require navigation)');
    }
  });

  test('Version endpoint returns valid response', async ({ page }) => {
    // Navigate to version endpoint
    const response = await page.goto('/api/trpc/system.version');
    
    // Check response status
    expect(response?.status()).toBe(200);
    
    // Get response body
    const body = await page.textContent('body');
    
    // Verify it contains expected fields
    expect(body).toContain('gitSha');
    expect(body).toContain('environment');
    
    console.log('✅ Version endpoint returns valid response');
  });

  test('Health endpoint returns valid response', async ({ page }) => {
    // Navigate to health endpoint
    const response = await page.goto('/api/trpc/system.health');
    
    // Check response status (may be 200 or 400 depending on input requirements)
    const status = response?.status();
    expect([200, 400]).toContain(status);
    
    console.log(`✅ Health endpoint responds with status ${status}`);
  });

  test('No console errors on page load', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navigate to dashboard
    await page.goto('/');
    await closeModalIfPresent(page);
    await page.waitForLoadState('networkidle');
    
    // Filter out known acceptable errors (e.g., failed network requests in demo mode)
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('Failed to load resource') &&
      !error.includes('net::ERR_') &&
      !error.includes('OAuth')
    );
    
    if (criticalErrors.length > 0) {
      console.log('⚠️ Console errors detected:', criticalErrors);
    } else {
      console.log('✅ No critical console errors');
    }
    
    // Soft assertion - log but don't fail for minor errors
    expect(criticalErrors.length).toBeLessThan(5);
  });
});

test.describe('Sandbox Fixture Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up demo login to bypass OAuth
    await setupDemoLogin(page, 'admin');
  });

  test('Fixture files exist and are valid JSON', async () => {
    // Verify fixture files exist
    const passFixturePath = path.resolve(process.cwd(), FIXTURE_PASS);
    const failFixturePath = path.resolve(process.cwd(), FIXTURE_FAIL);
    
    expect(fs.existsSync(passFixturePath)).toBe(true);
    expect(fs.existsSync(failFixturePath)).toBe(true);
    
    // Verify they are valid JSON
    const passFixture = JSON.parse(fs.readFileSync(passFixturePath, 'utf-8'));
    const failFixture = JSON.parse(fs.readFileSync(failFixturePath, 'utf-8'));
    
    // Verify canonical structure
    expect(passFixture.id).toBeDefined();
    expect(passFixture.expectedResult).toBe('pass');
    expect(passFixture.validatedFields).toBeDefined();
    expect(passFixture.findings).toHaveLength(0);
    
    expect(failFixture.id).toBeDefined();
    expect(failFixture.expectedResult).toBe('fail');
    expect(failFixture.validatedFields).toBeDefined();
    expect(failFixture.findings.length).toBeGreaterThan(0);
    
    // Verify canonical reason codes
    const validReasonCodes = new Set([
      'VALID', 'MISSING_FIELD', 'UNREADABLE_FIELD', 'LOW_CONFIDENCE',
      'INVALID_FORMAT', 'CONFLICT', 'OUT_OF_POLICY', 'INCOMPLETE_EVIDENCE',
      'OCR_FAILURE', 'PIPELINE_ERROR', 'SPEC_GAP', 'SECURITY_RISK'
    ]);
    
    for (const field of passFixture.validatedFields) {
      expect(validReasonCodes.has(field.reasonCode)).toBe(true);
    }
    
    for (const field of failFixture.validatedFields) {
      expect(validReasonCodes.has(field.reasonCode)).toBe(true);
    }
    
    for (const finding of failFixture.findings) {
      expect(validReasonCodes.has(finding.reasonCode)).toBe(true);
    }
    
    console.log('✅ Fixture files are valid and use canonical reason codes');
  });

  test('Pass fixture has 0 issues in validatedFields', async () => {
    const passFixturePath = path.resolve(process.cwd(), FIXTURE_PASS);
    const passFixture = JSON.parse(fs.readFileSync(passFixturePath, 'utf-8'));
    
    const failedFields = passFixture.validatedFields.filter(
      (f: { status: string }) => f.status === 'failed'
    );
    
    expect(failedFields.length).toBe(0);
    expect(passFixture.findings.length).toBe(0);
    
    console.log('✅ Pass fixture has Issues=0');
  });

  test('Fail fixture has >0 issues in validatedFields', async () => {
    const failFixturePath = path.resolve(process.cwd(), FIXTURE_FAIL);
    const failFixture = JSON.parse(fs.readFileSync(failFixturePath, 'utf-8'));
    
    const failedFields = failFixture.validatedFields.filter(
      (f: { status: string }) => f.status === 'failed'
    );
    
    expect(failedFields.length).toBeGreaterThan(0);
    expect(failFixture.findings.length).toBeGreaterThan(0);
    
    // Verify the failed field uses MISSING_FIELD (canonical code)
    const missingFieldFinding = failFixture.findings.find(
      (f: { reasonCode: string }) => f.reasonCode === 'MISSING_FIELD'
    );
    expect(missingFieldFinding).toBeDefined();
    
    console.log(`✅ Fail fixture has Issues=${failedFields.length} (>0)`);
  });

  test('Fixtures have consistent validatedFields and findings', async () => {
    const failFixturePath = path.resolve(process.cwd(), FIXTURE_FAIL);
    const failFixture = JSON.parse(fs.readFileSync(failFixturePath, 'utf-8'));
    
    // Every failed validatedField should have a corresponding finding
    const failedFields = failFixture.validatedFields.filter(
      (f: { status: string }) => f.status === 'failed'
    );
    
    for (const field of failedFields) {
      const matchingFinding = failFixture.findings.find(
        (f: { ruleId: string; reasonCode: string }) => 
          f.ruleId === field.ruleId && f.reasonCode === field.reasonCode
      );
      expect(matchingFinding).toBeDefined();
    }
    
    console.log('✅ Fixtures have consistent validatedFields and findings');
  });
});
