/**
 * Exception Management types (PR-17)
 *
 * Review SLAs, hold-queue ageing, recurrence, and per-rule overturn rates.
 */

export type AgeingBucketId =
  | "under_4h"
  | "4h_to_24h"
  | "1d_to_3d"
  | "3d_to_7d"
  | "over_7d";

export type SlaSeverity = "S0" | "S1" | "S2" | "S3" | "unknown";

/** Hours until SLA breach by highest open finding severity on the hold item. */
export const DEFAULT_SLA_HOURS: Record<SlaSeverity, number> = {
  S0: 4,
  S1: 8,
  S2: 24,
  S3: 72,
  unknown: 48,
};

export const AGEING_BUCKETS: Array<{
  id: AgeingBucketId;
  label: string;
  minHours: number;
  maxHours: number | null;
}> = [
  { id: "under_4h", label: "< 4 hours", minHours: 0, maxHours: 4 },
  { id: "4h_to_24h", label: "4–24 hours", minHours: 4, maxHours: 24 },
  { id: "1d_to_3d", label: "1–3 days", minHours: 24, maxHours: 72 },
  { id: "3d_to_7d", label: "3–7 days", minHours: 72, maxHours: 168 },
  { id: "over_7d", label: "> 7 days", minHours: 168, maxHours: null },
];

export interface HoldQueueItemRow {
  jobSheetId: number;
  referenceNumber: string | null;
  siteInfo: string | null;
  /** When the sheet entered review (jobSheets.createdAt / updatedAt). */
  queuedAt: Date | string;
  /** Highest open finding severity, if known. */
  highestSeverity: SlaSeverity;
  openFindingCount: number;
  technicianId: number | null;
}

export interface OverturnFindingRow {
  findingId: number;
  jobSheetId: number;
  ruleId: string | null;
  reasonCode: string;
  severity: "S0" | "S1" | "S2" | "S3";
  fieldName: string;
  resolutionStatus: "open" | "waived" | "overridden" | "flagged" | "approved";
  siteInfo: string | null;
  occurredAt: Date | string;
  resolvedAt: Date | string | null;
}

export interface AgeingBucketMetrics {
  id: AgeingBucketId;
  label: string;
  count: number;
  breachedCount: number;
  jobSheetIds: number[];
}

export interface HoldItemSlaStatus {
  jobSheetId: number;
  referenceNumber: string | null;
  siteInfo: string | null;
  queuedAt: string;
  ageHours: number;
  ageingBucket: AgeingBucketId;
  highestSeverity: SlaSeverity;
  slaHours: number;
  slaDeadline: string;
  breached: boolean;
  hoursUntilBreach: number;
  openFindingCount: number;
}

export interface HoldQueueSlaSummary {
  asOf: string;
  totalOnHold: number;
  breachedCount: number;
  breachRate: number;
  ageing: AgeingBucketMetrics[];
  items: HoldItemSlaStatus[];
  slaHoursBySeverity: Record<SlaSeverity, number>;
}

export interface RuleOverturnMetrics {
  ruleKey: string;
  ruleId: string | null;
  reasonCode: string;
  severity: string;
  totalFindings: number;
  overturnedCount: number;
  waivedCount: number;
  approvedCount: number;
  openCount: number;
  /** overturned / (overturned + approved + waived) when resolved > 0 */
  overturnRate: number | null;
  /** Human-actioned resolutions that reverse the automated finding */
  humanReversalCount: number;
  reversalRate: number | null;
  sampleFindingIds: number[];
}

export interface OverturnAnalyticsSummary {
  period: { start: string; end: string };
  totalFindings: number;
  overturnedCount: number;
  waivedCount: number;
  overallOverturnRate: number | null;
  byRule: RuleOverturnMetrics[];
  worstRules: RuleOverturnMetrics[];
}

export interface RecurrenceCluster {
  key: string;
  ruleId: string | null;
  reasonCode: string;
  site: string;
  occurrenceCount: number;
  distinctJobSheets: number;
  findingIds: number[];
  jobSheetIds: number[];
}

export interface RecurrenceSummary {
  period: { start: string; end: string };
  /** Minimum occurrences to count as recurrence */
  threshold: number;
  clusterCount: number;
  clusters: RecurrenceCluster[];
}

export interface ExceptionManagementSummary {
  holdQueue: HoldQueueSlaSummary;
  overturns: OverturnAnalyticsSummary;
  recurrence: RecurrenceSummary;
}
