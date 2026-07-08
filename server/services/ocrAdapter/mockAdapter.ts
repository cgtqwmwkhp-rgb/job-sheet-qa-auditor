/**
 * Mock OCR Adapter
 *
 * Test implementation for no-secrets CI testing.
 * Returns deterministic results for contract tests.
 *
 * PR-2: Includes a `deep` fixture with OCR-4 blocks, signature, and word confidence.
 */

import { getCorrelationId } from '../../utils/context';
import type {
  OCRAdapter,
  OCRResult,
  OCROptions,
  OCRProviderArtifact,
  OCRPage,
} from './types';
import { summarizeDeepFeatures } from './types';

const DEEP_MARKDOWN =
  '# Job Sheet\n\n**Job Number:** JS-2024-001\n**Date:** 2024-01-15\n**Client:** ACME Corp\n\n## Work Description\n\nRoutine maintenance inspection completed.\n\nCustomer Signature:\n';

const DEEP_PAGE: OCRPage = {
  pageNumber: 1,
  markdown: DEEP_MARKDOWN,
  dimensions: { width: 1700, height: 2200, dpi: 200 },
  blocks: [
    {
      type: 'title',
      content: 'Job Sheet',
      pixelCorners: { topLeftX: 240, topLeftY: 180, bottomRightX: 800, bottomRightY: 260 },
      boundingBox: {
        x: (240 / 1700) * 100,
        y: (180 / 2200) * 100,
        width: ((800 - 240) / 1700) * 100,
        height: ((260 - 180) / 2200) * 100,
        coordinateSpace: 'percent',
      },
    },
    {
      type: 'text',
      content: 'Job Number: JS-2024-001',
      pixelCorners: { topLeftX: 290, topLeftY: 400, bottomRightX: 900, bottomRightY: 460 },
      boundingBox: {
        x: (290 / 1700) * 100,
        y: (400 / 2200) * 100,
        width: ((900 - 290) / 1700) * 100,
        height: ((460 - 400) / 2200) * 100,
        coordinateSpace: 'percent',
      },
    },
    {
      type: 'signature',
      content: '',
      pixelCorners: { topLeftX: 200, topLeftY: 1800, bottomRightX: 900, bottomRightY: 2050 },
      boundingBox: {
        x: (200 / 1700) * 100,
        y: (1800 / 2200) * 100,
        width: ((900 - 200) / 1700) * 100,
        height: ((2050 - 1800) / 2200) * 100,
        coordinateSpace: 'percent',
      },
    },
  ],
  confidenceScores: {
    averagePageConfidence: 0.91,
    minimumPageConfidence: 0.82,
    wordConfidenceScores: [
      { text: 'Job', confidence: 0.99, startIndex: DEEP_MARKDOWN.indexOf('Job Number') },
      { text: ' Number', confidence: 0.98, startIndex: DEEP_MARKDOWN.indexOf('Job Number') + 3 },
      { text: ':', confidence: 0.99, startIndex: DEEP_MARKDOWN.indexOf('Job Number:') + 10 },
      { text: ' JS-2024-001', confidence: 0.82, startIndex: DEEP_MARKDOWN.indexOf('JS-2024-001') },
    ],
  },
  signatures: [
    {
      pageNumber: 1,
      content: '',
      isIllegible: true,
      boundingBox: {
        x: (200 / 1700) * 100,
        y: (1800 / 2200) * 100,
        width: ((900 - 200) / 1700) * 100,
        height: ((2050 - 1800) / 2200) * 100,
        coordinateSpace: 'percent',
      },
      pixelCorners: { topLeftX: 200, topLeftY: 1800, bottomRightX: 900, bottomRightY: 2050 },
    },
  ],
};

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
  deep: {
    success: true,
    pages: [DEEP_PAGE],
    totalPages: 1,
    model: 'mock-ocr-4-deep',
    processingTimeMs: 180,
    usageInfo: {
      pagesProcessed: 1,
      tokensGenerated: 150,
    },
    deepFeatures: summarizeDeepFeatures([DEEP_PAGE], true),
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

    // When caller explicitly disables deep features, strip them from deep fixture
    if (options?.includeDeepFeatures === false && this.mockResponse.pages.some(p => p.blocks)) {
      return {
        ...this.mockResponse,
        correlationId,
        pages: this.mockResponse.pages.map(p => ({
          pageNumber: p.pageNumber,
          markdown: p.markdown,
          images: p.images,
          dimensions: p.dimensions,
        })),
        deepFeatures: undefined,
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
        includeDeepFeatures: options?.includeDeepFeatures,
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

/** Expose mock presets for tests */
export const MOCK_OCR_PRESETS = MOCK_RESPONSES;
