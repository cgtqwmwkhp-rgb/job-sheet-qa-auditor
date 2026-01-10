/**
 * Engineer Feedback Framework - PR-4
 * 
 * Provides aggregation framework for:
 * - Engineer scorecards (daily/weekly/monthly)
 * - Fix pack generation per engineer/template
 * - Template quality metrics
 * 
 * All outputs are deterministic with stable ordering.
 */

import { createSafeLogger } from '../../utils/safeLogger';

const logger = createSafeLogger('engineerFeedback');

/**
 * Time period for aggregation
 */
export type AggregationPeriod = 'daily' | 'weekly' | 'monthly';

/**
 * Job sheet audit result for aggregation
 */
export interface AuditResult {
  auditId: string;
  jobSheetId: string;
  engineerId: string;
  engineerName: string;
  templateId: string;
  templateName: string;
  auditedAt: string;
  outcome: 'VALID' | 'INVALID' | 'REVIEW_QUEUE';
  reasonCodes: string[];
  confidence: number;
  fieldsExtracted: number;
  fieldsMissing: number;
  fieldsLowConfidence: number;
}

/**
 * Engineer scorecard
 */
export interface EngineerScorecard {
  engineerId: string;
  engineerName: string;
  period: AggregationPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: {
    totalAudits: number;
    validCount: number;
    invalidCount: number;
    reviewQueueCount: number;
    validRate: number;
    averageConfidence: number;
    fieldsExtractedTotal: number;
    fieldsMissingTotal: number;
    fieldsLowConfidenceTotal: number;
  };
  topIssues: Array<{
    reasonCode: string;
    count: number;
    percentage: number;
  }>;
  templateBreakdown: Array<{
    templateId: string;
    templateName: string;
    auditCount: number;
    validRate: number;
  }>;
  generatedAt: string;
}

/**
 * Fix pack for engineer
 */
export interface EngineerFixPack {
  engineerId: string;
  engineerName: string;
  generatedAt: string;
  period: AggregationPeriod;
  periodStart: string;
  periodEnd: string;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
  };
  issues: Array<{
    category: 'critical' | 'warning' | 'info';
    reasonCode: string;
    description: string;
    occurrences: number;
    exampleAuditIds: string[];
    recommendation: string;
  }>;
}

/**
 * Template quality metrics
 */
export interface TemplateQualityMetrics {
  templateId: string;
  templateName: string;
  period: AggregationPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: {
    totalAudits: number;
    validRate: number;
    averageConfidence: number;
    ambiguityRate: number;
    collisionCount: number;
    overrideCount: number;
    roiCompleteness: number;
    fixturePassRate: number;
  };
  topReasonCodes: Array<{
    reasonCode: string;
    count: number;
    percentage: number;
  }>;
  generatedAt: string;
}

/**
 * Template Quality Cockpit data
 */
export interface TemplateQualityCockpit {
  generatedAt: string;
  period: AggregationPeriod;
  periodStart: string;
  periodEnd: string;
  overallMetrics: {
    totalTemplates: number;
    totalAudits: number;
    averageValidRate: number;
    averageConfidence: number;
    templatesWithHighAmbiguity: number;
    templatesNeedingAttention: number;
  };
  templates: TemplateQualityMetrics[];
  topIssues: Array<{
    reasonCode: string;
    affectedTemplates: number;
    totalOccurrences: number;
  }>;
}

/**
 * Reason code descriptions
 */
const REASON_CODE_DESCRIPTIONS: Record<string, { description: string; recommendation: string; category: 'critical' | 'warning' | 'info' }> = {
  MISSING_FIELD: {
    description: 'Required field was not found in the document',
    recommendation: 'Ensure all required fields are present and clearly labeled on job sheets',
    category: 'critical',
  },
  INVALID_FORMAT: {
    description: 'Field value does not match expected format',
    recommendation: 'Use standard formats for dates, reference numbers, and other structured data',
    category: 'warning',
  },
  LOW_CONFIDENCE: {
    description: 'Field extraction had low confidence due to unclear or ambiguous content',
    recommendation: 'Ensure fields are clearly written or typed, avoid handwriting over printed text',
    category: 'warning',
  },
  CONFLICT: {
    description: 'Multiple conflicting values detected for the same field',
    recommendation: 'Ensure only one value is provided for each field, avoid corrections without clear marking',
    category: 'critical',
  },
  SPEC_GAP: {
    description: 'Template specification is missing required ROI or field definition',
    recommendation: 'Contact admin to update template specification',
    category: 'info',
  },
  OCR_FAILURE: {
    description: 'Document image quality prevented accurate text extraction',
    recommendation: 'Ensure documents are scanned clearly without shadows, folds, or low resolution',
    category: 'warning',
  },
  PIPELINE_ERROR: {
    description: 'System processing error occurred',
    recommendation: 'Retry the audit or contact support if issue persists',
    category: 'info',
  },
};

