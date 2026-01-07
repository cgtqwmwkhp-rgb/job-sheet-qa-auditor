/**
 * Template Analytics Service
 * 
 * Tracks template usage metrics, accuracy, and drift detection.
 * Provides data for dashboards and feedback loops.
 */

import type { CanonicalReasonCode } from './canonicalSemantics';

// ============================================================================
// Types
// ============================================================================

export interface SelectionEvent {
  timestamp: string;
  documentId: string;
  templateId: string;
  templateVersion: string;
  selectionMethod: 'auto' | 'manual' | 'fallback';
  confidence: number;
  selectionDurationMs: number;
  fingerprint?: string;
}

export interface ValidationEvent {
  timestamp: string;
  documentId: string;
  templateId: string;
  templateVersion: string;
  outcome: 'PASS' | 'FAIL';
  reasonCodes: CanonicalReasonCode[];
  fieldsPassed: number;
  fieldsFailed: number;
  validationDurationMs: number;
  overridden: boolean;
  overrideReason?: string;
}

export interface FeedbackEvent {
  timestamp: string;
  documentId: string;
  templateId: string;
  templateVersion: string;
  feedbackType: 'false_positive' | 'false_negative' | 'rule_suggestion' | 'field_mapping';
  fieldId?: string;
  ruleId?: string;
  description: string;
  suggestedAction?: string;
  submittedBy: string;
}

export interface TemplateMetrics {
  templateId: string;
  templateVersion: string;
  period: string; // ISO date (YYYY-MM-DD) or 'all'
  
  // Selection metrics
  selectionCount: number;
  autoSelectionCount: number;
  manualSelectionCount: number;
  fallbackSelectionCount: number;
  avgSelectionConfidence: number;
  avgSelectionDurationMs: number;
  
  // Validation metrics
  validationCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  avgFieldsPassed: number;
  avgFieldsFailed: number;
  avgValidationDurationMs: number;
  
  // Override metrics
  overrideCount: number;
  overrideRate: number;
  
  // Reason code distribution
  reasonCodeDistribution: Record<string, number>;
  
  // Feedback metrics
  feedbackCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  ruleSuggestionCount: number;
}

export interface DriftAlert {
  alertId: string;
  timestamp: string;
  templateId: string;
  templateVersion: string;
  alertType: 'pass_rate_drop' | 'selection_confidence_drop' | 'override_rate_spike' | 'new_reason_code';
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentValue: number;
  baselineValue: number;
  threshold: number;
  description: string;
  suggestedAction: string;
}

export interface DashboardData {
  generatedAt: string;
  period: { start: string; end: string };
  totalDocuments: number;
  totalTemplates: number;
  overallPassRate: number;
  templateMetrics: TemplateMetrics[];
  topReasonCodes: Array<{ code: string; count: number; percentage: number }>;
  recentAlerts: DriftAlert[];
  feedbackSummary: {
    total: number;
    byType: Record<string, number>;
    pendingReview: number;
  };
}

// ============================================================================
// In-Memory Storage (would be database in production)
// ============================================================================

const selectionEvents: SelectionEvent[] = [];
const validationEvents: ValidationEvent[] = [];
const feedbackEvents: FeedbackEvent[] = [];
const driftAlerts: DriftAlert[] = [];

// ============================================================================
// Drift Detection Thresholds
// ============================================================================

export const DRIFT_THRESHOLDS = {
  passRateDropPercent: 10, // Alert if pass rate drops by 10%
  selectionConfidenceDropPercent: 15, // Alert if avg confidence drops by 15%
  overrideRateSpikePercent: 20, // Alert if override rate increases by 20%
  minSampleSize: 10, // Minimum events before drift detection
};

// ============================================================================
// Event Recording
// ============================================================================

export function recordSelectionEvent(event: SelectionEvent): void {
  selectionEvents.push(event);
}

export function recordValidationEvent(event: ValidationEvent): void {
  validationEvents.push(event);
  
  // Check for drift after each validation
  checkForDrift(event.templateId, event.templateVersion);
}

export function recordFeedbackEvent(event: FeedbackEvent): void {
  feedbackEvents.push(event);
}

// ============================================================================
// Metrics Calculation
// ============================================================================

