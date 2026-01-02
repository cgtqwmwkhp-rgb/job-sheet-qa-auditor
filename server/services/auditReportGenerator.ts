/**
 * Audit Report Generator
 * Produces deterministic, audit-ready JSON reports
 * 
 * Features:
 * - Canonical JSON output with stable ordering
 * - Complete evidence trails
 * - Next steps and remediation guidance
 * - REVIEW_QUEUE and WAIVER support
 */

import { v4 as uuidv4 } from 'uuid';
import { DocumentExtractionResult, ExtractedField } from './documentExtraction';
import { ValidationResult, FieldValidationResult, BusinessRuleResult, GOLD_STANDARD_SPEC_V1 } from './goldStandardSpec';
import { getCorrelationId } from '../utils/context';

// ============================================================================
// TYPES
// ============================================================================

export type AuditStatus = 'PASS' | 'FAIL' | 'REVIEW_QUEUE' | 'WAIVED';
export type ReasonCode = 
  | 'MISSING_FIELD'
  | 'UNREADABLE_FIELD'
  | 'LOW_CONFIDENCE'
  | 'INVALID_FORMAT'
  | 'CONFLICT'
  | 'OUT_OF_POLICY'
  | 'INCOMPLETE_EVIDENCE'
  | 'OCR_FAILURE'
  | 'PIPELINE_ERROR'
  | 'SPEC_GAP'
  | 'SECURITY_RISK'
  | 'BUSINESS_RULE_VIOLATION';

export interface Finding {
  findingId: string;
  fieldId: string;
  fieldName: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  reasonCode: ReasonCode;
  description: string;
  evidence: {
    pageNumber?: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
    rawSnippet: string;
    normalizedValue: any;
    confidence: number;
    extractionMethod: string;
  };
  whyItMatters: string;
  nextSteps: NextStep[];
}

export interface NextStep {
  action: string;
  owner: 'ENGINEER' | 'QA_MANAGER' | 'ADMIN' | 'SYSTEM';
  priority: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';
  preventionTip: string;
}

export interface ReviewQueueItem {
  fieldId: string;
  fieldName: string;
  reason: string;
  currentValue: any;
  confidence: number;
  suggestedAction: string;
}

export interface Waiver {
  waiverId: string;
  findingId: string;
  approver: string;
  reason: string;
  expiryDate: string | null;
  createdAt: string;
  auditTrail: string[];
}

export interface AuditReport {
  // Metadata
  reportId: string;
  runId: string;
  correlationId: string;
  timestamp: string;
  
  // Document Info
  document: {
    filename: string;
    hash: string;
    totalPages: number;
    extractionStrategy: string;
    processingTimeMs: number;
  };
  
  // Version Info
  versions: {
    pipelineVersion: string;
    goldSpecVersion: string;
    ocrEngineVersion: string;
    reportSchemaVersion: string;
  };
  
  // Results
  status: AuditStatus;
  overallScore: number;
  overallConfidence: number;
  
  // Summary
  summary: {
    totalFields: number;
    extractedFields: number;
    validFields: number;
    missingRequired: number;
    criticalIssues: number;
    warnings: number;
    reviewQueueItems: number;
  };
  
  // Detailed Findings (sorted by severity, then reasonCode, then fieldName)
  findings: Finding[];
  
  // Review Queue
  reviewQueue: ReviewQueueItem[];
  
  // Waivers
  waivers: Waiver[];
  
  // Extracted Data (for reference)
  extractedData: Record<string, any>;
  
  // Business Rule Results
  businessRuleResults: Array<{
    ruleId: string;
    ruleName: string;
    passed: boolean;
    severity: string;
    errorMessage?: string;
  }>;
  
  // Processing Trace
  trace: {
    pages: Array<{
      pageNumber: number;
      extractionMethod: string;
      textLength: number;
      confidence?: number;
    }>;
    warnings: string[];
    errors: string[];
  };
}

// ============================================================================
// NEXT STEPS TEMPLATES
// ============================================================================

