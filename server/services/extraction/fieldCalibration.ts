/**
 * Critical Field Calibration
 * 
 * PR-4: Template-specific thresholds and guardrails for field extraction:
 * - Per-field confidence thresholds
 * - Template-specific calibration profiles
 * - Extraction quality guardrails
 * - Anomaly detection for out-of-spec extractions
 * 
 * NON-NEGOTIABLES:
 * - Canonical reason codes only
 * - Deterministic threshold application
 * - All calibration decisions logged for audit
 */

import type { FieldSpec, RuleSpec, SpecJson } from '../templateRegistry/types';

/**
 * Confidence threshold levels
 */
export type ThresholdLevel = 'strict' | 'standard' | 'lenient';

/**
 * Per-field calibration configuration
 */
export interface FieldCalibration {
  /** Field ID */
  fieldId: string;
  /** Minimum confidence to accept */
  minConfidence: number;
  /** Confidence below which triggers REVIEW_QUEUE */
  reviewThreshold: number;
  /** Whether this field is critical (affects overall outcome) */
  isCritical: boolean;
  /** Allowed extraction methods */
  allowedMethods: ('ocr' | 'regex' | 'position' | 'inference')[];
  /** Custom validation pattern (optional) */
  validationPattern?: string;
  /** Maximum extraction attempts before giving up */
  maxRetries: number;
}

/**
 * Template calibration profile
 */
export interface CalibrationProfile {
  /** Template ID this profile applies to */
  templateId: string;
  /** Version of the calibration profile */
  version: string;
  /** Overall threshold level */
  thresholdLevel: ThresholdLevel;
  /** Per-field calibrations */
  fieldCalibrations: Map<string, FieldCalibration>;
  /** Global minimum confidence */
  globalMinConfidence: number;
  /** Whether to require ROI match for critical fields */
  requireRoiForCriticalFields: boolean;
  /** Anomaly detection thresholds */
  anomalyThresholds: AnomalyThresholds;
}

/**
 * Anomaly detection thresholds
 */
export interface AnomalyThresholds {
  /** Max allowed missing critical fields */
  maxMissingCriticalFields: number;
  /** Min overall extraction score */
  minOverallExtractionScore: number;
  /** Max allowed LOW_CONFIDENCE fields */
  maxLowConfidenceFields: number;
  /** Threshold for anomalous document detection */
  anomalyScoreThreshold: number;
}

/**
 * Extraction quality assessment
 */
export interface QualityAssessment {
  /** Overall quality score (0-100) */
  overallScore: number;
  /** Quality grade */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Whether extraction passed quality gates */
  passedQualityGates: boolean;
  /** Issues found */
  issues: QualityIssue[];
  /** Recommendations */
  recommendations: string[];
  /** Whether anomaly was detected */
  anomalyDetected: boolean;
  /** Anomaly details (if detected) */
  anomalyDetails?: string;
}

/**
 * Quality issue
 */
export interface QualityIssue {
  /** Issue type */
  type: 'missing_field' | 'low_confidence' | 'validation_failed' | 'roi_mismatch' | 'anomaly';
  /** Field affected (if applicable) */
  fieldId?: string;
  /** Severity */
  severity: 'critical' | 'major' | 'minor';
  /** Description */
  description: string;
  /** Suggested action */
  suggestedAction: string;
}

/**
 * Field extraction result for calibration
 */
export interface ExtractedFieldForCalibration {
  fieldId: string;
  value: string | null;
  confidence: number;
  extracted: boolean;
  reasonCode?: string;
  source: 'ocr' | 'regex' | 'position' | 'inference';
  roiMatch?: boolean;
}

// ============================================================================
// DEFAULT THRESHOLD PROFILES
// ============================================================================

/**
 * Default threshold values by level
 */
export const THRESHOLD_LEVELS: Record<ThresholdLevel, {
  globalMinConfidence: number;
  criticalFieldMinConfidence: number;
  standardFieldMinConfidence: number;
  reviewThreshold: number;
}> = {
  strict: {
    globalMinConfidence: 85,
    criticalFieldMinConfidence: 90,
    standardFieldMinConfidence: 80,
    reviewThreshold: 70,
  },
  standard: {
    globalMinConfidence: 70,
    criticalFieldMinConfidence: 80,
    standardFieldMinConfidence: 60,
    reviewThreshold: 50,
  },
  lenient: {
    globalMinConfidence: 50,
    criticalFieldMinConfidence: 60,
    standardFieldMinConfidence: 40,
    reviewThreshold: 30,
  },
};

