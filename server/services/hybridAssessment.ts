/**
 * Hybrid Assessment Service
 * 
 * Provides lightweight assessment for documents that don't match a template.
 * Combines:
 * - Rule-based universal checks (instant)
 * - Field extraction summary (instant)
 * - Brief LLM summary (single, cheap call)
 * 
 * This ensures REVIEW_QUEUE items always have actionable context for humans.
 */

import { invokeLLM, isLLMConfigured } from '../_core/llm';
import { getSuggestedTemplates, FALLBACK_SPEC_JSON } from './templateRegistry/fallbackTemplate';

/**
 * Universal assessment result
 */
export interface UniversalAssessment {
  /** Document has a job reference / work order number */
  hasJobReference: boolean;
  /** Document has a date field */
  hasDate: boolean;
  /** Document has at least one signature */
  hasSignature: boolean;
  /** Document has an asset identifier (serial, reg, etc.) */
  hasAssetIdentifier: boolean;
  /** Document has engineer/technician name */
  hasEngineerName: boolean;
  /** Document has customer/site name */
  hasCustomerName: boolean;
  /** Overall OCR confidence score (0-1) */
  ocrConfidenceScore: number;
  /** Number of fields successfully extracted */
  extractedFieldCount: number;
  /** Total page count */
  pageCount: number;
  /** Approximate word count */
  wordCount: number;
}

/**
 * Extracted field from universal assessment
 */
export interface ExtractedField {
  field: string;
  label: string;
  value: string;
  confidence: number;
  pageNumber: number;
}

/**
 * Template suggestion for human review
 */
export interface TemplateSuggestion {
  hint: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

/**
 * Hybrid assessment result
 */
export interface HybridAssessmentResult {
  /** Assessment mode used */
  mode: 'HYBRID';
  /** Whether assessment completed successfully */
  success: boolean;
  /** Universal checks results */
  universalAssessment: UniversalAssessment;
  /** Fields extracted with values */
  extractedFields: ExtractedField[];
  /** Brief LLM-generated summary (if LLM available) */
  llmSummary?: string;
  /** Suggested templates based on content analysis */
  suggestedTemplates: TemplateSuggestion[];
  /** Processing time in ms */
  processingTimeMs: number;
  /** Review reason */
  reviewReason: 'TEMPLATE_NOT_MATCHED' | 'LOW_TEMPLATE_CONFIDENCE' | 'AMBIGUOUS_SELECTION';
  /** Human-readable explanation */
  reviewExplanation: string;
  /** Error if any */
  error?: string;
}

/**
 * Patterns for universal field detection
 */
const FIELD_PATTERNS = {
  jobReference: [
    /(?:job|work|order|wo|ref|ticket|case)\s*(?:no|number|#|ref)?[:.\s]*([A-Z0-9][-A-Z0-9/]{3,20})/i,
    /(?:reference|ref)[:.\s]*([A-Z0-9][-A-Z0-9/]{3,20})/i,
  ],
  date: [
    /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
    /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i,
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
  ],
  signature: [
    /signature[:.\s]*(.{2,50})/i,
    /signed[:.\s]*(.{2,50})/i,
    /authorized\s+by[:.\s]*(.{2,50})/i,
  ],
  assetIdentifier: [
    /(?:serial|s\/n|asset|reg|registration|fleet|plant)\s*(?:no|number|#)?[:.\s]*([A-Z0-9][-A-Z0-9/]{3,20})/i,
  ],
  engineerName: [
    /(?:engineer|technician|tech|inspector|examiner|completed\s+by|attended\s+by)[:.\s]*([A-Za-z][\w\s]{2,40})/i,
  ],
  customerName: [
    /(?:customer|client|company|site)[:.\s]*([A-Za-z][\w\s&.,]{2,60})/i,
  ],
};

/**
 * Extract a field value using patterns
 */
function extractFieldValue(
  text: string,
  patterns: RegExp[]
): { found: boolean; value: string; confidence: number } {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return {
        found: true,
        value: match[1].trim().substring(0, 100), // Limit length
        confidence: 0.7, // Pattern match = medium confidence
      };
    }
  }
  return { found: false, value: '', confidence: 0 };
}

/**
 * Perform universal assessment on document text
 */
export function performUniversalAssessment(
  documentText: string,
  pageCount: number,
  ocrConfidence: number
): UniversalAssessment {
  const jobRef = extractFieldValue(documentText, FIELD_PATTERNS.jobReference);
  const date = extractFieldValue(documentText, FIELD_PATTERNS.date);
  const signature = extractFieldValue(documentText, FIELD_PATTERNS.signature);
  const asset = extractFieldValue(documentText, FIELD_PATTERNS.assetIdentifier);
  const engineer = extractFieldValue(documentText, FIELD_PATTERNS.engineerName);
  const customer = extractFieldValue(documentText, FIELD_PATTERNS.customerName);
  
  const extractedCount = [jobRef, date, signature, asset, engineer, customer]
    .filter(f => f.found).length;
  
  return {
    hasJobReference: jobRef.found,
    hasDate: date.found,
    hasSignature: signature.found,
    hasAssetIdentifier: asset.found,
    hasEngineerName: engineer.found,
    hasCustomerName: customer.found,
    ocrConfidenceScore: ocrConfidence,
    extractedFieldCount: extractedCount,
    pageCount,
    wordCount: documentText.split(/\s+/).length,
  };
}

/**
 * Extract fields from document text
 */
export function extractUniversalFields(
  documentText: string,
  pageTexts: string[]
): ExtractedField[] {
  const fields: ExtractedField[] = [];
  
  // For each field type, try to extract
  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    // Check each page
    for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex++) {
      const pageText = pageTexts[pageIndex];
      const result = extractFieldValue(pageText, patterns);
      
      if (result.found) {
        // Find matching label from spec
        const specField = FALLBACK_SPEC_JSON.fields.find(f => f.field === fieldName);
        fields.push({
          field: fieldName,
          label: specField?.label || fieldName,
          value: result.value,
          confidence: result.confidence,
          pageNumber: pageIndex + 1,
        });
        break; // Found on this page, don't check other pages
      }
    }
  }
  
  return fields;
}