export function calculateTemplateMetrics(
  templateId: string,
  templateVersion: string,
  period: string = 'all'
): TemplateMetrics {
  // Filter events by template and period
  const filterByPeriod = <T extends { timestamp: string }>(events: T[]): T[] => {
    if (period === 'all') return events;
    return events.filter(e => e.timestamp.startsWith(period));
  };
  
  const templateSelections = filterByPeriod(
    selectionEvents.filter(e => e.templateId === templateId && e.templateVersion === templateVersion)
  );
  
  const templateValidations = filterByPeriod(
    validationEvents.filter(e => e.templateId === templateId && e.templateVersion === templateVersion)
  );
  
  const templateFeedback = filterByPeriod(
    feedbackEvents.filter(e => e.templateId === templateId && e.templateVersion === templateVersion)
  );
  
  // Selection metrics
  const selectionCount = templateSelections.length;
  const autoSelectionCount = templateSelections.filter(e => e.selectionMethod === 'auto').length;
  const manualSelectionCount = templateSelections.filter(e => e.selectionMethod === 'manual').length;
  const fallbackSelectionCount = templateSelections.filter(e => e.selectionMethod === 'fallback').length;
  const avgSelectionConfidence = selectionCount > 0
    ? templateSelections.reduce((sum, e) => sum + e.confidence, 0) / selectionCount
    : 0;
  const avgSelectionDurationMs = selectionCount > 0
    ? templateSelections.reduce((sum, e) => sum + e.selectionDurationMs, 0) / selectionCount
    : 0;
  
  // Validation metrics
  const validationCount = templateValidations.length;
  const passCount = templateValidations.filter(e => e.outcome === 'PASS').length;
  const failCount = templateValidations.filter(e => e.outcome === 'FAIL').length;
  const passRate = validationCount > 0 ? passCount / validationCount : 0;
  const avgFieldsPassed = validationCount > 0
    ? templateValidations.reduce((sum, e) => sum + e.fieldsPassed, 0) / validationCount
    : 0;
  const avgFieldsFailed = validationCount > 0
    ? templateValidations.reduce((sum, e) => sum + e.fieldsFailed, 0) / validationCount
    : 0;
  const avgValidationDurationMs = validationCount > 0
    ? templateValidations.reduce((sum, e) => sum + e.validationDurationMs, 0) / validationCount
    : 0;
  
  // Override metrics
  const overrideCount = templateValidations.filter(e => e.overridden).length;
  const overrideRate = validationCount > 0 ? overrideCount / validationCount : 0;
  
  // Reason code distribution
  const reasonCodeDistribution: Record<string, number> = {};
  for (const event of templateValidations) {
    for (const code of event.reasonCodes) {
      reasonCodeDistribution[code] = (reasonCodeDistribution[code] || 0) + 1;
    }
  }
  
  // Feedback metrics
  const feedbackCount = templateFeedback.length;
  const falsePositiveCount = templateFeedback.filter(e => e.feedbackType === 'false_positive').length;
  const falseNegativeCount = templateFeedback.filter(e => e.feedbackType === 'false_negative').length;
  const ruleSuggestionCount = templateFeedback.filter(e => e.feedbackType === 'rule_suggestion').length;
  
  return {
    templateId,
    templateVersion,
    period,
    selectionCount,
    autoSelectionCount,
    manualSelectionCount,
    fallbackSelectionCount,
    avgSelectionConfidence,
    avgSelectionDurationMs,
    validationCount,
    passCount,
    failCount,
    passRate,
    avgFieldsPassed,
    avgFieldsFailed,
    avgValidationDurationMs,
    overrideCount,
    overrideRate,
    reasonCodeDistribution,
    feedbackCount,
    falsePositiveCount,
    falseNegativeCount,
    ruleSuggestionCount,
  };
}

// ============================================================================
// Drift Detection
// ============================================================================

