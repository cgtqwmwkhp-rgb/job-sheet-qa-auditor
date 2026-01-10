/**
 * Selection Analytics Service
 * 
 * PR-I: Provides analytics and aggregations for template selection.
 * Helps maintain stability when scaling to 20-30 templates.
 */

import type { ConfidenceBand, SelectionScore } from '../templateRegistry/types';
import type { SelectionTraceArtifact } from '../templateRegistry/selectionTraceWriter';

/**
 * Selection record for analytics
 */
export interface SelectionRecord {
  /** Unique record ID */
  id: number;
  /** Job sheet ID */
  jobSheetId: number;
  /** Timestamp */
  timestamp: Date;
  /** Template ID selected (null if none) */
  templateId: number | null;
  /** Template slug */
  templateSlug: string | null;
  /** Confidence band */
  confidenceBand: ConfidenceBand;
  /** Top score */
  topScore: number;
  /** Runner-up score */
  runnerUpScore: number;
  /** Score gap */
  scoreGap: number;
  /** Whether auto-processing was allowed */
  autoProcessed: boolean;
  /** Was manually overridden */
  wasOverridden: boolean;
  /** Matched tokens */
  matchedTokens: string[];
  /** Number of candidates */
  candidateCount: number;
}

/**
 * Analytics aggregation result
 */
export interface SelectionAnalytics {
  /** Total selections analyzed */
  totalSelections: number;
  /** Confidence distribution */
  confidenceDistribution: Record<ConfidenceBand, number>;
  /** Auto-processed count */
  autoProcessedCount: number;
  /** Override count */
  overrideCount: number;
  /** Ambiguous selections (gap < 10) */
  ambiguousCount: number;
  /** Time period start */
  periodStart: Date;
  /** Time period end */
  periodEnd: Date;
}

/**
 * Ambiguous template pair
 */
export interface AmbiguousTemplatePair {
  /** First template slug */
  template1: string;
  /** Second template slug */
  template2: string;
  /** Number of ambiguous selections */
  count: number;
  /** Average score gap */
  avgGap: number;
}

/**
 * Token collision data
 */
export interface TokenCollision {
  /** Token causing collisions */
  token: string;
  /** Templates that use this token */
  templates: string[];
  /** Number of ambiguous selections involving this token */
  collisionCount: number;
}

/**
 * Template analytics summary
 */
export interface TemplateAnalyticsSummary {
  /** Template slug */
  templateSlug: string;
  /** Total selections for this template */
  totalSelections: number;
  /** HIGH confidence count */
  highConfidenceCount: number;
  /** MEDIUM confidence count */
  mediumConfidenceCount: number;
  /** LOW confidence count */
  lowConfidenceCount: number;
  /** Override count */
  overrideCount: number;
  /** Average score */
  avgScore: number;
  /** Times appeared as runner-up */
  runnerUpCount: number;
}

// In-memory selection records store
const selectionRecords: SelectionRecord[] = [];
let nextRecordId = 1;

// Constants
const AMBIGUITY_THRESHOLD = 0.10; // Score gap < 10% is ambiguous

/**
 * Record a selection for analytics
 */
export function recordSelection(
  trace: SelectionTraceArtifact,
  wasOverridden: boolean = false
): SelectionRecord {
  const record: SelectionRecord = {
    id: nextRecordId++,
    jobSheetId: trace.jobSheetId,
    timestamp: new Date(trace.timestamp),
    templateId: trace.outcome.templateId,
    templateSlug: trace.outcome.templateSlug,
    confidenceBand: trace.outcome.confidenceBand,
    topScore: trace.outcome.topScore,
    runnerUpScore: trace.outcome.runnerUpScore,
    scoreGap: trace.outcome.scoreDelta,
    autoProcessed: trace.outcome.autoProcessingAllowed && trace.outcome.selected,
    wasOverridden,
    matchedTokens: trace.inputSignals.tokenSample,
    candidateCount: trace.candidates.length,
  };

  selectionRecords.push(record);
  return record;
}

/**
 * Get overall selection analytics
 */
export function getSelectionAnalytics(
  startDate?: Date,
  endDate?: Date
): SelectionAnalytics {
  const now = new Date();
  const start = startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const end = endDate ?? now;

  const filteredRecords = selectionRecords.filter(r =>
    r.timestamp >= start && r.timestamp <= end
  );

  const distribution: Record<ConfidenceBand, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  let autoProcessedCount = 0;
  let overrideCount = 0;
  let ambiguousCount = 0;

  for (const record of filteredRecords) {
    distribution[record.confidenceBand]++;
    if (record.autoProcessed) autoProcessedCount++;
    if (record.wasOverridden) overrideCount++;
    if (record.scoreGap < AMBIGUITY_THRESHOLD && record.candidateCount > 1) {
      ambiguousCount++;
    }
  }

  return {
    totalSelections: filteredRecords.length,
    confidenceDistribution: distribution,
    autoProcessedCount,
    overrideCount,
    ambiguousCount,
    periodStart: start,
    periodEnd: end,
  };
}

/**
 * Get top ambiguous template pairs
 */