/**
 * Generate brief LLM summary for unknown document
 */
async function generateLLMSummary(documentText: string): Promise<string | undefined> {
  if (!isLLMConfigured()) {
    return undefined;
  }
  
  try {
    // Use a brief, cheap prompt
    const prompt = `Briefly describe this document in 2-3 sentences. What type of document is it? What is its main purpose?

Document text (first 2000 chars):
${documentText.substring(0, 2000)}

Respond with ONLY the description, no preamble.`;

    const response = await invokeLLM({
      model: 'gemini-2.0-flash', // Use faster/cheaper model
      prompt,
      maxTokens: 150, // Keep it brief
      temperature: 0.3, // More deterministic
    });
    
    return response.text?.trim();
  } catch (error) {
    console.warn('[HybridAssessment] LLM summary failed:', error);
    return undefined;
  }
}

/**
 * Perform hybrid assessment on a document
 */
export async function performHybridAssessment(
  documentText: string,
  pageTexts: string[],
  ocrConfidence: number,
  reviewReason: 'TEMPLATE_NOT_MATCHED' | 'LOW_TEMPLATE_CONFIDENCE' | 'AMBIGUOUS_SELECTION'
): Promise<HybridAssessmentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Universal assessment (instant)
    const universalAssessment = performUniversalAssessment(
      documentText,
      pageTexts.length,
      ocrConfidence
    );
    
    // 2. Field extraction (instant)
    const extractedFields = extractUniversalFields(documentText, pageTexts);
    
    // 3. Template suggestions (instant)
    const rawSuggestions = getSuggestedTemplates(documentText);
    const suggestedTemplates: TemplateSuggestion[] = rawSuggestions.map(s => ({
      ...s,
      reason: `Document contains keywords matching "${s.hint}"`,
    }));
    
    // 4. LLM summary (async, but optional)
    const llmSummary = await generateLLMSummary(documentText);
    
    // 5. Generate review explanation
    const explanationParts: string[] = [];
    
    if (reviewReason === 'TEMPLATE_NOT_MATCHED') {
      explanationParts.push('No template matched this document type.');
    } else if (reviewReason === 'LOW_TEMPLATE_CONFIDENCE') {
      explanationParts.push('Template match confidence was too low for auto-processing.');
    } else {
      explanationParts.push('Multiple templates matched with similar scores.');
    }
    
    explanationParts.push(`Extracted ${extractedFields.length} universal fields.`);
    
    if (suggestedTemplates.length > 0) {
      explanationParts.push(`Suggested template: ${suggestedTemplates[0].hint}`);
    }
    
    return {
      mode: 'HYBRID',
      success: true,
      universalAssessment,
      extractedFields,
      llmSummary,
      suggestedTemplates,
      processingTimeMs: Date.now() - startTime,
      reviewReason,
      reviewExplanation: explanationParts.join(' '),
    };
  } catch (error) {
    return {
      mode: 'HYBRID',
      success: false,
      universalAssessment: {
        hasJobReference: false,
        hasDate: false,
        hasSignature: false,
        hasAssetIdentifier: false,
        hasEngineerName: false,
        hasCustomerName: false,
        ocrConfidenceScore: ocrConfidence,
        extractedFieldCount: 0,
        pageCount: pageTexts.length,
        wordCount: 0,
      },
      extractedFields: [],
      suggestedTemplates: [],
      processingTimeMs: Date.now() - startTime,
      reviewReason,
      reviewExplanation: 'Hybrid assessment failed. Manual review required.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
