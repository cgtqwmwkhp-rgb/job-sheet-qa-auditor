/**
 * Drift Detectors
 * 
 * Individual detectors for various drift categories.
 */

import type {
  DriftAlert,
  DriftThresholds,
  DriftBaseline,
  AlertSeverity,
  AmbiguityRateData,
  TokenCollisionData,
  OverrideSpikeData,
  ScanQualityData,
} from './types';

/**
 * Generate unique alert ID
 */
function generateAlertId(category: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `alert-${category}-${timestamp}-${random}`;
}

/**
 * Determine severity based on value and thresholds
 */
function determineSeverity(
  value: number,
  warningThreshold: number,
  criticalThreshold: number,
  higherIsBetter: boolean = false
): AlertSeverity | null {
  if (higherIsBetter) {
    // For metrics where higher is better (e.g., accuracy)
    if (value < criticalThreshold) return 'critical';
    if (value < warningThreshold) return 'warning';
  } else {
    // For metrics where lower is better (e.g., error rates)
    if (value >= criticalThreshold) return 'critical';
    if (value >= warningThreshold) return 'warning';
  }
  return null;
}

/**
 * Detect ambiguity rate spikes
 */
export function detectAmbiguitySpike(
  data: AmbiguityRateData,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const currentRate = data.totalDocuments > 0 
    ? data.ambiguousSelections / data.totalDocuments 
    : 0;
  
  const baselineRate = baseline?.ambiguityRate ?? 0;
  const deviation = currentRate - baselineRate;
  
  const severity = determineSeverity(
    currentRate,
    thresholds.ambiguityRate.warning,
    thresholds.ambiguityRate.critical
  );
  
  if (severity) {
    alerts.push({
      id: generateAlertId('ambiguity'),
      category: 'ambiguity_rate',
      severity,
      status: 'active',
      message: `Ambiguity rate spike detected: ${(currentRate * 100).toFixed(1)}% (threshold: ${(thresholds.ambiguityRate[severity] * 100).toFixed(1)}%)`,
      detectedAt: new Date().toISOString(),
      metric: 'ambiguity_rate',
      currentValue: currentRate,
      threshold: thresholds.ambiguityRate[severity],
      baselineValue: baselineRate,
      deviation,
      deviationPercent: baselineRate > 0 ? (deviation / baselineRate) * 100 : 0,
      affectedTemplates: Object.entries(data.byTemplateId)
        .filter(([, stats]) => stats.rate > thresholds.ambiguityRate.warning)
        .map(([templateId]) => templateId),
      suggestedAction: 'Review template collision rules and consider adding disambiguation signals',
    });
  }
  
  return alerts;
}

/**
 * Detect token collisions
 */
export function detectTokenCollisions(
  data: TokenCollisionData,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const currentRate = data.totalTokens > 0 
    ? data.collisions / data.totalTokens 
    : 0;
  
  const baselineRate = baseline?.tokenCollisionRate ?? 0;
  const deviation = currentRate - baselineRate;
  
  const severity = determineSeverity(
    currentRate,
    thresholds.tokenCollisionRate.warning,
    thresholds.tokenCollisionRate.critical
  );
  
  if (severity) {
    const collidingTemplates = Object.entries(data.byTemplateId)
      .filter(([, stats]) => stats.collisions > 0)
      .map(([templateId]) => templateId);
    
    alerts.push({
      id: generateAlertId('token-collision'),
      category: 'token_collision',
      severity,
      status: 'active',
      message: `Token collision rate elevated: ${(currentRate * 100).toFixed(1)}%`,
      detectedAt: new Date().toISOString(),
      metric: 'token_collision_rate',
      currentValue: currentRate,
      threshold: thresholds.tokenCollisionRate[severity],
      baselineValue: baselineRate,
      deviation,
      deviationPercent: baselineRate > 0 ? (deviation / baselineRate) * 100 : 0,
      affectedTemplates: collidingTemplates,
      suggestedAction: 'Review template token definitions for overlapping patterns',
    });
  }
  
  return alerts;
}

/**
 * Detect override spikes
 */
export function detectOverrideSpike(
  data: OverrideSpikeData,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const currentRate = data.totalDecisions > 0 
    ? data.overrides / data.totalDecisions 
    : 0;
  
  const baselineRate = baseline?.overrideRate ?? 0;
  const deviation = currentRate - baselineRate;
  
  const severity = determineSeverity(
    currentRate,
    thresholds.overrideRate.warning,
    thresholds.overrideRate.critical
  );
  
  if (severity) {
    alerts.push({
      id: generateAlertId('override'),
      category: 'override_spike',
      severity,
      status: 'active',
      message: `Override rate spike detected: ${(currentRate * 100).toFixed(1)}%`,
      detectedAt: new Date().toISOString(),
      metric: 'override_rate',
      currentValue: currentRate,
      threshold: thresholds.overrideRate[severity],
      baselineValue: baselineRate,
      deviation,
      deviationPercent: baselineRate > 0 ? (deviation / baselineRate) * 100 : 0,
      suggestedAction: 'Investigate reason for increased manual overrides - may indicate extraction quality issues',
    });
  }
  
  return alerts;
}

