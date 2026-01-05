/**
 * Mistral OCR Service
 * Extracts text from PDF documents and images using Mistral's OCR API
 * Includes enterprise-grade resilience: retry logic, circuit breaker, correlation tracking
 */

import { withResiliency, mistralCircuitBreaker, CircuitBreakerOpenError } from '../utils/resilience';
import { getCorrelationId, addContextMetadata } from '../utils/context';
import { redactExtractedText } from '../utils/piiRedaction';
import { addToDeadLetterQueue } from '../utils/deadLetterQueue';
import { createSafeLogger } from '../utils/safeLogger';

const ocrLogger = createSafeLogger('Mistral OCR');

const MISTRAL_OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr';

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

export interface OCROptions {
  includeImageLocations?: boolean;
  imageLimit?: number;
  pageLimit?: number;
  jobSheetId?: number; // For DLQ tracking
  skipRetry?: boolean;
  redactPII?: boolean;
}

/**
 * Internal OCR call (without resilience wrapper)
 */
async function callMistralOCR(
  documentUrl: string,
  apiKey: string,
  options: OCROptions
): Promise<OCRResult> {
  const startTime = Date.now();
  const correlationId = getCorrelationId();

  const payload: Record<string, unknown> = {
    model: 'mistral-ocr-latest',
    document: {
      type: 'document_url',
      document_url: documentUrl,
    },
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

  ocrLogger.info('Starting extraction', {
    correlationId,
    documentUrl: documentUrl.substring(0, 50) + '...',
  });

  const response = await fetch(MISTRAL_OCR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(correlationId && { 'X-Correlation-ID': correlationId }),
    },
    body: JSON.stringify(payload),
  });

  const processingTimeMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    const errorCode = `HTTP_${response.status}`;
    
    ocrLogger.error('API error', {
      correlationId,
      status: response.status,
      error: errorText,
      processingTimeMs,
    });

    // Throw to trigger retry for transient errors
    if (response.status >= 500 || response.status === 429) {
      const error = new Error(`OCR API error: ${response.status} - ${errorText}`);
      (error as any).code = errorCode;
      (error as any).retryable = true;
      throw error;
    }

    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      correlationId,
      processingTimeMs,
      error: `OCR API error: ${response.status} - ${errorText}`,
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

  ocrLogger.info('Extraction complete', {
    correlationId,
    totalPages: pages.length,
    processingTimeMs,
  });

  addContextMetadata('ocrPages', pages.length);
  addContextMetadata('ocrProcessingMs', processingTimeMs);

  return {
    success: true,
    pages,
    totalPages: pages.length,
    model: result.model || 'mistral-ocr-latest',
    correlationId,
    processingTimeMs,
    usageInfo: result.usage_info ? {
      pagesProcessed: result.usage_info.pages_processed,
      tokensGenerated: result.usage_info.doc_size_tokens,
    } : undefined,
  };
}

/**
 * Process a document URL through Mistral OCR with resilience
 */
export async function extractTextFromDocument(
  documentUrl: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  const correlationId = getCorrelationId();
  const startTime = Date.now();
  
  if (!apiKey) {
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      correlationId,
      error: 'MISTRAL_API_KEY not configured',
      errorCode: 'CONFIG_ERROR',
    };
  }

  let retryAttempts = 0;

  try {
    const result = await withResiliency(
      () => callMistralOCR(documentUrl, apiKey, options),
      mistralCircuitBreaker,
      {
        maxRetries: options.skipRetry ? 0 : 3,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        onRetry: (attempt, error, delayMs) => {
          retryAttempts = attempt;
          ocrLogger.warn(`Retry attempt ${attempt}`, {
            correlationId,
            error: error.message,
            nextRetryMs: delayMs,
          });
        },
      }
    );

    return { ...result, retryAttempts };

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    
    // Handle circuit breaker open
    if (error instanceof CircuitBreakerOpenError) {
      ocrLogger.error('Circuit breaker open', {
        correlationId,
        retryAfterMs: error.retryAfterMs,
      });

      // Add to DLQ if job sheet ID provided
      if (options.jobSheetId) {
        addToDeadLetterQueue(options.jobSheetId, 'ocr', error, {
          correlationId,
          recoverable: true,
          metadata: { documentUrl, circuitBreakerOpen: true },
        });
      }

      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: 'mistral-ocr-latest',
        correlationId,
        processingTimeMs,
        error: 'OCR service temporarily unavailable. Please try again later.',
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        retryAttempts,
      };
    }

    ocrLogger.error('Processing failed after retries', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      retryAttempts,
      processingTimeMs,
    });

    // Add to DLQ if job sheet ID provided
    if (options.jobSheetId) {
      addToDeadLetterQueue(
        options.jobSheetId, 
        'ocr', 
        error instanceof Error ? error : new Error(String(error)),
        {
          correlationId,
          attempts: retryAttempts + 1,
          maxAttempts: 3,
          metadata: { documentUrl },
        }
      );
    }

    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      correlationId,
      processingTimeMs,
      error: error instanceof Error ? error.message : 'Unknown OCR error',
      errorCode: 'PROCESSING_ERROR',
      retryAttempts,
    };
  }
}

