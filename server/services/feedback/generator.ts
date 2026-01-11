/**
 * Feedback Generator
 * 
 * Generates scorecards and fix packs for daily/weekly/monthly cadence.
 */

import type {
  CadencePeriod,
  EngineerScorecard,
  CustomerScorecard,
  AssetTypeScorecard,
  TemplateScorecard,
  FixPack,
  FixPackIssue,
  FeedbackReport,
  CockpitData,
  TrendDataPoint,
  ExportConfig,
} from './types';
import { DEFAULT_EXPORT_CONFIG } from './types';

/**
 * Generate unique ID
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Get period boundaries
 */
function getPeriodBoundaries(period: CadencePeriod, referenceDate?: Date): { start: string; end: string } {
  const ref = referenceDate || new Date();
  const start = new Date(ref);
  const end = new Date(ref);
  
  switch (period) {
    case 'daily':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'weekly':
      start.setDate(ref.getDate() - ref.getDay());
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'monthly':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(ref.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
  }
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Determine trend direction
 */
function determineTrend(current: number, previous: number): 'improving' | 'stable' | 'declining' {
  const delta = current - previous;
  if (delta > 0.02) return 'improving';
  if (delta < -0.02) return 'declining';
  return 'stable';
}

/**
 * Redact value if PII redaction enabled
 */
function redactValue<T>(value: T, redact: boolean): T | string {
  if (!redact) return value;
  if (typeof value === 'string') return '[REDACTED]';
  return value;
}

/**
 * Generate engineer scorecard
 */
export function generateEngineerScorecard(
  engineerId: string,
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): EngineerScorecard {
  const { start, end } = getPeriodBoundaries(period);
  
  // Simulate data (in production, this would query actual processing data)
  const totalDocuments = 50 + Math.floor(Math.random() * 150);
  const passRate = 0.80 + Math.random() * 0.18;
  const failRate = 1 - passRate - Math.random() * 0.05;
  
  return {
    scorecardId: generateId('eng-score'),
    period,
    periodStart: start,
    periodEnd: end,
    engineer: {
      id: engineerId,
      name: config.redactPii ? undefined : `Engineer ${engineerId}`,
      redacted: config.redactPii,
    },
    metrics: {
      totalDocuments,
      passRate,
      failRate,
      reviewQueueRate: 1 - passRate - failRate,
      averageProcessingTimeMs: 1500 + Math.floor(Math.random() * 2000),
      overrideRate: Math.random() * 0.15,
    },
    byAssetType: {
      'job_sheet': { total: Math.floor(totalDocuments * 0.6), passed: Math.floor(totalDocuments * 0.6 * passRate), failed: Math.floor(totalDocuments * 0.6 * failRate), passRate },
      'invoice': { total: Math.floor(totalDocuments * 0.3), passed: Math.floor(totalDocuments * 0.3 * passRate), failed: Math.floor(totalDocuments * 0.3 * failRate), passRate },
      'receipt': { total: Math.floor(totalDocuments * 0.1), passed: Math.floor(totalDocuments * 0.1 * passRate), failed: Math.floor(totalDocuments * 0.1 * failRate), passRate },
    },
    byTemplateId: {
      'template-a': { total: Math.floor(totalDocuments * 0.4), passed: Math.floor(totalDocuments * 0.4 * passRate), failed: Math.floor(totalDocuments * 0.4 * failRate), passRate },
      'template-b': { total: Math.floor(totalDocuments * 0.35), passed: Math.floor(totalDocuments * 0.35 * passRate), failed: Math.floor(totalDocuments * 0.35 * failRate), passRate },
      'template-c': { total: Math.floor(totalDocuments * 0.25), passed: Math.floor(totalDocuments * 0.25 * passRate), failed: Math.floor(totalDocuments * 0.25 * failRate), passRate },
    },
    topIssues: [
      { reasonCode: 'MISSING_FIELD', count: Math.floor((1 - passRate) * totalDocuments * 0.4), percentage: 40 },
      { reasonCode: 'INVALID_FORMAT', count: Math.floor((1 - passRate) * totalDocuments * 0.3), percentage: 30 },
      { reasonCode: 'LOW_CONFIDENCE', count: Math.floor((1 - passRate) * totalDocuments * 0.2), percentage: 20 },
    ],
    trend: {
      passRateDelta: (Math.random() - 0.5) * 0.10,
      volumeDelta: (Math.random() - 0.5) * 0.20,
      direction: determineTrend(passRate, passRate - 0.02),
    },
  };
}

/**
 * Generate customer scorecard
 */
export function generateCustomerScorecard(
  customerId: string,
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): CustomerScorecard {
  const { start, end } = getPeriodBoundaries(period);
  
  const totalDocuments = 100 + Math.floor(Math.random() * 500);
  const passRate = 0.85 + Math.random() * 0.12;
  
  return {
    scorecardId: generateId('cust-score'),
    period,
    periodStart: start,
    periodEnd: end,
    customer: {
      id: customerId,
      name: config.redactPii ? undefined : `Customer ${customerId}`,
      redacted: config.redactPii,
    },
    metrics: {
      totalDocuments,
      passRate,
      failRate: 1 - passRate,
      averageProcessingTimeMs: 2000 + Math.floor(Math.random() * 3000),
    },
    byAssetType: {
      'job_sheet': { total: Math.floor(totalDocuments * 0.7), passed: Math.floor(totalDocuments * 0.7 * passRate), failed: Math.floor(totalDocuments * 0.7 * (1 - passRate)), passRate },
      'invoice': { total: Math.floor(totalDocuments * 0.3), passed: Math.floor(totalDocuments * 0.3 * passRate), failed: Math.floor(totalDocuments * 0.3 * (1 - passRate)), passRate },
    },
    topIssues: [
      { reasonCode: 'MISSING_FIELD', count: Math.floor((1 - passRate) * totalDocuments * 0.5), percentage: 50 },
      { reasonCode: 'OUT_OF_POLICY', count: Math.floor((1 - passRate) * totalDocuments * 0.3), percentage: 30 },
    ],
    trend: {
      passRateDelta: (Math.random() - 0.5) * 0.08,
      volumeDelta: (Math.random() - 0.5) * 0.15,
      direction: determineTrend(passRate, passRate - 0.01),
    },
  };
}

/**
 * Generate asset type scorecard
 */
export function generateAssetTypeScorecard(
  assetType: string,
  period: CadencePeriod
): AssetTypeScorecard {
  const { start, end } = getPeriodBoundaries(period);
  
  const totalDocuments = 500 + Math.floor(Math.random() * 2000);
  const passRate = 0.88 + Math.random() * 0.10;
  
  return {
    scorecardId: generateId('asset-score'),
    period,
    periodStart: start,
    periodEnd: end,
    assetType,
    metrics: {
      totalDocuments,
      passRate,
      failRate: 1 - passRate,
      averageProcessingTimeMs: 1800 + Math.floor(Math.random() * 2500),
      averageConfidence: 0.85 + Math.random() * 0.12,
    },
    byTemplateId: {
      'template-a': { total: Math.floor(totalDocuments * 0.5), passed: Math.floor(totalDocuments * 0.5 * passRate), failed: Math.floor(totalDocuments * 0.5 * (1 - passRate)), passRate },
      'template-b': { total: Math.floor(totalDocuments * 0.3), passed: Math.floor(totalDocuments * 0.3 * passRate), failed: Math.floor(totalDocuments * 0.3 * (1 - passRate)), passRate },
      'template-c': { total: Math.floor(totalDocuments * 0.2), passed: Math.floor(totalDocuments * 0.2 * passRate), failed: Math.floor(totalDocuments * 0.2 * (1 - passRate)), passRate },
    },
    topIssues: [
      { reasonCode: 'MISSING_FIELD', count: Math.floor((1 - passRate) * totalDocuments * 0.4), percentage: 40 },
      { reasonCode: 'INVALID_FORMAT', count: Math.floor((1 - passRate) * totalDocuments * 0.35), percentage: 35 },
    ],
    trend: {
      passRateDelta: (Math.random() - 0.5) * 0.06,
      volumeDelta: (Math.random() - 0.5) * 0.25,
      direction: determineTrend(passRate, passRate),
    },
  };
}

/**
 * Generate template scorecard
 */
export function generateTemplateScorecard(
  templateId: string,
  period: CadencePeriod
): TemplateScorecard {
  const { start, end } = getPeriodBoundaries(period);
  
  const totalDocuments = 200 + Math.floor(Math.random() * 800);
  const passRate = 0.90 + Math.random() * 0.08;
  
  return {
    scorecardId: generateId('tmpl-score'),
    period,
    periodStart: start,
    periodEnd: end,
    templateId,
    templateName: `Template ${templateId}`,
    metrics: {
      totalDocuments,
      passRate,
      failRate: 1 - passRate,
      selectionAccuracy: 0.92 + Math.random() * 0.07,
      averageConfidence: 0.88 + Math.random() * 0.10,
      ambiguityRate: Math.random() * 0.10,
    },
    byField: {
      'jobNumber': { total: totalDocuments, correct: Math.floor(totalDocuments * 0.98), incorrect: Math.floor(totalDocuments * 0.02), accuracy: 0.98 },
      'customerName': { total: totalDocuments, correct: Math.floor(totalDocuments * 0.95), incorrect: Math.floor(totalDocuments * 0.05), accuracy: 0.95 },
      'serviceDate': { total: totalDocuments, correct: Math.floor(totalDocuments * 0.97), incorrect: Math.floor(totalDocuments * 0.03), accuracy: 0.97 },
      'totalCost': { total: totalDocuments, correct: Math.floor(totalDocuments * 0.92), incorrect: Math.floor(totalDocuments * 0.08), accuracy: 0.92 },
    },
    topIssues: [
      { reasonCode: 'INVALID_FORMAT', fieldId: 'totalCost', count: Math.floor((1 - passRate) * totalDocuments * 0.5), percentage: 50 },
      { reasonCode: 'MISSING_FIELD', fieldId: 'customerName', count: Math.floor((1 - passRate) * totalDocuments * 0.3), percentage: 30 },
    ],
    trend: {
      passRateDelta: (Math.random() - 0.5) * 0.05,
      volumeDelta: (Math.random() - 0.5) * 0.20,
      direction: determineTrend(passRate, passRate + 0.01),
    },
  };
}

/**
 * Generate fix pack for a target
 */
export function generateFixPack(
  targetType: 'engineer' | 'customer' | 'assetType' | 'templateId',
  targetId: string,
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): FixPack {
  const { start, end } = getPeriodBoundaries(period);
  
  const issueCount = 5 + Math.floor(Math.random() * 20);
  const issues: FixPackIssue[] = [];
  
  const reasonCodes = ['MISSING_FIELD', 'INVALID_FORMAT', 'OUT_OF_POLICY', 'LOW_CONFIDENCE'];
  const severities: Array<'S0' | 'S1' | 'S2' | 'S3'> = ['S0', 'S1', 'S2', 'S3'];
  
  for (let i = 0; i < issueCount; i++) {
    const reasonCode = reasonCodes[Math.floor(Math.random() * reasonCodes.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    
    issues.push({
      issueId: generateId('issue'),
      documentId: `doc-${1000 + i}`,
      fieldId: ['jobNumber', 'customerName', 'serviceDate', 'totalCost'][Math.floor(Math.random() * 4)],
      reasonCode,
      severity,
      message: `${reasonCode.replace(/_/g, ' ').toLowerCase()} detected`,
      context: {
        extractedValue: config.redactPii ? undefined : `value_${i}`,
        expectedPattern: '[A-Z]{2}-[0-9]{4}',
        confidence: 0.5 + Math.random() * 0.4,
        pageNumber: 1,
        redacted: config.redactPii,
      },
      suggestedAction: `Review ${reasonCode.replace(/_/g, ' ').toLowerCase()} and update extraction rules`,
      status: 'open',
    });
  }
  
  // Count by severity and reason
  const bySeverity: Record<string, number> = {};
  const byReasonCode: Record<string, number> = {};
  let criticalCount = 0;
  
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byReasonCode[issue.reasonCode] = (byReasonCode[issue.reasonCode] || 0) + 1;
    if (issue.severity === 'S0' || issue.severity === 'S1') {
      criticalCount++;
    }
  }
  
  return {
    fixPackId: generateId('fixpack'),
    period,
    periodStart: start,
    periodEnd: end,
    target: {
      type: targetType,
      id: targetId,
      name: config.redactPii ? undefined : `${targetType} ${targetId}`,
      redacted: config.redactPii,
    },
    issues,
    summary: {
      totalIssues: issues.length,
      bySeverity,
      byReasonCode,
      estimatedImpact: issues.length * 0.5, // Potential % improvement
    },
    priority: criticalCount > 5 ? 'critical' : criticalCount > 2 ? 'high' : 'medium',
  };
}

/**
 * Generate full feedback report
 */
export function generateFeedbackReport(
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): FeedbackReport {
  const { start, end } = getPeriodBoundaries(period);
  
  // Generate scorecards
  const engineerScorecards = [
    generateEngineerScorecard('eng-001', period, config),
    generateEngineerScorecard('eng-002', period, config),
    generateEngineerScorecard('eng-003', period, config),
  ];
  
  const customerScorecards = [
    generateCustomerScorecard('cust-001', period, config),
    generateCustomerScorecard('cust-002', period, config),
  ];
  
  const assetTypeScorecards = [
    generateAssetTypeScorecard('job_sheet', period),
    generateAssetTypeScorecard('invoice', period),
  ];
  
  const templateScorecards = [
    generateTemplateScorecard('template-a', period),
    generateTemplateScorecard('template-b', period),
    generateTemplateScorecard('template-c', period),
  ];
  
  // Generate fix packs
  const fixPacks = [
    generateFixPack('engineer', 'eng-001', period, config),
    generateFixPack('templateId', 'template-a', period, config),
  ];
  
  // Calculate overall metrics
  const totalDocuments = engineerScorecards.reduce((sum, s) => sum + s.metrics.totalDocuments, 0);
  const avgPassRate = engineerScorecards.reduce((sum, s) => sum + s.metrics.passRate, 0) / engineerScorecards.length;
  
  // Count critical issues
  const criticalIssues = fixPacks.reduce((sum, fp) => {
    return sum + fp.issues.filter(i => i.severity === 'S0' || i.severity === 'S1').length;
  }, 0);
  
  return {
    reportId: generateId('report'),
    period,
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date().toISOString(),
    overall: {
      totalDocuments,
      passRate: avgPassRate,
      failRate: 1 - avgPassRate,
      reviewQueueRate: 0.05,
    },
    engineerScorecards,
    customerScorecards,
    assetTypeScorecards,
    templateScorecards,
    fixPacks,
    summary: {
      totalEngineers: engineerScorecards.length,
      totalCustomers: customerScorecards.length,
      totalAssetTypes: assetTypeScorecards.length,
      totalTemplates: templateScorecards.length,
      totalFixPackIssues: fixPacks.reduce((sum, fp) => sum + fp.issues.length, 0),
      criticalIssues,
    },
  };
}

/**
 * Generate cockpit data for UI
 */
export function generateCockpitData(period: CadencePeriod = 'weekly'): CockpitData {
  const { start, end } = getPeriodBoundaries(period);
  
  // Generate trend data points
  const trends: TrendDataPoint[] = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * (period === 'daily' ? 1 : period === 'weekly' ? 7 : 30));
    
    trends.push({
      date: date.toISOString().split('T')[0],
      passRate: 0.88 + Math.random() * 0.08,
      volume: 100 + Math.floor(Math.random() * 200),
      failRate: 0.05 + Math.random() * 0.08,
    });
  }
  
  return {
    currentPeriod: {
      period,
      periodStart: start,
      periodEnd: end,
      passRate: trends[trends.length - 1].passRate,
      volume: trends[trends.length - 1].volume,
      criticalIssues: Math.floor(Math.random() * 10),
    },
    trends,
    topIssues: [
      { reasonCode: 'MISSING_FIELD', count: 45, trend: 'up' },
      { reasonCode: 'INVALID_FORMAT', count: 32, trend: 'down' },
      { reasonCode: 'OUT_OF_POLICY', count: 18, trend: 'stable' },
      { reasonCode: 'LOW_CONFIDENCE', count: 12, trend: 'down' },
    ],
    recentFixPacks: [
      { fixPackId: 'fp-001', target: 'Engineer eng-001', issueCount: 12, priority: 'high' },
      { fixPackId: 'fp-002', target: 'Template template-a', issueCount: 8, priority: 'medium' },
    ],
  };
}

/**
 * Export feedback report
 */
export function exportFeedbackReport(
  report: FeedbackReport,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): string {
  if (config.format === 'json') {
    return JSON.stringify(report, null, 2);
  }
  
  if (config.format === 'csv') {
    // Simple CSV export of overall metrics
    const rows = [
      'Metric,Value',
      `Total Documents,${report.overall.totalDocuments}`,
      `Pass Rate,${(report.overall.passRate * 100).toFixed(1)}%`,
      `Fail Rate,${(report.overall.failRate * 100).toFixed(1)}%`,
      `Total Fix Pack Issues,${report.summary.totalFixPackIssues}`,
      `Critical Issues,${report.summary.criticalIssues}`,
    ];
    return rows.join('\n');
  }
  
  // PDF would require a PDF library - return placeholder
  return '[PDF export requires additional library]';
}
