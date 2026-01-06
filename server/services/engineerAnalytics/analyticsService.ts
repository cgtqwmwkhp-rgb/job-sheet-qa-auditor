/**
 * Engineer Analytics Service
 * 
 * Calculates engineer scores, trends, and generates Fix Packs.
 * All outputs are deterministic given same input.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  EngineerProfile,
  IssueOccurrence,
  EngineerScoreCard,
  IssueTypeCount,
  RecurringIssue,
  CoachingRecommendation,
  FixPack,
  FixPackIssue,
  FixPackExample,
  TrendAnalytics,
  TrendDataPoint,
  IssueTypeTrend,
  EngineerTrendSummary,
  IssueType,
} from './types';
import { getDefaultTrainingModules } from './types';

/**
 * Calculate engineer score card
 */
export function calculateScoreCard(
  engineer: EngineerProfile,
  issues: IssueOccurrence[],
  totalDocuments: number,
  periodStart: string,
  periodEnd: string,
  peerScores?: { teamAvgScore: number; regionAvgScore: number; percentile: number }
): EngineerScoreCard {
  // Filter issues for this engineer in the period
  const engineerIssues = issues.filter(
    i => i.engineerId === engineer.id &&
    i.occurredAt >= periodStart &&
    i.occurredAt <= periodEnd
  );
  
  // Calculate issue rate
  const documentsWithIssues = new Set(engineerIssues.map(i => i.documentId)).size;
  const issueRate = totalDocuments > 0 ? documentsWithIssues / totalDocuments : 0;
  
  // Calculate overall score (100 - penalty for issues)
  const severityWeights = { S0: 10, S1: 5, S2: 2, S3: 1 };
  let penalty = 0;
  for (const issue of engineerIssues) {
    penalty += severityWeights[issue.severity];
  }
  const overallScore = Math.max(0, Math.min(100, 100 - penalty));
  
  // Count issues by severity
  const issuesBySeverity = {
    S0: engineerIssues.filter(i => i.severity === 'S0').length,
    S1: engineerIssues.filter(i => i.severity === 'S1').length,
    S2: engineerIssues.filter(i => i.severity === 'S2').length,
    S3: engineerIssues.filter(i => i.severity === 'S3').length,
  };
  
  // Count issues by type
  const issuesByType = calculateIssuesByType(engineerIssues);
  
  // Find recurring issues
  const topRecurringIssues = findRecurringIssues(engineerIssues);
  
  // Determine trend (would need historical data in real implementation)
  const trend = determineTrend(overallScore, 85); // Assume previous score of 85
  
  // Generate recommendations
  const recommendations = generateRecommendations(engineerIssues, topRecurringIssues);
  
  return {
    engineerId: engineer.id,
    engineerName: engineer.name,
    period: {
      start: periodStart,
      end: periodEnd,
    },
    overallScore: Math.round(overallScore),
    trend,
    documentsProcessed: totalDocuments,
    documentsWithIssues,
    issueRate: Math.round(issueRate * 100) / 100,
    issuesBySeverity,
    issuesByType,
    topRecurringIssues,
    peerComparison: peerScores || {
      percentile: 50,
      teamAvgScore: 80,
      regionAvgScore: 78,
    },
    recommendations,
  };
}

/**
 * Calculate issues by type
 */
function calculateIssuesByType(issues: IssueOccurrence[]): IssueTypeCount[] {
  const typeCounts = new Map<IssueType, number>();
  
  for (const issue of issues) {
    const count = typeCounts.get(issue.issueType) || 0;
    typeCounts.set(issue.issueType, count + 1);
  }
  
  const total = issues.length;
  const result: IssueTypeCount[] = [];
  
  typeCounts.forEach((count, issueType) => {
    result.push({
      issueType,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) / 100 : 0,
    });
  });
  
  // Sort by count descending, then by type for stability
  return result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.issueType.localeCompare(b.issueType);
  });
}

/**
 * Find recurring issues
 */
