/**
 * Mistral OCR Adapter
 * 
 * Primary OCR implementation using Mistral OCR 2503 API.
 * Includes enterprise-grade resilience: retry logic, circuit breaker, correlation tracking.
 * 
 * SECURITY: Uses safeLogger to prevent OCR text from appearing in logs.
 */

import { createSafeLogger } from '../../utils/safeLogger';
import { withResiliency, mistralCircuitBreaker, CircuitBreakerOpenError } from '../../utils/resilience';
import { getCorrelationId, addContextMetadata } from '../../utils/context';
import { redactExtractedText } from '../../utils/piiRedaction';
import { addToDeadLetterQueue } from '../../utils/deadLetterQueue';
import type { OCRAdapter, OCRResult, OCROptions, OCRPage, OCRProviderArtifact, OCRConfig } from './types';
import { getOCRConfig } from './types';

const logger = createSafeLogger('MistralOCR');

const MISTRAL_OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr';

/**
 * Mistral OCR Adapter implementation
 */
export class MistralOCRAdapter implements OCRAdapter {
  readonly providerName = 'mistral';
  private readonly config: OCRConfig;
  
  constructor(config?: Partial<OCRConfig>) {
    this.config = { ...getOCRConfig(), ...config };
  }
  
  get modelId(): string {
    return this.config.model;
  }
  
