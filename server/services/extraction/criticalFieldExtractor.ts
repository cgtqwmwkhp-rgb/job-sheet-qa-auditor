/**
 * Critical Field Extraction Engine - PR-1
 * 
 * Per-field extraction strategies for the 6 critical fields:
 * - jobReference
 * - assetId
 * - date
 * - expiryDate
 * - engineerSignOff
 * - complianceTickboxes
 * 
 * Each field has a dedicated extraction strategy with:
 * - Pattern matching
 * - Confidence scoring
 * - Candidate tracking for validation trace
 */

import { createSafeLogger } from '../../utils/safeLogger';

const logger = createSafeLogger('criticalFieldExtractor');

/**
 * Critical field types
 */
export const CRITICAL_FIELDS = [
  'jobReference',
  'assetId',
  'date',
  'expiryDate',
  'engineerSignOff',
  'complianceTickboxes',
] as const;

export type CriticalFieldType = typeof CRITICAL_FIELDS[number];

/**
 * Extraction candidate - a potential value for a field
 */
export interface ExtractionCandidate {
  value: string;
  confidence: number;
  source: 'pattern' | 'roi' | 'context' | 'llm_advisory';
  location?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  matchedPattern?: string;
}

/**
 * Field extraction result
 */
export interface FieldExtractionResult {
  fieldId: CriticalFieldType;
  extracted: boolean;
  value: string | null;
  confidence: number;
  candidates: ExtractionCandidate[];
  selectedCandidate: number; // Index of selected candidate, -1 if none
  reasonCode: 'VALID' | 'MISSING_FIELD' | 'LOW_CONFIDENCE' | 'CONFLICT';
  validationNotes: string[];
}

/**
 * Validation trace - captures all extraction decisions
 */
export interface ValidationTrace {
  documentId: string;
  timestamp: string;
  engineVersion: string;
  fields: FieldExtractionResult[];
  overallConfidence: number;
  processingTimeMs: number;
}

/**
 * Extraction strategy configuration
 */
interface ExtractionStrategy {
  patterns: RegExp[];
  validators: ((value: string) => boolean)[];
  normalizer: (value: string) => string;
  minConfidence: number;
}

/**
 * Field-specific extraction strategies
 */