/**
 * Default anomaly thresholds
 */
export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  maxMissingCriticalFields: 1,
  minOverallExtractionScore: 50,
  maxLowConfidenceFields: 3,
  anomalyScoreThreshold: 0.7,
};

/**
 * Critical fields that should always have high thresholds
 */
export const ALWAYS_CRITICAL_FIELDS = new Set([
  'customerSignature',
  'dateOfService',
  'jobNumber',
  'serialNumber',
  'technicianName',
]);

// ============================================================================
// CALIBRATION PROFILE CREATION
// ============================================================================

/**
 * Create a calibration profile from a spec
 */
export function createCalibrationProfile(
  templateId: string,
  specJson: SpecJson,
  thresholdLevel: ThresholdLevel = 'standard',
  options: Partial<CalibrationProfile> = {}
): CalibrationProfile {
  const levelConfig = THRESHOLD_LEVELS[thresholdLevel];
  const fieldCalibrations = new Map<string, FieldCalibration>();
  
  // Create calibrations for each field in the spec
  for (const field of specJson.fields) {
    const isCritical = ALWAYS_CRITICAL_FIELDS.has(field.field) || field.required;
    
    fieldCalibrations.set(field.field, {
      fieldId: field.field,
      minConfidence: isCritical 
        ? levelConfig.criticalFieldMinConfidence 
        : levelConfig.standardFieldMinConfidence,
      reviewThreshold: levelConfig.reviewThreshold,
      isCritical,
      allowedMethods: ['ocr', 'regex', 'position', 'inference'],
      validationPattern: getValidationPatternForField(field, specJson.rules),
      maxRetries: isCritical ? 3 : 1,
    });
  }
  
  return {
    templateId,
    version: `${specJson.version}-calibration-v1`,
    thresholdLevel,
    fieldCalibrations,
    globalMinConfidence: levelConfig.globalMinConfidence,
    requireRoiForCriticalFields: thresholdLevel === 'strict',
    anomalyThresholds: options.anomalyThresholds ?? DEFAULT_ANOMALY_THRESHOLDS,
    ...options,
  };
}

/**
 * Get validation pattern for a field from rules
 */
function getValidationPatternForField(
  field: FieldSpec,
  rules: RuleSpec[]
): string | undefined {
  const rule = rules.find(r => r.field === field.field && r.pattern);
  return rule?.pattern;
}

// ============================================================================
// FIELD CALIBRATION APPLICATION
// ============================================================================

/**
 * Apply calibration to extracted field
 */
export function applyFieldCalibration(
  extracted: ExtractedFieldForCalibration,
  calibration: FieldCalibration
): {
  accepted: boolean;
  needsReview: boolean;
  adjustedConfidence: number;
  notes: string[];
} {
  const notes: string[] = [];
  let adjustedConfidence = extracted.confidence;
  
  // Check if extraction method is allowed
  if (!calibration.allowedMethods.includes(extracted.source)) {
    adjustedConfidence = Math.max(0, adjustedConfidence - 20);
    notes.push(`Method ${extracted.source} not preferred, confidence reduced`);
  }
  
  // Apply validation pattern if present
  if (calibration.validationPattern && extracted.value) {
    try {
      const regex = new RegExp(calibration.validationPattern);
      if (!regex.test(extracted.value)) {
        adjustedConfidence = Math.max(0, adjustedConfidence - 30);
        notes.push(`Value does not match validation pattern`);
      }
    } catch {
      // Invalid regex - ignore
    }
  }
  
  // Check ROI match for critical fields
  if (calibration.isCritical && extracted.roiMatch === false) {
    adjustedConfidence = Math.max(0, adjustedConfidence - 15);
    notes.push(`Critical field not in expected ROI region`);
  }
  
  // Determine acceptance
  const accepted = adjustedConfidence >= calibration.minConfidence && extracted.extracted;
  const needsReview = !accepted && adjustedConfidence >= calibration.reviewThreshold;
  
  if (!extracted.extracted) {
    notes.push(`Field not extracted`);
  } else if (!accepted && needsReview) {
    notes.push(`Confidence ${adjustedConfidence} below min ${calibration.minConfidence}, needs review`);
  } else if (!accepted && !needsReview) {
    notes.push(`Confidence ${adjustedConfidence} below review threshold ${calibration.reviewThreshold}`);
  }
  
  return { accepted, needsReview, adjustedConfidence, notes };
}