function findRecurringIssues(issues: IssueOccurrence[]): RecurringIssue[] {
  const issueMap = new Map<string, IssueOccurrence[]>();
  
  // Group by issue type + field name
  for (const issue of issues) {
    const key = `${issue.issueType}:${issue.fieldName}`;
    const existing = issueMap.get(key) || [];
    existing.push(issue);
    issueMap.set(key, existing);
  }
  
  const recurring: RecurringIssue[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  issueMap.forEach((occurrences, _key) => {
    if (occurrences.length >= 2) {
      const sorted = occurrences.sort((a, b) => 
        a.occurredAt.localeCompare(b.occurredAt)
      );
      const lastOccurrence = sorted[sorted.length - 1].occurredAt;
      
      recurring.push({
        issueType: occurrences[0].issueType,
        fieldName: occurrences[0].fieldName,
        occurrenceCount: occurrences.length,
        firstOccurrence: sorted[0].occurredAt,
        lastOccurrence,
        isRecent: new Date(lastOccurrence) >= thirtyDaysAgo,
      });
    }
  });
  
  // Sort by occurrence count descending, then by type for stability
  return recurring
    .sort((a, b) => {
      if (b.occurrenceCount !== a.occurrenceCount) {
        return b.occurrenceCount - a.occurrenceCount;
      }
      return a.issueType.localeCompare(b.issueType);
    })
    .slice(0, 5);
}

/**
 * Determine trend direction
 */
function determineTrend(
  currentScore: number,
  previousScore: number
): 'improving' | 'stable' | 'declining' {
  const delta = currentScore - previousScore;
  if (delta > 5) return 'improving';
  if (delta < -5) return 'declining';
  return 'stable';
}

/**
 * Generate coaching recommendations
 */
function generateRecommendations(
  issues: IssueOccurrence[],
  recurringIssues: RecurringIssue[]
): CoachingRecommendation[] {
  const recommendations: CoachingRecommendation[] = [];
  
  // Check for S0 issues
  const s0Issues = issues.filter(i => i.severity === 'S0');
  if (s0Issues.length > 0) {
    const s0Types = Array.from(new Set(s0Issues.map(i => i.issueType))).sort();
    recommendations.push({
      id: uuidv4(),
      priority: 'high',
      category: 'quality',
      title: 'Address Critical Quality Issues',
      description: `${s0Issues.length} critical (S0) issues detected. Immediate attention required.`,
      relatedIssueTypes: s0Types,
      suggestedActions: [
        'Review all S0 issues with supervisor',
        'Complete refresher training on affected areas',
        'Implement pre-submission checklist',
      ],
    });
  }
  
  // Check for recurring issues
  const recentRecurring = recurringIssues.filter(r => r.isRecent);
  if (recentRecurring.length > 0) {
    const recurringTypes = Array.from(new Set(recentRecurring.map(r => r.issueType))).sort();
    recommendations.push({
      id: uuidv4(),
      priority: 'medium',
      category: 'training',
      title: 'Address Recurring Issue Patterns',
      description: `${recentRecurring.length} recurring issue patterns identified in the last 30 days.`,
      relatedIssueTypes: recurringTypes,
      suggestedActions: [
        'Review specific examples of recurring issues',
        'Identify root cause of repetition',
        'Complete targeted training modules',
      ],
    });
  }
  
  // Check for signature issues
  const signatureIssues = issues.filter(i => i.issueType === 'SIGNATURE_MISSING');
  if (signatureIssues.length >= 2) {
    recommendations.push({
      id: uuidv4(),
      priority: 'medium',
      category: 'process',
      title: 'Improve Signature Collection Process',
      description: 'Multiple missing signature issues detected.',
      relatedIssueTypes: ['SIGNATURE_MISSING'],
      suggestedActions: [
        'Review signature requirements with customer',
        'Use signature collection checklist',
        'Verify signature before leaving site',
      ],
    });
  }
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return recommendations.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.title.localeCompare(b.title);
  });
}

/**
 * Generate Fix Pack for an engineer
 */
