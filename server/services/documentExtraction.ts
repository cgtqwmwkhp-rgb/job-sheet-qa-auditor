/**
 * Enterprise Document Extraction Service
 * Best-in-Class++ Implementation
 * 
 * Features:
 * - Hybrid extraction (embedded text + OCR fallback)
 * - Multi-pattern field detection with confidence scoring
 * - Field normalization and validation
 * - Comprehensive audit evidence trails
 * - Deterministic, reproducible results
 */

import { v4 as uuidv4 } from 'uuid';
import { withRetry, CircuitBreaker } from '../utils/resilience';
import { getCorrelationId, createRequestContext, runWithContext } from '../utils/context';
import { redactString } from '../utils/piiRedaction';
import { calculateHash } from '../utils/fileValidation';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ExtractionMethod = 'EMBEDDED_TEXT' | 'OCR' | 'HYBRID' | 'MANUAL';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNREADABLE';
export type FieldType = 'string' | 'date' | 'number' | 'boolean' | 'enum' | 'text';

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldEvidence {
  rawSnippet: string;
  normalizedValue: string | number | boolean | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  extractionMethod: ExtractionMethod;
  boundingBox?: BoundingBox;
  matchedPattern?: string;
  alternativeValues?: Array<{ value: string; confidence: number }>;
}

export interface ExtractedField {
  fieldId: string;
  fieldName: string;
  fieldType: FieldType;
  value: string | number | boolean | null;
  evidence: FieldEvidence;
  validationErrors: string[];
  isRequired: boolean;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
}

export interface PageExtractionResult {
  pageNumber: number;
  extractionMethod: ExtractionMethod;
  rawText: string;
  textLength: number;
  hasEmbeddedText: boolean;
  ocrConfidence?: number;
  processingTimeMs: number;
}

export interface DocumentExtractionResult {
  runId: string;
  correlationId: string;
  timestamp: string;
  documentHash: string;
  filename: string;
  totalPages: number;
  extractionStrategy: ExtractionMethod;
  pages: PageExtractionResult[];
  fields: ExtractedField[];
  fullText: string;
  overallConfidence: number;
  processingTimeMs: number;
  pipelineVersion: string;
  warnings: string[];
  errors: string[];
}

export interface FieldDefinition {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  patterns: RegExp[];
  labelPatterns: string[];
  validators?: Array<(value: any) => boolean>;
  normalizer?: (value: string) => any;
  enumValues?: string[];
  description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PIPELINE_VERSION = '2.0.0-enterprise';

const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.60,
  LOW: 0.30,
};

// ============================================================================
// FIELD DEFINITIONS (Based on Real Document Analysis)
// ============================================================================