// ============================================================================
// QUALITY ASSESSMENT
// ============================================================================

/**
 * Assess extraction quality against calibration profile
 */
export function assessExtractionQuality(
  extractedFields: ExtractedFieldForCalibration[],
  profile: CalibrationProfile
): QualityAssessment {
  const issues: QualityIssue[] = [];
  const recommendations: string[] = [];
  
  let totalScore = 0;
  let fieldCount = 0;
  let missingCritical = 0;
  let lowConfidenceCount = 0;
  
  for (const field of extractedFields) {
    const calibration = profile.fieldCalibrations.get(field.fieldId);
    if (!calibration) continue;
    
    fieldCount++;
    
    if (!field.extracted) {
      if (calibration.isCritical) {
        missingCritical++;
        issues.push({
          type: 'missing_field',
          fieldId: field.fieldId,
          severity: 'critical',
          description: `Critical field ${field.fieldId} is missing`,
          suggestedAction: 'Review document manually for this field',
        });
      } else {
        issues.push({
          type: 'missing_field',
          fieldId: field.fieldId,
          severity: 'minor',
          description: `Field ${field.fieldId} is missing`,
          suggestedAction: 'Consider re-extraction or manual entry',
        });
      }
      continue;
    }
    
    // Apply calibration
    const calibResult = applyFieldCalibration(field, calibration);
    totalScore += calibResult.adjustedConfidence;
    
    if (calibResult.adjustedConfidence < calibration.reviewThreshold) {
      lowConfidenceCount++;
      issues.push({
        type: 'low_confidence',
        fieldId: field.fieldId,
        severity: calibration.isCritical ? 'critical' : 'major',
        description: `Field ${field.fieldId} has low confidence (${calibResult.adjustedConfidence})`,
        suggestedAction: calibResult.notes.join('; '),
      });
    }
    
    if (!calibResult.accepted && calibResult.needsReview) {
      recommendations.push(`Review ${field.fieldId}: ${calibResult.notes.join(', ')}`);
    }
  }
  
  // Calculate overall score
  const overallScore = fieldCount > 0 ? Math.round(totalScore / fieldCount) : 0;
  
  // Determine grade
  let grade: QualityAssessment['grade'];
  if (overallScore >= 90) grade = 'A';
  else if (overallScore >= 80) grade = 'B';
  else if (overallScore >= 70) grade = 'C';
  else if (overallScore >= 50) grade = 'D';
  else grade = 'F';
  
  // Check anomaly thresholds
  let anomalyDetected = false;
  let anomalyDetails: string | undefined;
  
  if (missingCritical > profile.anomalyThresholds.maxMissingCriticalFields) {
    anomalyDetected = true;
    anomalyDetails = `Too many missing critical fields (${missingCritical})`;
    issues.push({
      type: 'anomaly',
      severity: 'critical',
      description: anomalyDetails,
      suggestedAction: 'This document may be corrupted or wrong type',
    });
  }
  
  if (overallScore < profile.anomalyThresholds.minOverallExtractionScore) {
    anomalyDetected = true;
    anomalyDetails = `Overall score ${overallScore} below threshold`;
    issues.push({
      type: 'anomaly',
      severity: 'critical',
      description: `Overall extraction score too low (${overallScore})`,
      suggestedAction: 'Document may be unreadable or wrong format',
    });
  }
  
  if (lowConfidenceCount > profile.anomalyThresholds.maxLowConfidenceFields) {
    anomalyDetected = true;
    anomalyDetails = `Too many low confidence fields (${lowConfidenceCount})`;
  }
  
  // Check quality gates
  const passedQualityGates = 
    overallScore >= profile.globalMinConfidence &&
    missingCritical === 0 &&
    !anomalyDetected;
  
  if (!passedQualityGates) {
    recommendations.push('Document requires manual review before processing');
  }
  
  return {
    overallScore,
    grade,
    passedQualityGates,
    issues,
    recommendations,
    anomalyDetected,
    anomalyDetails,
  };
}

// ============================================================================
// GUARDRAILS
// ============================================================================