  /**
   * Internal OCR call (without resilience wrapper)
   */
  private async callMistralOCR(
    documentPayload: Record<string, unknown>,
    options: OCROptions
  ): Promise<OCRResult> {
    const startTime = Date.now();
    const correlationId = getCorrelationId();
    
    const payload: Record<string, unknown> = {
      model: this.config.model,
      document: documentPayload,
    };
    
    if (options.includeImageLocations) {
      payload.include_image_base64 = false;
    }
    
    if (options.pageLimit) {
      payload.page_limit = options.pageLimit;
    }
    
    if (options.imageLimit) {
      payload.image_limit = options.imageLimit;
    }
    
    // Safe logging - no document content
    logger.info('Starting OCR extraction', {
      correlationId,
      model: this.config.model,
      pageLimit: options.pageLimit,
      imageLimit: options.imageLimit,
    });
    
    const response = await fetch(MISTRAL_OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...(correlationId && { 'X-Correlation-ID': correlationId }),
      },
      body: JSON.stringify(payload),
    });
    
    const processingTimeMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorCode = `HTTP_${response.status}`;
      
      logger.error('OCR API error', {
        correlationId,
        statusCode: response.status,
        errorCode,
        processingTimeMs,
        // Note: errorText may contain sensitive info, truncated by safeLogger
        error: errorText,
      });
      
      // Throw to trigger retry for transient errors
      if (response.status >= 500 || response.status === 429) {
        const error = new Error(`OCR API error: ${response.status}`);
        (error as any).code = errorCode;
        (error as any).retryable = true;
        throw error;
      }
      
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.config.model,
        correlationId,
        processingTimeMs,
        error: `OCR API error: ${response.status}`,
        errorCode,
      };
    }
    
    const result = await response.json();
    
    // Parse the OCR response
    let pages: OCRPage[] = (result.pages || []).map((page: any, index: number) => ({
      pageNumber: page.index ?? index + 1,
      markdown: page.markdown || '',
      images: page.images,
      dimensions: page.dimensions,
    }));
    
    // Optionally redact PII from extracted text
    if (options.redactPII) {
      pages = pages.map(page => ({
        ...page,
        markdown: redactExtractedText(page.markdown),
      }));
    }
    
    // Safe logging - only metadata, no OCR text
    logger.info('OCR extraction complete', {
      correlationId,
      totalPages: pages.length,
      processingTimeMs,
      tokensGenerated: result.usage_info?.doc_size_tokens,
    });
    
    addContextMetadata('ocrPages', pages.length);
    addContextMetadata('ocrProcessingMs', processingTimeMs);
    
    return {
      success: true,
      pages,
      totalPages: pages.length,
      model: result.model || this.config.model,
      correlationId,
      processingTimeMs,
      usageInfo: result.usage_info ? {
        pagesProcessed: result.usage_info.pages_processed,
        tokensGenerated: result.usage_info.doc_size_tokens,
      } : undefined,
    };
  }
  
  /**
   * Extract text from a document URL
   */
  async extractFromUrl(documentUrl: string, options: OCROptions = {}): Promise<OCRResult> {
    const correlationId = getCorrelationId();
    const startTime = Date.now();
    
    if (!this.config.apiKey) {
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.config.model,
        correlationId,
        error: 'MISTRAL_API_KEY not configured',
        errorCode: 'CONFIG_ERROR',
      };
    }
    
    let retryAttempts = 0;
    
    const documentPayload = {
      type: 'document_url',
      document_url: documentUrl,
    };
    
    try {
      const result = await withResiliency(
        () => this.callMistralOCR(documentPayload, options),
        mistralCircuitBreaker,
        {
          maxRetries: options.skipRetry ? 0 : this.config.maxRetries,
          baseDelayMs: this.config.baseDelayMs,
          maxDelayMs: this.config.maxDelayMs,
          backoffMultiplier: 2,
          onRetry: (attempt, error, delayMs) => {
            retryAttempts = attempt;
            logger.warn('Retry attempt', {
              correlationId,
              attempt,
              nextRetryMs: delayMs,
              error: error.message,
            });
          },
        }
      );
      
      return { ...result, retryAttempts };
      
    } catch (error) {
      return this.handleError(error, correlationId, startTime, retryAttempts, options);
    }
  }
  
  /**
   * Extract text from base64 encoded document
   */
  async extractFromBase64(
    base64Data: string,
    mimeType: string = 'application/pdf',
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const correlationId = getCorrelationId();
    const startTime = Date.now();
    
    if (!this.config.apiKey) {
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.config.model,
        correlationId,
        error: 'MISTRAL_API_KEY not configured',
        errorCode: 'CONFIG_ERROR',
      };
    }
    
    let retryAttempts = 0;
    
    const documentPayload = {
      type: 'base64',
      base64: base64Data,
      mime_type: mimeType,
    };
    
    try {
      const result = await withResiliency(
        () => this.callMistralOCR(documentPayload, options),
        mistralCircuitBreaker,
        {
          maxRetries: options.skipRetry ? 0 : this.config.maxRetries,
          baseDelayMs: this.config.baseDelayMs,
          onRetry: (attempt) => { retryAttempts = attempt; },
        }
      );
      
      return { ...result, retryAttempts };
      
    } catch (error) {
      return this.handleError(error, correlationId, startTime, retryAttempts, options);
    }
  }
  
  /**
   * Handle errors with DLQ support
   */
  private handleError(
    error: unknown,
    correlationId: string | undefined,
    startTime: number,
    retryAttempts: number,
    options: OCROptions
  ): OCRResult {
    const processingTimeMs = Date.now() - startTime;
    
    // Handle circuit breaker open
    if (error instanceof CircuitBreakerOpenError) {
      logger.error('Circuit breaker open', {
        correlationId,
        retryAfterMs: error.retryAfterMs,
      });
      
      if (options.jobSheetId) {
        addToDeadLetterQueue(options.jobSheetId, 'ocr', error, {
          correlationId,
          recoverable: true,
          metadata: { circuitBreakerOpen: true },
        });
      }
      
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.config.model,
        correlationId,
        processingTimeMs,
        error: 'OCR service temporarily unavailable. Please try again later.',
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        retryAttempts,
      };
    }
    
    logger.error('Processing failed after retries', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      retryAttempts,
      processingTimeMs,
    });
    
    if (options.jobSheetId) {
      addToDeadLetterQueue(
        options.jobSheetId,
        'ocr',
        error instanceof Error ? error : new Error(String(error)),
        {
          correlationId,
          attempts: retryAttempts + 1,
          maxAttempts: this.config.maxRetries,
        }
      );
    }
    
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: this.config.model,
      correlationId,
      processingTimeMs,
      error: error instanceof Error ? error.message : 'Unknown OCR error',
      errorCode: 'PROCESSING_ERROR',
      retryAttempts,
    };
  }
  
  /**
   * Validate API key is configured and working
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (!this.config.apiKey) {
      return { valid: false, error: 'MISTRAL_API_KEY not configured' };
    }
    
    try {
      const response = await fetch('https://api.mistral.ai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });
      
      if (response.ok) {
        return { valid: true };
      } else {
        return { valid: false, error: `API validation failed: ${response.status}` };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Connection error',
      };
    }
  }
  
  /**
   * Get provider artifact for audit trail (redacted)
   */
  getProviderArtifact(result: OCRResult, options?: OCROptions): OCRProviderArtifact {
    return {
      provider: this.providerName,
      model: result.model,
      timestamp: new Date().toISOString(),
      correlationId: result.correlationId,
      requestMetadata: {
        documentType: 'url', // or 'base64' - would need to track this
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
 * Create Mistral OCR adapter instance
 */
export function createMistralAdapter(config?: Partial<OCRConfig>): OCRAdapter {
  return new MistralOCRAdapter(config);
}

/**
 * Get circuit breaker status for monitoring
 */
export function getOCRCircuitBreakerStatus() {
  return mistralCircuitBreaker.getStats();
}

/**
 * Reset circuit breaker (admin function)
 */
export function resetOCRCircuitBreaker() {
  mistralCircuitBreaker.reset();
  logger.info('Circuit breaker manually reset');
}