export function generateFixPack(
  engineer: EngineerProfile,
  issues: IssueOccurrence[],
  validDays: number = 30
): FixPack {
  const now = new Date();
  const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  
  // Group issues by type + field
  const issueGroups = new Map<string, IssueOccurrence[]>();
  for (const issue of issues) {
    const key = `${issue.issueType}:${issue.fieldName}`;
    const existing = issueGroups.get(key) || [];
    existing.push(issue);
    issueGroups.set(key, existing);
  }
  
  // Create Fix Pack issues
  const fixPackIssues: FixPackIssue[] = [];
  issueGroups.forEach((occurrences, _key) => {
    const sorted = occurrences.sort((a, b) => 
      b.occurredAt.localeCompare(a.occurredAt)
    );
    
    // Get up to 3 examples
    const examples: FixPackExample[] = sorted.slice(0, 3).map(occ => ({
      documentId: occ.documentId,
      date: occ.occurredAt.split('T')[0],
      description: `Issue on document ${occ.documentId}`,
      whatWentWrong: getWhatWentWrong(occ.issueType),
      correctApproach: getCorrectApproach(occ.issueType),
    }));
    
    fixPackIssues.push({
      issueType: occurrences[0].issueType,
      fieldName: occurrences[0].fieldName,
      occurrenceCount: occurrences.length,
      severity: getMostSevereSeverity(occurrences),
      examples,
      correctProcedure: getCorrectProcedure(occurrences[0].issueType),
    });
  });
  
  // Sort by severity then occurrence count
  const severityOrder = { S0: 0, S1: 1, S2: 2, S3: 3 };
  fixPackIssues.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.occurrenceCount - a.occurrenceCount;
  });
  
  // Get relevant training modules
  const issueTypes = Array.from(new Set(issues.map(i => i.issueType)));
  const allModules = getDefaultTrainingModules();
  const relevantModules = allModules.filter(m =>
    m.relatedIssueTypes.some(t => issueTypes.includes(t))
  );
  
  // Calculate summary
  const criticalIssues = issues.filter(i => i.severity === 'S0').length;
  const focusAreas = Array.from(new Set(fixPackIssues.slice(0, 3).map(i => i.issueType)));
  
  return {
    id: uuidv4(),
    engineerId: engineer.id,
    engineerName: engineer.name,
    generatedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    summary: {
      totalIssues: issues.length,
      criticalIssues,
      focusAreas,
    },
    issues: fixPackIssues,
    trainingModules: relevantModules,
    acknowledgment: {
      required: criticalIssues > 0,
    },
  };
}

/**
 * Get most severe severity from a list
 */
function getMostSevereSeverity(
  occurrences: IssueOccurrence[]
): 'S0' | 'S1' | 'S2' | 'S3' {
  const severityOrder = { S0: 0, S1: 1, S2: 2, S3: 3 };
  let mostSevere: 'S0' | 'S1' | 'S2' | 'S3' = 'S3';
  
  for (const occ of occurrences) {
    if (severityOrder[occ.severity] < severityOrder[mostSevere]) {
      mostSevere = occ.severity;
    }
  }
  
  return mostSevere;
}

/**
 * Get what went wrong description
 */
function getWhatWentWrong(issueType: IssueType): string {
  const descriptions: Record<IssueType, string> = {
    MISSING_FIELD: 'Required field was not completed on the job sheet',
    INVALID_FORMAT: 'Field value did not match the required format',
    OUT_OF_POLICY: 'Action or value was outside company policy guidelines',
    SIGNATURE_MISSING: 'Customer signature was not obtained',
    DATE_MISMATCH: 'Date recorded did not match actual service date',
    PHOTO_QUALITY: 'Photo documentation did not meet quality standards',
    INCOMPLETE_CHECKLIST: 'Checklist items were not fully completed',
    OTHER: 'Issue detected during quality review',
  };
  return descriptions[issueType];
}

/**
 * Get correct approach description
 */