const EXTRACTION_STRATEGIES: Record<CriticalFieldType, ExtractionStrategy> = {
  jobReference: {
    patterns: [
      // Match "Job Reference:", "Job Ref:", "Job No:", etc. followed by alphanumeric ID
      /job\s+reference\s*[:.\s]+([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /job\s+ref\s*[:.\s]+([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /job\s+(?:no|number|#)\s*[:.\s]+([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /work\s+order\s*[:.\s]+([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /WO\s*[:.\s]+([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
    ],
    validators: [
      (v) => v.length >= 3 && v.length <= 30,
      (v) => /[A-Z0-9]/i.test(v),
    ],
    normalizer: (v) => v.toUpperCase().replace(/\s+/g, '-'),
    minConfidence: 0.7,
  },
  assetId: {
    patterns: [
      // Match "Asset ID:", "Asset No:", "Equipment ID:", etc. followed by alphanumeric ID
      // Require colon explicitly to avoid partial matches
      /asset\s+(?:id|no|number|#)\s*:\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /asset\s*:\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /equipment\s+(?:id|no)\s*:\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /plant\s+(?:id|no)\s*:\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
      /serial\s*:\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/i,
    ],
    validators: [
      (v) => v.length >= 2 && v.length <= 30,
      (v) => /[A-Z0-9]/i.test(v),
    ],
    normalizer: (v) => v.toUpperCase().replace(/\s+/g, '-'),
    minConfidence: 0.7,
  },
  date: {
    patterns: [
      /date[:.\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
      /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,
      /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i,
    ],
    validators: [
      (v) => {
        const parsed = parseDate(v);
        return parsed !== null;
      },
    ],
    normalizer: (v) => {
      const parsed = parseDate(v);
      return parsed ? formatDateIso(parsed) : v;
    },
    minConfidence: 0.7, // Lowered from 0.8 to allow pattern matches
  },
  expiryDate: {
    patterns: [
      /expir(?:y|es|ation)\s*(?:date)?[:.\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /valid\s*(?:until|to)[:.\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /next\s*(?:service|inspection)[:.\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /due\s*(?:date)?[:.\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ],
    validators: [
      (v) => {
        const parsed = parseDate(v);
        return parsed !== null;
      },
    ],
    normalizer: (v) => {
      const parsed = parseDate(v);
      return parsed ? formatDateIso(parsed) : v;
    },
    minConfidence: 0.7, // Lowered from 0.8 to allow pattern matches
  },
  engineerSignOff: {
    patterns: [
      /(?:engineer|technician|completed\s*by).*(?:sign|signature)/i,
      /sign(?:ature|ed)?.*(?:engineer|technician)/i,
    ],
    validators: [
      () => true, // Signature presence is validated by image QA
    ],
    normalizer: (v) => v.trim(),
    minConfidence: 0.6,
  },
  complianceTickboxes: {
    patterns: [
      /(?:checked|completed|yes|no|n\/a)/i,
      /\[[\sxX✓✔]\]/,
      /☐|☑|☒/,
    ],
    validators: [
      () => true, // Tickbox validation done by image QA
    ],
    normalizer: (v) => v.trim().toLowerCase(),
    minConfidence: 0.6,
  },
};

/**
 * Parsed date components (to avoid timezone issues)
 */
interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/**
 * Parse date from various formats
 * Returns parsed components to avoid timezone issues
 */
function parseDate(value: string): ParsedDate | null {
  const cleanValue = value.trim();
  
  // Try ISO format first: YYYY-MM-DD
  const isoMatch = cleanValue.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]);
    const day = parseInt(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }
  
  // Try DD/MM/YYYY or DD-MM-YYYY (UK format)
  const ukMatch = cleanValue.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ukMatch) {
    let year = parseInt(ukMatch[3]);
    if (year < 100) year += 2000;
    const month = parseInt(ukMatch[2]);
    const day = parseInt(ukMatch[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }
  
  // Try month name format: 15 January 2024
  const monthMatch = cleanValue.match(/^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})$/i);
  if (monthMatch) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    let year = parseInt(monthMatch[3]);
    if (year < 100) year += 2000;
    const month = months[monthMatch[2].toLowerCase().substring(0, 3)];
    const day = parseInt(monthMatch[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }
  
  return null;
}

/**
 * Format parsed date as ISO string (YYYY-MM-DD)
 */
function formatDateIso(parsed: ParsedDate): string {
  const year = parsed.year.toString().padStart(4, '0');
  const month = parsed.month.toString().padStart(2, '0');
  const day = parsed.day.toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Extract candidates for a field using its strategy
 */
function extractCandidates(
  fieldId: CriticalFieldType,
  text: string,
  roiText?: string
): ExtractionCandidate[] {
  const strategy = EXTRACTION_STRATEGIES[fieldId];
  const candidates: ExtractionCandidate[] = [];
  
  // Extract from ROI first (higher confidence)
  if (roiText) {
    for (const pattern of strategy.patterns) {
      const regex = new RegExp(pattern, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(roiText)) !== null) {
        const value = match[1] || match[0];
        const normalized = strategy.normalizer(value);
        
        // Validate
        const isValid = strategy.validators.every((v) => v(normalized));
        if (isValid) {
          candidates.push({
            value: normalized,
            confidence: 0.9, // High confidence for ROI extraction
            source: 'roi',
            matchedPattern: pattern.source,
          });
        }
      }
    }
  }
  
  // Extract from full text (lower confidence)
  for (const pattern of strategy.patterns) {
    const regex = new RegExp(pattern, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] || match[0];
      const normalized = strategy.normalizer(value);
      
      // Validate
      const isValid = strategy.validators.every((v) => v(normalized));
      if (isValid) {
        // Check if already found in ROI
        const existsInRoi = candidates.some(
          (c) => c.source === 'roi' && c.value === normalized
        );
        if (!existsInRoi) {
          candidates.push({
            value: normalized,
            confidence: 0.7, // Lower confidence for full text
            source: 'pattern',
            matchedPattern: pattern.source,
          });
        }
      }
    }
  }
  
  // Sort by confidence descending, then by value for determinism
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.value.localeCompare(b.value);
  });
  
  return candidates;
}

/**
 * Select best candidate and determine reason code
 */
function selectCandidate(
  fieldId: CriticalFieldType,
  candidates: ExtractionCandidate[]
): { selectedIndex: number; reasonCode: FieldExtractionResult['reasonCode']; notes: string[] } {
  const strategy = EXTRACTION_STRATEGIES[fieldId];
  const notes: string[] = [];
  
  if (candidates.length === 0) {
    notes.push('No candidates found');
    return { selectedIndex: -1, reasonCode: 'MISSING_FIELD', notes };
  }
  
  const topCandidate = candidates[0];
  
  // Check confidence threshold first
  if (topCandidate.confidence < strategy.minConfidence) {
    notes.push(`Confidence ${topCandidate.confidence.toFixed(2)} below threshold ${strategy.minConfidence}`);
    return { selectedIndex: 0, reasonCode: 'LOW_CONFIDENCE', notes };
  }
  
  // Check for conflicts: only consider it a conflict if there are multiple high-confidence
  // candidates with different values AND similar confidence levels (within 0.1)
  const highConfCandidates = candidates.filter((c) => c.confidence >= strategy.minConfidence);
  const uniqueValues = new Set(highConfCandidates.map((c) => c.value));
  
  if (uniqueValues.size > 1) {
    // Check if top candidate has a clear confidence advantage (>0.1 gap from runner-up)
    const runnerUp = candidates.find((c) => c.value !== topCandidate.value);
    const confidenceGap = runnerUp ? topCandidate.confidence - runnerUp.confidence : 1;
    
    if (confidenceGap < 0.1) {
      notes.push(`Conflict: ${uniqueValues.size} different values with similar confidence (gap: ${confidenceGap.toFixed(2)})`);
      return { selectedIndex: 0, reasonCode: 'CONFLICT', notes };
    } else {
      notes.push(`Resolved conflict: top candidate has ${confidenceGap.toFixed(2)} confidence advantage`);
    }
  }
  
  notes.push(`Selected with confidence ${topCandidate.confidence.toFixed(2)}`);
  return { selectedIndex: 0, reasonCode: 'VALID', notes };
}

/**
 * Extract a single critical field
 */
export function extractField(
  fieldId: CriticalFieldType,
  text: string,
  roiText?: string
): FieldExtractionResult {
  const candidates = extractCandidates(fieldId, text, roiText);
  const { selectedIndex, reasonCode, notes } = selectCandidate(fieldId, candidates);
  
  return {
    fieldId,
    extracted: selectedIndex >= 0 && reasonCode === 'VALID',
    value: selectedIndex >= 0 ? candidates[selectedIndex].value : null,
    confidence: selectedIndex >= 0 ? candidates[selectedIndex].confidence : 0,
    candidates,
    selectedCandidate: selectedIndex,
    reasonCode,
    validationNotes: notes,
  };
}

/**
 * Extract all critical fields and generate validation trace
 */
export function extractAllCriticalFields(
  documentId: string,
  text: string,
  roiTexts?: Partial<Record<CriticalFieldType, string>>
): ValidationTrace {
  const startTime = Date.now();
  const fields: FieldExtractionResult[] = [];
  
  for (const fieldId of CRITICAL_FIELDS) {
    const roiText = roiTexts?.[fieldId];
    const result = extractField(fieldId, text, roiText);
    fields.push(result);
  }
  
  // Calculate overall confidence (geometric mean of field confidences)
  const validFields = fields.filter((f) => f.extracted);
  const overallConfidence = validFields.length > 0
    ? Math.pow(
        validFields.reduce((acc, f) => acc * f.confidence, 1),
        1 / validFields.length
      )
    : 0;
  
  const processingTimeMs = Date.now() - startTime;
  
  logger.info('Critical field extraction complete', {
    documentId,
    fieldsExtracted: validFields.length,
    totalFields: CRITICAL_FIELDS.length,
    overallConfidence: overallConfidence.toFixed(3),
    processingTimeMs,
  });
  
  return {
    documentId,
    timestamp: new Date().toISOString(),
    engineVersion: '1.0.0',
    fields,
    overallConfidence,
    processingTimeMs,
  };
}

/**
 * Write validation trace as JSON artifact
 */
export function generateValidationTraceJson(trace: ValidationTrace): string {
  return JSON.stringify(trace, null, 2);
}
