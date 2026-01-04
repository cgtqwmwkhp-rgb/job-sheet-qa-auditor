/**
 * Extraction Service Implementation
 * 
 * Extracts structured fields from OCR text using pattern matching and keyword search.
 */

import type { FieldDefinition, FieldType } from '../specResolver/types';
import type {
  ExtractedField,
  ExtractionResult,
  ExtractionOptions,
  PageContent,
  ExtractionArtifact,
  ExtractionConfidence,
} from './types';
import { getCorrelationId } from '../../utils/context';

const EXTRACTION_VERSION = '1.0.0';

/**
 * Confidence thresholds
 */
const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
  low: 0.2,
};

/**
 * Get confidence level from numeric confidence
 */
function getConfidenceLevel(confidence: number): ExtractionConfidence {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (confidence >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'none';
}

/**
 * Common date patterns
 */
const DATE_PATTERNS = [
  /(\d{4}-\d{2}-\d{2})/,                    // ISO: 2024-01-15
  /(\d{1,2}\/\d{1,2}\/\d{2,4})/,            // US: 1/15/2024 or 01/15/24
  /(\d{1,2}-\d{1,2}-\d{2,4})/,              // Alt: 1-15-2024
  /(\w+ \d{1,2},? \d{4})/i,                 // Written: January 15, 2024
];

/**
 * Currency patterns
 */
const CURRENCY_PATTERNS = [
  /\$[\d,]+(?:\.\d{2})?/,                   // $1,234.56
  /[\d,]+(?:\.\d{2})?\s*(?:USD|dollars?)/i, // 1234.56 USD
];

/**
 * Extract a single field from page content
 */
function extractField(
  fieldDef: FieldDefinition,
  pages: PageContent[],
  pageHint?: number
): ExtractedField | null {
  const searchPages = pageHint 
    ? pages.filter(p => p.pageNumber === pageHint)
    : pages;
  
  // If page hint didn't match, search all pages
  const pagesToSearch = searchPages.length > 0 ? searchPages : pages;
  
  for (const page of pagesToSearch) {
    const result = extractFromText(fieldDef, page.markdown, page.pageNumber);
    if (result) {
      return result;
    }
  }
  
  return null;
}

/**
 * Extract field from text content
 */
function extractFromText(
  fieldDef: FieldDefinition,
  text: string,
  pageNumber: number
): ExtractedField | null {
  // Try extraction hints first
  for (const hint of fieldDef.extractionHints || []) {
    const result = extractByKeyword(fieldDef, text, hint, pageNumber);
    if (result) {
      return result;
    }
  }
  
  // Try field label
  const labelResult = extractByKeyword(fieldDef, text, fieldDef.label, pageNumber);
  if (labelResult) {
    return labelResult;
  }
  
  // Try aliases
  for (const alias of fieldDef.aliases || []) {
    const result = extractByKeyword(fieldDef, text, alias, pageNumber);
    if (result) {
      return result;
    }
  }
  
  return null;
}

/**
 * Extract field value by keyword search
 */
function extractByKeyword(
  fieldDef: FieldDefinition,
  text: string,
  keyword: string,
  pageNumber: number
): ExtractedField | null {
  // Escape special regex characters in keyword
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Pattern: keyword followed by colon/space and value
  const patterns = [
    new RegExp(`${escapedKeyword}[:\\s]+([^\\n]+)`, 'i'),
    new RegExp(`${escapedKeyword}[:\\s]*([^\\n]+)`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const rawValue = match[1].trim();
      const { value, normalized } = normalizeValue(rawValue, fieldDef.type);
      
      // Calculate confidence based on match quality
      const confidence = calculateConfidence(rawValue, fieldDef.type, keyword);
      
      return {
        field: fieldDef.field,
        value,
        rawValue,
        confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        pageNumber,
        method: 'keyword',
        normalized,
      };
    }
  }
  
  // For specific types, try type-specific patterns
  if (fieldDef.type === 'date') {
    for (const pattern of DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const rawValue = match[1];
        const { value, normalized } = normalizeValue(rawValue, 'date');
        
        return {
          field: fieldDef.field,
          value,
          rawValue,
          confidence: 0.6, // Lower confidence for pattern-only match
          confidenceLevel: 'medium',
          pageNumber,
          method: 'pattern',
          normalized,
        };
      }
    }
  }
  
  if (fieldDef.type === 'currency') {
    for (const pattern of CURRENCY_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const rawValue = match[0];
        const { value, normalized } = normalizeValue(rawValue, 'currency');
        
        return {
          field: fieldDef.field,
          value,
          rawValue,
          confidence: 0.6,
          confidenceLevel: 'medium',
          pageNumber,
          method: 'pattern',
          normalized,
        };
      }
    }
  }
  
  return null;
}

/**
 * Normalize extracted value based on field type
 */
