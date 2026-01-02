/**
 * Mistral OCR Service
 * Extracts text from PDF documents and images using Mistral's OCR API
 */

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
  usageInfo?: {
    pagesProcessed: number;
    tokensGenerated: number;
  };
  error?: string;
}

export interface OCROptions {
  includeImageLocations?: boolean;
  imageLimit?: number;
  pageLimit?: number;
}

/**
 * Process a document URL through Mistral OCR
 */
export async function extractTextFromDocument(
  documentUrl: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      error: 'MISTRAL_API_KEY not configured',
    };
  }

  try {
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

    const response = await fetch(MISTRAL_OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Mistral OCR] API error:', response.status, errorText);
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: 'mistral-ocr-latest',
        error: `OCR API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    
    // Parse the OCR response
    const pages: OCRPage[] = (result.pages || []).map((page: any, index: number) => ({
      pageNumber: page.index ?? index + 1,
      markdown: page.markdown || '',
      images: page.images,
      dimensions: page.dimensions,
    }));

    return {
      success: true,
      pages,
      totalPages: pages.length,
      model: result.model || 'mistral-ocr-latest',
      usageInfo: result.usage_info ? {
        pagesProcessed: result.usage_info.pages_processed,
        tokensGenerated: result.usage_info.doc_size_tokens,
      } : undefined,
    };
  } catch (error) {
    console.error('[Mistral OCR] Processing error:', error);
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      error: error instanceof Error ? error.message : 'Unknown OCR error',
    };
  }
}

/**
 * Extract text from a base64 encoded document
 */
export async function extractTextFromBase64(
  base64Data: string,
  mimeType: string = 'application/pdf',
  options: OCROptions = {}
): Promise<OCRResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      error: 'MISTRAL_API_KEY not configured',
    };
  }

  try {
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
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Mistral OCR] API error:', response.status, errorText);
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: 'mistral-ocr-latest',
        error: `OCR API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    
    const pages: OCRPage[] = (result.pages || []).map((page: any, index: number) => ({
      pageNumber: page.index ?? index + 1,
      markdown: page.markdown || '',
      images: page.images,
      dimensions: page.dimensions,
    }));

    return {
      success: true,
      pages,
      totalPages: pages.length,
      model: result.model || 'mistral-ocr-latest',
      usageInfo: result.usage_info ? {
        pagesProcessed: result.usage_info.pages_processed,
        tokensGenerated: result.usage_info.doc_size_tokens,
      } : undefined,
    };
  } catch (error) {
    console.error('[Mistral OCR] Processing error:', error);
    return {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      error: error instanceof Error ? error.message : 'Unknown OCR error',
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
    // Use the models endpoint to validate the key
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