/**
 * Calculate period boundaries
 */
function calculatePeriodBoundaries(
  period: AggregationPeriod,
  referenceDate: Date = new Date()
): { start: Date; end: Date } {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  
  switch (period) {
    case 'daily':
      // Start and end are the same day
      break;
    case 'weekly':
      // Go back to start of week (Sunday)
      start.setDate(start.getDate() - start.getDay());
      // End is 6 days later (Saturday)
      end.setDate(start.getDate() + 6);
      break;
    case 'monthly':
      // Start of month
      start.setDate(1);
      // End of month
      end.setMonth(end.getMonth() + 1, 0);
      break;
  }
  
  return { start, end };
}

/**
 * Filter audits by period
 */
function filterAuditsByPeriod(
  audits: AuditResult[],
  period: AggregationPeriod,
  referenceDate?: Date
): AuditResult[] {
  const { start, end } = calculatePeriodBoundaries(period, referenceDate);
  
  return audits.filter(audit => {
    const auditDate = new Date(audit.auditedAt);
    return auditDate >= start && auditDate <= end;
  });
}

/**
 * Calculate reason code distribution
 */
function calculateReasonCodeDistribution(
  audits: AuditResult[]
): Array<{ reasonCode: string; count: number; percentage: number }> {
  const counts = new Map<string, number>();
  let total = 0;
  
  for (const audit of audits) {
    for (const code of audit.reasonCodes) {
      counts.set(code, (counts.get(code) || 0) + 1);
      total++;
    }
  }
  
  const distribution = Array.from(counts.entries())
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode));
  
  return distribution;
}

/**
 * Generate engineer scorecard
 */
