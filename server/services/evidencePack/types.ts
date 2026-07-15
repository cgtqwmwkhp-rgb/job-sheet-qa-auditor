/**
 * Review evidence pack types (Phase 3.x)
 *
 * Distinct from riskRouting.EvidencePack — this module builds structured
 * review evidence for downstream consumers behind FEATURE_EVIDENCE_PACK.
 */

export interface FindingSummary {
  id: string;
  severity: string;
  fieldKey?: string;
  message?: string;
}

export const REVIEW_EVIDENCE_PACK_VERSION = "1.0.0";

/** Immutable capture of the review state when the pack was generated. */
export interface ResolutionSnapshot {
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** The user or service responsible for generating the pack. */
export interface EvidencePackActor {
  id: string;
  type: "system" | "user" | "service";
  displayName?: string;
}

export interface ReviewEvidencePack {
  packVersion: typeof REVIEW_EVIDENCE_PACK_VERSION;
  jobSheetId: string;
  correlationId: string;
  pipelineRunId: string;
  confidence: number;
  findings: FindingSummary[];
  reasons: string[];
  resolutionSnapshot: ResolutionSnapshot;
  auditLogRefs: string[];
  actor: EvidencePackActor;
  generatedAt: string;
  /** SHA-256 of every pack field except this field. */
  contentHash: string;
}
