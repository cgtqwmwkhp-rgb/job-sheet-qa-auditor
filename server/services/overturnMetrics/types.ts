/**
 * Overturn / auditor-correction metrics types.
 *
 * These track when human reviewers Override or Correct AI findings,
 * providing trust-calibration signals for the QA pipeline.
 */

import type { FindingAction, ResolutionStatus } from "../auditActions/types";

/** Actions that constitute an "overturn" — the human disagreed with the AI. */
export const OVERTURN_ACTIONS: readonly FindingAction[] = [
  "override",
  "waive",
] as const;

/** Actions that are "agreement" — the human accepted the AI finding. */
export const AGREEMENT_ACTIONS: readonly FindingAction[] = [
  "approve",
] as const;

/**
 * A single audit action log entry consumed by the metrics engine.
 * Mirrors the shape written by `AuditActionDeps.logAction`.
 */
export interface AuditActionLogEntry {
  action: string;
  entityType: string;
  entityId: number;
  userId: number;
  timestamp: string;
  details: {
    previousStatus?: ResolutionStatus;
    newStatus?: ResolutionStatus;
    fieldName?: string;
    originalValue?: string;
    correctedValue?: string;
    [key: string]: unknown;
  };
}

export type OverturnCategory = "override" | "waive" | "field_correction";

export interface OverturnBreakdown {
  category: OverturnCategory;
  count: number;
  rate: number;
}

export interface OverturnMetricsSummary {
  /** Total finding-level actions processed. */
  totalActions: number;
  /** Actions where reviewer agreed with the AI (approve). */
  agreements: number;
  /** Actions where reviewer overturned the AI (override / waive). */
  overturns: number;
  /** Field-level corrections (FIELD_CORRECTION action). */
  fieldCorrections: number;

  /**
   * overturnRate = overturns / totalActions (0 when no actions).
   * Lower is better — means the AI's findings are trusted.
   */
  overturnRate: number;
  /**
   * correctionRate = fieldCorrections / totalActions (0 when no actions).
   */
  correctionRate: number;
  /**
   * agreementRate = agreements / totalActions (0 when no actions).
   * Higher means better AI-human alignment.
   */
  agreementRate: number;

  /** Per-category breakdown. */
  breakdown: OverturnBreakdown[];
}