export function generateEngineerScorecard(
  engineerId: string,
  engineerName: string,
  audits: AuditResult[],
  period: AggregationPeriod,
  referenceDate?: Date
): EngineerScorecard {
  const { start, end } = calculatePeriodBoundaries(period, referenceDate);
  const periodAudits = filterAuditsByPeriod(audits, period, referenceDate)
    .filter(a => a.engineerId === engineerId);
  
  const validCount = periodAudits.filter(a => a.outcome === 'VALID').length;
  const invalidCount = periodAudits.filter(a => a.outcome === 'INVALID').length;
  const reviewQueueCount = periodAudits.filter(a => a.outcome === 'REVIEW_QUEUE').length;
  
  const totalAudits = periodAudits.length;
  const validRate = totalAudits > 0 ? validCount / totalAudits : 0;
  const averageConfidence = totalAudits > 0
    ? periodAudits.reduce((sum, a) => sum + a.confidence, 0) / totalAudits
    : 0;
  
  // Aggregate field counts
  const fieldsExtractedTotal = periodAudits.reduce((sum, a) => sum + a.fieldsExtracted, 0);
  const fieldsMissingTotal = periodAudits.reduce((sum, a) => sum + a.fieldsMissing, 0);
  const fieldsLowConfidenceTotal = periodAudits.reduce((sum, a) => sum + a.fieldsLowConfidence, 0);
  
  // Top issues
  const topIssues = calculateReasonCodeDistribution(periodAudits).slice(0, 5);
  
  // Template breakdown
  const templateMap = new Map<string, { name: string; valid: number; total: number }>();
  for (const audit of periodAudits) {
    const existing = templateMap.get(audit.templateId) || { name: audit.templateName, valid: 0, total: 0 };
    existing.total++;
    if (audit.outcome === 'VALID') existing.valid++;
    templateMap.set(audit.templateId, existing);
  }
  
  const templateBreakdown = Array.from(templateMap.entries())
    .map(([templateId, data]) => ({
      templateId,
      templateName: data.name,
      auditCount: data.total,
      validRate: data.total > 0 ? data.valid / data.total : 0,
    }))
    .sort((a, b) => b.auditCount - a.auditCount || a.templateId.localeCompare(b.templateId));
  
  logger.info('Engineer scorecard generated', {
    engineerId,
    period,
    totalAudits,
    validRate: validRate.toFixed(3),
  });
  
  return {
    engineerId,
    engineerName,
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics: {
      totalAudits,
      validCount,
      invalidCount,
      reviewQueueCount,
      validRate,
      averageConfidence,
      fieldsExtractedTotal,
      fieldsMissingTotal,
      fieldsLowConfidenceTotal,
    },
    topIssues,
    templateBreakdown,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate fix pack for engineer
 */
export function generateEngineerFixPack(
  engineerId: string,
  engineerName: string,
  audits: AuditResult[],
  period: AggregationPeriod,
  referenceDate?: Date
): EngineerFixPack {
  const { start, end } = calculatePeriodBoundaries(period, referenceDate);
  const periodAudits = filterAuditsByPeriod(audits, period, referenceDate)
    .filter(a => a.engineerId === engineerId)
    .filter(a => a.outcome !== 'VALID');
  
  // Aggregate issues by reason code
  const issueMap = new Map<string, { auditIds: string[] }>();
  for (const audit of periodAudits) {
    for (const code of audit.reasonCodes) {
      const existing = issueMap.get(code) || { auditIds: [] };
      existing.auditIds.push(audit.auditId);
      issueMap.set(code, existing);
    }
  }
  
  // Build issue list
  const issues = Array.from(issueMap.entries())
    .map(([reasonCode, data]) => {
      const info = REASON_CODE_DESCRIPTIONS[reasonCode] || {
        description: 'Unknown issue',
        recommendation: 'Contact support for assistance',
        category: 'info' as const,
      };
      return {
        category: info.category,
        reasonCode,
        description: info.description,
        occurrences: data.auditIds.length,
        exampleAuditIds: data.auditIds.slice(0, 3), // Limit examples
        recommendation: info.recommendation,
      };
    })
    .sort((a, b) => {
      // Sort by category (critical first), then by occurrences
      const categoryOrder = { critical: 0, warning: 1, info: 2 };
      const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
      if (categoryDiff !== 0) return categoryDiff;
      return b.occurrences - a.occurrences || a.reasonCode.localeCompare(b.reasonCode);
    });
  
  const summary = {
    totalIssues: issues.reduce((sum, i) => sum + i.occurrences, 0),
    criticalIssues: issues.filter(i => i.category === 'critical').reduce((sum, i) => sum + i.occurrences, 0),
    warningIssues: issues.filter(i => i.category === 'warning').reduce((sum, i) => sum + i.occurrences, 0),
    infoIssues: issues.filter(i => i.category === 'info').reduce((sum, i) => sum + i.occurrences, 0),
  };
  
  logger.info('Fix pack generated', {
    engineerId,
    period,
    totalIssues: summary.totalIssues,
    criticalIssues: summary.criticalIssues,
  });
  
  return {
    engineerId,
    engineerName,
    generatedAt: new Date().toISOString(),
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    summary,
    issues,
  };
}

/**
 * Generate template quality metrics
 */
export function generateTemplateQualityMetrics(
  templateId: string,
  templateName: string,
  audits: AuditResult[],
  period: AggregationPeriod,
  additionalMetrics?: {
    collisionCount?: number;
    overrideCount?: number;
    roiCompleteness?: number;
    fixturePassRate?: number;
  },
  referenceDate?: Date
): TemplateQualityMetrics {
  const { start, end } = calculatePeriodBoundaries(period, referenceDate);
  const periodAudits = filterAuditsByPeriod(audits, period, referenceDate)
    .filter(a => a.templateId === templateId);
  
  const totalAudits = periodAudits.length;
  const validCount = periodAudits.filter(a => a.outcome === 'VALID').length;
  const validRate = totalAudits > 0 ? validCount / totalAudits : 0;
  const averageConfidence = totalAudits > 0
    ? periodAudits.reduce((sum, a) => sum + a.confidence, 0) / totalAudits
    : 0;
  
  // Ambiguity rate (LOW_CONFIDENCE or CONFLICT outcomes)
  const ambiguousCount = periodAudits.filter(
    a => a.reasonCodes.includes('LOW_CONFIDENCE') || a.reasonCodes.includes('CONFLICT')
  ).length;
  const ambiguityRate = totalAudits > 0 ? ambiguousCount / totalAudits : 0;
  
  const topReasonCodes = calculateReasonCodeDistribution(periodAudits).slice(0, 5);
  
  return {
    templateId,
    templateName,
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics: {
      totalAudits,
      validRate,
      averageConfidence,
      ambiguityRate,
      collisionCount: additionalMetrics?.collisionCount ?? 0,
      overrideCount: additionalMetrics?.overrideCount ?? 0,
      roiCompleteness: additionalMetrics?.roiCompleteness ?? 1,
      fixturePassRate: additionalMetrics?.fixturePassRate ?? 1,
    },
    topReasonCodes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate template quality cockpit
 */
export function generateTemplateQualityCockpit(
  audits: AuditResult[],
  templateMetricsMap: Map<string, { name: string; collisionCount?: number; overrideCount?: number; roiCompleteness?: number; fixturePassRate?: number }>,
  period: AggregationPeriod,
  referenceDate?: Date
): TemplateQualityCockpit {
  const { start, end } = calculatePeriodBoundaries(period, referenceDate);
  const periodAudits = filterAuditsByPeriod(audits, period, referenceDate);
  
  // Generate metrics for each template
  const templateIdsSet = new Set(periodAudits.map(a => a.templateId));
  const templateIds = Array.from(templateIdsSet);
  const templates: TemplateQualityMetrics[] = [];
  
  for (const templateId of templateIds) {
    const templateInfo = templateMetricsMap.get(templateId);
    const templateName = templateInfo?.name || templateId;
    const additionalMetrics = templateInfo ? {
      collisionCount: templateInfo.collisionCount,
      overrideCount: templateInfo.overrideCount,
      roiCompleteness: templateInfo.roiCompleteness,
      fixturePassRate: templateInfo.fixturePassRate,
    } : undefined;
    const metrics = generateTemplateQualityMetrics(
      templateId,
      templateName,
      audits,
      period,
      additionalMetrics,
      referenceDate
    );
    templates.push(metrics);
  }
  
  // Sort templates: by attention needed (low valid rate, high ambiguity) first
  templates.sort((a, b) => {
    const aScore = a.metrics.validRate - a.metrics.ambiguityRate;
    const bScore = b.metrics.validRate - b.metrics.ambiguityRate;
    if (aScore !== bScore) return aScore - bScore; // Lower score = needs more attention
    return a.templateId.localeCompare(b.templateId);
  });
  
  // Calculate overall metrics
  const totalTemplates = templates.length;
  const totalAudits = periodAudits.length;
  const averageValidRate = templates.length > 0
    ? templates.reduce((sum, t) => sum + t.metrics.validRate, 0) / templates.length
    : 0;
  const averageConfidence = templates.length > 0
    ? templates.reduce((sum, t) => sum + t.metrics.averageConfidence, 0) / templates.length
    : 0;
  const templatesWithHighAmbiguity = templates.filter(t => t.metrics.ambiguityRate > 0.2).length;
  const templatesNeedingAttention = templates.filter(t => t.metrics.validRate < 0.8).length;
  
  // Top issues across all templates
  const allReasonCodes = calculateReasonCodeDistribution(periodAudits);
  const topIssues = allReasonCodes.slice(0, 5).map(rc => ({
    reasonCode: rc.reasonCode,
    affectedTemplates: templates.filter(t => 
      t.topReasonCodes.some(trc => trc.reasonCode === rc.reasonCode)
    ).length,
    totalOccurrences: rc.count,
  }));
  
  logger.info('Template quality cockpit generated', {
    period,
    totalTemplates,
    totalAudits,
    templatesNeedingAttention,
  });
  
  return {
    generatedAt: new Date().toISOString(),
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    overallMetrics: {
      totalTemplates,
      totalAudits,
      averageValidRate,
      averageConfidence,
      templatesWithHighAmbiguity,
      templatesNeedingAttention,
    },
    templates,
    topIssues,
  };
}

/**
 * Generate JSON export of scorecard
 */
export function generateScorecardJson(scorecard: EngineerScorecard): string {
  return JSON.stringify(scorecard, null, 2);
}

/**
 * Generate JSON export of fix pack
 */
export function generateFixPackJson(fixPack: EngineerFixPack): string {
  return JSON.stringify(fixPack, null, 2);
}

/**
 * Generate JSON export of cockpit
 */
export function generateCockpitJson(cockpit: TemplateQualityCockpit): string {
  return JSON.stringify(cockpit, null, 2);
}