function normalizeValue(
  rawValue: string,
  type: FieldType
): { value: string | number | boolean | null; normalized: boolean } {
  const trimmed = rawValue.trim();
  
  switch (type) {
    case 'number':
      const num = parseFloat(trimmed.replace(/[,\s]/g, ''));
      if (!isNaN(num)) {
        return { value: num, normalized: true };
      }
      return { value: trimmed, normalized: false };
      
    case 'currency':
      const currency = parseFloat(trimmed.replace(/[$,\s]/g, ''));
      if (!isNaN(currency)) {
        return { value: currency, normalized: true };
      }
      return { value: trimmed, normalized: false };
      
    case 'boolean':
      const lower = trimmed.toLowerCase();
      if (['yes', 'true', '1', 'checked', 'signed'].includes(lower)) {
        return { value: true, normalized: true };
      }
      if (['no', 'false', '0', 'unchecked', 'unsigned'].includes(lower)) {
        return { value: false, normalized: true };
      }
      return { value: trimmed, normalized: false };
      
    case 'date':
      // Try to normalize to ISO format
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return { value: date.toISOString().split('T')[0], normalized: true };
      }
      return { value: trimmed, normalized: false };
      
    case 'string':
    case 'list':
    default:
      return { value: trimmed, normalized: false };
  }
}

/**
 * Calculate extraction confidence
 */
function calculateConfidence(
  rawValue: string,
  type: FieldType,
  keyword: string
): number {
  let confidence = 0.7; // Base confidence for keyword match
  
  // Adjust based on value quality
  if (!rawValue || rawValue.length === 0) {
    return 0;
  }
  
  // Boost for longer, more complete values
  if (rawValue.length > 5) {
    confidence += 0.1;
  }
  
  // Boost for type-appropriate values
  switch (type) {
    case 'number':
    case 'currency':
      if (/^\$?[\d,]+(?:\.\d{2})?$/.test(rawValue)) {
        confidence += 0.15;
      }
      break;
    case 'date':
      if (/\d{4}|\d{1,2}\/\d{1,2}/.test(rawValue)) {
        confidence += 0.15;
      }
      break;
    case 'boolean':
      if (/^(yes|no|true|false|signed|unsigned)$/i.test(rawValue)) {
        confidence += 0.2;
      }
      break;
  }
  
  return Math.min(confidence, 1.0);
}

/**
 * Extract all fields from document pages
 */
export function extractFields(
  pages: PageContent[],
  options: ExtractionOptions
): ExtractionResult {
  const startTime = Date.now();
  const correlationId = getCorrelationId();
  
  const fields = new Map<string, ExtractedField>();
  const missingFields: string[] = [];
  const lowConfidenceFields: string[] = [];
  
  // Filter pages by range if specified
  let pagesToProcess = pages;
  if (options.pageRange) {
    pagesToProcess = pages.filter(
      p => p.pageNumber >= options.pageRange!.start && 
           p.pageNumber <= options.pageRange!.end
    );
  }
  
  // Extract each field
  for (const fieldDef of options.fields) {
    const extracted = extractField(fieldDef, pagesToProcess, fieldDef.pageHint);
    
    if (extracted) {
      // Apply confidence threshold
      const minConfidence = options.minConfidence ?? 0;
      if (extracted.confidence >= minConfidence) {
        fields.set(fieldDef.field, extracted);
        
        if (extracted.confidenceLevel === 'low') {
          lowConfidenceFields.push(fieldDef.field);
        }
      } else {
        missingFields.push(fieldDef.field);
        lowConfidenceFields.push(fieldDef.field);
      }
    } else {
      missingFields.push(fieldDef.field);
    }
  }
  
  const processingTimeMs = Date.now() - startTime;
  
  return {
    success: true,
    fields,
    missingFields,
    lowConfidenceFields,
    metadata: {
      totalPages: pages.length,
      processingTimeMs,
      extractionVersion: EXTRACTION_VERSION,
    },
    correlationId,
  };
}

/**
 * Generate extraction artifact for persistence
 */
export function generateExtractionArtifact(
  result: ExtractionResult,
  documentId?: string
): ExtractionArtifact {
  const fieldsRecord: ExtractionArtifact['fields'] = {};
  
  for (const [field, extracted] of Array.from(result.fields.entries())) {
    fieldsRecord[field] = {
      value: extracted.value,
      confidence: extracted.confidence,
      pageNumber: extracted.pageNumber,
      method: extracted.method,
    };
  }
  
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    correlationId: result.correlationId,
    documentId,
    fields: fieldsRecord,
    metadata: {
      totalPages: result.metadata.totalPages,
      processingTimeMs: result.metadata.processingTimeMs,
      ocrModel: result.metadata.ocrModel,
      extractionVersion: result.metadata.extractionVersion,
      missingFields: result.missingFields,
      lowConfidenceFields: result.lowConfidenceFields,
    },
  };
}
