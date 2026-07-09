/**
 * Exception Management — pure aggregation (PR-17)
 *
 * Hold-queue SLA timers, ageing buckets, per-rule overturn rates, recurrence.
 * Fixtures/mocks only in contract tests — no live OCR/LLM.
 */

import {
  AGEING_BUCKETS,
  DEFAULT_SLA_HOURS,
  type AgeingBucketId,
  type AgeingBucketMetrics,
  type ExceptionManagementSummary,
  type HoldItemSlaStatus,
  type HoldQueueItemRow,
  type HoldQueueSlaSummary,
  type OverturnAnalyticsSummary,
  type OverturnFindingRow,
  type RecurrenceCluster,
  type RecurrenceSummary,
  type RuleOverturnMetrics,
  type SlaSeverity,
} from "./types";

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function toMs(value: Date | string): number {
  return new Date(value).getTime();
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function resolveExceptionPeriod(
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const fallback = defaultPeriod();
  return {
    start: startDate ? new Date(startDate).toISOString() : fallback.start,
    end: endDate ? new Date(endDate).toISOString() : fallback.end,
  };
}

export function hoursBetween(from: Date | string, to: Date | string): number {
  const ms = toMs(to) - toMs(from);
  return Math.max(0, ms / (60 * 60 * 1000));
}

export function classifyAgeingBucket(ageHours: number): AgeingBucketId {
  for (const bucket of AGEING_BUCKETS) {
    if (bucket.maxHours == null) {
      if (ageHours >= bucket.minHours) return bucket.id;
    } else if (ageHours >= bucket.minHours && ageHours < bucket.maxHours) {
      return bucket.id;
    }
  }
  return "over_7d";
}

export function slaHoursForSeverity(
  severity: SlaSeverity,
  overrides?: Partial<Record<SlaSeverity, number>>
): number {
  const table = { ...DEFAULT_SLA_HOURS, ...overrides };
  return table[severity] ?? table.unknown;
}

function emptyAgeingBuckets(): AgeingBucketMetrics[] {
  return AGEING_BUCKETS.map(b => ({
    id: b.id,
    label: b.label,
    count: 0,
    breachedCount: 0,
    jobSheetIds: [],
  }));
}

/**
 * Compute SLA + ageing status for every hold-queue item.
 */
export function buildHoldQueueSlaSummary(input: {
  items: HoldQueueItemRow[];
  asOf?: Date | string;
  slaHoursBySeverity?: Partial<Record<SlaSeverity, number>>;
}): HoldQueueSlaSummary {
  const asOf = input.asOf ? new Date(input.asOf) : new Date();
  const asOfIso = asOf.toISOString();
  const slaHoursBySeverity: Record<SlaSeverity, number> = {
    ...DEFAULT_SLA_HOURS,
    ...input.slaHoursBySeverity,
  };

  const ageing = emptyAgeingBuckets();
  const ageingIndex = new Map(ageing.map(b => [b.id, b]));

  const items: HoldItemSlaStatus[] = input.items.map(row => {
    const ageHours = hoursBetween(row.queuedAt, asOf);
    const ageingBucket = classifyAgeingBucket(ageHours);
    const slaHours = slaHoursForSeverity(
      row.highestSeverity,
      input.slaHoursBySeverity
    );
    const deadlineMs = toMs(row.queuedAt) + slaHours * 60 * 60 * 1000;
    const hoursUntilBreach = (deadlineMs - asOf.getTime()) / (60 * 60 * 1000);
    const breached = hoursUntilBreach < 0;

    const bucket = ageingIndex.get(ageingBucket)!;
    bucket.count++;
    bucket.jobSheetIds.push(row.jobSheetId);
    if (breached) bucket.breachedCount++;

    return {
      jobSheetId: row.jobSheetId,
      referenceNumber: row.referenceNumber,
      siteInfo: row.siteInfo,
      queuedAt: toIso(row.queuedAt),
      ageHours: Math.round(ageHours * 100) / 100,
      ageingBucket,
      highestSeverity: row.highestSeverity,
      slaHours,
      slaDeadline: new Date(deadlineMs).toISOString(),
      breached,
      hoursUntilBreach: Math.round(hoursUntilBreach * 100) / 100,
      openFindingCount: row.openFindingCount,
    };
  });

  // Worst first: breached, then oldest
  items.sort((a, b) => {
    if (a.breached !== b.breached) return a.breached ? -1 : 1;
    return b.ageHours - a.ageHours;
  });

  const breachedCount = items.filter(i => i.breached).length;
  const totalOnHold = items.length;

  return {
    asOf: asOfIso,
    totalOnHold,
    breachedCount,
    breachRate: totalOnHold > 0 ? breachedCount / totalOnHold : 0,
    ageing,
    items,
    slaHoursBySeverity,
  };
}

function ruleKey(row: OverturnFindingRow): string {
  if (row.ruleId && row.ruleId.trim().length > 0) {
    return `${row.ruleId}|${row.reasonCode}|${row.severity}`;
  }
  return `reason:${row.reasonCode}|${row.severity}`;
}

function inPeriod(value: Date | string, start: string, end: string): boolean {
  const t = toMs(value);
  return t >= toMs(start) && t <= toMs(end);
}

/**
 * Per-rule overturn / waiver rates from resolved findings.
 * Overturn = resolutionStatus === "overridden".
 * Human reversal = overridden | waived (automated finding not upheld).
 */
export function buildOverturnAnalytics(input: {
  findings: OverturnFindingRow[];
  startDate?: string;
  endDate?: string;
  worstLimit?: number;
}): OverturnAnalyticsSummary {
  const period = resolveExceptionPeriod(input.startDate, input.endDate);
  const worstLimit = input.worstLimit ?? 10;

  const inWindow = input.findings.filter(f =>
    inPeriod(f.occurredAt, period.start, period.end)
  );

  const byRule = new Map<
    string,
    {
      ruleId: string | null;
      reasonCode: string;
      severity: string;
      total: number;
      overturned: number;
      waived: number;
      approved: number;
      open: number;
      sampleIds: number[];
    }
  >();

  let overturnedCount = 0;
  let waivedCount = 0;

  for (const f of inWindow) {
    const key = ruleKey(f);
    let entry = byRule.get(key);
    if (!entry) {
      entry = {
        ruleId: f.ruleId?.trim() || null,
        reasonCode: f.reasonCode,
        severity: f.severity,
        total: 0,
        overturned: 0,
        waived: 0,
        approved: 0,
        open: 0,
        sampleIds: [],
      };
      byRule.set(key, entry);
    }
    entry.total++;
    if (entry.sampleIds.length < 5) entry.sampleIds.push(f.findingId);

    switch (f.resolutionStatus) {
      case "overridden":
        entry.overturned++;
        overturnedCount++;
        break;
      case "waived":
        entry.waived++;
        waivedCount++;
        break;
      case "approved":
        entry.approved++;
        break;
      case "open":
      case "flagged":
        entry.open++;
        break;
    }
  }

  const rules: RuleOverturnMetrics[] = Array.from(byRule.entries()).map(
    ([key, e]) => {
      const resolved = e.overturned + e.waived + e.approved;
      const humanReversal = e.overturned + e.waived;
      return {
        ruleKey: key,
        ruleId: e.ruleId,
        reasonCode: e.reasonCode,
        severity: e.severity,
        totalFindings: e.total,
        overturnedCount: e.overturned,
        waivedCount: e.waived,
        approvedCount: e.approved,
        openCount: e.open,
        overturnRate: resolved > 0 ? e.overturned / resolved : null,
        humanReversalCount: humanReversal,
        reversalRate: resolved > 0 ? humanReversal / resolved : null,
        sampleFindingIds: e.sampleIds,
      };
    }
  );

  rules.sort((a, b) => {
    const ar = a.overturnRate ?? -1;
    const br = b.overturnRate ?? -1;
    if (br !== ar) return br - ar;
    return b.overturnedCount - a.overturnedCount;
  });

  const resolvedTotal =
    overturnedCount +
    waivedCount +
    rules.reduce((s, r) => s + r.approvedCount, 0);

  return {
    period,
    totalFindings: inWindow.length,
    overturnedCount,
    waivedCount,
    overallOverturnRate:
      resolvedTotal > 0 ? overturnedCount / resolvedTotal : null,
    byRule: rules,
    worstRules: rules
      .filter(r => (r.overturnRate ?? 0) > 0 || r.overturnedCount > 0)
      .slice(0, worstLimit),
  };
}

/**
 * Recurrence: same rule+reason+site appearing repeatedly in the window.
 */
export function buildRecurrenceSummary(input: {
  findings: OverturnFindingRow[];
  startDate?: string;
  endDate?: string;
  threshold?: number;
  limit?: number;
}): RecurrenceSummary {
  const period = resolveExceptionPeriod(input.startDate, input.endDate);
  const threshold = input.threshold ?? 3;
  const limit = input.limit ?? 20;

  const inWindow = input.findings.filter(f =>
    inPeriod(f.occurredAt, period.start, period.end)
  );

  const clusters = new Map<
    string,
    {
      ruleId: string | null;
      reasonCode: string;
      site: string;
      findingIds: number[];
      jobSheetIds: Set<number>;
    }
  >();

  for (const f of inWindow) {
    const site =
      f.siteInfo && f.siteInfo.trim().length > 0
        ? f.siteInfo.trim()
        : "Unknown";
    const rulePart = f.ruleId?.trim() || f.reasonCode;
    const key = `${rulePart}|${f.reasonCode}|${site}`;
    let c = clusters.get(key);
    if (!c) {
      c = {
        ruleId: f.ruleId?.trim() || null,
        reasonCode: f.reasonCode,
        site,
        findingIds: [],
        jobSheetIds: new Set(),
      };
      clusters.set(key, c);
    }
    c.findingIds.push(f.findingId);
    c.jobSheetIds.add(f.jobSheetId);
  }

  const result: RecurrenceCluster[] = Array.from(clusters.entries())
    .map(([key, c]) => ({
      key,
      ruleId: c.ruleId,
      reasonCode: c.reasonCode,
      site: c.site,
      occurrenceCount: c.findingIds.length,
      distinctJobSheets: c.jobSheetIds.size,
      findingIds: c.findingIds.slice(0, 10),
      jobSheetIds: Array.from(c.jobSheetIds).slice(0, 10),
    }))
    .filter(c => c.occurrenceCount >= threshold)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, limit);

  return {
    period,
    threshold,
    clusterCount: result.length,
    clusters: result,
  };
}

export function buildExceptionManagementSummary(input: {
  holdItems: HoldQueueItemRow[];
  findings: OverturnFindingRow[];
  asOf?: Date | string;
  startDate?: string;
  endDate?: string;
  slaHoursBySeverity?: Partial<Record<SlaSeverity, number>>;
  recurrenceThreshold?: number;
}): ExceptionManagementSummary {
  return {
    holdQueue: buildHoldQueueSlaSummary({
      items: input.holdItems,
      asOf: input.asOf,
      slaHoursBySeverity: input.slaHoursBySeverity,
    }),
    overturns: buildOverturnAnalytics({
      findings: input.findings,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
    recurrence: buildRecurrenceSummary({
      findings: input.findings,
      startDate: input.startDate,
      endDate: input.endDate,
      threshold: input.recurrenceThreshold,
    }),
  };
}