/**
 * Detect scan quality degradation
 */
export function detectScanQualityDegradation(
  data: ScanQualityData,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const baselineQuality = baseline?.averageScanQuality ?? 0.95;
  const qualityDrop = baselineQuality - data.averageConfidence;
  
  // Check for quality drop
  if (qualityDrop >= thresholds.scanQualityDrop.critical) {
    alerts.push({
      id: generateAlertId('scan-quality'),
      category: 'scan_quality',
      severity: 'critical',
      status: 'active',
      message: `Critical scan quality degradation: ${(qualityDrop * 100).toFixed(1)}% drop from baseline`,
      detectedAt: new Date().toISOString(),
      metric: 'scan_quality',
      currentValue: data.averageConfidence,
      threshold: baselineQuality - thresholds.scanQualityDrop.critical,
      baselineValue: baselineQuality,
      deviation: -qualityDrop,
      deviationPercent: baselineQuality > 0 ? (-qualityDrop / baselineQuality) * 100 : 0,
      suggestedAction: 'Review OCR/image quality settings and check for scanner hardware issues',
    });
  } else if (qualityDrop >= thresholds.scanQualityDrop.warning) {
    alerts.push({
      id: generateAlertId('scan-quality'),
      category: 'scan_quality',
      severity: 'warning',
      status: 'active',
      message: `Scan quality degradation detected: ${(qualityDrop * 100).toFixed(1)}% drop from baseline`,
      detectedAt: new Date().toISOString(),
      metric: 'scan_quality',
      currentValue: data.averageConfidence,
      threshold: baselineQuality - thresholds.scanQualityDrop.warning,
      baselineValue: baselineQuality,
      deviation: -qualityDrop,
      deviationPercent: baselineQuality > 0 ? (-qualityDrop / baselineQuality) * 100 : 0,
      suggestedAction: 'Monitor scan quality trends and consider calibration',
    });
  }
  
  // Check for high low-quality scan rate
  const lowQualityRate = data.totalScans > 0 
    ? data.lowQualityScans / data.totalScans 
    : 0;
  
  if (lowQualityRate > 0.20) {
    alerts.push({
      id: generateAlertId('low-quality-rate'),
      category: 'scan_quality',
      severity: lowQualityRate > 0.35 ? 'critical' : 'warning',
      status: 'active',
      message: `High rate of low-quality scans: ${(lowQualityRate * 100).toFixed(1)}%`,
      detectedAt: new Date().toISOString(),
      metric: 'low_quality_scan_rate',
      currentValue: lowQualityRate,
      threshold: 0.20,
      baselineValue: 0.10,
      deviation: lowQualityRate - 0.10,
      deviationPercent: 100,
      suggestedAction: 'Investigate scan quality issues across affected documents',
    });
  }
  
  return alerts;
}

/**
 * Detect selection accuracy drift
 */
export function detectSelectionAccuracyDrift(
  currentAccuracy: number,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const baselineAccuracy = baseline?.selectionAccuracy ?? 0.95;
  const drop = baselineAccuracy - currentAccuracy;
  
  if (drop >= thresholds.selectionAccuracyDrop.critical) {
    alerts.push({
      id: generateAlertId('selection-accuracy'),
      category: 'selection_accuracy',
      severity: 'critical',
      status: 'active',
      message: `Critical selection accuracy drop: ${(drop * 100).toFixed(1)}% below baseline`,
      detectedAt: new Date().toISOString(),
      metric: 'selection_accuracy',
      currentValue: currentAccuracy,
      threshold: baselineAccuracy - thresholds.selectionAccuracyDrop.critical,
      baselineValue: baselineAccuracy,
      deviation: -drop,
      deviationPercent: baselineAccuracy > 0 ? (-drop / baselineAccuracy) * 100 : 0,
      suggestedAction: 'Investigate template selection logic and recent changes',
    });
  } else if (drop >= thresholds.selectionAccuracyDrop.warning) {
    alerts.push({
      id: generateAlertId('selection-accuracy'),
      category: 'selection_accuracy',
      severity: 'warning',
      status: 'active',
      message: `Selection accuracy drop detected: ${(drop * 100).toFixed(1)}% below baseline`,
      detectedAt: new Date().toISOString(),
      metric: 'selection_accuracy',
      currentValue: currentAccuracy,
      threshold: baselineAccuracy - thresholds.selectionAccuracyDrop.warning,
      baselineValue: baselineAccuracy,
      deviation: -drop,
      deviationPercent: baselineAccuracy > 0 ? (-drop / baselineAccuracy) * 100 : 0,
      suggestedAction: 'Monitor selection accuracy trends',
    });
  }
  
  return alerts;
}

