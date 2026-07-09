/**
 * Predictive Risk Analytics types (PR-19)
 *
 * Leading-indicator risk scoring → "needing attention" queue + fix packs.
 */

import type { FixPack } from "../engineerAnalytics/types";

export type RiskEntityType = "engineer" | "asset" | "template";

export type RiskBand = "critical" | "high" | "medium" | "low";

export interface PredictiveDocumentRow {
  jobSheetId: number;
  technicianId: number | null;
  templateSlug: string | null;
  assetType: string | null;
  result: "pass" | "fail" | "review_queue" | "waived";
  confidenceScore: number | null;
  processedAt: Date | string;
}

export interface PredictiveFindingRow {
  findingId: number;
  jobSheetId: number;
  technicianId: number | null;
  severity: "S0" | "S1" | "S2" | "S3";
  reasonCode: string;
  fieldName: string;
  resolutionStatus: "open" | "waived" | "overridden" | "flagged" | "approved";
  occurredAt: Date | string;
}

export interface PredictiveDisputeRow {
  id: number;
  auditFindingId: number;
  raisedBy: number;
  status: string;
  createdAt: Date | string;
}

export interface PredictiveUserRow {
  id: number;
  name: string | null;
  email: string | null;
}

/** Component scores are 0–100. */
export interface LeadingIndicators {
  /** Share of findings that are minor (S2/S3) — elevated mix is a leading signal. */
  minorIssueMix: number;
  /** Disputes per finding (capped/scaled to 0–100). */
  disputeRate: number;
  /** Recent vs prior review_queue / ambiguity rate delta (scaled). */
  ambiguityTrend: number;
  /** Overall issue rate on documents (scaled). */
  issueRate: number;
  /** Critical (S0/S1) density (scaled). */
  criticalDensity: number;
}

export interface RiskScoreBreakdown {
  indicators: LeadingIndicators;
  weights: {
    minorIssueMix: number;
    disputeRate: number;
    ambiguityTrend: number;
    issueRate: number;
    criticalDensity: number;
  };
  /** Weighted composite 0–100. */
  riskScore: number;
  band: RiskBand;
}

export interface AttentionQueueItem {
  id: string;
  entityType: RiskEntityType;
  entityKey: string;
  label: string;
  riskScore: number;
  band: RiskBand;
  indicators: LeadingIndicators;
  drivers: string[];
  documentCount: number;
  findingCount: number;
  disputeCount: number;
  /** Attached when entity is an engineer with issues. */
  fixPack: FixPack | null;
  suggestedAction: string;
}

export interface PredictiveAlertPrediction {
  assetId: string;
  riskScore: number;
  predictedFailureDate: string;
  reason: string;
  confidence: number;
}

export interface PredictiveRiskSummary {
  period: { start: string; end: string };
  asOf: string;
  attentionQueue: AttentionQueueItem[];
  predictions: PredictiveAlertPrediction[];
  fixPacks: FixPack[];
  summary: {
    entitiesScored: number;
    needingAttention: number;
    criticalCount: number;
    highCount: number;
    fixPackCount: number;
    avgRiskScore: number;
  };
}

export interface PredictiveRiskThresholds {
  /** Minimum documents before an entity is scored. */
  minDocuments: number;
  /** Risk score ≥ this enters the attention queue. */
  attentionScore: number;
  /** Band cutoffs (inclusive lower bounds). */
  criticalAt: number;
  highAt: number;
  mediumAt: number;
}

export const DEFAULT_RISK_WEIGHTS = {
  minorIssueMix: 0.2,
  disputeRate: 0.2,
  ambiguityTrend: 0.25,
  issueRate: 0.2,
  criticalDensity: 0.15,
} as const;

export const DEFAULT_RISK_THRESHOLDS: PredictiveRiskThresholds = {
  minDocuments: 2,
  attentionScore: 40,
  criticalAt: 80,
  highAt: 60,
  mediumAt: 40,
};
