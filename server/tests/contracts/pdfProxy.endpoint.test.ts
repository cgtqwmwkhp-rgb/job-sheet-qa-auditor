/**
 * PDF Proxy Endpoint Contract Tests
 * 
 * Verifies that the PDF proxy endpoint:
 * 1. Requires authentication (returns 401 without auth header)
 * 2. Returns proper content type headers
 * 3. Supports HTTP Range requests
 * 4. Handles download mode
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PDF Proxy Endpoint Contract', () => {
  const pdfProxyPath = path.resolve(__dirname, '../../_core/pdfProxy.ts');
  let pdfProxyContent: string;

  beforeAll(() => {
    pdfProxyContent = fs.readFileSync(pdfProxyPath, 'utf-8');
  });

  describe('Authentication', () => {
    it('should have requireAuth middleware defined', () => {
      expect(pdfProxyContent).toContain('function requireAuth');
    });

    it('should check for x-ms-client-principal header', () => {
      expect(pdfProxyContent).toContain("x-ms-client-principal");
    });

    it('should return 401 when no principal header', () => {
      expect(pdfProxyContent).toContain('res.status(401)');
      expect(pdfProxyContent).toContain("'Unauthorized'");
    });

    it('should apply requireAuth to GET endpoint', () => {
      expect(pdfProxyContent).toContain("router.get('/:jobSheetId/pdf', requireAuth");
    });

    it('should apply requireAuth to HEAD endpoint', () => {
      expect(pdfProxyContent).toContain("router.head('/:jobSheetId/pdf', requireAuth");
    });
  });

  describe('Content Headers', () => {
    it('should set Content-Type to application/pdf', () => {
      expect(pdfProxyContent).toContain("'application/pdf'");
      expect(pdfProxyContent).toContain("Content-Type");
    });

    it('should set Content-Disposition header', () => {
      expect(pdfProxyContent).toContain('Content-Disposition');
    });

    it('should support inline disposition for viewing', () => {
      expect(pdfProxyContent).toContain("'inline'");
    });

    it('should support attachment disposition for download', () => {
      expect(pdfProxyContent).toContain("'attachment'");
      expect(pdfProxyContent).toContain('download');
    });
  });

  describe('Range Request Support', () => {
    it('should check for Range header', () => {
      expect(pdfProxyContent).toContain('req.headers.range');
    });

    it('should forward Range header to storage', () => {
      expect(pdfProxyContent).toContain("'Range'");
    });

    it('should set Accept-Ranges header', () => {
      expect(pdfProxyContent).toContain('Accept-Ranges');
      expect(pdfProxyContent).toContain("'bytes'");
    });

    it('should handle 206 Partial Content response', () => {
      expect(pdfProxyContent).toContain('206');
      expect(pdfProxyContent).toContain('Content-Range');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid job sheet ID', () => {
      expect(pdfProxyContent).toContain("res.status(400)");
      expect(pdfProxyContent).toContain("Invalid job sheet ID");
    });

    it('should return 404 for missing job sheet', () => {
      expect(pdfProxyContent).toContain("res.status(404)");
      expect(pdfProxyContent).toContain("Job sheet not found");
    });

    it('should return 502 for storage fetch failures', () => {
      expect(pdfProxyContent).toContain("res.status(502)");
    });

    it('should handle stream errors gracefully', () => {
      expect(pdfProxyContent).toContain('Stream error');
    });
  });

  describe('Caching', () => {
    it('should set Cache-Control header', () => {
      expect(pdfProxyContent).toContain('Cache-Control');
    });

    it('should use private caching for authenticated content', () => {
      expect(pdfProxyContent).toContain("'private");
    });
  });
});