function getCorrectApproach(issueType: IssueType): string {
  const approaches: Record<IssueType, string> = {
    MISSING_FIELD: 'Complete all required fields before submission',
    INVALID_FORMAT: 'Follow the specified format exactly (e.g., YYYY-MM-DD for dates)',
    OUT_OF_POLICY: 'Review policy guidelines before taking action',
    SIGNATURE_MISSING: 'Obtain customer signature before leaving the site',
    DATE_MISMATCH: 'Record the actual date of service, not the submission date',
    PHOTO_QUALITY: 'Ensure photos are clear, well-lit, and show the required details',
    INCOMPLETE_CHECKLIST: 'Complete every checklist item and mark appropriately',
    OTHER: 'Follow standard operating procedures',
  };
  return approaches[issueType];
}

/**
 * Get correct procedure description
 */
function getCorrectProcedure(issueType: IssueType): string {
  const procedures: Record<IssueType, string> = {
    MISSING_FIELD: '1. Review all required fields before starting\n2. Complete each field as work progresses\n3. Verify all fields are complete before submission',
    INVALID_FORMAT: '1. Check the required format for each field\n2. Use the correct format (dates: YYYY-MM-DD, times: HH:MM)\n3. Validate format before submission',
    OUT_OF_POLICY: '1. Review relevant policy before starting work\n2. Consult supervisor if unsure\n3. Document any exceptions with approval',
    SIGNATURE_MISSING: '1. Explain signature requirement to customer\n2. Obtain signature before leaving\n3. If customer refuses, document reason and get supervisor approval',
    DATE_MISMATCH: '1. Record date at time of service\n2. Use actual service date, not submission date\n3. Verify date accuracy before submission',
    PHOTO_QUALITY: '1. Ensure adequate lighting\n2. Hold camera steady\n3. Verify photo clarity before saving\n4. Retake if blurry or unclear',
    INCOMPLETE_CHECKLIST: '1. Review all checklist items at start\n2. Complete each item as work progresses\n3. Mark N/A for non-applicable items with reason\n4. Verify all items addressed before submission',
    OTHER: '1. Follow standard operating procedures\n2. Consult documentation if unsure\n3. Ask supervisor for guidance',
  };
  return procedures[issueType];
}

/**
 * Calculate trend analytics
 */
export function calculateTrendAnalytics(
  issues: IssueOccurrence[],
  documents: { id: string; processedAt: string }[],
  periodStart: string,
  periodEnd: string,
  granularity: 'day' | 'week' | 'month' = 'week'
): TrendAnalytics {
  // Generate time series
  const timeSeries = generateTimeSeries(issues, documents, periodStart, periodEnd, granularity);
  
  // Calculate overall trend
  const overallTrend = calculateOverallTrend(timeSeries);
  
  // Calculate issue type trends
  const issueTypeTrends = calculateIssueTypeTrends(issues, periodStart, periodEnd);
  
  // Calculate engineer trends (mock data for now)
  const topImproving: EngineerTrendSummary[] = [];
  const needingAttention: EngineerTrendSummary[] = [];
  
  return {
    period: {
      start: periodStart,
      end: periodEnd,
      granularity,
    },
    overallTrend,
    timeSeries,
    issueTypeTrends,
    topImproving,
    needingAttention,
  };
}

/**
 * Generate time series data
 */
