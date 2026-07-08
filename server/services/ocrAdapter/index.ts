/**
 * OCR Service Module
 *
 * Provides pluggable OCR adapter for document text extraction.
 * Primary: Mistral OCR (pinned via DEFAULT_OCR_MODEL, currently mistral-ocr-4-0)
 * Fallback: Azure Document Intelligence (PR-4, when OCR_FAILOVER_ENABLED)
 * Testing: Mock adapter (no-secrets CI)
 */

export * from "./types";
export * from "./mistralAdapter";
export * from "./mockAdapter";
export * from "./mockAzureDiAdapter";
export * from "./azureDocumentIntelligenceAdapter";
export * from "./resilientOcrAdapter";
export {
  parseMistralOcrResponse,
  pixelCornersToPercent,
} from "./parseMistralOcrResponse";
export { parseAzureDiResponse } from "./parseAzureDiResponse";

import type { OCRAdapter, OCRProvider } from "./types";
import { getOCRConfig } from "./types";
import {
  createMistralAdapter,
  getOCRCircuitBreakerStatus,
  resetOCRCircuitBreaker,
} from "./mistralAdapter";
import { createMockAdapter, getMockAdapter } from "./mockAdapter";
import { createAzureDocumentIntelligenceAdapter } from "./azureDocumentIntelligenceAdapter";
import { createMockAzureDiAdapter } from "./mockAzureDiAdapter";
import { createResilientOcrAdapter } from "./resilientOcrAdapter";

/**
 * Create a leaf adapter for a provider (no resilience wrap).
 */
function createLeafAdapter(provider: OCRProvider): OCRAdapter {
  switch (provider) {
    case "mock":
      return getMockAdapter();
    case "azure":
      return createAzureDocumentIntelligenceAdapter();
    case "mistral":
    default:
      return createMistralAdapter();
  }
}

/**
 * Get the configured OCR adapter
 *
 * Uses OCR_PROVIDER env var to select adapter:
 * - 'mistral' (default): Mistral OCR (pinned model, see DEFAULT_OCR_MODEL)
 * - 'mock': Mock adapter for testing
 * - 'azure': Azure Document Intelligence (primary when selected)
 *
 * When OCR_FAILOVER_ENABLED=true, wraps primary with resilient failover
 * to OCR_FALLBACK_PROVIDER (default azure). Does not replace primary.
 */
export function getOCRAdapter(): OCRAdapter {
  const config = getOCRConfig();
  const primary = createLeafAdapter(config.provider);

  if (!config.failoverEnabled && config.crossCheckSampleRate <= 0) {
    return primary;
  }

  // Avoid wrapping primary with itself as fallback
  const fallbackProvider =
    config.fallbackProvider === config.provider
      ? config.provider === "mock"
        ? "azure"
        : "mock"
      : config.fallbackProvider;

  // In CI / mocks-only: when primary is mock and fallback is azure, use mock Azure
  const fallback =
    config.provider === "mock" && fallbackProvider === "azure"
      ? createMockAzureDiAdapter()
      : fallbackProvider === "azure" && !config.azureKey
        ? createMockAzureDiAdapter()
        : createLeafAdapter(fallbackProvider);

  return createResilientOcrAdapter(primary, fallback, {
    failoverEnabled: config.failoverEnabled,
    crossCheckSampleRate: config.crossCheckSampleRate,
    primaryProviderName: config.provider,
    fallbackProviderName:
      fallback.providerName === "mock-azure" ? "azure" : fallbackProvider,
  });
}

/**
 * Create a specific OCR adapter by provider name (leaf, no wrap).
 */
export function createOCRAdapter(provider: OCRProvider): OCRAdapter {
  switch (provider) {
    case "mock":
      return createMockAdapter();
    case "azure":
      return createAzureDocumentIntelligenceAdapter();
    case "mistral":
    default:
      return createMistralAdapter();
  }
}

// Re-export circuit breaker utilities
export { getOCRCircuitBreakerStatus, resetOCRCircuitBreaker };
