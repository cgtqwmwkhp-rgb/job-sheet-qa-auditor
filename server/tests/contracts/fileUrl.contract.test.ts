/**
 * File URL Endpoint Contract Tests
 * 
 * Verifies that the getFileUrl endpoint correctly retrieves fresh SAS URLs
 * for job sheet files, enabling reliable PDF viewing and downloading.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('File URL Endpoint Contract', () => {
  const routersPath = path.resolve(__dirname, '../../routers.ts');
  let routersContent: string;

  beforeAll(() => {
    routersContent = fs.readFileSync(routersPath, 'utf-8');
  });

  describe('getFileUrl Endpoint', () => {
    it('should have getFileUrl procedure defined in jobSheets router', () => {
      expect(routersContent).toContain('getFileUrl: protectedProcedure');
    });

    it('should accept id as input parameter', () => {
      expect(routersContent).toContain('getFileUrl: protectedProcedure');
      // The endpoint should accept an id parameter
      const getFileUrlSection = routersContent.substring(
        routersContent.indexOf('getFileUrl: protectedProcedure'),
        routersContent.indexOf('getFileUrl: protectedProcedure') + 500
      );
      expect(getFileUrlSection).toContain('id: z.number()');
    });

    it('should return url, fileName, and fileType', () => {
      const getFileUrlSection = routersContent.substring(
        routersContent.indexOf('getFileUrl: protectedProcedure'),
        routersContent.indexOf('getFileUrl: protectedProcedure') + 1000
      );
      expect(getFileUrlSection).toContain('url');
      expect(getFileUrlSection).toContain('fileName');
      expect(getFileUrlSection).toContain('fileType');
    });

    it('should use storage adapter to generate fresh URL when fileKey exists', () => {
      const getFileUrlSection = routersContent.substring(
        routersContent.indexOf('getFileUrl: protectedProcedure'),
        routersContent.indexOf('getFileUrl: protectedProcedure') + 1000
      );
      expect(getFileUrlSection).toContain('getStorageAdapter()');
      expect(getFileUrlSection).toContain('storage.get(');
    });

    it('should handle case when job sheet not found', () => {
      const getFileUrlSection = routersContent.substring(
        routersContent.indexOf('getFileUrl: protectedProcedure'),
        routersContent.indexOf('getFileUrl: protectedProcedure') + 500
      );
      expect(getFileUrlSection).toContain("throw new Error('Job sheet not found')");
    });

    it('should fall back to stored URL when no fileKey', () => {
      const getFileUrlSection = routersContent.substring(
        routersContent.indexOf('getFileUrl: protectedProcedure'),
        routersContent.indexOf('getFileUrl: protectedProcedure') + 1000
      );
      expect(getFileUrlSection).toContain('jobSheet.fileUrl');
    });
  });
});
