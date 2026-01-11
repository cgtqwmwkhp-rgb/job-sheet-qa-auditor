/**
 * Drift Detection Types
 * 
 * Types for detecting accuracy drift and generating alerts.
 */

/**
 * Alert severity levels
 */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Alert status
 */
export type AlertStatus = 'active' | 'resolved' | 'acknowledged';

/**
 * Drift category
 */
export type DriftCategory = 
  | 'ambiguity_rate'
  | 'token_collision'
  | 'override_spike'
  | 'scan_quality'
  | 'selection_accuracy'
  | 'field_accuracy'
  | 'fusion_disagreement'
  | 'pass2_escalation';

/**
 * Individual drift alert
 */
export interface DriftAlert {
  id: string;
  category: DriftCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  detectedAt: string;
  metric: string;
  currentValue: number;
  threshold: number;
  baselineValue: number;
  deviation: number;
  deviationPercent: number;
  affectedTemplates?: string[];
  affectedDocuments?: string[];
  suggestedAction?: string;
}

/**
 * Ambiguity rate drift detector input
 */
export interface AmbiguityRateData {
  totalDocuments: number;
  ambiguousSelections: number;
  byTemplateId: Record<string, {
    total: number;
    ambiguous: number;
    rate: number;
  }>;
}

/**
 * Token collision detector input
 */
export interface TokenCollisionData {
  totalTokens: number;
  collisions: number;
  byTemplateId: Record<string, {
    tokens: number;
    collisions: number;
    collidingTokens: string[];
  }>;
}

/**
 * Override spike detector input
 */
export interface OverrideSpikeData {
  totalDecisions: number;
  overrides: number;
  byType: Record<string, number>;
  byUser?: Record<string, number>;
}

/**
 * Scan quality detector input
 */
export interface ScanQualityData {
  totalScans: number;
  lowQualityScans: number;
  averageConfidence: number;
  byField: Record<string, {
    total: number;
    lowConfidence: number;
    averageConfidence: number;
  }>;
}

/**
 * Drift thresholds configuration
 */
export interface DriftThresholds {
  ambiguityRate: {
    warning: number;
    critical: number;
  };
  tokenCollisionRate: {
    warning: number;
    critical: number;
  };
  overrideRate: {
    warning: number;
    critical: number;
  };
  scanQualityDrop: {
    warning: number;
    critical: number;
  };
  selectionAccuracyDrop: {
    warning: number;
    critical: number;
  };
  fieldAccuracyDrop: {
    warning: number;
    critical: number;
  };
  fusionDisagreementRate: {
    warning: number;
    critical: number;
  };
  pass2EscalationRate: {
    warning: number;
    critical: number;
  };
}

/**
 * Default drift thresholds
 */
export const DEFAULT_DRIFT_THRESHOLDS: DriftThresholds = {
  ambiguityRate: {
    warning: 0.10, // 10%
    critical: 0.20, // 20%
  },
  tokenCollisionRate: {
    warning: 0.05, // 5%
    critical: 0.15, // 15%
  },
  overrideRate: {
    warning: 0.15, // 15%
    critical: 0.30, // 30%
  },
  scanQualityDrop: {
    warning: 0.05, // 5% drop from baseline
    critical: 0.10, // 10% drop from baseline
  },
  selectionAccuracyDrop: {
    warning: 0.03, // 3% drop
    critical: 0.05, // 5% drop
  },
  fieldAccuracyDrop: {
    warning: 0.05, // 5% drop
    critical: 0.10, // 10% drop
  },
  fusionDisagreementRate: {
    warning: 0.15, // 15%
    critical: 0.25, // 25%
  },
  pass2EscalationRate: {
    warning: 0.20, // 20%
    critical: 0.35, // 35%
  },
};

/**
 * Baseline metrics for drift comparison
 */
export interface DriftBaseline {
  version: string;
  createdAt: string;
  ambiguityRate: number;
  tokenCollisionRate: number;
  overrideRate: number;
  averageScanQuality: number;
  selectionAccuracy: number;
  fieldAccuracy: number;
  fusionAgreementRate: number;
  pass2Rate: number;
  byTemplateId: Record<string, {
    ambiguityRate: number;
    selectionAccuracy: number;
    fieldAccuracy: number;
  }>;
}

/**
 * Complete drift report
 */
export interface DriftReport {
  version: string;
  runId: string;
  timestamp: string;
  environment: 'local' | 'staging' | 'production';
  
  // Current metrics
  currentMetrics: {
    ambiguityRate: number;
    tokenCollisionRate: number;
    overrideRate: number;
    averageScanQuality: number;
    selectionAccuracy: number;
    fieldAccuracy: number;
    fusionAgreementRate: number;
    pass2Rate: number;
  };
  
  // Baseline comparison
  baseline: DriftBaseline | null;
  
  // Alerts generated
  alerts: DriftAlert[];
  
  // Summary
  summary: {
    totalAlerts: number;
    criticalAlerts: number;
    warningAlerts: number;
    infoAlerts: number;
    categories: DriftCategory[];
  };
  
  // Flag for immediate action
  requiresImmediateAction: boolean;
  
  // Thresholds used
  thresholds: DriftThresholds;
}

/**
 * Drift detection configuration
 */
export interface DriftConfig {
  enabled: boolean;
  thresholds: DriftThresholds;
  baselinePath?: string;
  alertWebhookUrl?: string;
  runSchedule: 'daily' | 'hourly' | 'manual';
}

/**
 * Default drift configuration
 */
export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  enabled: true,
  thresholds: DEFAULT_DRIFT_THRESHOLDS,
  runSchedule: 'daily',
};
