/**
 * OCR Service (compatibility facade)
 *
 * PR-1: Unified onto the single OCR adapter interface in `./ocrAdapter`.
 *
 * There is now ONE OCR implementation (the adapter) and ONE pinned model
 * source of truth (`DEFAULT_OCR_MODEL`). This module is a thin facade that
 * preserves the existing public surface so current importers
 * (`documentProcessor`, `routers`, and `ocr.test`) are unaffected, while the
 * legacy duplicate Mistral client — including its raw `console.log` calls that
 * risked leaking OCR text — is retired in favour of the adapter's safe logger.
 */

export type {
  OCRPage,
  OCRResult,
  OCROptions,
  OCRBlock,
  OCRBlockType,
  OCRWordConfidence,
  OCRConfidenceScores,
  OCRSignatureRegion,
  OCRDeepFeaturesSummary,
} from './ocrAdapter/types';
import type { OCRResult, OCROptions } from './ocrAdapter/types';
import { getOCRAdapter } from './ocrAdapter';

/**
 * @deprecated Retained for backwards compatibility only. The Mistral endpoint
 * is now owned by the OCR adapter (`./ocrAdapter/mistralAdapter`).
 */
export const MISTRAL_OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr';

/**
 * Extract text from a document URL via the configured OCR adapter.
 */
export async function extractTextFromDocument(
  documentUrl: string,
  options: OCROptions = {},
): Promise<OCRResult> {
  return getOCRAdapter().extractFromUrl(documentUrl, options);
}

/**
 * Extract text from a base64-encoded document via the configured OCR adapter.
 */
export async function extractTextFromBase64(
  base64Data: string,
  mimeType: string = 'application/pdf',
  options: OCROptions = {},
): Promise<OCRResult> {
  return getOCRAdapter().extractFromBase64(base64Data, mimeType, options);
}

/**
 * Validate that the configured OCR provider's credentials are working.
 */
export async function validateMistralApiKey(): Promise<{ valid: boolean; error?: string }> {
  return getOCRAdapter().validateApiKey();
}