/**
 * Guardrail severity aligned to S0-S3 scale
 * 
 * Phase C: Severity mapping for deterministic stop behavior:
 * - S0: Blocker - MUST stop processing immediately
 * - S1: Critical - MUST send to REVIEW_QUEUE
 * - S2: Major - MAY continue but flag for attention
 * - S3: Minor - Log and continue
 */
export type GuardrailSeverity = 'S0' | 'S1' | 'S2' | 'S3';

/**
 * Guardrail check result with S0-S3 severity
 */
export interface GuardrailResult {
  passed: boolean;
  guardrailId: string;
  description: string;
  /** S0-S3 severity (aligned with finding severity) */
  severity: GuardrailSeverity;
  /** Legacy severity for backward compatibility */
  legacySeverity: 'blocking' | 'warning';
  details?: string;
  /** Deterministic stop behavior */
  stopBehavior: 'STOP_IMMEDIATELY' | 'REVIEW_QUEUE' | 'CONTINUE_FLAGGED' | 'CONTINUE';
}

/**
 * Map S0-S3 severity to stop behavior
 */
export function getSeverityStopBehavior(
  severity: GuardrailSeverity
): GuardrailResult['stopBehavior'] {
  switch (severity) {
    case 'S0':
      return 'STOP_IMMEDIATELY';
    case 'S1':
      return 'REVIEW_QUEUE';
    case 'S2':
      return 'CONTINUE_FLAGGED';
    case 'S3':
      return 'CONTINUE';
    default:
      return 'CONTINUE_FLAGGED';
  }
}

/**
 * Get legacy severity from S0-S3
 */
function getLegacySeverity(severity: GuardrailSeverity): 'blocking' | 'warning' {
  return severity === 'S0' || severity === 'S1' ? 'blocking' : 'warning';
}

/**
 * Run all guardrails on extraction results
 * 
 * Phase C: Each guardrail now has S0-S3 severity and deterministic stop behavior
 */
export function runExtractionGuardrails(
  extractedFields: ExtractedFieldForCalibration[],
  profile: CalibrationProfile
): GuardrailResult[] {
  const results: GuardrailResult[] = [];
  
  // Guardrail 1: At least one field must be extracted
  // Severity: S0 (Blocker) - cannot proceed without any data
  const extractedCount = extractedFields.filter(f => f.extracted).length;
  const g001Passed = extractedCount > 0;
  const g001Severity: GuardrailSeverity = 'S0';
  results.push({
    guardrailId: 'G001',
    description: 'At least one field must be extracted',
    passed: g001Passed,
    severity: g001Severity,
    legacySeverity: getLegacySeverity(g001Severity),
    stopBehavior: g001Passed ? 'CONTINUE' : getSeverityStopBehavior(g001Severity),
    details: `${extractedCount} fields extracted`,
  });
  
  // Guardrail 2: Critical fields must have minimum confidence
  // Severity: S1 (Critical) - needs review queue
  const criticalFields = extractedFields.filter(f => {
    const cal = profile.fieldCalibrations.get(f.fieldId);
    return cal?.isCritical;
  });
  const criticalWithLowConfidence = criticalFields.filter(f => {
    const cal = profile.fieldCalibrations.get(f.fieldId);
    return f.extracted && f.confidence < (cal?.reviewThreshold ?? 50);
  });
  const g002Passed = criticalWithLowConfidence.length === 0;
  const g002Severity: GuardrailSeverity = 'S1';
  results.push({
    guardrailId: 'G002',
    description: 'Critical fields must have acceptable confidence',
    passed: g002Passed,
    severity: g002Severity,
    legacySeverity: getLegacySeverity(g002Severity),
    stopBehavior: g002Passed ? 'CONTINUE' : getSeverityStopBehavior(g002Severity),
    details: criticalWithLowConfidence.length > 0 
      ? `${criticalWithLowConfidence.length} critical fields with low confidence`
      : undefined,
  });
  
  // Guardrail 3: No conflicting extractions
  // Severity: S2 (Major) - flag but may continue
  const valuesByField = new Map<string, string[]>();
  for (const f of extractedFields) {
    if (f.extracted && f.value) {
      const existing = valuesByField.get(f.fieldId) ?? [];
      existing.push(f.value);
      valuesByField.set(f.fieldId, existing);
    }
  }
  const conflicts = Array.from(valuesByField.entries())
    .filter(([_, values]) => new Set(values).size > 1);
  const g003Passed = conflicts.length === 0;
  const g003Severity: GuardrailSeverity = 'S2';
  results.push({
    guardrailId: 'G003',
    description: 'No conflicting field values',
    passed: g003Passed,
    severity: g003Severity,
    legacySeverity: getLegacySeverity(g003Severity),
    stopBehavior: g003Passed ? 'CONTINUE' : getSeverityStopBehavior(g003Severity),
    details: conflicts.length > 0 
      ? `Conflicts in: ${conflicts.map(([id]) => id).join(', ')}`
      : undefined,
  });
  
  // Guardrail 4: Anomaly score within threshold
  // Severity: S2 (Major) if anomaly detected
  const anomalyScore = calculateAnomalyScore(extractedFields, profile);
  const g004Passed = anomalyScore <= profile.anomalyThresholds.anomalyScoreThreshold;
  const g004Severity: GuardrailSeverity = 'S2';
  results.push({
    guardrailId: 'G004',
    description: 'Document anomaly score within threshold',
    passed: g004Passed,
    severity: g004Severity,
    legacySeverity: getLegacySeverity(g004Severity),
    stopBehavior: g004Passed ? 'CONTINUE' : getSeverityStopBehavior(g004Severity),
    details: `Anomaly score: ${anomalyScore.toFixed(2)}`,
  });
  
  return results;
}

