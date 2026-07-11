/**
 * Overturn Metrics Service
 *
 * Pure helpers for computing how often human reviewers override or correct
 * AI-generated QA findings. Northern-star trust calibration metric.
 *
 * Feature-flagged via FEATURE_OVERTURN_METRICS (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_OVERTURN_METRICS";

export * from "./types";

import type {
  AuditActionLogEntry,
  OverturnBreakdown,
  OverturnCategory,
  OverturnMetricsSummary,
} from "./types";

export function isOverturnMetricsEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

const FINDING_ACTION_PREFIX = "FINDING_";

const OVERTURN_ACTION_SUFFIXES = new Set(["OVERRIDE", "WAIVE"]);
const AGREEMENT_ACTION_SUFFIXES = new Set(["APPROVE"]);
const FIELD_CORRECTION_ACTION = "FIELD_CORRECTION";

function isFindingAction(action: string): boolean {
  return action.startsWith(FINDING_ACTION_PREFIX);
}

function isOverturnAction(action: string): boolean {
  if (!isFindingAction(action)) return false;
  const suffix = action.slice(FINDING_ACTION_PREFIX.length);
  return OVERTURN_ACTION_SUFFIXES.has(suffix);
}

function isAgreementAction(action: string): boolean {
  if (!isFindingAction(action)) return false;
  const suffix = action.slice(FINDING_ACTION_PREFIX.length);
  return AGREEMENT_ACTION_SUFFIXES.has(suffix);
}

function isFieldCorrection(action: string): boolean {
  return action === FIELD_CORRECTION_ACTION;
}

function classifyOverturnCategory(action: string): OverturnCategory | null {
  if (action === FIELD_CORRECTION_ACTION) return "field_correction";
  if (!isFindingAction(action)) return null;
  const suffix = action.slice(FINDING_ACTION_PREFIX.length).toLowerCase();
  if (suffix === "override") return "override";
  if (suffix === "waive") return "waive";
  return null;
}

/**
 * Compute overturn metrics from a set of audit action log entries.
 *
 * Only considers FINDING_* actions (override, waive, approve, flag) and
 * FIELD_CORRECTION. Undo/flag actions are excluded from the denominator
 * since they don't represent a trust decision.
 */
export function computeOverturnMetrics(
  entries: readonly AuditActionLogEntry[]
): OverturnMetricsSummary {
  let agreements = 0;
  let overturns = 0;
  let fieldCorrections = 0;

  const categoryCounts = new Map<OverturnCategory, number>();

  for (const entry of entries) {
    const { action } = entry;

    if (isAgreementAction(action)) {
      agreements++;
    } else if (isOverturnAction(action)) {
      overturns++;
      const cat = classifyOverturnCategory(action);
      if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    } else if (isFieldCorrection(action)) {
      fieldCorrections++;
      categoryCounts.set(
        "field_correction",
        (categoryCounts.get("field_correction") ?? 0) + 1
      );
    }
    // Undo, flag, and non-finding actions are intentionally excluded
  }

  const totalActions = agreements + overturns + fieldCorrections;

  const overturnRate = totalActions === 0 ? 0 : overturns / totalActions;
  const correctionRate =
    totalActions === 0 ? 0 : fieldCorrections / totalActions;
  const agreementRate = totalActions === 0 ? 0 : agreements / totalActions;

  const breakdown: OverturnBreakdown[] = (
    ["override", "waive", "field_correction"] as const
  )
    .filter(cat => categoryCounts.has(cat))
    .map(cat => {
      const count = categoryCounts.get(cat)!;
      return {
        category: cat,
        count,
        rate: totalActions === 0 ? 0 : count / totalActions,
      };
    });

  return {
    totalActions,
    agreements,
    overturns,
    fieldCorrections,
    overturnRate,
    correctionRate,
    agreementRate,
    breakdown,
  };
}

/**
 * Compute overturn rate from before/after finding snapshots.
 *
 * Compares two sets of finding IDs. Findings present in `before` but
 * absent in `after` were removed (overturned). Findings in `after` but
 * not in `before` were added (corrections that introduced new issues).
 */
export function computeOverturnRate(
  findingIdsBefore: readonly number[],
  findingIdsAfter: readonly number[]
): {
  removedCount: number;
  addedCount: number;
  unchangedCount: number;
  overturnRate: number;
} {
  const before = new Set(findingIdsBefore);
  const after = new Set(findingIdsAfter);

  let removedCount = 0;
  let unchangedCount = 0;

  for (const id of Array.from(before)) {
    if (after.has(id)) {
      unchangedCount++;
    } else {
      removedCount++;
    }
  }

  let addedCount = 0;
  for (const id of Array.from(after)) {
    if (!before.has(id)) addedCount++;
  }

  const total = before.size;
  const overturnRate = total === 0 ? 0 : removedCount / total;

  return { removedCount, addedCount, unchangedCount, overturnRate };
}
