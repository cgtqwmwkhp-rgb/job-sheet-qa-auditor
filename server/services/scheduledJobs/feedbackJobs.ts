/**
 * Engineer Feedback Scheduled Jobs
 * 
 * Provides scheduled job definitions for:
 * - Daily: Summary counts + top issues
 * - Weekly: Engineer scorecards + fix packs
 * - Monthly: Customer/assetType quality pack
 * 
 * All outputs are deterministic and redacted by default.
 */

import { createSafeLogger } from '../../utils/safeLogger';
import {
  generateEngineerScorecard,
  generateEngineerFixPack,
  generateTemplateQualityCockpit,
  type AuditResult,
  type EngineerScorecard,
  type EngineerFixPack,
  type TemplateQualityCockpit,
  type AggregationPeriod,
} from '../engineerFeedback/feedbackService';

const logger = createSafeLogger('feedbackJobs');

/**
 * Daily summary output
 */
export interface DailySummary {
  date: string;
  generatedAt: string;
  counts: {
    totalAudits: number;
    validCount: number;
    invalidCount: number;
    reviewQueueCount: number;
    validRate: number;
  };
  topIssues: Array<{
    reasonCode: string;
    count: number;
    percentage: number;
  }>;
  topEngineers: Array<{
    engineerId: string;
    engineerName: string;
    auditCount: number;
    validRate: number;
  }>;
  topTemplates: Array<{
    templateId: string;
    templateName: string;
    auditCount: number;
    validRate: number;
  }>;
}

/**
 * Weekly report output
 */
export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  engineerScorecards: EngineerScorecard[];
  engineerFixPacks: EngineerFixPack[];
  templateCockpit: TemplateQualityCockpit;
}

/**
 * Monthly quality pack output
 */
export interface MonthlyQualityPack {
  month: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  overallMetrics: {
    totalAudits: number;
    totalEngineers: number;
    totalTemplates: number;
    averageValidRate: number;
    averageConfidence: number;
  };
  customerBreakdown: Array<{
    customerId: string;
    customerName: string;
    auditCount: number;
    validRate: number;
    topIssues: Array<{ reasonCode: string; count: number }>;
  }>;
  assetTypeBreakdown: Array<{
    assetType: string;
    auditCount: number;
    validRate: number;
    topIssues: Array<{ reasonCode: string; count: number }>;
  }>;
  engineerScorecards: EngineerScorecard[];
  templateCockpit: TemplateQualityCockpit;
  recommendations: string[];
}

/**
 * Job execution result
 */
export interface JobExecutionResult<T> {
  jobName: string;
  executedAt: string;
  success: boolean;
  durationMs: number;
  output?: T;
  error?: string;
}

/**
 * Generate daily summary
 */
export function generateDailySummary(
  audits: AuditResult[],
  referenceDate: Date = new Date()
): DailySummary {
  const dateStr = referenceDate.toISOString().split('T')[0];
  
  // Filter to today's audits
  const todayAudits = audits.filter(a => {
    const auditDate = new Date(a.auditedAt).toISOString().split('T')[0];
    return auditDate === dateStr;
  });
  
  const totalAudits = todayAudits.length;
  const validCount = todayAudits.filter(a => a.outcome === 'VALID').length;
  const invalidCount = todayAudits.filter(a => a.outcome === 'INVALID').length;
  const reviewQueueCount = todayAudits.filter(a => a.outcome === 'REVIEW_QUEUE').length;
  const validRate = totalAudits > 0 ? validCount / totalAudits : 0;
  
  // Top issues
  const issueCounts = new Map<string, number>();
  let totalIssues = 0;
  for (const audit of todayAudits) {
    for (const code of audit.reasonCodes) {
      issueCounts.set(code, (issueCounts.get(code) || 0) + 1);
      totalIssues++;
    }
  }
  const topIssues = Array.from(issueCounts.entries())
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      percentage: totalIssues > 0 ? (count / totalIssues) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode))
    .slice(0, 5);
  
  // Top engineers
  const engineerMap = new Map<string, { name: string; valid: number; total: number }>();
  for (const audit of todayAudits) {
    const existing = engineerMap.get(audit.engineerId) || { name: audit.engineerName, valid: 0, total: 0 };
    existing.total++;
    if (audit.outcome === 'VALID') existing.valid++;
    engineerMap.set(audit.engineerId, existing);
  }
  const topEngineers = Array.from(engineerMap.entries())
    .map(([engineerId, data]) => ({
      engineerId,
      engineerName: data.name,
      auditCount: data.total,
      validRate: data.total > 0 ? data.valid / data.total : 0,
    }))
    .sort((a, b) => b.auditCount - a.auditCount || a.engineerId.localeCompare(b.engineerId))
    .slice(0, 5);
  
  // Top templates
  const templateMap = new Map<string, { name: string; valid: number; total: number }>();
  for (const audit of todayAudits) {
    const existing = templateMap.get(audit.templateId) || { name: audit.templateName, valid: 0, total: 0 };
    existing.total++;
    if (audit.outcome === 'VALID') existing.valid++;
    templateMap.set(audit.templateId, existing);
  }
  const topTemplates = Array.from(templateMap.entries())
    .map(([templateId, data]) => ({
      templateId,
      templateName: data.name,
      auditCount: data.total,
      validRate: data.total > 0 ? data.valid / data.total : 0,
    }))
    .sort((a, b) => b.auditCount - a.auditCount || a.templateId.localeCompare(b.templateId))
    .slice(0, 5);
  
  logger.info('Daily summary generated', { date: dateStr, totalAudits, validRate: validRate.toFixed(3) });
  
  return {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    counts: {
      totalAudits,
      validCount,
      invalidCount,
      reviewQueueCount,
      validRate,
    },
    topIssues,
    topEngineers,
    topTemplates,
  };
}

