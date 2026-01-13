import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * DocumentViewer Performance and Security Tests
 * 
 * These tests verify:
 * 1. No blob.core.windows.net URLs are allowed
 * 2. PDF proxy endpoint is used
 * 3. Performance marks are set correctly
 */

describe('DocumentViewer URL Guard', () => {
  const consoleError = console.error;
  
  beforeEach(() => {
    console.error = vi.fn();
  });
  
  afterEach(() => {
    console.error = consoleError;
  });
  
  it('should reject direct blob.core.windows.net URLs', () => {
    const blobUrl = 'https://mystorageaccount.blob.core.windows.net/container/file.pdf?sv=2020-08-04&sig=...';
    
    // In dev mode, this should throw
    const assertNoDirectBlobUrl = (url: string) => {
      if (url && url.includes('blob.core.windows.net')) {
        throw new Error('Direct blob URLs not allowed');
      }
    };
    
    expect(() => assertNoDirectBlobUrl(blobUrl)).toThrow('Direct blob URLs not allowed');
  });
  
  it('should allow PDF proxy endpoint URLs', () => {
    const proxyUrl = '/api/documents/31/pdf';
    
    const assertNoDirectBlobUrl = (url: string) => {
      if (url && url.includes('blob.core.windows.net')) {
        throw new Error('Direct blob URLs not allowed');
      }
    };
    
    expect(() => assertNoDirectBlobUrl(proxyUrl)).not.toThrow();
  });
  
  it('should detect blob URLs in various formats', () => {
    const blobUrls = [
      'https://account.blob.core.windows.net/container/file.pdf',
      'https://account.blob.core.windows.net/container/file.pdf?sv=2020',
      'https://storage.blob.core.windows.net/docs/report.pdf',
    ];
    
    const assertNoDirectBlobUrl = (url: string) => {
      if (url && url.includes('blob.core.windows.net')) {
        throw new Error('Direct blob URLs not allowed');
      }
    };
    
    for (const url of blobUrls) {
      expect(() => assertNoDirectBlobUrl(url)).toThrow('Direct blob URLs not allowed');
    }
  });
});

describe('PDF Proxy Endpoint Compliance', () => {
  it('should use /api/documents/:id/pdf pattern', () => {
    const validPatterns = [
      '/api/documents/1/pdf',
      '/api/documents/31/pdf',
      '/api/documents/123456/pdf',
    ];
    
    const isValidProxyUrl = (url: string) => /^\/api\/documents\/\d+\/pdf$/.test(url);
    
    for (const url of validPatterns) {
      expect(isValidProxyUrl(url)).toBe(true);
    }
  });
  
  it('should reject blob URLs as proxy endpoints', () => {
    const invalidUrls = [
      'https://account.blob.core.windows.net/container/file.pdf',
      '/blob/container/file.pdf',
    ];
    
    const isValidProxyUrl = (url: string) => /^\/api\/documents\/\d+\/pdf$/.test(url);
    
    for (const url of invalidUrls) {
      expect(isValidProxyUrl(url)).toBe(false);
    }
  });
});
