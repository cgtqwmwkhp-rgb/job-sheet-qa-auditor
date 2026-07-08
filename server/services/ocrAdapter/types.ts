/**
 * OCR Adapter Types
 * 
 * Defines the pluggable OCR adapter interface for document text extraction.
 * Primary implementation: Mistral OCR 2503
 */

/**
 * OCR page result with extracted content
 */
export interface OCRPage {
  pageNumber: number;
  markdown: string;
  images?: Array<{
    id: string;
    topLeftX: number;
    topLeftY: number;
    bottomRightX: number;
    bottomRightY: number;
  }>;
  dimensions?: {
    width: number;
    height: number;
    dpi: number;
  };
}

/**
 * OCR extraction result
 */
export interface OCRResult {
  success: boolean;
  pages: OCRPage[];
  totalPages: number;
  model: string;
  correlationId?: string;
  processingTimeMs?: number;
  usageInfo?: {
    pagesProcessed: number;
    tokensGenerated: number;
  };
  error?: string;
  errorCode?: string;
  retryAttempts?: number;
}

/**
 * OCR extraction options
 */
export interface OCROptions {
  includeImageLocations?: boolean;
  imageLimit?: number;
  pageLimit?: number;
  jobSheetId?: number;
  skipRetry?: boolean;
  redactPII?: boolean;
}

/**
 * Provider raw response artifact (for audit trail)
 * Sensitive fields are redacted before storage
 */
export interface OCRProviderArtifact {
  provider: string;
  model: string;
  timestamp: string;
  correlationId?: string;
  requestMetadata: {
    documentType: 'url' | 'base64';
    pageLimit?: number;
    imageLimit?: number;
  };
  responseMetadata: {
    statusCode: number;
    processingTimeMs: number;
    pagesProcessed: number;
    tokensGenerated?: number;
  };
  // Raw response is NOT stored - only metadata
  // This prevents accidental PII/OCR text leakage
}

/**
 * OCR adapter interface - pluggable implementation
 */
export interface OCRAdapter {
  /**
   * Provider name for logging and artifacts
   */
  readonly providerName: string;
  
  /**
   * Model identifier
   */
  readonly modelId: string;
  
  /**
   * Extract text from a document URL
   */
  extractFromUrl(documentUrl: string, options?: OCROptions): Promise<OCRResult>;
  
  /**
   * Extract text from base64 encoded document
   */
  extractFromBase64(base64Data: string, mimeType: string, options?: OCROptions): Promise<OCRResult>;
  
  /**
   * Validate API key is configured and working
   */
  validateApiKey(): Promise<{ valid: boolean; error?: string }>;
  
  /**
   * Get provider artifact for audit trail (redacted)
   */
  getProviderArtifact(result: OCRResult, options?: OCROptions): OCRProviderArtifact;
}

/**
 * OCR adapter factory function type
 */
export type OCRAdapterFactory = () => OCRAdapter;

/**
 * Supported OCR providers
 */
export type OCRProvider = 'mistral' | 'mock';

/**
 * OCR configuration from environment
 */
export interface OCRConfig {
  provider: OCRProvider;
  model: string;
  apiKey?: string;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Default OCR provider.
 */
export const DEFAULT_OCR_PROVIDER: OCRProvider = 'mistral';

/**
 * Pinned, best-in-class OCR model version (single source of truth).
 *
 * PR-1: Pin an explicit, immutable model version rather than a floating alias
 * such as `mistral-ocr-latest`. A floating alias can silently change which
 * engine produced an audit (Mistral's `-latest` moved from 2503 to OCR 4 in
 * June 2026), which is unacceptable for an auditable compliance trail.
 * Upgrade deliberately by overriding the MISTRAL_OCR_MODEL environment
 * variable once a candidate has passed the golden-set eval gate.
 */
export const DEFAULT_OCR_MODEL = 'mistral-ocr-4-0';

/**
 * Get OCR configuration from environment
 */
export function getOCRConfig(): OCRConfig {
  return {
    provider: (process.env.OCR_PROVIDER as OCRProvider) || DEFAULT_OCR_PROVIDER,
    model: process.env.MISTRAL_OCR_MODEL || DEFAULT_OCR_MODEL,
    apiKey: process.env.MISTRAL_API_KEY,
    maxRetries: parseInt(process.env.OCR_MAX_RETRIES || '3', 10),
    baseDelayMs: parseInt(process.env.OCR_BASE_DELAY_MS || '2000', 10),
    maxDelayMs: parseInt(process.env.OCR_MAX_DELAY_MS || '30000', 10),
  };
}

/**
 * Build the engine-version tag stamped on every audit result, e.g.
 * `mistral/mistral-ocr-4-0`. Records both provider and exact model so an
 * audit is always attributable to the engine that produced it. Kept within
 * the 32-character `audit_results.ocrEngineVersion` column budget.
 */
export function getOCREngineVersion(model?: string, config: OCRConfig = getOCRConfig()): string {
  return `${config.provider}/${model ?? config.model}`;
}
