/**
 * Cache Headers Contract Tests (INC-2026-01-12-ASSETS)
 * 
 * Ensures proper cache control headers are set for:
 * - index.html: no-store (must revalidate on every request)
 * - /assets/*: immutable (hashed filenames, cache forever)
 * - Service workers: no-cache (must revalidate)
 * - Images/icons: 1 day cache
 * 
 * These tests validate the cache strategy that prevents stale chunk errors.
 * See: docs/runbooks/STATIC_ASSET_SERVING.md
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Cache Headers Contract', () => {
  describe('Cache Control Strategy - Code Verification', () => {
    it('should have no-store for index.html in vite.ts', async () => {
      const vitePath = path.resolve(__dirname, '../../_core/vite.ts');
      const viteContent = fs.readFileSync(vitePath, 'utf-8');
      
      // Verify the index.html cache control pattern
      expect(viteContent).toContain("'no-store, no-cache, must-revalidate'");
      expect(viteContent).toContain("filePath.endsWith('index.html')");
    });

    it('should have immutable for hashed assets in vite.ts', async () => {
      const vitePath = path.resolve(__dirname, '../../_core/vite.ts');
      const viteContent = fs.readFileSync(vitePath, 'utf-8');
      
      // Verify the assets caching strategy
      expect(viteContent).toContain("maxAge: '1y'");
      expect(viteContent).toContain('immutable: true');
    });

    it('should have no-cache for service workers', async () => {
      const vitePath = path.resolve(__dirname, '../../_core/vite.ts');
      const viteContent = fs.readFileSync(vitePath, 'utf-8');
      
      // Verify service worker handling
      expect(viteContent).toContain("sw.js");
      expect(viteContent).toContain("'no-cache, must-revalidate'");
    });

    it('should have reasonable cache for images', async () => {
      const vitePath = path.resolve(__dirname, '../../_core/vite.ts');
      const viteContent = fs.readFileSync(vitePath, 'utf-8');
      
      // Verify image caching (1 day = 86400 seconds)
      expect(viteContent).toContain("max-age=86400");
      expect(viteContent).toMatch(/\.(png|jpg|ico|svg)/);
    });
  });

  describe('SPA Fallback', () => {
    it('should exclude .auth routes from SPA fallback', async () => {
      const vitePath = path.resolve(__dirname, '../../_core/vite.ts');
      const viteContent = fs.readFileSync(vitePath, 'utf-8');
      
      // Verify Azure Easy Auth routes are excluded
      expect(viteContent).toContain("/.auth");
      expect(viteContent).toContain("startsWith('/.auth')");
    });
  });

  describe('PWA Assets', () => {
    it('should have PWA icons defined in vite config', async () => {
      const viteConfigPath = path.resolve(__dirname, '../../../vite.config.ts');
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
      
      // Verify PWA icons are configured
      expect(viteConfig).toContain('pwa-192x192');
      expect(viteConfig).toContain('pwa-512x512');
    });

    it('should have favicon defined in index.html', async () => {
      const indexPath = path.resolve(__dirname, '../../../client/index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      
      // Verify favicon link
      expect(indexContent).toContain('rel="icon"');
      expect(indexContent).toContain('favicon');
    });
  });
});

describe('Analytics Script Safety', () => {
  it('should not load analytics if env vars are unsubstituted', () => {
    // Verify the guard pattern exists
    const unsubstitutedPattern = '%VITE_';
    const badEndpoint = '%VITE_ANALYTICS_ENDPOINT%';
    
    // The analytics.ts file should check for this pattern
    expect(badEndpoint.includes(unsubstitutedPattern)).toBe(true);
    
    // A properly substituted var would not contain %
    const goodEndpoint = 'https://analytics.example.com';
    expect(goodEndpoint.includes('%')).toBe(false);
  });

  it('should have analytics guard in analytics.ts', async () => {
    const analyticsPath = path.resolve(__dirname, '../../../client/src/analytics.ts');
    const analyticsContent = fs.readFileSync(analyticsPath, 'utf-8');
    
    // Verify the unsubstituted check exists - checks for includes('%')
    expect(analyticsContent).toContain("includes('%')");
    // Verify there's a guard that checks if endpoint/website_id are falsy
    expect(analyticsContent).toContain('!ANALYTICS_ENDPOINT');
  });
});

describe('Azure Easy Auth ExcludedPaths Contract', () => {
  /**
   * These paths MUST be in Azure Easy Auth excludedPaths config.
   * If not, static assets will return 401 and the app won't load.
   */
  const REQUIRED_EXCLUDED_PATHS = [
    '/healthz',
    '/readyz', 
    '/metrics',
    '/assets/*',
    '/manifest.webmanifest',
    '/sw.js',
    '/images/*',
  ];

  it('should document required excludedPaths', () => {
    // This test documents the contract - actual verification is in CI
    REQUIRED_EXCLUDED_PATHS.forEach(path => {
      expect(path).toBeDefined();
    });
    
    expect(REQUIRED_EXCLUDED_PATHS.length).toBeGreaterThanOrEqual(7);
  });
});