const NEXT_STEPS_BY_REASON: Record<ReasonCode, (fieldName: string) => NextStep[]> = {
  MISSING_FIELD: (fieldName) => [
    {
      action: `Locate and enter the ${fieldName} on the job sheet`,
      owner: 'ENGINEER',
      priority: 'IMMEDIATE',
      preventionTip: `Ensure ${fieldName} is always filled before leaving site`,
    },
    {
      action: `Review job sheet template to ensure ${fieldName} field is prominent`,
      owner: 'QA_MANAGER',
      priority: 'MEDIUM',
      preventionTip: 'Consider making this a mandatory field in the mobile app',
    },
  ],
  UNREADABLE_FIELD: (fieldName) => [
    {
      action: `Re-scan or re-photograph the ${fieldName} section with better lighting`,
      owner: 'ENGINEER',
      priority: 'HIGH',
      preventionTip: 'Use the mobile app camera for consistent quality',
    },
    {
      action: `Manually verify ${fieldName} from original document`,
      owner: 'QA_MANAGER',
      priority: 'HIGH',
      preventionTip: 'Train engineers on proper document photography',
    },
  ],
  LOW_CONFIDENCE: (fieldName) => [
    {
      action: `Verify the extracted ${fieldName} value is correct`,
      owner: 'QA_MANAGER',
      priority: 'MEDIUM',
      preventionTip: 'Encourage clear handwriting or use printed labels',
    },
  ],
  INVALID_FORMAT: (fieldName) => [
    {
      action: `Correct the ${fieldName} format to match requirements`,
      owner: 'ENGINEER',
      priority: 'HIGH',
      preventionTip: 'Use the correct format as shown in the field placeholder',
    },
  ],
  CONFLICT: (fieldName) => [
    {
      action: `Resolve conflicting values for ${fieldName}`,
      owner: 'QA_MANAGER',
      priority: 'HIGH',
      preventionTip: 'Ensure only one authoritative source for each field',
    },
  ],
  OUT_OF_POLICY: (fieldName) => [
    {
      action: `Review ${fieldName} against company policy`,
      owner: 'QA_MANAGER',
      priority: 'HIGH',
      preventionTip: 'Ensure engineers are trained on current policies',
    },
  ],
  INCOMPLETE_EVIDENCE: (fieldName) => [
    {
      action: `Provide additional evidence for ${fieldName}`,
      owner: 'ENGINEER',
      priority: 'MEDIUM',
      preventionTip: 'Always include photos and detailed notes',
    },
  ],
  OCR_FAILURE: (fieldName) => [
    {
      action: `Re-upload document with better scan quality`,
      owner: 'ENGINEER',
      priority: 'HIGH',
      preventionTip: 'Use 300 DPI or higher for scans',
    },
    {
      action: `Manually enter ${fieldName} if OCR continues to fail`,
      owner: 'QA_MANAGER',
      priority: 'MEDIUM',
      preventionTip: 'Consider using digital forms instead of paper',
    },
  ],
  PIPELINE_ERROR: (fieldName) => [
    {
      action: `Report system error to IT support`,
      owner: 'ADMIN',
      priority: 'HIGH',
      preventionTip: 'Monitor system health dashboards',
    },
  ],
  SPEC_GAP: (fieldName) => [
    {
      action: `Review Gold Standard spec for ${fieldName} definition`,
      owner: 'ADMIN',
      priority: 'MEDIUM',
      preventionTip: 'Keep spec updated with business requirements',
    },
  ],
  SECURITY_RISK: (fieldName) => [
    {
      action: `Review ${fieldName} for potential PII exposure`,
      owner: 'ADMIN',
      priority: 'IMMEDIATE',
      preventionTip: 'Implement PII detection in upload process',
    },
  ],
  BUSINESS_RULE_VIOLATION: (fieldName) => [
    {
      action: `Review and correct the data inconsistency`,
      owner: 'QA_MANAGER',
      priority: 'HIGH',
      preventionTip: 'Ensure engineers understand the business rules',
    },
  ],
};

// ============================================================================
// REPORT GENERATOR
// ============================================================================