/**
 * Extract text from a base64 encoded document with resilience
 */
export async function extractTextFromBase64(
  base64Data: string,
  mimeType: string = 'application/pdf',
  options: OCROptions = {}
): Promise<OCRResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  const correlationId = getCorrelationId();
  const startTime = Date.now();
  
  if (!apiKey) {
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      correlationId,
      error: 'MISTRAL_API_KEY not configured',
      errorCode: 'CONFIG_ERROR',
    };
  }

  let retryAttempts = 0;

  const callOCR = async (): Promise<OCRResult> => {
    const payload: Record<string, unknown> = {
      model: 'mistral-ocr-latest',
      document: {
        type: 'base64',
        base64: base64Data,
        mime_type: mimeType,
      },
    };

    if (options.pageLimit) {
      payload.page_limit = options.pageLimit;
    }

    const response = await fetch(MISTRAL_OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(correlationId && { 'X-Correlation-ID': correlationId }),
      },
      body: JSON.stringify(payload),
    });

    const processingTimeMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status >= 500 || response.status === 429) {
        const error = new Error(`OCR API error: ${response.status}`);
        (error as any).code = `HTTP_${response.status}`;
        throw error;
      }

      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: 'mistral-ocr-latest',
        correlationId,
        processingTimeMs,
        error: `OCR API error: ${response.status} - ${errorText}`,
        errorCode: `HTTP_${response.status}`,
      };
    }

    const result = await response.json();
    
    let pages: OCRPage[] = (result.pages || []).map((page: any, index: number) => ({
      pageNumber: page.index ?? index + 1,
      markdown: page.markdown || '',
      images: page.images,
      dimensions: page.dimensions,
    }));

    if (options.redactPII) {
      pages = pages.map(page => ({
        ...page,
        markdown: redactExtractedText(page.markdown),
      }));
    }

    return {
      success: true,
      pages,
      totalPages: pages.length,
      model: result.model || 'mistral-ocr-latest',
      correlationId,
      processingTimeMs,
      usageInfo: result.usage_info ? {
        pagesProcessed: result.usage_info.pages_processed,
        tokensGenerated: result.usage_info.doc_size_tokens,
      } : undefined,
    };
  };

  try {
    const result = await withResiliency(callOCR, mistralCircuitBreaker, {
      maxRetries: options.skipRetry ? 0 : 3,
      baseDelayMs: 2000,
      onRetry: (attempt) => { retryAttempts = attempt; },
    });

    return { ...result, retryAttempts };

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;

    if (options.jobSheetId) {
      addToDeadLetterQueue(
        options.jobSheetId,
        'ocr',
        error instanceof Error ? error : new Error(String(error)),
        { correlationId, attempts: retryAttempts + 1 }
      );
    }

    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      correlationId,
      processingTimeMs,
      error: error instanceof Error ? error.message : 'Unknown OCR error',
      errorCode: 'PROCESSING_ERROR',
      retryAttempts,
    };
  }
}

/**
 * Validate that the Mistral API key is working
 */
export async function validateMistralApiKey(): Promise<{ valid: boolean; error?: string }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  
  if (!apiKey) {
    return { valid: false, error: 'MISTRAL_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    } else {
      const errorText = await response.text();
      return { valid: false, error: `API validation failed: ${response.status} - ${errorText}` };
    }
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Connection error' 
    };
  }
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
  ocrLogger.info('Circuit breaker manually reset');
}