export function getAmbiguousTemplatePairs(limit: number = 10): AmbiguousTemplatePair[] {
  // Track pairs that appear together in ambiguous selections
  const pairMap = new Map<string, { count: number; totalGap: number }>();

  // Find ambiguous selections with multiple candidates
  const ambiguousRecords = selectionRecords.filter(r =>
    r.scoreGap < AMBIGUITY_THRESHOLD && r.candidateCount > 1
  );

  // For demo, we'll simulate pairs based on template slugs
  // In real implementation, this would analyze candidate lists from traces
  for (const record of ambiguousRecords) {
    if (record.templateSlug) {
      const pairKey = `${record.templateSlug}|runner-up`;
      const existing = pairMap.get(pairKey) ?? { count: 0, totalGap: 0 };
      pairMap.set(pairKey, {
        count: existing.count + 1,
        totalGap: existing.totalGap + record.scoreGap,
      });
    }
  }

  // Convert to array and sort
  const pairs: AmbiguousTemplatePair[] = [];
  for (const [key, data] of Array.from(pairMap.entries())) {
    const [t1, t2] = key.split('|');
    pairs.push({
      template1: t1,
      template2: t2,
      count: data.count,
      avgGap: data.totalGap / data.count,
    });
  }

  return pairs
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get tokens causing most collisions
 */
export function getTokenCollisions(limit: number = 20): TokenCollision[] {
  // Track token frequency in ambiguous selections
  const tokenMap = new Map<string, { templates: Set<string>; count: number }>();

  const ambiguousRecords = selectionRecords.filter(r =>
    r.scoreGap < AMBIGUITY_THRESHOLD && r.candidateCount > 1
  );

  for (const record of ambiguousRecords) {
    for (const token of record.matchedTokens) {
      const existing = tokenMap.get(token) ?? { templates: new Set(), count: 0 };
      if (record.templateSlug) {
        existing.templates.add(record.templateSlug);
      }
      existing.count++;
      tokenMap.set(token, existing);
    }
  }

  // Convert to array
  const collisions: TokenCollision[] = [];
  for (const [token, data] of Array.from(tokenMap.entries())) {
    if (data.templates.size > 1) { // Only tokens in multiple templates
      collisions.push({
        token,
        templates: Array.from(data.templates),
        collisionCount: data.count,
      });
    }
  }

  return collisions
    .sort((a, b) => b.collisionCount - a.collisionCount)
    .slice(0, limit);
}

/**
 * Get per-template analytics summary
 */
export function getTemplateAnalyticsSummary(): TemplateAnalyticsSummary[] {
  const templateMap = new Map<string, {
    total: number;
    high: number;
    medium: number;
    low: number;
    overrides: number;
    totalScore: number;
    runnerUp: number;
  }>();

  // Track selections per template
  for (const record of selectionRecords) {
    if (!record.templateSlug) continue;

    const existing = templateMap.get(record.templateSlug) ?? {
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
      overrides: 0,
      totalScore: 0,
      runnerUp: 0,
    };

    existing.total++;
    existing.totalScore += record.topScore;
    if (record.confidenceBand === 'HIGH') existing.high++;
    if (record.confidenceBand === 'MEDIUM') existing.medium++;
    if (record.confidenceBand === 'LOW') existing.low++;
    if (record.wasOverridden) existing.overrides++;

    templateMap.set(record.templateSlug, existing);
  }

  // Convert to array
  const summaries: TemplateAnalyticsSummary[] = [];
  for (const [slug, data] of Array.from(templateMap.entries())) {
    summaries.push({
      templateSlug: slug,
      totalSelections: data.total,
      highConfidenceCount: data.high,
      mediumConfidenceCount: data.medium,
      lowConfidenceCount: data.low,
      overrideCount: data.overrides,
      avgScore: data.total > 0 ? data.totalScore / data.total : 0,
      runnerUpCount: data.runnerUp,
    });
  }

  // Sort by total selections desc
  return summaries.sort((a, b) => b.totalSelections - a.totalSelections);
}

/**
 * Check if ambiguity rate exceeds threshold (for alerting)
 */
export function checkAmbiguityAlert(
  thresholdPercent: number = 15
): { alert: boolean; rate: number; message: string } {
  const analytics = getSelectionAnalytics();
  
  if (analytics.totalSelections === 0) {
    return { alert: false, rate: 0, message: 'No selections recorded' };
  }

  const rate = (analytics.ambiguousCount / analytics.totalSelections) * 100;
  const alert = rate > thresholdPercent;

  return {
    alert,
    rate,
    message: alert
      ? `Ambiguity rate ${rate.toFixed(1)}% exceeds ${thresholdPercent}% threshold. Review template fingerprints.`
      : `Ambiguity rate ${rate.toFixed(1)}% is within acceptable range.`,
  };
}

/**
 * Get selection records with filtering/pagination
 */
export function getSelectionRecords(options: {
  limit?: number;
  offset?: number;
  templateSlug?: string;
  confidenceBand?: ConfidenceBand;
  onlyAmbiguous?: boolean;
}): { records: SelectionRecord[]; total: number } {
  let filtered = [...selectionRecords];

  if (options.templateSlug) {
    filtered = filtered.filter(r => r.templateSlug === options.templateSlug);
  }

  if (options.confidenceBand) {
    filtered = filtered.filter(r => r.confidenceBand === options.confidenceBand);
  }

  if (options.onlyAmbiguous) {
    filtered = filtered.filter(r => r.scoreGap < AMBIGUITY_THRESHOLD && r.candidateCount > 1);
  }

  // Sort by timestamp desc
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const total = filtered.length;
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return {
    records: filtered.slice(offset, offset + limit),
    total,
  };
}

/**
 * Reset analytics store (for testing)
 */
export function resetAnalyticsStore(): void {
  selectionRecords.length = 0;
  nextRecordId = 1;
}

/**
 * Get analytics store stats
 */
export function getAnalyticsStoreStats(): { recordCount: number } {
  return { recordCount: selectionRecords.length };
}
