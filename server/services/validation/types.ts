/**
 * Validation Service Types
 * 
 * Defines the validation pipeline interface and types.
 */

import type { ValidationRule, RuleStatus, RuleSeverity } from '../specResolver/types';
import type { ExtractedField } from '../extraction/types';

/**
 * Single validated field result
 */
export interface ValidatedField {
  /**
   * Rule ID that was checked
   */
  ruleId: string;
  
  /**
   * Canonical field name
   */
  field: string;
  
  /**
   * Validation status
   */
  status: RuleStatus;
  
  /**
   * Extracted value (if available)
   */
  value?: string | number | boolean | null;
  
  /**
   * Confidence from extraction
   */
  confidence?: number;
  
  /**
   * Page number where field was found
   */
  pageNumber?: number;
  
  /**
   * Rule severity
   */
  severity: RuleSeverity;
  
  /**
   * Validation message
   */
  message?: string;
}

/**
 * Single finding (defect/issue)
 */
export interface Finding {
  /**
   * Rule ID that failed
   */
  ruleId: string;
  
  /**
   * Canonical field name
   */
  field: string;
  
  /**
   * Finding status (always 'failed' for findings)
   */
  status: 'failed';
  
  /**
   * Rule severity
   */
  severity: RuleSeverity;
  
  /**
   * Human-readable message
   */
  message: string;
  
  /**
   * Actual value found (if any)
   */
  actualValue?: string | number | boolean | null;
  
  /**
   * Expected value/pattern
   */
  expectedValue?: string;
  
  /**
   * Page number where issue was found
   */
  pageNumber?: number;
}

/**
 * Validation result for a document
 */
export interface ValidationResult {
  /**
   * Whether validation passed overall
   */
  passed: boolean;
  
  /**
   * All validated fields (complete list of all rules checked)
   */
  validatedFields: ValidatedField[];
  
  /**
   * Findings (defects/issues only)
   */
  findings: Finding[];
  
  /**
   * Summary statistics
   */
  summary: {
    totalRules: number;
    passedRules: number;
    failedRules: number;
    skippedRules: number;
    criticalFailures: number;
    majorFailures: number;
    minorFailures: number;
    infoFailures: number;
  };
  
  /**
   * Validation metadata
   */
  metadata: {
    processingTimeMs: number;
    validationVersion: string;
    specPackId: string;
    specPackVersion: string;
  };
  
  /**
   * Correlation ID for tracing
   */
  correlationId?: string;
}

/**
 * Review queue item
 */
export interface ReviewQueueItem {
  /**
   * Unique item ID
   */
  id: string;
  
  /**
   * Document ID
   */
  documentId: string;
  
  /**
   * Reason for review
   */
  reason: 'low_confidence' | 'validation_failure' | 'manual_flag';
  
  /**
   * Fields requiring review
   */
  fields: string[];
  
  /**
   * Priority (1-5, 1 is highest)
   */
  priority: number;
  
  /**
   * Review status
   */
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  
  /**
   * Assigned reviewer
   */
  assignedTo?: string;
  
  /**
   * Created timestamp
   */
  createdAt: string;
  
  /**
   * Updated timestamp
   */
  updatedAt: string;
  
  /**
   * Correlation ID
   */
  correlationId?: string;
}

/**
 * Validation artifact (for persistence)
 */
export interface ValidationArtifact {
  version: '1.0.0';
  generatedAt: string;
  correlationId?: string;
  documentId?: string;
  passed: boolean;
  validatedFields: ValidatedField[];
  findings: Finding[];
  summary: ValidationResult['summary'];
  metadata: ValidationResult['metadata'];
}