export class AuditReportGenerator {
  private reportSchemaVersion = '2.0.0';
  
  generateReport(
    extraction: DocumentExtractionResult,
    validation: ValidationResult,
    existingWaivers: Waiver[] = []
  ): AuditReport {
    const reportId = uuidv4();
    const correlationId = getCorrelationId() || extraction.correlationId;
    
    // Build findings from validation results
    const findings = this.buildFindings(extraction, validation);
    
    // Build review queue
    const reviewQueue = this.buildReviewQueue(extraction, validation);
    
    // Determine status
    const status = this.determineStatus(validation, reviewQueue, existingWaivers);
    
    // Build extracted data map
    const extractedData: Record<string, any> = {};
    for (const field of extraction.fields) {
      extractedData[field.fieldId] = field.value;
    }
    
    // Build report
    const report: AuditReport = {
      reportId,
      runId: extraction.runId,
      correlationId,
      timestamp: new Date().toISOString(),
      
      document: {
        filename: extraction.filename,
        hash: extraction.documentHash,
        totalPages: extraction.totalPages,
        extractionStrategy: extraction.extractionStrategy,
        processingTimeMs: extraction.processingTimeMs,
      },
      
      versions: {
        pipelineVersion: extraction.pipelineVersion,
        goldSpecVersion: GOLD_STANDARD_SPEC_V1.version,
        ocrEngineVersion: 'mistral-ocr-latest',
        reportSchemaVersion: this.reportSchemaVersion,
      },
      
      status,
      overallScore: validation.overallScore,
      overallConfidence: extraction.overallConfidence,
      
      summary: {
        totalFields: validation.summary.totalFields,
        extractedFields: extraction.fields.filter(f => f.value !== null).length,
        validFields: validation.summary.validFields,
        missingRequired: validation.summary.missingRequired,
        criticalIssues: validation.summary.criticalIssues,
        warnings: validation.summary.warnings,
        reviewQueueItems: reviewQueue.length,
      },
      
      findings,
      reviewQueue,
      waivers: existingWaivers,
      extractedData,
      
      businessRuleResults: validation.businessRuleResults.map(r => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        passed: r.passed,
        severity: r.severity,
        errorMessage: r.errorMessage,
      })),
      
