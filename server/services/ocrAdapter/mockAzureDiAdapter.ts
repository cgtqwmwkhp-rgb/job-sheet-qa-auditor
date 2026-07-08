/**
 * Mock Azure Document Intelligence OCR Adapter (PR-4).
 *
 * Fixture-driven — no live Azure HTTP. Used as OCR_FALLBACK_PROVIDER in
 * overnight / CI tests when failover or cross-check is enabled.
 */

import { getCorrelationId } from "../../utils/context";
import type {
  OCRAdapter,
  OCRResult,
  OCROptions,
  OCRProviderArtifact,
  OCRPage,
} from "./types";
import { DEFAULT_AZURE_DI_MODEL } from "./types";
import { parseAzureDiResponse } from "./parseAzureDiResponse";

const AGREEING_MARKDOWN =
  "# Job Sheet\n\n**Job Number:** JS-2024-001\n**Date:** 2024-01-15\n**Client:** ACME Corp\n\n## Work Description\n\nRoutine maintenance inspection completed.";

const DISAGREEING_MARKDOWN =
  "# Different Document\n\n**Job Number:** ZZ-99999\n**Client:** Other Corp\n\nUnrelated content for cross-check disagreement tests.";

const AGREEING_PAGE: OCRPage = {
  pageNumber: 1,
  markdown: AGREEING_MARKDOWN,
  dimensions: { width: 8.5, height: 11, dpi: 72 },
  confidenceScores: {
    averagePageConfidence: 0.94,
    minimumPageConfidence: 0.88,
  },
};

const DISAGREEING_PAGE: OCRPage = {
  pageNumber: 1,
  markdown: DISAGREEING_MARKDOWN,
  dimensions: { width: 8.5, height: 11, dpi: 72 },
  confidenceScores: {
    averagePageConfidence: 0.9,
    minimumPageConfidence: 0.85,
  },
};

const MOCK_AZURE_RESPONSES: Record<string, OCRResult> = {
  default: {
    success: true,
    pages: [AGREEING_PAGE],
    totalPages: 1,
    model: DEFAULT_AZURE_DI_MODEL,
    provider: "azure",
    processingTimeMs: 120,
    usageInfo: { pagesProcessed: 1, tokensGenerated: 0 },
  },
  disagree: {
    success: true,
    pages: [DISAGREEING_PAGE],
    totalPages: 1,
    model: DEFAULT_AZURE_DI_MODEL,
    provider: "azure",
    processingTimeMs: 110,
    usageInfo: { pagesProcessed: 1, tokensGenerated: 0 },
  },
  error: {
    success: false,
    pages: [],
    totalPages: 0,
    model: DEFAULT_AZURE_DI_MODEL,
    provider: "azure",
    error: "Mock Azure DI error for testing",
    errorCode: "AZURE_DI_MOCK_ERROR",
  },
};

/**
 * Mock Azure DI adapter — deterministic, no network.
 */
export class MockAzureDiAdapter implements OCRAdapter {
  readonly providerName = "azure";
  readonly modelId = DEFAULT_AZURE_DI_MODEL;

  private mockResponse: OCRResult = MOCK_AZURE_RESPONSES.default;
  private shouldFail = false;

  setMockResponse(key: keyof typeof MOCK_AZURE_RESPONSES | OCRResult): void {
    if (typeof key === "string") {
      this.mockResponse =
        MOCK_AZURE_RESPONSES[key] || MOCK_AZURE_RESPONSES.default;
    } else {
      this.mockResponse = key;
    }
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  reset(): void {
    this.mockResponse = MOCK_AZURE_RESPONSES.default;
    this.shouldFail = false;
  }

  /**
   * Load response from a raw Azure DI JSON fixture (parser path).
   */
  setFromFixture(raw: unknown): void {
    const parsed = parseAzureDiResponse(raw);
    this.mockResponse = {
      success: parsed.pages.length > 0,
      pages: parsed.pages,
      totalPages: parsed.pages.length,
      model: parsed.model,
      provider: "azure",
      processingTimeMs: 100,
      usageInfo: parsed.usageInfo,
      error: parsed.pages.length === 0 ? "Empty Azure DI fixture" : undefined,
      errorCode: parsed.pages.length === 0 ? "AZURE_DI_EMPTY" : undefined,
    };
  }

  async extractFromUrl(
    _documentUrl: string,
    _options?: OCROptions
  ): Promise<OCRResult> {
    const correlationId = getCorrelationId();
    await new Promise(resolve => setTimeout(resolve, 5));

    if (this.shouldFail) {
      return { ...MOCK_AZURE_RESPONSES.error, correlationId };
    }

    return { ...this.mockResponse, correlationId, provider: "azure" };
  }

  async extractFromBase64(
    _base64Data: string,
    _mimeType: string,
    options?: OCROptions
  ): Promise<OCRResult> {
    return this.extractFromUrl("mock-azure://base64", options);
  }

  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }

  getProviderArtifact(
    result: OCRResult,
    options?: OCROptions
  ): OCRProviderArtifact {
    return {
      provider: this.providerName,
      model: this.modelId,
      timestamp: new Date().toISOString(),
      correlationId: result.correlationId,
      requestMetadata: {
        documentType: "url",
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

export function createMockAzureDiAdapter(): MockAzureDiAdapter {
  return new MockAzureDiAdapter();
}

let mockAzureInstance: MockAzureDiAdapter | null = null;

export function getMockAzureDiAdapter(): MockAzureDiAdapter {
  if (!mockAzureInstance) {
    mockAzureInstance = new MockAzureDiAdapter();
  }
  return mockAzureInstance;
}

export function resetMockAzureDiAdapter(): void {
  if (mockAzureInstance) {
    mockAzureInstance.reset();
  }
}

export const MOCK_AZURE_DI_PRESETS = MOCK_AZURE_RESPONSES;