/**
 * Evaluate guardrail results and determine overall stop behavior
 * 
 * Phase C: Deterministic stop behavior based on worst-case severity
 */
export function evaluateGuardrailResults(
  results: GuardrailResult[]
): {
  shouldStop: boolean;
  stopReason?: string;
  overallBehavior: GuardrailResult['stopBehavior'];
  failedGuardrails: GuardrailResult[];
} {
  const failedGuardrails = results.filter(r => !r.passed);
  
  if (failedGuardrails.length === 0) {
    return {
      shouldStop: false,
      overallBehavior: 'CONTINUE',
      failedGuardrails: [],
    };
  }
  
  // Determine worst-case behavior (priority order)
  const behaviors = failedGuardrails.map(r => r.stopBehavior);
  let overallBehavior: GuardrailResult['stopBehavior'] = 'CONTINUE';
  
  if (behaviors.includes('STOP_IMMEDIATELY')) {
    overallBehavior = 'STOP_IMMEDIATELY';
  } else if (behaviors.includes('REVIEW_QUEUE')) {
    overallBehavior = 'REVIEW_QUEUE';
  } else if (behaviors.includes('CONTINUE_FLAGGED')) {
    overallBehavior = 'CONTINUE_FLAGGED';
  }
  
  const shouldStop = overallBehavior === 'STOP_IMMEDIATELY' || overallBehavior === 'REVIEW_QUEUE';
  
  return {
    shouldStop,
    stopReason: shouldStop
      ? `Guardrail(s) failed: ${failedGuardrails.map(g => g.guardrailId).join(', ')}`
      : undefined,
    overallBehavior,
    failedGuardrails,
  };
}

/**
 * Calculate anomaly score (0-1, higher = more anomalous)
 */
function calculateAnomalyScore(
  extractedFields: ExtractedFieldForCalibration[],
  profile: CalibrationProfile
): number {
  let anomalyFactors = 0;
  let maxFactors = 0;
  
  // Factor 1: Missing critical fields
  const criticalFields = Array.from(profile.fieldCalibrations.values())
    .filter(c => c.isCritical);
  const missingCritical = criticalFields.filter(c => {
    const extracted = extractedFields.find(f => f.fieldId === c.fieldId);
    return !extracted?.extracted;
  }).length;
  maxFactors++;
  if (missingCritical > 0) {
    anomalyFactors += Math.min(1, missingCritical / criticalFields.length);
  }
  
  // Factor 2: Low average confidence
  const confidences = extractedFields
    .filter(f => f.extracted)
    .map(f => f.confidence);
  if (confidences.length > 0) {
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    maxFactors++;
    if (avgConfidence < 50) {
      anomalyFactors += (50 - avgConfidence) / 50;
    }
  }
  
  // Factor 3: High variance in confidence
  if (confidences.length > 1) {
    const variance = calculateVariance(confidences);
    maxFactors++;
    if (variance > 400) { // High variance (std dev > 20)
      anomalyFactors += Math.min(1, variance / 1000);
    }
  }
  
  return maxFactors > 0 ? anomalyFactors / maxFactors : 0;
}

/**
 * Calculate variance of an array of numbers
 */
function calculateVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}