      trace: {
        pages: extraction.pages.map(p => ({
          pageNumber: p.pageNumber,
          extractionMethod: p.extractionMethod,
          textLength: p.textLength,
          confidence: p.ocrConfidence,
        })),
        warnings: extraction.warnings,
        errors: extraction.errors,
      },
    };
    
    // Sort findings by severity, then reasonCode, then fieldName
    report.findings.sort((a, b) => {
      const severityOrder = { 'S0': 0, 'S1': 1, 'S2': 2, 'S3': 3 };
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      
      const reasonDiff = a.reasonCode.localeCompare(b.reasonCode);
      if (reasonDiff !== 0) return reasonDiff;
      
      return a.fieldName.localeCompare(b.fieldName);
    });
    
    return report;
  }
  
  private buildFindings(
    extraction: DocumentExtractionResult,
    validation: ValidationResult
  ): Finding[] {
    const findings: Finding[] = [];
    
    // Add findings from field validation
    for (const fieldResult of validation.fieldResults) {
      if (!fieldResult.isValid || fieldResult.errors.length > 0) {
        const extractedField = extraction.fields.find(f => f.fieldId === fieldResult.fieldId);
        
        // Determine reason code
        let reasonCode: ReasonCode = 'INVALID_FORMAT';
        if (!fieldResult.isPresent && fieldResult.isRequired) {
          reasonCode = 'MISSING_FIELD';
        } else if (extractedField && extractedField.evidence.confidenceLevel === 'LOW') {
          reasonCode = 'LOW_CONFIDENCE';
        } else if (extractedField && extractedField.evidence.confidenceLevel === 'UNREADABLE') {
          reasonCode = 'UNREADABLE_FIELD';
        }
        
        findings.push({
          findingId: uuidv4(),
          fieldId: fieldResult.fieldId,
          fieldName: fieldResult.fieldName,
          severity: fieldResult.severity,
          reasonCode,
          description: fieldResult.errors.join('; ') || `Issue with ${fieldResult.fieldName}`,
          evidence: {
            rawSnippet: extractedField?.evidence.rawSnippet || '',
            normalizedValue: fieldResult.value,
            confidence: extractedField?.evidence.confidence || 0,
            extractionMethod: extractedField?.evidence.extractionMethod || 'UNKNOWN',
          },
          whyItMatters: fieldResult.whyItMatters,
          nextSteps: NEXT_STEPS_BY_REASON[reasonCode](fieldResult.fieldName),
        });
      }
    }
    
    // Add findings from business rule violations
    for (const ruleResult of validation.businessRuleResults) {
      if (!ruleResult.passed) {
        findings.push({
          findingId: uuidv4(),
          fieldId: ruleResult.ruleId,
          fieldName: ruleResult.ruleName,
          severity: ruleResult.severity,
          reasonCode: 'BUSINESS_RULE_VIOLATION',
          description: ruleResult.errorMessage || 'Business rule violation',
          evidence: {
            rawSnippet: '',
            normalizedValue: null,
            confidence: 1,
            extractionMethod: 'RULE_ENGINE',
          },
          whyItMatters: ruleResult.whyItMatters,
          nextSteps: NEXT_STEPS_BY_REASON['BUSINESS_RULE_VIOLATION'](ruleResult.ruleName),
        });
      }
    }
    
    return findings;
  }
  
  private buildReviewQueue(
    extraction: DocumentExtractionResult,
    validation: ValidationResult
  ): ReviewQueueItem[] {
    const queue: ReviewQueueItem[] = [];
    
    // Add low confidence fields to review queue
    for (const field of extraction.fields) {
      if (field.evidence.confidenceLevel === 'LOW' || field.evidence.confidenceLevel === 'MEDIUM') {
        const fieldResult = validation.fieldResults.find(f => f.fieldId === field.fieldId);
        
        queue.push({
          fieldId: field.fieldId,
          fieldName: field.fieldName,
          reason: `Confidence level: ${field.evidence.confidenceLevel} (${Math.round(field.evidence.confidence * 100)}%)`,
          currentValue: field.value,
          confidence: field.evidence.confidence,
          suggestedAction: field.evidence.confidenceLevel === 'LOW' 
            ? 'Manual verification required'
            : 'Review and confirm value',
        });
      }
    }
    
    // Add fields with validation errors that aren't critical
    for (const fieldResult of validation.fieldResults) {
      if (!fieldResult.isValid && (fieldResult.severity === 'S2' || fieldResult.severity === 'S3')) {
        if (!queue.some(q => q.fieldId === fieldResult.fieldId)) {
          queue.push({
            fieldId: fieldResult.fieldId,
            fieldName: fieldResult.fieldName,
            reason: fieldResult.errors.join('; '),
            currentValue: fieldResult.value,
            confidence: 0.5,
            suggestedAction: 'Review and correct if necessary',
          });
        }
      }
    }
    
    return queue;
  }
  
  private determineStatus(
    validation: ValidationResult,
    reviewQueue: ReviewQueueItem[],
    waivers: Waiver[]
  ): AuditStatus {
    // Check for waivers covering all critical issues
    const criticalFindings = validation.fieldResults.filter(
      f => !f.isValid && (f.severity === 'S0' || f.severity === 'S1')
    );
    
    const allCriticalWaived = criticalFindings.every(f =>
      waivers.some(w => w.findingId === f.fieldId && (!w.expiryDate || new Date(w.expiryDate) > new Date()))
    );
    
    if (allCriticalWaived && criticalFindings.length > 0) {
      return 'WAIVED';
    }
    
    if (validation.summary.criticalIssues > 0) {
      return 'FAIL';
    }
    
    if (reviewQueue.length > 0) {
      return 'REVIEW_QUEUE';
    }
    
    return 'PASS';
  }
}

// Export singleton
export const auditReportGenerator = new AuditReportGenerator();
