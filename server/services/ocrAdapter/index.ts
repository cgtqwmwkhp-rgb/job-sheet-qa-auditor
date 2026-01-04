/**
 * OCR Service Module
 * 
 * Provides pluggable OCR adapter for document text extraction.
 * Primary: Mistral OCR 2503
 * Testing: Mock adapter (no-secrets CI)
 */

export * from './types';
export * from './mistralAdapter';
export * from './mockAdapter';

import type { OCRAdapter, OCRProvider } from './types';
import { getOCRConfig } from './types';
import { createMistralAdapter, getOCRCircuitBreakerStatus, resetOCRCircuitBreaker } from './mistralAdapter';
import { createMockAdapter, getMockAdapter } from './mockAdapter';

/**
 * Get the configured OCR adapter
 * 
 * Uses OCR_PROVIDER env var to select adapter:
 * - 'mistral' (default): Mistral OCR 2503
 * - 'mock': Mock adapter for testing
 */
export function getOCRAdapter(): OCRAdapter {
  const config = getOCRConfig();
  
  switch (config.provider) {
    case 'mock':
      return getMockAdapter();
    case 'mistral':
    default:
      return createMistralAdapter();
  }
}

/**
 * Create a specific OCR adapter by provider name
 */
export function createOCRAdapter(provider: OCRProvider): OCRAdapter {
  switch (provider) {
    case 'mock':
      return createMockAdapter();
    case 'mistral':
    default:
      return createMistralAdapter();
  }
}

// Re-export circuit breaker utilities
export { getOCRCircuitBreakerStatus, resetOCRCircuitBreaker };