/**
 * Detect field accuracy drift
 */
export function detectFieldAccuracyDrift(
  currentAccuracy: number,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const baselineAccuracy = baseline?.fieldAccuracy ?? 0.92;
  const drop = baselineAccuracy - currentAccuracy;
  
  if (drop >= thresholds.fieldAccuracyDrop.critical) {
    alerts.push({
      id: generateAlertId('field-accuracy'),
      category: 'field_accuracy',
      severity: 'critical',
      status: 'active',
      message: `Critical field accuracy drop: ${(drop * 100).toFixed(1)}% below baseline`,
      detectedAt: new Date().toISOString(),
      metric: 'field_accuracy',
      currentValue: currentAccuracy,
      threshold: baselineAccuracy - thresholds.fieldAccuracyDrop.critical,
      baselineValue: baselineAccuracy,
      deviation: -drop,
      deviationPercent: baselineAccuracy > 0 ? (-drop / baselineAccuracy) * 100 : 0,
      suggestedAction: 'Review field extraction rules and OCR settings',
    });
  } else if (drop >= thresholds.fieldAccuracyDrop.warning) {
    alerts.push({
      id: generateAlertId('field-accuracy'),
      category: 'field_accuracy',
      severity: 'warning',
      status: 'active',
      message: `Field accuracy drop detected: ${(drop * 100).toFixed(1)}% below baseline`,
      detectedAt: new Date().toISOString(),
      metric: 'field_accuracy',
      currentValue: currentAccuracy,
      threshold: baselineAccuracy - thresholds.fieldAccuracyDrop.warning,
      baselineValue: baselineAccuracy,
      deviation: -drop,
      deviationPercent: baselineAccuracy > 0 ? (-drop / baselineAccuracy) * 100 : 0,
      suggestedAction: 'Monitor field accuracy trends',
    });
  }
  
  return alerts;
}

/**
 * Detect fusion disagreement rate
 */
export function detectFusionDisagreement(
  disagreementRate: number,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const baselineDisagreement = baseline 
    ? (1 - baseline.fusionAgreementRate) 
    : 0.12;
  
  const severity = determineSeverity(
    disagreementRate,
    thresholds.fusionDisagreementRate.warning,
    thresholds.fusionDisagreementRate.critical
  );
  
  if (severity) {
    alerts.push({
      id: generateAlertId('fusion-disagreement'),
      category: 'fusion_disagreement',
      severity,
      status: 'active',
      message: `OCR + Image QA disagreement rate elevated: ${(disagreementRate * 100).toFixed(1)}%`,
      detectedAt: new Date().toISOString(),
      metric: 'fusion_disagreement_rate',
      currentValue: disagreementRate,
      threshold: thresholds.fusionDisagreementRate[severity],
      baselineValue: baselineDisagreement,
      deviation: disagreementRate - baselineDisagreement,
      deviationPercent: baselineDisagreement > 0 
        ? ((disagreementRate - baselineDisagreement) / baselineDisagreement) * 100 
        : 0,
      suggestedAction: 'Review fusion logic and investigate conflicting extraction sources',
    });
  }
  
  return alerts;
}

/**
 * Detect pass-2 escalation rate
 */
export function detectPass2Escalation(
  escalationRate: number,
  baseline: DriftBaseline | null,
  thresholds: DriftThresholds
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  
  const baselineRate = baseline?.pass2Rate ?? 0.10;
  
  const severity = determineSeverity(
    escalationRate,
    thresholds.pass2EscalationRate.warning,
    thresholds.pass2EscalationRate.critical
  );
  
  if (severity) {
    alerts.push({
      id: generateAlertId('pass2-escalation'),
      category: 'pass2_escalation',
      severity,
      status: 'active',
      message: `Pass-2 escalation rate elevated: ${(escalationRate * 100).toFixed(1)}%`,
      detectedAt: new Date().toISOString(),
      metric: 'pass2_escalation_rate',
      currentValue: escalationRate,
      threshold: thresholds.pass2EscalationRate[severity],
      baselineValue: baselineRate,
      deviation: escalationRate - baselineRate,
      deviationPercent: baselineRate > 0 
        ? ((escalationRate - baselineRate) / baselineRate) * 100 
        : 0,
      suggestedAction: 'Investigate why more documents require interpreter escalation',
    });
  }
  
  return alerts;
}