function generateTimeSeries(
  issues: IssueOccurrence[],
  documents: { id: string; processedAt: string }[],
  periodStart: string,
  periodEnd: string,
  granularity: 'day' | 'week' | 'month'
): TrendDataPoint[] {
  const points: TrendDataPoint[] = [];
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  
  // Determine interval
  let intervalMs: number;
  switch (granularity) {
    case 'day':
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case 'week':
      intervalMs = 7 * 24 * 60 * 60 * 1000;
      break;
    case 'month':
      intervalMs = 30 * 24 * 60 * 60 * 1000;
      break;
  }
  
  let current = start;
  while (current <= end) {
    const periodEnd = new Date(current.getTime() + intervalMs);
    const periodStartStr = current.toISOString();
    const periodEndStr = periodEnd.toISOString();
    
    const periodDocs = documents.filter(
      d => d.processedAt >= periodStartStr && d.processedAt < periodEndStr
    );
    const periodIssues = issues.filter(
      i => i.occurredAt >= periodStartStr && i.occurredAt < periodEndStr
    );
    
    const documentsProcessed = periodDocs.length;
    const issueCount = periodIssues.length;
    const issueRate = documentsProcessed > 0 ? issueCount / documentsProcessed : 0;
    
    // Calculate avg score (simplified)
    const avgScore = documentsProcessed > 0 
      ? Math.max(0, 100 - (issueCount / documentsProcessed) * 20)
      : 100;
    
    points.push({
      date: current.toISOString().split('T')[0],
      documentsProcessed,
      issueCount,
      issueRate: Math.round(issueRate * 100) / 100,
      avgScore: Math.round(avgScore),
    });
    
    current = periodEnd;
  }
  
  return points;
}

/**
 * Calculate overall trend
 */
function calculateOverallTrend(
  timeSeries: TrendDataPoint[]
): { direction: 'improving' | 'stable' | 'declining'; changePercent: number } {
  if (timeSeries.length < 2) {
    return { direction: 'stable', changePercent: 0 };
  }
  
  const firstHalf = timeSeries.slice(0, Math.floor(timeSeries.length / 2));
  const secondHalf = timeSeries.slice(Math.floor(timeSeries.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, p) => sum + p.avgScore, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, p) => sum + p.avgScore, 0) / secondHalf.length;
  
  const changePercent = firstAvg > 0 
    ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100)
    : 0;
  
  let direction: 'improving' | 'stable' | 'declining';
  if (changePercent > 5) {
    direction = 'improving';
  } else if (changePercent < -5) {
    direction = 'declining';
  } else {
    direction = 'stable';
  }
  
  return { direction, changePercent };
}

/**
 * Calculate issue type trends
 */
function calculateIssueTypeTrends(
  issues: IssueOccurrence[],
  periodStart: string,
  periodEnd: string
): IssueTypeTrend[] {
  const midpoint = new Date(
    (new Date(periodStart).getTime() + new Date(periodEnd).getTime()) / 2
  ).toISOString();
  
  const firstHalf = issues.filter(i => i.occurredAt < midpoint);
  const secondHalf = issues.filter(i => i.occurredAt >= midpoint);
  
  const issueTypes: IssueType[] = [
    'MISSING_FIELD',
    'INVALID_FORMAT',
    'OUT_OF_POLICY',
    'SIGNATURE_MISSING',
    'DATE_MISMATCH',
    'PHOTO_QUALITY',
    'INCOMPLETE_CHECKLIST',
    'OTHER',
  ];
  
  const trends: IssueTypeTrend[] = [];
  
  for (const issueType of issueTypes) {
    const previousCount = firstHalf.filter(i => i.issueType === issueType).length;
    const currentCount = secondHalf.filter(i => i.issueType === issueType).length;
    
    const changePercent = previousCount > 0
      ? Math.round(((currentCount - previousCount) / previousCount) * 100)
      : (currentCount > 0 ? 100 : 0);
    
    let trend: 'increasing' | 'stable' | 'decreasing';
    if (changePercent > 10) {
      trend = 'increasing';
    } else if (changePercent < -10) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }
    
    if (previousCount > 0 || currentCount > 0) {
      trends.push({
        issueType,
        currentCount,
        previousCount,
        changePercent,
        trend,
      });
    }
  }
  
  // Sort by current count descending
  return trends.sort((a, b) => b.currentCount - a.currentCount);
}

/**
 * Export Fix Pack to JSON
 */
export function exportFixPackToJson(fixPack: FixPack): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    type: 'fix-pack',
    ...fixPack,
  }, null, 2);
}

/**
 * Export score card to JSON
 */
export function exportScoreCardToJson(scoreCard: EngineerScoreCard): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    type: 'score-card',
    ...scoreCard,
  }, null, 2);
}