/**
 * Generate weekly report with scorecards and fix packs
 */
export function generateWeeklyReport(
  audits: AuditResult[],
  templateMetricsMap: Map<string, { name: string; collisionCount?: number; overrideCount?: number; roiCompleteness?: number; fixturePassRate?: number }>,
  referenceDate: Date = new Date()
): WeeklyReport {
  // Calculate week boundaries
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
  
  // Get unique engineers
  const engineerIds = Array.from(new Set(audits.map(a => a.engineerId)));
  
  // Generate scorecards for each engineer
  const engineerScorecards: EngineerScorecard[] = [];
  const engineerFixPacks: EngineerFixPack[] = [];
  
  for (const engineerId of engineerIds) {
    const engineerAudits = audits.filter(a => a.engineerId === engineerId);
    if (engineerAudits.length === 0) continue;
    
    const engineerName = engineerAudits[0].engineerName;
    
    const scorecard = generateEngineerScorecard(
      engineerId,
      engineerName,
      audits,
      'weekly',
      referenceDate
    );
    engineerScorecards.push(scorecard);
    
    const fixPack = generateEngineerFixPack(
      engineerId,
      engineerName,
      audits,
      'weekly',
      referenceDate
    );
    if (fixPack.summary.totalIssues > 0) {
      engineerFixPacks.push(fixPack);
    }
  }
  
  // Sort scorecards by audit count desc
  engineerScorecards.sort((a, b) => 
    b.metrics.totalAudits - a.metrics.totalAudits || 
    a.engineerId.localeCompare(b.engineerId)
  );
  
  // Sort fix packs by critical issues desc
  engineerFixPacks.sort((a, b) => 
    b.summary.criticalIssues - a.summary.criticalIssues ||
    b.summary.totalIssues - a.summary.totalIssues ||
    a.engineerId.localeCompare(b.engineerId)
  );
  
  // Generate template cockpit
  const templateCockpit = generateTemplateQualityCockpit(
    audits,
    templateMetricsMap,
    'weekly',
    referenceDate
  );
  
  logger.info('Weekly report generated', {
    weekStart: start.toISOString(),
    engineerCount: engineerScorecards.length,
    fixPackCount: engineerFixPacks.length,
  });
  
  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    generatedAt: new Date().toISOString(),
    engineerScorecards,
    engineerFixPacks,
    templateCockpit,
  };
}

/**
 * Generate monthly quality pack
 */
