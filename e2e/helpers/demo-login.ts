import { Page } from '@playwright/test';

/**
 * Helper function to set up demo login state via localStorage
 * This bypasses the need to interact with the demo gateway UI
 * and avoids issues with onboarding modals blocking tests.
 */
export async function setupDemoLogin(page: Page, role: 'admin' | 'technician' = 'admin') {
  // Navigate to a page that won't trigger OAuth redirect
  // The demo page is public and won't redirect
  await page.goto('/demo');
  
  // Set localStorage values for demo mode
  await page.evaluate((userRole) => {
    localStorage.setItem('demo_user_role', userRole);
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('demo_user_name', userRole === 'admin' ? 'Sarah Connor' : 'John Smith');
    localStorage.setItem('demo_user_email', userRole === 'admin' ? 'sarah@example.com' : 'john@example.com');
  }, role);
}

/**
 * Helper to close any modal that might be blocking the UI
 * Uses keyboard escape which is safer than clicking
 */
export async function closeModalIfPresent(page: Page) {
  // Wait a bit for any modal to appear
  await page.waitForTimeout(500);
  
  // Try to close onboarding modal using Escape key (safer than clicking)
  const onboardingModal = page.locator('text=Welcome to Job Sheet QA');
  if (await onboardingModal.isVisible()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return true;
  }
  
  // Try escape key for any other modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  
  return false;
}

/**
 * Navigate to a page with demo login already set up
 * Uses direct navigation after setting localStorage
 */
export async function navigateWithDemoLogin(page: Page, path: string, role: 'admin' | 'technician' = 'admin') {
  // First set up demo login state
  await setupDemoLogin(page, role);
  
  // Now navigate to the target path
  await page.goto(path);
  
  // Wait for page to stabilize
  await page.waitForTimeout(1000);
  
  // Close any modal that appears
  await closeModalIfPresent(page);
}