function generateAlertId(): string {
  return `alert_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

export function checkForDrift(templateId: string, templateVersion: string): DriftAlert[] {
  const newAlerts: DriftAlert[] = [];
  
  // Get current and baseline metrics
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const currentMetrics = calculateTemplateMetrics(templateId, templateVersion, today);
  const baselineMetrics = calculateTemplateMetrics(templateId, templateVersion, 'all');
  
  // Skip if not enough data
  if (baselineMetrics.validationCount < DRIFT_THRESHOLDS.minSampleSize) {
    return newAlerts;
  }
  
  // Check pass rate drop
  if (baselineMetrics.passRate > 0) {
    const passRateDrop = (baselineMetrics.passRate - currentMetrics.passRate) / baselineMetrics.passRate * 100;
    if (passRateDrop >= DRIFT_THRESHOLDS.passRateDropPercent && currentMetrics.validationCount >= 3) {
      const alert: DriftAlert = {
        alertId: generateAlertId(),
        timestamp: new Date().toISOString(),
        templateId,
        templateVersion,
        alertType: 'pass_rate_drop',
        severity: passRateDrop >= 30 ? 'critical' : passRateDrop >= 20 ? 'high' : 'medium',
        currentValue: currentMetrics.passRate,
        baselineValue: baselineMetrics.passRate,
        threshold: DRIFT_THRESHOLDS.passRateDropPercent,
        description: `Pass rate dropped from ${(baselineMetrics.passRate * 100).toFixed(1)}% to ${(currentMetrics.passRate * 100).toFixed(1)}%`,
        suggestedAction: 'Review recent validation failures and check for document format changes',
      };
      newAlerts.push(alert);
      driftAlerts.push(alert);
    }
  }
  
  // Check selection confidence drop
  if (baselineMetrics.avgSelectionConfidence > 0) {
    const confidenceDrop = (baselineMetrics.avgSelectionConfidence - currentMetrics.avgSelectionConfidence) / baselineMetrics.avgSelectionConfidence * 100;
    if (confidenceDrop >= DRIFT_THRESHOLDS.selectionConfidenceDropPercent && currentMetrics.selectionCount >= 3) {
      const alert: DriftAlert = {
        alertId: generateAlertId(),
        timestamp: new Date().toISOString(),
        templateId,
        templateVersion,
        alertType: 'selection_confidence_drop',
        severity: confidenceDrop >= 30 ? 'high' : 'medium',
        currentValue: currentMetrics.avgSelectionConfidence,
        baselineValue: baselineMetrics.avgSelectionConfidence,
        threshold: DRIFT_THRESHOLDS.selectionConfidenceDropPercent,
        description: `Selection confidence dropped from ${(baselineMetrics.avgSelectionConfidence * 100).toFixed(1)}% to ${(currentMetrics.avgSelectionConfidence * 100).toFixed(1)}%`,
        suggestedAction: 'Review template fingerprint and selection criteria',
      };
      newAlerts.push(alert);
      driftAlerts.push(alert);
    }
  }
  
  // Check override rate spike
  if (currentMetrics.overrideRate > 0) {
    const overrideSpike = (currentMetrics.overrideRate - baselineMetrics.overrideRate) / (baselineMetrics.overrideRate || 0.01) * 100;
    if (overrideSpike >= DRIFT_THRESHOLDS.overrideRateSpikePercent && currentMetrics.overrideCount >= 2) {
      const alert: DriftAlert = {
        alertId: generateAlertId(),
        timestamp: new Date().toISOString(),
        templateId,
        templateVersion,
        alertType: 'override_rate_spike',
        severity: overrideSpike >= 50 ? 'high' : 'medium',
        currentValue: currentMetrics.overrideRate,
        baselineValue: baselineMetrics.overrideRate,
        threshold: DRIFT_THRESHOLDS.overrideRateSpikePercent,
        description: `Override rate increased from ${(baselineMetrics.overrideRate * 100).toFixed(1)}% to ${(currentMetrics.overrideRate * 100).toFixed(1)}%`,
        suggestedAction: 'Review validation rules for potential false positives',
      };
      newAlerts.push(alert);
      driftAlerts.push(alert);
    }
  }
  
  return newAlerts;
}

// ============================================================================
// Dashboard Data
// ============================================================================

export function generateDashboardData(periodDays: number = 30): DashboardData {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  // Filter events by period
  const periodSelections = selectionEvents.filter(e => 
    new Date(e.timestamp) >= startDate && new Date(e.timestamp) <= endDate
  );
  const periodValidations = validationEvents.filter(e => 
    new Date(e.timestamp) >= startDate && new Date(e.timestamp) <= endDate
  );
  const periodFeedback = feedbackEvents.filter(e => 
    new Date(e.timestamp) >= startDate && new Date(e.timestamp) <= endDate
  );
  
  // Get unique templates
  const templateSet = new Set<string>();
  for (const event of [...periodSelections, ...periodValidations]) {
    templateSet.add(`${event.templateId}@${event.templateVersion}`);
  }
  
  // Calculate metrics for each template
  const templateMetrics: TemplateMetrics[] = [];
  for (const templateKey of templateSet) {
    const [templateId, templateVersion] = templateKey.split('@');
    templateMetrics.push(calculateTemplateMetrics(templateId, templateVersion, 'all'));
  }
  
  // Calculate overall pass rate
  const totalValidations = periodValidations.length;
  const totalPasses = periodValidations.filter(e => e.outcome === 'PASS').length;
  const overallPassRate = totalValidations > 0 ? totalPasses / totalValidations : 0;
  
  // Calculate top reason codes
  const reasonCodeCounts: Record<string, number> = {};
  for (const event of periodValidations) {
    for (const code of event.reasonCodes) {
      reasonCodeCounts[code] = (reasonCodeCounts[code] || 0) + 1;
    }
  }
  
  const totalReasonCodes = Object.values(reasonCodeCounts).reduce((sum, count) => sum + count, 0);
  const topReasonCodes = Object.entries(reasonCodeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({
      code,
      count,
      percentage: totalReasonCodes > 0 ? count / totalReasonCodes * 100 : 0,
    }));
  
  // Get recent alerts
  const recentAlerts = driftAlerts
    .filter(a => new Date(a.timestamp) >= startDate)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
  
  // Feedback summary
  const feedbackByType: Record<string, number> = {};
  for (const event of periodFeedback) {
    feedbackByType[event.feedbackType] = (feedbackByType[event.feedbackType] || 0) + 1;
  }
  
  return {
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    totalDocuments: new Set(periodValidations.map(e => e.documentId)).size,
    totalTemplates: templateSet.size,
    overallPassRate,
    templateMetrics,
    topReasonCodes,
    recentAlerts,
    feedbackSummary: {
      total: periodFeedback.length,
      byType: feedbackByType,
      pendingReview: periodFeedback.length, // In production, filter by status
    },
  };
}

// ============================================================================
// Feedback Processing
// ============================================================================

export interface FeedbackAnalysis {
  templateId: string;
  templateVersion: string;
  totalFeedback: number;
  byType: Record<string, number>;
  topFields: Array<{ fieldId: string; count: number }>;
  topRules: Array<{ ruleId: string; count: number }>;
  suggestedActions: string[];
}

export function analyzeFeedback(templateId: string, templateVersion: string): FeedbackAnalysis {
  const templateFeedback = feedbackEvents.filter(
    e => e.templateId === templateId && e.templateVersion === templateVersion
  );
  
  // Count by type
  const byType: Record<string, number> = {};
  for (const event of templateFeedback) {
    byType[event.feedbackType] = (byType[event.feedbackType] || 0) + 1;
  }
  
  // Count by field
  const fieldCounts: Record<string, number> = {};
  for (const event of templateFeedback) {
    if (event.fieldId) {
      fieldCounts[event.fieldId] = (fieldCounts[event.fieldId] || 0) + 1;
    }
  }
  const topFields = Object.entries(fieldCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([fieldId, count]) => ({ fieldId, count }));
  
  // Count by rule
  const ruleCounts: Record<string, number> = {};
  for (const event of templateFeedback) {
    if (event.ruleId) {
      ruleCounts[event.ruleId] = (ruleCounts[event.ruleId] || 0) + 1;
    }
  }
  const topRules = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ruleId, count]) => ({ ruleId, count }));
  
  // Generate suggested actions
  const suggestedActions: string[] = [];
  
  if ((byType['false_positive'] || 0) > 3) {
    suggestedActions.push('High false positive rate - consider relaxing validation rules');
  }
  if ((byType['false_negative'] || 0) > 3) {
    suggestedActions.push('High false negative rate - consider adding stricter validation rules');
  }
  if (topFields.length > 0 && topFields[0].count > 5) {
    suggestedActions.push(`Field "${topFields[0].fieldId}" has frequent issues - review field mapping`);
  }
  if (topRules.length > 0 && topRules[0].count > 5) {
    suggestedActions.push(`Rule "${topRules[0].ruleId}" has frequent issues - review rule logic`);
  }
  
  return {
    templateId,
    templateVersion,
    totalFeedback: templateFeedback.length,
    byType,
    topFields,
    topRules,
    suggestedActions,
  };
}

// ============================================================================
// Query Functions
// ============================================================================

export function getSelectionEvents(templateId?: string, limit: number = 100): SelectionEvent[] {
  let events = templateId 
    ? selectionEvents.filter(e => e.templateId === templateId)
    : selectionEvents;
  return events.slice(-limit);
}

export function getValidationEvents(templateId?: string, limit: number = 100): ValidationEvent[] {
  let events = templateId 
    ? validationEvents.filter(e => e.templateId === templateId)
    : validationEvents;
  return events.slice(-limit);
}

export function getFeedbackEvents(templateId?: string, limit: number = 100): FeedbackEvent[] {
  let events = templateId 
    ? feedbackEvents.filter(e => e.templateId === templateId)
    : feedbackEvents;
  return events.slice(-limit);
}

export function getDriftAlerts(templateId?: string, limit: number = 50): DriftAlert[] {
  let alerts = templateId 
    ? driftAlerts.filter(a => a.templateId === templateId)
    : driftAlerts;
  return alerts.slice(-limit);
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function resetAnalytics(): void {
  selectionEvents.length = 0;
  validationEvents.length = 0;
  feedbackEvents.length = 0;
  driftAlerts.length = 0;
}
