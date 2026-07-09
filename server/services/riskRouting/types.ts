/**
 * Risk-based routing types (Phase 3.1)
 *
 * Routes job-sheet QA outcomes by confidence and finding severity:
 * auto-pass high-confidence clean sheets, evidence packs for mid-tier,
 * full human review for low confidence or critical findings.
 */

export type RoutingDecision = "auto_pass" | "human_review" | "evidence_pack";

export interface RiskRoutingThresholds {
  /** Confidence ≥ this with no critical findings → auto_pass. Default 0.92. */
  highThreshold: number;
  /** Confidence ≥ this (below high) → evidence_pack. Default 0.75. */
  midThreshold: number;
}

export const DEFAULT_RISK_ROUTING_THRESHOLDS: RiskRoutingThresholds = {
  highThreshold: 0.92,
  midThreshold: 0.75,
};

/** Minimal finding shape for routing — severity only. */
export interface RiskRoutingFinding {
  severity: "S0" | "S1" | "S2" | "S3" | string;
  reasonCode?: string;
  fieldName?: string;
}

export interface EvidencePack {
  jobSheetId: number;
  /** Human-readable summary of findings considered during routing. */
  findingsSummary: string;
  confidence: number;
  reasons: string[];
}

export interface RiskRoutingInput {
  jobSheetId: number;
  /** Model confidence on 0–1 scale. */
  confidence: number;
  findings: RiskRoutingFinding[];
  /** Optional override for findings summary in evidence packs. */
  findingsSummary?: string;
  thresholds?: Partial<RiskRoutingThresholds>;
}

export interface RiskRoutingResult {
  decision: RoutingDecision;
  confidence: number;
  reasons: string[];
  evidencePack?: EvidencePack;
}
