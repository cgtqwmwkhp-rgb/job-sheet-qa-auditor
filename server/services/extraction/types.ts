/**
 * Extraction Service Types
 * 
 * Defines the extraction pipeline interface and types.
 */

import type { FieldDefinition, FieldType } from '../specResolver/types';

/**
 * Extraction confidence level
 */
export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'none';

/**
 * Single extracted field
 */
export interface ExtractedField {
  /**
   * Canonical field name
   */
  field: string;
  
  /**
   * Extracted value (normalized)
   */
  value: string | number | boolean | null;
  
  /**
   * Raw extracted text (before normalization)
   */
  rawValue?: string;
  
  /**
   * Extraction confidence (0-1)
   */
  confidence: number;
  
  /**
   * Confidence level
   */
  confidenceLevel: ExtractionConfidence;
  
  /**
   * Page number where field was found (1-indexed)
   */
  pageNumber?: number;
  
  /**
   * Extraction method used
   */
  method: 'pattern' | 'keyword' | 'position' | 'llm' | 'fallback';
  
  /**
   * Whether value was normalized
   */
  normalized: boolean;
}

/**
 * Extraction result for a document
 */
export interface ExtractionResult {
  /**
   * Whether extraction was successful
   */
  success: boolean;
  
  /**
   * Extracted fields map
   */
  fields: Map<string, ExtractedField>;
  
  /**
   * Fields that could not be extracted
   */
  missingFields: string[];
  
  /**
   * Low-confidence fields that may need review
   */
  lowConfidenceFields: string[];
  
  /**
   * Extraction metadata
   */
  metadata: {
    totalPages: number;
    processingTimeMs: number;
    ocrModel?: string;
    extractionVersion: string;
  };
  
  /**
   * Correlation ID for tracing
   */
  correlationId?: string;
  
  /**
   * Error message if extraction failed
   */
  error?: string;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  /**
   * Field definitions to extract
   */
  fields: FieldDefinition[];
  
  /**
   * Minimum confidence threshold (0-1)
   */
  minConfidence?: number;
  
  /**
   * Enable LLM-assisted extraction for low-confidence fields
   */
  enableLlmFallback?: boolean;
  
  /**
   * Page range to extract from (1-indexed)
   */
  pageRange?: {
    start: number;
    end: number;
  };
}

/**
 * OCR page content for extraction
 */
export interface PageContent {
  pageNumber: number;
  markdown: string;
  rawText?: string;
}

/**
 * Extraction artifact (for persistence)
 */
export interface ExtractionArtifact {
  version: '1.0.0';
  generatedAt: string;
  correlationId?: string;
  documentId?: string;
  fields: Record<string, {
    value: string | number | boolean | null;
    confidence: number;
    pageNumber?: number;
    method: string;
  }>;
  metadata: {
    totalPages: number;
    processingTimeMs: number;
    ocrModel?: string;
    extractionVersion: string;
    missingFields: string[];
    lowConfidenceFields: string[];
  };
}
