/**
 * OCR Adapter Types
 *
 * Defines the pluggable OCR adapter interface for document text extraction.
 * Primary implementation: Mistral OCR (pinned via DEFAULT_OCR_MODEL).
 *
 * PR-2: Optional OCR-4 deep features (blocks, word confidence, signatures).
 */

/**
 * Structural block types returned by Mistral OCR-4 `include_blocks`.
 */
export type OCRBlockType =
  | 'text'
  | 'title'
  | 'list'
  | 'table'
  | 'image'
  | 'equation'
  | 'caption'
  | 'code'
  | 'references'
  | 'aside_text'
  | 'header'
  | 'footer'
  | 'signature'
  | string;

/**
 * Normalized bounding box in percent of page dimensions (0–100).
 * Matches DocumentViewer coordinate space for PR-12 highlight wiring.
 */
export interface OCRBoundingBoxPercent {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: 'percent';
}

/**
 * Pixel-corner bbox as returned by Mistral (before normalization).
 */
export interface OCRPixelCorners {
  topLeftX: number;
  topLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
}

/**
 * A structural content block from OCR-4.
 */
export interface OCRBlock {
  type: OCRBlockType;
  content: string;
  /** Pixel corners from the provider (optional if only percent available). */
  pixelCorners?: OCRPixelCorners;
  /** Normalized percent bbox when page dimensions are known. */
  boundingBox?: OCRBoundingBoxPercent;
  imageId?: string;
  tableId?: string;
}

/**
 * Per-word confidence entry (indices into page markdown).
 */
export interface OCRWordConfidence {
  text: string;
  /** Confidence in 0–1 range. */
  confidence: number;
  /** Start index into the page markdown string. */
  startIndex: number;
}

/**
 * Page-level confidence aggregates (+ optional word scores).
 */
export interface OCRConfidenceScores {
  averagePageConfidence?: number;
  minimumPageConfidence?: number;
  wordConfidenceScores?: OCRWordConfidence[];
}

/**
 * Derived signature region (from blocks with type === 'signature').
 */
export interface OCRSignatureRegion {
  pageNumber: number;
  content: string;
  boundingBox?: OCRBoundingBoxPercent;
  pixelCorners?: OCRPixelCorners;
  /** True when ink is present but transcription is empty/illegible. */
  isIllegible: boolean;
}

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
  /** OCR-4 structural blocks (optional; absent on shallow responses). */
  blocks?: OCRBlock[];
  /** OCR-4 confidence scores (optional). */
  confidenceScores?: OCRConfidenceScores;
  /** Derived from blocks where type === 'signature'. */
  signatures?: OCRSignatureRegion[];
}

/**
 * Lightweight deep-feature summary (safe to store in reportJson — no raw text).
 */
export interface OCRDeepFeaturesSummary {
  enabled: boolean;
  pagesWithBlocks: number;
  signatureBlocksDetected: number;
  averagePageConfidence?: number;
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
  /** Optional deep-feature summary (no PII / block content). */
  deepFeatures?: OCRDeepFeaturesSummary;
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
  /**
   * Request OCR-4 deep features (blocks + confidence).
   * Defaults to config/env gate when omitted.
   */
  includeDeepFeatures?: boolean;
  /** Maps to Mistral `confidence_scores_granularity`. */
  confidenceGranularity?: 'word' | 'page' | 'none';
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
    includeDeepFeatures?: boolean;
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
  /** Master switch for OCR-4 deep features. */
  deepFeaturesEnabled: boolean;
  confidenceGranularity: 'word' | 'page' | 'none';
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
 * True when the model supports OCR-4 deep features (blocks, word confidence).
 */
export function supportsDeepFeatures(model: string): boolean {
  return model.startsWith('mistral-ocr-4');
}

/**
 * Resolve whether deep features are enabled for the given model/env.
 * OCR_DEEP_FEATURES=false|0 forces off; true|1 forces on.
 * Default: on for mistral-ocr-4* models.
 */
export function resolveDeepFeaturesEnabled(model: string, envValue?: string): boolean {
  const raw = envValue ?? process.env.OCR_DEEP_FEATURES;
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  return supportsDeepFeatures(model);
}

function resolveConfidenceGranularity(
  envValue?: string
): 'word' | 'page' | 'none' {
  const raw = (envValue ?? process.env.OCR_CONFIDENCE_GRANULARITY ?? 'word').toLowerCase();
  if (raw === 'page' || raw === 'none' || raw === 'word') return raw;
  return 'word';
}

/**
 * Get OCR configuration from environment
 */
export function getOCRConfig(): OCRConfig {
  const model = process.env.MISTRAL_OCR_MODEL || DEFAULT_OCR_MODEL;
  return {
    provider: (process.env.OCR_PROVIDER as OCRProvider) || DEFAULT_OCR_PROVIDER,
    model,
    apiKey: process.env.MISTRAL_API_KEY,
    maxRetries: parseInt(process.env.OCR_MAX_RETRIES || '3', 10),
    baseDelayMs: parseInt(process.env.OCR_BASE_DELAY_MS || '2000', 10),
    maxDelayMs: parseInt(process.env.OCR_MAX_DELAY_MS || '30000', 10),
    deepFeaturesEnabled: resolveDeepFeaturesEnabled(model),
    confidenceGranularity: resolveConfidenceGranularity(),
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

/**
 * Summarize deep features for reportJson (no block content / PII).
 */
export function summarizeDeepFeatures(pages: OCRPage[], enabled: boolean): OCRDeepFeaturesSummary {
  const pagesWithBlocks = pages.filter(p => (p.blocks?.length ?? 0) > 0).length;
  const signatureBlocksDetected = pages.reduce(
    (sum, p) => sum + (p.signatures?.length ?? 0),
    0
  );
  const confidences = pages
    .map(p => p.confidenceScores?.averagePageConfidence)
    .filter((c): c is number => typeof c === 'number');
  const averagePageConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : undefined;

  return {
    enabled,
    pagesWithBlocks,
    signatureBlocksDetected,
    averagePageConfidence,
  };
}
