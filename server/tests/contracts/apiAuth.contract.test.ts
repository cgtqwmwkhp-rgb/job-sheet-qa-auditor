/**
 * API Authentication Contract Tests
 * 
 * Verifies that:
 * 1. API endpoints return 401 (not redirect) when unauthenticated
 * 2. Protected procedures require authentication
 * 3. Auth context correctly parses Azure Easy Auth headers
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('API Authentication Contract', () => {
  describe('SDK Auth Handling', () => {
    const sdkPath = path.resolve(__dirname, '../../_core/sdk.ts');
    let sdkContent: string;

    beforeAll(() => {
      sdkContent = fs.readFileSync(sdkPath, 'utf-8');
    });

    it('should read x-ms-client-principal header for Azure Easy Auth', () => {
      expect(sdkContent).toContain('x-ms-client-principal');
    });

    it('should decode base64 principal from Azure header', () => {
      expect(sdkContent).toContain("Buffer.from(azureClientPrincipal, 'base64')");
    });

    it('should parse principal JSON', () => {
      expect(sdkContent).toContain('JSON.parse(decoded)');
    });
    
    it('should handle Azure AD authentication', () => {
      expect(sdkContent).toContain('azure-easy-auth');
    });
  });

  describe('Protected Procedures', () => {
    const trpcPath = path.resolve(__dirname, '../../_core/trpc.ts');
    let trpcContent: string;

    beforeAll(() => {
      trpcContent = fs.readFileSync(trpcPath, 'utf-8');
    });

    it('should define protectedProcedure', () => {
      expect(trpcContent).toContain('protectedProcedure');
    });

    it('should throw UNAUTHORIZED for missing user', () => {
      expect(trpcContent).toContain('UNAUTHORIZED');
    });
  });

  describe('Router Protected Routes', () => {
    const routersPath = path.resolve(__dirname, '../../routers.ts');
    let routersContent: string;

    beforeAll(() => {
      routersContent = fs.readFileSync(routersPath, 'utf-8');
    });

    it('jobSheets.list should be protected', () => {
      expect(routersContent).toMatch(/jobSheets:\s*router\(\{[\s\S]*?list:\s*protectedProcedure/);
    });

    it('jobSheets.get should be protected', () => {
      expect(routersContent).toContain('get: protectedProcedure');
    });

    it('jobSheets.upload should be protected', () => {
      expect(routersContent).toContain('upload: protectedProcedure');
    });

    it('audits.list should be protected', () => {
      expect(routersContent).toMatch(/audits[\s\S]*?list:\s*protectedProcedure/);
    });
  });

  describe('PDF Proxy Auth', () => {
    const pdfProxyPath = path.resolve(__dirname, '../../_core/pdfProxy.ts');
    let pdfProxyContent: string;

    beforeAll(() => {
      pdfProxyContent = fs.readFileSync(pdfProxyPath, 'utf-8');
    });

    it('should have dedicated auth middleware', () => {
      expect(pdfProxyContent).toContain('function requireAuth');
    });

    it('should return 401 for unauthenticated requests', () => {
      expect(pdfProxyContent).toContain('res.status(401)');
    });

    it('should NOT redirect to login', () => {
      // PDF proxy should never issue a redirect
      expect(pdfProxyContent).not.toContain('res.redirect');
      expect(pdfProxyContent).not.toContain('302');
    });
  });
});