export function generateMonthlyQualityPack(
  audits: AuditResult[],
  templateMetricsMap: Map<string, { name: string; collisionCount?: number; overrideCount?: number; roiCompleteness?: number; fixturePassRate?: number }>,
  customerData: Map<string, { customerId: string; customerName: string }>,
  assetTypeData: Map<string, string>, // auditId -> assetType
  referenceDate: Date = new Date()
): MonthlyQualityPack {
  // Calculate month boundaries
  const start = new Date(referenceDate);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(referenceDate);
  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  
  const monthStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  
  // Filter to month's audits
  const monthAudits = audits.filter(a => {
    const auditDate = new Date(a.auditedAt);
    return auditDate >= start && auditDate <= end;
  });
  
  // Overall metrics
  const totalAudits = monthAudits.length;
  const totalEngineers = new Set(monthAudits.map(a => a.engineerId)).size;
  const totalTemplates = new Set(monthAudits.map(a => a.templateId)).size;
  const validCount = monthAudits.filter(a => a.outcome === 'VALID').length;
  const averageValidRate = totalAudits > 0 ? validCount / totalAudits : 0;
  const averageConfidence = totalAudits > 0
    ? monthAudits.reduce((sum, a) => sum + a.confidence, 0) / totalAudits
    : 0;
  
  // Customer breakdown
  const customerMap = new Map<string, { name: string; valid: number; total: number; issues: Map<string, number> }>();
  for (const audit of monthAudits) {
    const customer = customerData.get(audit.auditId);
    if (!customer) continue;
    
    const existing = customerMap.get(customer.customerId) || {
      name: customer.customerName,
      valid: 0,
      total: 0,
      issues: new Map(),
    };
    existing.total++;
    if (audit.outcome === 'VALID') existing.valid++;
    for (const code of audit.reasonCodes) {
      existing.issues.set(code, (existing.issues.get(code) || 0) + 1);
    }
    customerMap.set(customer.customerId, existing);
  }
  
  const customerBreakdown = Array.from(customerMap.entries())
    .map(([customerId, data]) => ({
      customerId,
      customerName: data.name,
      auditCount: data.total,
      validRate: data.total > 0 ? data.valid / data.total : 0,
      topIssues: Array.from(data.issues.entries())
        .map(([reasonCode, count]) => ({ reasonCode, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => b.auditCount - a.auditCount || a.customerId.localeCompare(b.customerId));
  
  // Asset type breakdown
  const assetTypeMap = new Map<string, { valid: number; total: number; issues: Map<string, number> }>();
  for (const audit of monthAudits) {
    const assetType = assetTypeData.get(audit.auditId) || 'Unknown';
    const existing = assetTypeMap.get(assetType) || {
      valid: 0,
      total: 0,
      issues: new Map(),
    };
    existing.total++;
    if (audit.outcome === 'VALID') existing.valid++;
    for (const code of audit.reasonCodes) {
      existing.issues.set(code, (existing.issues.get(code) || 0) + 1);
    }
    assetTypeMap.set(assetType, existing);
  }
  
  const assetTypeBreakdown = Array.from(assetTypeMap.entries())
    .map(([assetType, data]) => ({
      assetType,
      auditCount: data.total,
      validRate: data.total > 0 ? data.valid / data.total : 0,
      topIssues: Array.from(data.issues.entries())
        .map(([reasonCode, count]) => ({ reasonCode, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => b.auditCount - a.auditCount || a.assetType.localeCompare(b.assetType));
  
  // Get engineer scorecards
  const engineerIds = Array.from(new Set(monthAudits.map(a => a.engineerId)));
  const engineerScorecards: EngineerScorecard[] = [];
  
  for (const engineerId of engineerIds) {
    const engineerAudits = monthAudits.filter(a => a.engineerId === engineerId);
    if (engineerAudits.length === 0) continue;
    
    const scorecard = generateEngineerScorecard(
      engineerId,
      engineerAudits[0].engineerName,
      audits,
      'monthly',
      referenceDate
    );
    engineerScorecards.push(scorecard);
  }
  
  engineerScorecards.sort((a, b) => 
    b.metrics.totalAudits - a.metrics.totalAudits || 
    a.engineerId.localeCompare(b.engineerId)
  );
  
  // Template cockpit
  const templateCockpit = generateTemplateQualityCockpit(
    audits,
    templateMetricsMap,
    'monthly',
    referenceDate
  );
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (averageValidRate < 0.8) {
    recommendations.push('Overall valid rate is below 80%. Consider additional engineer training.');
  }
  
  const highAmbiguityTemplates = templateCockpit.templates.filter(t => t.metrics.ambiguityRate > 0.2);
  if (highAmbiguityTemplates.length > 0) {
    recommendations.push(`${highAmbiguityTemplates.length} templates have high ambiguity rates. Review selection fingerprints.`);
  }
  
  const lowConfidenceCustomers = customerBreakdown.filter(c => c.validRate < 0.7);
  if (lowConfidenceCustomers.length > 0) {
    recommendations.push(`${lowConfidenceCustomers.length} customers have valid rates below 70%. Consider targeted outreach.`);
  }
  
  logger.info('Monthly quality pack generated', {
    month: monthStr,
    totalAudits,
    averageValidRate: averageValidRate.toFixed(3),
    recommendationCount: recommendations.length,
  });
  
  return {
    month: monthStr,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    generatedAt: new Date().toISOString(),
    overallMetrics: {
      totalAudits,
      totalEngineers,
      totalTemplates,
      averageValidRate,
      averageConfidence,
    },
    customerBreakdown,
    assetTypeBreakdown,
    engineerScorecards,
    templateCockpit,
    recommendations,
  };
}

/**
 * Execute daily job
 */
export async function executeDailyJob(
  fetchAudits: () => Promise<AuditResult[]>
): Promise<JobExecutionResult<DailySummary>> {
  const startTime = Date.now();
  const jobName = 'daily-summary';
  
  try {
    logger.info('Starting daily job execution');
    const audits = await fetchAudits();
    const output = generateDailySummary(audits);
    
    return {
      jobName,
      executedAt: new Date().toISOString(),
      success: true,
      durationMs: Date.now() - startTime,
      output,
    };
  } catch (error) {
    logger.error('Daily job failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      jobName,
      executedAt: new Date().toISOString(),
      success: false,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute weekly job
 */
export async function executeWeeklyJob(
  fetchAudits: () => Promise<AuditResult[]>,
  fetchTemplateMetrics: () => Promise<Map<string, { name: string; collisionCount?: number; overrideCount?: number; roiCompleteness?: number; fixturePassRate?: number }>>
): Promise<JobExecutionResult<WeeklyReport>> {
  const startTime = Date.now();
  const jobName = 'weekly-report';
  
  try {
    logger.info('Starting weekly job execution');
    const [audits, templateMetrics] = await Promise.all([
      fetchAudits(),
      fetchTemplateMetrics(),
    ]);
    const output = generateWeeklyReport(audits, templateMetrics);
    
    return {
      jobName,
      executedAt: new Date().toISOString(),
      success: true,
      durationMs: Date.now() - startTime,
      output,
    };
  } catch (error) {
    logger.error('Weekly job failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      jobName,
      executedAt: new Date().toISOString(),
      success: false,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute monthly job
 */
export async function executeMonthlyJob(
  fetchAudits: () => Promise<AuditResult[]>,
  fetchTemplateMetrics: () => Promise<Map<string, { name: string; collisionCount?: number; overrideCount?: number; roiCompleteness?: number; fixturePassRate?: number }>>,
  fetchCustomerData: () => Promise<Map<string, { customerId: string; customerName: string }>>,
  fetchAssetTypeData: () => Promise<Map<string, string>>
): Promise<JobExecutionResult<MonthlyQualityPack>> {
  const startTime = Date.now();
  const jobName = 'monthly-quality-pack';
  
  try {
    logger.info('Starting monthly job execution');
    const [audits, templateMetrics, customerData, assetTypeData] = await Promise.all([
      fetchAudits(),
      fetchTemplateMetrics(),
      fetchCustomerData(),
      fetchAssetTypeData(),
    ]);
    const output = generateMonthlyQualityPack(audits, templateMetrics, customerData, assetTypeData);
    
    return {
      jobName,
      executedAt: new Date().toISOString(),
      success: true,
      durationMs: Date.now() - startTime,
      output,
    };
  } catch (error) {
    logger.error('Monthly job failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      jobName,
      executedAt: new Date().toISOString(),
      success: false,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Redact PII from output for safe logging/storage
 */
export function redactOutput<T>(output: T): T {
  const redacted = JSON.parse(JSON.stringify(output));
  
  // Redact engineer names
  const redactName = (name: string) => {
    if (!name) return name;
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}. ${parts[parts.length - 1][0]}.`;
    }
    return name[0] + '.';
  };
  
  const redactObject = (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      if (key === 'engineerName' || key === 'customerName') {
        obj[key] = redactName(obj[key] as string);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key])) {
          for (const item of obj[key] as unknown[]) {
            if (typeof item === 'object' && item !== null) {
              redactObject(item as Record<string, unknown>);
            }
          }
        } else {
          redactObject(obj[key] as Record<string, unknown>);
        }
      }
    }
  };
  
  if (typeof redacted === 'object' && redacted !== null) {
    redactObject(redacted as Record<string, unknown>);
  }
  
  return redacted;
}

/**
 * Job schedule configuration
 */
export const JOB_SCHEDULE = {
  daily: {
    cron: '0 6 * * *', // 6 AM daily
    description: 'Daily summary with counts and top issues',
  },
  weekly: {
    cron: '0 7 * * 1', // 7 AM every Monday
    description: 'Weekly engineer scorecards and fix packs',
  },
  monthly: {
    cron: '0 8 1 * *', // 8 AM on 1st of each month
    description: 'Monthly customer/asset quality pack',
  },
};
