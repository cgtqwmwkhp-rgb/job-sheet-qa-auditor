/**
 * Feedback Cadence Types
 * 
 * Types for daily/weekly/monthly feedback outputs.
 */

/**
 * Feedback cadence period
 */
export type CadencePeriod = 'daily' | 'weekly' | 'monthly';

/**
 * Engineer scorecard
 */
export interface EngineerScorecard {
  scorecardId: string;
  period: CadencePeriod;
  periodStart: string;
  periodEnd: string;
  
  // Engineer info (redacted by default)
  engineer: {
    id: string;
    name?: string; // Only included if not redacted
    redacted: boolean;
  };
  
  // Performance metrics
  metrics: {
    totalDocuments: number;
    passRate: number;
    failRate: number;
    reviewQueueRate: number;
    averageProcessingTimeMs: number;
    overrideRate: number;
  };
  
  // Breakdown by asset type
  byAssetType: Record<string, {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  
  // Breakdown by template
  byTemplateId: Record<string, {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  
  // Top issues
  topIssues: Array<{
    reasonCode: string;
    count: number;
    percentage: number;
  }>;
  
  // Trend vs previous period
  trend: {
    passRateDelta: number;
    volumeDelta: number;
    direction: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Fix pack - collection of issues to address
 */
export interface FixPack {
  fixPackId: string;
  period: CadencePeriod;
  periodStart: string;
  periodEnd: string;
  
  // Target
  target: {
    type: 'engineer' | 'customer' | 'assetType' | 'templateId';
    id: string;
    name?: string;
    redacted: boolean;
  };
  
  // Issues to fix
  issues: FixPackIssue[];
  
  // Summary
  summary: {
    totalIssues: number;
    bySeverity: Record<string, number>;
    byReasonCode: Record<string, number>;
    estimatedImpact: number; // Potential improvement in pass rate
  };
  
  // Priority
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Individual issue in a fix pack
 */
export interface FixPackIssue {
  issueId: string;
  documentId: string;
  fieldId?: string;
  
  // Issue details
  reasonCode: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  message: string;
  
  // Context (redacted by default)
  context: {
    extractedValue?: unknown;
    expectedPattern?: string;
    confidence?: number;
    pageNumber?: number;
    redacted: boolean;
  };
  
  // Suggested action
  suggestedAction?: string;
  
  // Status
  status: 'open' | 'acknowledged' | 'fixed' | 'wontfix';
}

/**
 * Customer scorecard
 */
export interface CustomerScorecard {
  scorecardId: string;
  period: CadencePeriod;
  periodStart: string;
  periodEnd: string;
  
  // Customer info (redacted by default)
  customer: {
    id: string;
    name?: string;
    redacted: boolean;
  };
  
  // Performance metrics
  metrics: {
    totalDocuments: number;
    passRate: number;
    failRate: number;
    averageProcessingTimeMs: number;
  };
  
  // Breakdown by asset type
  byAssetType: Record<string, {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  
  // Top issues
  topIssues: Array<{
    reasonCode: string;
    count: number;
    percentage: number;
  }>;
  
  // Trend
  trend: {
    passRateDelta: number;
    volumeDelta: number;
    direction: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Asset type scorecard
 */
export interface AssetTypeScorecard {
  scorecardId: string;
  period: CadencePeriod;
  periodStart: string;
  periodEnd: string;
  
  assetType: string;
  
  // Performance metrics
  metrics: {
    totalDocuments: number;
    passRate: number;
    failRate: number;
    averageProcessingTimeMs: number;
    averageConfidence: number;
  };
  
  // Breakdown by template
  byTemplateId: Record<string, {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  
  // Top issues
  topIssues: Array<{
    reasonCode: string;
    count: number;
    percentage: number;
  }>;
  
  // Trend
  trend: {
    passRateDelta: number;
    volumeDelta: number;
    direction: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Template scorecard
 */
export interface TemplateScorecard {
  scorecardId: string;
  period: CadencePeriod;
  periodStart: string;
  periodEnd: string;
  
  templateId: string;
  templateName?: string;
  
  // Performance metrics
  metrics: {
    totalDocuments: number;
    passRate: number;
    failRate: number;
    selectionAccuracy: number;
    averageConfidence: number;
    ambiguityRate: number;
  };
  
  // Field-level breakdown
  byField: Record<string, {
    total: number;
    correct: number;
    incorrect: number;
    accuracy: number;
  }>;
  
  // Top issues
  topIssues: Array<{
    reasonCode: string;
    fieldId?: string;
    count: number;
    percentage: number;
  }>;
  
  // Trend
  trend: {
    passRateDelta: number;
    volumeDelta: number;
    direction: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Feedback report (aggregates all scorecards for a period)
 */
export interface FeedbackReport {
  reportId: string;
  period: CadencePeriod;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  
  // Overall metrics
  overall: {
    totalDocuments: number;
    passRate: number;
    failRate: number;
    reviewQueueRate: number;
  };
  
  // Scorecards by type
  engineerScorecards: EngineerScorecard[];
  customerScorecards: CustomerScorecard[];
  assetTypeScorecards: AssetTypeScorecard[];
  templateScorecards: TemplateScorecard[];
  
  // Fix packs
  fixPacks: FixPack[];
  
  // Summary
  summary: {
    totalEngineers: number;
    totalCustomers: number;
    totalAssetTypes: number;
    totalTemplates: number;
    totalFixPackIssues: number;
    criticalIssues: number;
  };
}

/**
 * Trend data point for UI
 */
export interface TrendDataPoint {
  date: string;
  passRate: number;
  volume: number;
  failRate: number;
}

/**
 * UI Cockpit data
 */
export interface CockpitData {
  // Current period metrics
  currentPeriod: {
    period: CadencePeriod;
    periodStart: string;
    periodEnd: string;
    passRate: number;
    volume: number;
    criticalIssues: number;
  };
  
  // Trend data (last N periods)
  trends: TrendDataPoint[];
  
  // Top issues
  topIssues: Array<{
    reasonCode: string;
    count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  
  // Recent fix packs
  recentFixPacks: Array<{
    fixPackId: string;
    target: string;
    issueCount: number;
    priority: string;
  }>;
}

/**
 * Export configuration
 */
export interface ExportConfig {
  redactPii: boolean;
  includeDetails: boolean;
  format: 'json' | 'csv' | 'pdf';
  period: CadencePeriod;
}

/**
 * Default export configuration (redacted by default)
 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  redactPii: true,
  includeDetails: true,
  format: 'json',
  period: 'weekly',
};