export const JOB_SHEET_FIELDS: FieldDefinition[] = [
  // Asset Information
  {
    id: 'asset_no',
    name: 'Asset Number',
    type: 'string',
    required: true,
    severity: 'S0',
    patterns: [
      /Asset\s*(?:No|Number|#)?[:\s]*([A-Z0-9\-_]+)/i,
      /(?:Asset|Equipment)\s*ID[:\s]*([A-Z0-9\-_]+)/i,
    ],
    labelPatterns: ['Asset No', 'Asset Number', 'Asset ID', 'Equipment ID'],
    description: 'Unique identifier for the asset/equipment',
  },
  {
    id: 'make_model',
    name: 'Make/Model',
    type: 'string',
    required: true,
    severity: 'S1',
    patterns: [
      /Make\s*[\/&]\s*Model[:\s]*([^\n]+)/i,
      /(?:Make|Manufacturer)[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Make/Model', 'Make & Model', 'Make', 'Model', 'Equipment Type'],
    description: 'Manufacturer and model of the asset',
  },
  {
    id: 'serial_no',
    name: 'Serial Number',
    type: 'string',
    required: false,
    severity: 'S2',
    patterns: [
      /Serial\s*(?:No|Number|#)?[:\s]*([A-Z0-9\-_]+)/i,
      /S\/N[:\s]*([A-Z0-9\-_]+)/i,
    ],
    labelPatterns: ['Serial No', 'Serial Number', 'S/N'],
    description: 'Manufacturer serial number',
  },
  {
    id: 'mileage_hours',
    name: 'Mileage/Hours',
    type: 'number',
    required: false,
    severity: 'S3',
    patterns: [
      /(?:Asset\s*)?(?:Mileage|Hours)[\/\s]*(?:Hours)?[:\s]*(\d+(?:\.\d+)?)/i,
      /(?:Odometer|Hour\s*Meter)[:\s]*(\d+(?:\.\d+)?)/i,
    ],
    labelPatterns: ['Mileage/Hours', 'Asset Mileage/Hours', 'Hours', 'Mileage'],
    normalizer: (v) => parseFloat(v) || 0,
    description: 'Current mileage or operating hours',
  },

  // Job Information
  {
    id: 'job_no',
    name: 'Job Number',
    type: 'string',
    required: true,
    severity: 'S0',
    patterns: [
      /Job\s*(?:No|Number|#)?[:\s]*(\d+)/i,
      /Work\s*Order[:\s]*(\d+)/i,
      /Reference[:\s]*(\d+)/i,
    ],
    labelPatterns: ['Job No', 'Job Number', 'Work Order', 'Reference'],
    description: 'Unique job/work order identifier',
  },
  {
    id: 'customer_name',
    name: 'Customer Name',
    type: 'string',
    required: true,
    severity: 'S0',
    patterns: [
      /Customer\s*(?:Name)?[:\s]*([^\n]+)/i,
      /Client[:\s]*([^\n]+)/i,
      /Company[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Customer Name', 'Customer', 'Client', 'Company'],
    description: 'Name of the customer/client',
  },
  {
    id: 'contact_name',
    name: 'Contact Name',
    type: 'string',
    required: false,
    severity: 'S3',
    patterns: [
      /Contact\s*(?:Name)?[:\s]*([^\n]+)/i,
      /Contact\s*Person[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Contact Name', 'Contact', 'Contact Person'],
    description: 'On-site contact person',
  },
  {
    id: 'address',
    name: 'Address',
    type: 'string',
    required: false,
    severity: 'S3',
    patterns: [
      /(?:Site\s*)?Address[:\s]*([^\n]+)/i,
      /Location[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Address', 'Site Address', 'Location'],
    description: 'Job site address',
  },
  {
    id: 'date',
    name: 'Date',
    type: 'date',
    required: true,
    severity: 'S0',
    patterns: [
      /Date[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(?:Job|Work)\s*Date[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ],
    labelPatterns: ['Date', 'Job Date', 'Work Date', 'Service Date'],
    normalizer: normalizeDate,
    description: 'Date of the job/service',
  },
  {
    id: 'travel_time',
    name: 'Travel Time',
    type: 'number',
    required: false,
    severity: 'S3',
    patterns: [
      /Travel\s*Time[:\s]*(\d+(?:\.\d+)?)/i,
    ],
    labelPatterns: ['Travel Time'],
    normalizer: (v) => parseFloat(v) || 0,
    description: 'Travel time in hours',
  },
  {
    id: 'engineer_name',
    name: 'Engineer Name',
    type: 'string',
    required: true,
    severity: 'S0',
    patterns: [
      /Engineer\s*(?:Name)?[:\s]*([^\n]+)/i,
      /Technician\s*(?:Name)?[:\s]*([^\n]+)/i,
      /(?:Performed|Completed)\s*(?:By)?[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Engineer Name', 'Technician', 'Performed By', 'Completed By'],
    description: 'Name of the engineer/technician',
  },

  // Issue Description
  {
    id: 'issue_description',
    name: 'Issue Description',
    type: 'text',
    required: true,
    severity: 'S1',
    patterns: [
      /Issue[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*:)[^\n]+)*)/i,
      /Problem[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*:)[^\n]+)*)/i,
      /Fault[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*:)[^\n]+)*)/i,
    ],
    labelPatterns: ['Issue', 'Problem', 'Fault', 'Reason for Call'],
    description: 'Description of the reported issue',
  },

  // Completion Details
  {
    id: 'consumables_used',
    name: 'Consumables Used',
    type: 'boolean',
    required: false,
    severity: 'S3',
    patterns: [
      /Consumables\s*Used[:\s]*(Yes|No|Y|N|True|False)/i,
    ],
    labelPatterns: ['Consumables Used'],
    normalizer: normalizeBoolean,
    description: 'Whether consumables were used',
  },
  {
    id: 'overtime',
    name: 'Overtime',
    type: 'boolean',
    required: false,
    severity: 'S3',
    patterns: [
      /Overtime[:\s]*(Yes|No|Y|N|True|False)/i,
    ],
    labelPatterns: ['Overtime'],
    normalizer: normalizeBoolean,
    description: 'Whether overtime was worked',
  },
  {
    id: 'works_completed',
    name: 'Works Fully Completed',
    type: 'boolean',
    required: true,
    severity: 'S1',
    patterns: [
      /(?:Were\s*)?(?:all\s*)?works?\s*(?:fully\s*)?completed[:\?]?\s*(Yes|No|Y|N|True|False)/i,
      /Job\s*Completed[:\?]?\s*(Yes|No|Y|N|True|False)/i,
    ],
    labelPatterns: ['Were all works fully completed', 'Works Completed', 'Job Completed'],
    normalizer: normalizeBoolean,
    description: 'Whether all work was completed',
  },
  {
    id: 'return_visit_required',
    name: 'Return Visit Required',
    type: 'boolean',
    required: true,
    severity: 'S1',
    patterns: [
      /(?:Is\s*a\s*)?return\s*visit\s*required[:\?]?\s*(Yes|No|Y|N|True|False)/i,
      /Follow[\s\-]*up\s*Required[:\?]?\s*(Yes|No|Y|N|True|False)/i,
    ],
    labelPatterns: ['Is a return visit required', 'Return Visit Required', 'Follow-up Required'],
    normalizer: normalizeBoolean,
    description: 'Whether a return visit is needed',
  },
  {
    id: 'safe_to_use',
    name: 'Safe to Use',
    type: 'boolean',
    required: true,
    severity: 'S0',
    patterns: [
      /(?:Is\s*the\s*)?asset\s*safe\s*to\s*use[:\?]?\s*(Yes|No|Y|N|True|False)/i,
      /Safe\s*(?:to\s*)?(?:Use|Operate)[:\?]?\s*(Yes|No|Y|N|True|False)/i,
    ],
    labelPatterns: ['Is the asset safe to use', 'Safe to Use', 'Safe to Operate'],
    normalizer: normalizeBoolean,
    validators: [(v) => typeof v === 'boolean'],
    description: 'Critical safety indicator - determines VOR status',
  },

  // Repair Details
  {
    id: 'engineer_comments',
    name: 'Engineer Comments',
    type: 'text',
    required: true,
    severity: 'S1',
    patterns: [
      /Engineer\s*Comments?[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*(?:\s+[A-Z][a-z]*)?:)[^\n]+)*)/i,
      /Technician\s*(?:Notes?|Comments?)[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*:)[^\n]+)*)/i,
      /Work\s*(?:Performed|Done|Description)[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*:)[^\n]+)*)/i,
    ],
    labelPatterns: ['Engineer Comments', 'Technician Notes', 'Work Performed', 'Work Description'],
    description: 'Detailed comments from the engineer',
  },
  {
    id: 'fault_reason',
    name: 'Fault Reason',
    type: 'string',
    required: false,
    severity: 'S2',
    patterns: [
      /Fault\s*Reason[:\s]*([^\n]+)/i,
      /Root\s*Cause[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Fault Reason', 'Root Cause', 'Cause'],
    enumValues: ['Wear & Tear', 'Routine', 'Damage', 'Electrical', 'Mechanical', 'User Error', 'Unknown'],
    description: 'Category of the fault',
  },
  {
    id: 'repair_duration',
    name: 'Repair Duration',
    type: 'number',
    required: false,
    severity: 'S2',
    patterns: [
      /Repair\s*Duration[:\s]*(\d+(?:\.\d+)?)/i,
      /Labour\s*(?:Time|Hours)[:\s]*(\d+(?:\.\d+)?)/i,
    ],
    labelPatterns: ['Repair Duration', 'Labour Time', 'Labour Hours'],
    normalizer: (v) => parseFloat(v) || 0,
    description: 'Time spent on repairs in hours',
  },
  {
    id: 'parts_used',
    name: 'Parts Used',
    type: 'text',
    required: false,
    severity: 'S2',
    patterns: [
      /Parts?\s*Used[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*(?:\s+[A-Z][a-z]*)?:)[^\n]+)*)/i,
      /Components?\s*(?:Used|Replaced)[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Parts Used', 'Components Used', 'Parts Replaced'],
    description: 'List of parts used in the repair',
  },
  {
    id: 'parts_required',
    name: 'Parts Still Required',
    type: 'text',
    required: false,
    severity: 'S2',
    patterns: [
      /Parts?\s*(?:Still\s*)?Required[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*:)[^\n]+)*)/i,
      /Parts?\s*(?:to\s*)?Order[:\s]*([^\n]+)/i,
    ],
    labelPatterns: ['Parts Still Required', 'Parts Required', 'Parts to Order'],
    description: 'Parts needed for completion',
  },

  // Signatures
  {
    id: 'technician_signature',
    name: 'Technician Signature',
    type: 'boolean',
    required: true,
    severity: 'S0',
    patterns: [
      /Technician\s*Signature/i,
      /Engineer\s*Signature/i,
      /Signed\s*(?:by\s*)?(?:Technician|Engineer)/i,
    ],
    labelPatterns: ['Technician Signature', 'Engineer Signature'],
    normalizer: () => true, // Presence of label indicates signature exists
    description: 'Technician signature present',
  },

  // VOR Status
  {
    id: 'vor_status',
    name: 'VOR Status',
    type: 'boolean',
    required: false,
    severity: 'S0',
    patterns: [
      /(?:This\s*)?(?:Vehicle|Asset)\s*(?:is\s*)?marked\s*as\s*VOR/i,
      /VOR\s*Status[:\s]*(Yes|No|True|False)/i,
      /Vehicle\s*Off\s*Road/i,
    ],
    labelPatterns: ['VOR', 'Vehicle Off Road', 'VOR Status'],
    normalizer: (v) => v.toLowerCase().includes('vor') || normalizeBoolean(v),
    description: 'Vehicle Off Road status',
  },
];

// ============================================================================
// NORMALIZERS
// ============================================================================

function normalizeDate(value: string): string | null {
  if (!value) return null;
  
  // Try various date formats
  const patterns = [
    // DD/MM/YYYY or DD-MM-YYYY
    { regex: /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, format: 'DMY' },
    // DD/MM/YY or DD-MM-YY
    { regex: /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/, format: 'DMY-short' },
    // YYYY-MM-DD (ISO)
    { regex: /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, format: 'YMD' },
  ];
  
  for (const { regex, format } of patterns) {
    const match = value.match(regex);
    if (match) {
      let day: number, month: number, year: number;
      
      if (format === 'DMY') {
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else if (format === 'DMY-short') {
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = 2000 + parseInt(match[3], 10);
      } else { // YMD
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      }
      
      // Validate date
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  
  return value; // Return original if can't parse
}

function normalizeBoolean(value: string): boolean {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  
  const normalized = value.toString().toLowerCase().trim();
  return ['yes', 'y', 'true', '1', 'checked', '✓', '✔'].includes(normalized);
}

// ============================================================================
// EXTRACTION ENGINE
// ============================================================================

export class DocumentExtractionEngine {
  private ocrCircuitBreaker: CircuitBreaker;
  
  constructor() {
    this.ocrCircuitBreaker = new CircuitBreaker('ocr-extraction', {
      failureThreshold: 3,
      resetTimeoutMs: 60000,
    });
  }
  
  /**
   * Main extraction entry point
   */
  async extractDocument(
    fileBuffer: Buffer,
    filename: string,
    options: { forceOCR?: boolean } = {}
  ): Promise<DocumentExtractionResult> {
    const startTime = Date.now();
    const runId = uuidv4();
    const correlationId = getCorrelationId() || runId;
    
    const result: DocumentExtractionResult = {
      runId,
      correlationId,
      timestamp: new Date().toISOString(),
      documentHash: calculateHash(fileBuffer),
      filename,
      totalPages: 0,
      extractionStrategy: 'EMBEDDED_TEXT',
      pages: [],
      fields: [],
      fullText: '',
      overallConfidence: 0,
      processingTimeMs: 0,
      pipelineVersion: PIPELINE_VERSION,
      warnings: [],
      errors: [],
    };
    
    try {
      // Step 1: Try embedded text extraction first
      const embeddedResult = await this.extractEmbeddedText(fileBuffer);
      
      if (embeddedResult.success && embeddedResult.text.length > 100) {
        result.extractionStrategy = 'EMBEDDED_TEXT';
        result.fullText = embeddedResult.text;
        result.totalPages = embeddedResult.pageCount;
        result.pages = embeddedResult.pages.map((p, i) => ({
          pageNumber: i + 1,
          extractionMethod: 'EMBEDDED_TEXT' as ExtractionMethod,
          rawText: p,
          textLength: p.length,
          hasEmbeddedText: true,
          processingTimeMs: embeddedResult.processingTimeMs / embeddedResult.pageCount,
        }));
      } else if (options.forceOCR || embeddedResult.text.length < 100) {
        // Step 2: Fall back to OCR
        result.warnings.push('Embedded text insufficient, using OCR fallback');
        const ocrResult = await this.extractWithOCR(fileBuffer);
        
        if (ocrResult.success) {
          result.extractionStrategy = 'OCR';
          result.fullText = ocrResult.text;
          result.totalPages = ocrResult.pageCount;
          result.pages = ocrResult.pages.map((p, i) => ({
            pageNumber: i + 1,
            extractionMethod: 'OCR' as ExtractionMethod,
            rawText: p.text,
            textLength: p.text.length,
            hasEmbeddedText: false,
            ocrConfidence: p.confidence,
            processingTimeMs: p.processingTimeMs,
          }));
        } else {
          result.errors.push(`OCR extraction failed: ${ocrResult.error}`);
        }
      }
      
      // Step 3: Extract fields from text
      if (result.fullText.length > 0) {
        result.fields = this.extractFields(result.fullText, result.extractionStrategy);
        result.overallConfidence = this.calculateOverallConfidence(result.fields);
      }
      
    } catch (error) {
      result.errors.push(`Extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    result.processingTimeMs = Date.now() - startTime;
    return result;
  }
  
  /**
   * Extract embedded text from PDF using pdftotext
   */
  private async extractEmbeddedText(fileBuffer: Buffer): Promise<{
    success: boolean;
    text: string;
    pages: string[];
    pageCount: number;
    processingTimeMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Write buffer to temp file
      const fs = await import('fs/promises');
      const path = await import('path');
      const { execSync } = await import('child_process');
      
      const tempPath = `/tmp/extract_${uuidv4()}.pdf`;
      await fs.writeFile(tempPath, fileBuffer);
      
      try {
        // Extract text using pdftotext
        const text = execSync(`pdftotext "${tempPath}" -`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: 30000,
        });
        
        // Get page count
        const pageInfo = execSync(`pdfinfo "${tempPath}" 2>/dev/null | grep Pages`, {
          encoding: 'utf-8',
        });
        const pageCount = parseInt(pageInfo.match(/Pages:\s*(\d+)/)?.[1] || '1', 10);
        
        // Split by form feed or estimate pages
        const pages = text.split('\f').filter(p => p.trim().length > 0);
        
        return {
          success: true,
          text: text.trim(),
          pages: pages.length > 0 ? pages : [text],
          pageCount,
          processingTimeMs: Date.now() - startTime,
        };
      } finally {
        // Cleanup temp file
        await fs.unlink(tempPath).catch(() => {});
      }
    } catch (error) {
      return {
        success: false,
        text: '',
        pages: [],
        pageCount: 0,
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Extract text using Mistral OCR
   */
  private async extractWithOCR(fileBuffer: Buffer): Promise<{
    success: boolean;
    text: string;
    pages: Array<{ text: string; confidence: number; processingTimeMs: number }>;
    pageCount: number;
    error?: string;
  }> {
    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
    
    if (!MISTRAL_API_KEY) {
      return {
        success: false,
        text: '',
        pages: [],
        pageCount: 0,
        error: 'MISTRAL_API_KEY not configured',
      };
    }
    
    try {
      const result = await this.ocrCircuitBreaker.execute(async () => {
        const base64 = fileBuffer.toString('base64');
        
        const response = await withRetry(
          async () => {
            const res = await fetch('https://api.mistral.ai/v1/ocr', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${MISTRAL_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'mistral-ocr-latest',
                document: {
                  type: 'document_url',
                  document_url: `data:application/pdf;base64,${base64}`,
                },
              }),
            });
            
            if (!res.ok) {
              throw new Error(`OCR API error: ${res.status}`);
            }
            
            return res.json();
          },
          { maxRetries: 2, baseDelayMs: 1000 }
        );
        
        return response;
      });
      
      const pages = (result.pages || []).map((p: any, i: number) => ({
        text: p.markdown || p.text || '',
        confidence: p.confidence || 0.8,
        processingTimeMs: 0,
      }));
      
      const fullText = pages.map((p: any) => p.text).join('\n\n');
      
      return {
        success: true,
        text: fullText,
        pages,
        pageCount: pages.length,
      };
    } catch (error) {
      return {
        success: false,
        text: '',
        pages: [],
        pageCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Extract all defined fields from text
   */
  extractFields(text: string, extractionMethod: ExtractionMethod): ExtractedField[] {
    const fields: ExtractedField[] = [];
    
    for (const fieldDef of JOB_SHEET_FIELDS) {
      const extracted = this.extractField(text, fieldDef, extractionMethod);
      fields.push(extracted);
    }
    
    // Sort by severity then by field order
    const severityOrder = { 'S0': 0, 'S1': 1, 'S2': 2, 'S3': 3 };
    fields.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return JOB_SHEET_FIELDS.findIndex(f => f.id === a.fieldId) - 
             JOB_SHEET_FIELDS.findIndex(f => f.id === b.fieldId);
    });
    
    return fields;
  }
  
  /**
   * Extract a single field using multiple strategies
   */
  private extractField(
    text: string,
    fieldDef: FieldDefinition,
    extractionMethod: ExtractionMethod
  ): ExtractedField {
    const result: ExtractedField = {
      fieldId: fieldDef.id,
      fieldName: fieldDef.name,
      fieldType: fieldDef.type,
      value: null,
      evidence: {
        rawSnippet: '',
        normalizedValue: null,
        confidence: 0,
        confidenceLevel: 'UNREADABLE',
        extractionMethod,
      },
      validationErrors: [],
      isRequired: fieldDef.required,
      severity: fieldDef.severity,
    };
    
    // Try each pattern
    for (const pattern of fieldDef.patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const rawValue = match[1].trim();
        
        // Calculate confidence based on match quality
        let confidence = 0.7; // Base confidence for pattern match
        
        // Boost confidence if label is found nearby
        for (const label of fieldDef.labelPatterns) {
          if (text.toLowerCase().includes(label.toLowerCase())) {
            confidence += 0.15;
            break;
          }
        }
        
        // Boost for embedded text extraction
        if (extractionMethod === 'EMBEDDED_TEXT') {
          confidence += 0.1;
        }
        
        // Cap at 0.99
        confidence = Math.min(0.99, confidence);
        
        // Normalize value
        let normalizedValue: any = rawValue;
        if (fieldDef.normalizer) {
          try {
            normalizedValue = fieldDef.normalizer(rawValue);
          } catch {
            result.validationErrors.push(`Normalization failed for value: ${rawValue}`);
          }
        }
        
        // Validate
        if (fieldDef.validators) {
          for (const validator of fieldDef.validators) {
            if (!validator(normalizedValue)) {
              result.validationErrors.push(`Validation failed for field ${fieldDef.name}`);
              confidence -= 0.2;
            }
          }
        }
        
        // Check enum values
        if (fieldDef.enumValues && typeof normalizedValue === 'string') {
          const matchedEnum = fieldDef.enumValues.find(
            e => e.toLowerCase() === normalizedValue.toLowerCase()
          );
          if (matchedEnum) {
            normalizedValue = matchedEnum;
            confidence += 0.1;
          } else {
            result.validationErrors.push(
              `Value "${normalizedValue}" not in allowed values: ${fieldDef.enumValues.join(', ')}`
            );
          }
        }
        
        result.value = normalizedValue;
        result.evidence = {
          rawSnippet: rawValue,
          normalizedValue,
          confidence: Math.max(0, Math.min(1, confidence)),
          confidenceLevel: this.getConfidenceLevel(confidence),
          extractionMethod,
          matchedPattern: pattern.toString(),
        };
        
        break; // Use first successful match
      }
    }
    
    // If required field not found, add error
    if (result.value === null && fieldDef.required) {
      result.validationErrors.push(`Required field "${fieldDef.name}" not found`);
    }
    
    return result;
  }
  
  /**
   * Get confidence level from numeric confidence
   */
  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
    if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
    if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return 'LOW';
    return 'UNREADABLE';
  }
  
  /**
   * Calculate overall document confidence
   */
  private calculateOverallConfidence(fields: ExtractedField[]): number {
    const requiredFields = fields.filter(f => f.isRequired);
    if (requiredFields.length === 0) return 0;
    
    const foundRequired = requiredFields.filter(f => f.value !== null);
    const avgConfidence = foundRequired.reduce((sum, f) => sum + f.evidence.confidence, 0) / 
                          Math.max(1, foundRequired.length);
    
    const completeness = foundRequired.length / requiredFields.length;
    
    return Math.round((avgConfidence * 0.6 + completeness * 0.4) * 100) / 100;
  }
}

// Export singleton instance
export const documentExtractionEngine = new DocumentExtractionEngine();
