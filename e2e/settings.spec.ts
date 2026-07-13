import { test, expect } from "@playwright/test";

/**
 * Settings & Configuration E2E Tests
 * ===================================
 * Tests the demo gateway flow for settings functionality
 *
 * Note: Protected pages that make tRPC calls require OAuth authentication.
 * These tests focus on the demo gateway flow and basic page structure.
 */

test.describe("Settings via Demo Gateway", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });

  test("should show template studio feature in admin card", async ({
    page,
  }) => {
    await expect(page.locator("text=Template Studio")).toBeVisible();
  });

  test("should show user control feature in admin card", async ({ page }) => {
    await expect(page.locator("text=User Control")).toBeVisible();
  });
});

test.describe("Processing Settings", () => {
  test("demo gateway should show admin features", async ({ page }) => {
    await page.goto("/demo");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(page.locator("text=Executive Dashboard")).toBeVisible();
  });
});

test.describe("Template Studio", () => {
  test("demo gateway should display template studio feature", async ({
    page,
  }) => {
    await page.goto("/demo");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(page.locator("text=Template Studio")).toBeVisible();
    await expect(page.locator("text=Spec Management")).toHaveCount(0);
  });
});

test.describe("User Management", () => {
  test("demo gateway should display user control feature", async ({ page }) => {
    await page.goto("/demo");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(page.locator("text=User Control")).toBeVisible();
  });
});
