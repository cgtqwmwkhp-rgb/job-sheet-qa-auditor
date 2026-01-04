/**
 * Mock OCR Adapter
 * 
 * Test implementation for no-secrets CI testing.
 * Returns deterministic results for contract tests.
 */

import { getCorrelationId } from '../../utils/context';
import type { OCRAdapter, OCRResult, OCROptions, OCRProviderArtifact } from './types';

/**
 * Mock OCR responses for testing
 */
const MOCK_RESPONSES: Record<string, OCRResult> = {
  default: {
    success: true,
    pages: [
      {
        pageNumber: 1,
        markdown: '# Job Sheet\n\n**Job Number:** JS-2024-001\n**Date:** 2024-01-15\n**Client:** ACME Corp\n\n## Work Description\n\nRoutine maintenance inspection completed.',
        dimensions: { width: 612, height: 792, dpi: 72 },
      },
    ],
    totalPages: 1,
    model: 'mock-ocr-v1',
    processingTimeMs: 150,
    usageInfo: {
      pagesProcessed: 1,
      tokensGenerated: 100,
    },
  },
  multiPage: {
    success: true,
    pages: [
      {
        pageNumber: 1,
        markdown: '# Job Sheet - Page 1\n\n**Job Number:** JS-2024-002\n**Date:** 2024-01-20',
        dimensions: { width: 612, height: 792, dpi: 72 },
      },
      {
        pageNumber: 2,
        markdown: '## Work Details - Page 2\n\nDetailed inspection findings...',
        dimensions: { width: 612, height: 792, dpi: 72 },
      },
    ],
    totalPages: 2,
    model: 'mock-ocr-v1',
    processingTimeMs: 250,
    usageInfo: {
      pagesProcessed: 2,
      tokensGenerated: 200,
    },
  },
  error: {
    success: false,
    pages: [],
    totalPages: 0,
    model: 'mock-ocr-v1',
    error: 'Mock error for testing',
    errorCode: 'MOCK_ERROR',
  },
};

/**
 * Mock OCR Adapter implementation
 */
export class MockOCRAdapter implements OCRAdapter {
  readonly providerName = 'mock';
  readonly modelId = 'mock-ocr-v1';
  
  private mockResponse: OCRResult = MOCK_RESPONSES.default;
  private shouldFail = false;
  
  /**
   * Set the mock response for testing
   */
  setMockResponse(key: keyof typeof MOCK_RESPONSES | OCRResult): void {
    if (typeof key === 'string') {
      this.mockResponse = MOCK_RESPONSES[key] || MOCK_RESPONSES.default;
    } else {
      this.mockResponse = key;
    }
  }
  
  /**
   * Set whether the adapter should fail
   */
  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }
  
  /**
   * Reset to default state
   */
  reset(): void {
    this.mockResponse = MOCK_RESPONSES.default;
    this.shouldFail = false;
  }
  
  /**
   * Extract text from a document URL (mock)
   */
  async extractFromUrl(documentUrl: string, options?: OCROptions): Promise<OCRResult> {
    const correlationId = getCorrelationId();
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (this.shouldFail) {
      return {
        ...MOCK_RESPONSES.error,
        correlationId,
      };
    }
    
    return {
      ...this.mockResponse,
      correlationId,
    };
  }
  
  /**
   * Extract text from base64 encoded document (mock)
   */
  async extractFromBase64(
    base64Data: string,
    mimeType: string,
    options?: OCROptions
  ): Promise<OCRResult> {
    return this.extractFromUrl('mock://base64', options);
  }
  
  /**
   * Validate API key (always valid for mock)
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }
  
  /**
   * Get provider artifact for audit trail
   */
  getProviderArtifact(result: OCRResult, options?: OCROptions): OCRProviderArtifact {
    return {
      provider: this.providerName,
      model: this.modelId,
      timestamp: new Date().toISOString(),
      correlationId: result.correlationId,
      requestMetadata: {
        documentType: 'url',
        pageLimit: options?.pageLimit,
        imageLimit: options?.imageLimit,
      },
      responseMetadata: {
        statusCode: result.success ? 200 : 500,
        processingTimeMs: result.processingTimeMs || 0,
        pagesProcessed: result.totalPages,
        tokensGenerated: result.usageInfo?.tokensGenerated,
      },
    };
  }
}

/**
 * Create mock OCR adapter instance
 */
export function createMockAdapter(): MockOCRAdapter {
  return new MockOCRAdapter();
}

/**
 * Singleton mock adapter for testing
 */
let mockAdapterInstance: MockOCRAdapter | null = null;

export function getMockAdapter(): MockOCRAdapter {
  if (!mockAdapterInstance) {
    mockAdapterInstance = new MockOCRAdapter();
  }
  return mockAdapterInstance;
}

export function resetMockAdapter(): void {
  if (mockAdapterInstance) {
    mockAdapterInstance.reset();
  }
}
