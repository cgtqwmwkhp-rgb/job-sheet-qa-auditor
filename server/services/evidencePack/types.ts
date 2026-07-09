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

export interface ReviewEvidencePack {
  jobSheetId: string;
  confidence: number;
  findings: FindingSummary[];
  reasons: string[];
  generatedAt: string;
}
