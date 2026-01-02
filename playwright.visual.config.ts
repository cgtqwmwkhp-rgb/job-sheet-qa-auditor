import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Visual Regression Test Configuration
 * ================================================
 * Specialized configuration for visual regression testing
 * with screenshot comparison capabilities.
 */
export default defineConfig({
  // Test directory for visual regression tests
  testDir: './e2e/visual-regression',
  
  // Snapshot directory for baseline images
  snapshotDir: './e2e/visual-regression/snapshots',
  
  // Run tests sequentially for consistent screenshots
  fullyParallel: false,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry failed tests (visual tests can be flaky)
  retries: process.env.CI ? 2 : 1,
  
  // Single worker for consistent screenshots
  workers: 1,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'visual-regression-report' }],
    ['json', { outputFile: 'visual-regression-results/results.json' }],
    ['list']
  ],
  
  // Shared settings for all projects
  use: {
    // Base URL for the application
    baseURL: 'http://localhost:3000',
    
    // Collect trace when retrying failed test
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Fixed viewport for consistent screenshots
    viewport: { width: 1280, height: 720 },
    
    // Timeout for actions
    actionTimeout: 15000,
    
    // Navigation timeout
    navigationTimeout: 30000,
    
    // Disable animations for consistent screenshots
    launchOptions: {
      args: ['--disable-animations'],
    },
  },
  
  // Visual comparison settings
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      // Maximum allowed pixel difference ratio (0.2 = 20%)
      maxDiffPixelRatio: 0.02,
      
      // Maximum allowed pixel difference count
      maxDiffPixels: 100,
      
      // Threshold for color comparison (0-1, lower = stricter)
      threshold: 0.2,
      
      // Animation handling
      animations: 'disabled',
      
      // Caret blinking
      caret: 'hide',
    },
    toMatchSnapshot: {
      // Maximum allowed pixel difference ratio
      maxDiffPixelRatio: 0.02,
      
      // Threshold for color comparison
      threshold: 0.2,
    },
  },
  
  // Configure projects for different viewports
  projects: [
    // Desktop Chrome
    {
      name: 'desktop-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    
    // Desktop Firefox
    {
      name: 'desktop-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    
    // Tablet viewport
    {
      name: 'tablet',
      use: { 
        ...devices['iPad Pro'],
        viewport: { width: 1024, height: 768 },
      },
    },
    
    // Mobile viewport
    {
      name: 'mobile',
      use: { 
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  
  // Run local dev server before starting tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  
  // Global timeout for each test
  timeout: 60000,
  
  // Output directory for test artifacts
  outputDir: 'visual-regression-results',
});
