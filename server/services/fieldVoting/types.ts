/**
 * Multi-engine field voting types (Wave-4 B2).
 *
 * Candidates come from distinct OCR/VLM engines (primary, fallback, crop,
 * ensemble strategies, VLM ink). Voting is real consensus — not Jaccard
 * page-text theater and not fabricated confidence.
 */

export type EngineId =
  | "primary"
  | "fallback"
  | "crop"
  | "ensemble"
  | "vlm"
  | "azure_custom"
  | "regex"
  | "fuzzy"
  | "context"
  | string;

/**
 * How much ink/structure evidence backs the candidate.
 * label_only = signature label found with no ink/VLM proof (theater risk).
 */
export type EvidenceStrength = "strong" | "weak" | "label_only" | "none";

export interface EngineFieldCandidate {
  engine: EngineId;
  fieldId: string;
  value: string | null;
  /** 0–1 confidence from the engine */
  confidence: number;
  evidenceStrength?: EvidenceStrength;
  /** Optional short evidence note (no PII dumps). */
  evidence?: string;
}

export type VoteDecision =
  | "consensus"
  | "majority"
  | "confidence_gap"
  | "single"
  | "abstain";

export type VoteReasonCode =
  | "AGREED"
  | "MAJORITY"
  | "CONFIDENCE_GAP"
  | "SINGLE_ENGINE"
  | "ABSTAIN"
  | "LABEL_ONLY_NO_INK";

export interface FieldVoteResult {
  fieldId: string;
  /** Voted value; null when abstaining with no safe fallback. */
  value: string | null;
  /** 0–1 voted confidence (honest — no fake boosts on abstain). */
  confidence: number;
  decision: VoteDecision;
  reasonCode: VoteReasonCode;
  candidates: EngineFieldCandidate[];
  winningEngines: string[];
  conflictValues?: string[];
  /**
   * When abstaining, best single-engine value for review UI only —
   * not promoted as high-confidence truth.
   */
  fallbackValue?: string | null;
  fallbackEngine?: string;
  /** True when vote abstained due to disagreement / weak evidence. */
  abstained: boolean;
}

export interface FieldVoteBatchResult {
  fields: Record<string, FieldVoteResult>;
  summary: {
    voted: number;
    consensus: number;
    majority: number;
    abstained: number;
    singleEngine: number;
  };
}

/** Critical + handwriting-adjacent fields that participate in multi-engine vote. */
export const VOTE_FIELD_IDS = [
  "jobReference",
  "jobNumber",
  "assetId",
  "serialNumber",
  "date",
  "dateOfService",
  "expiryDate",
  "engineerSignOff",
  "customerSignature",
  "technicianName",
  "customerName",
  "makeModel",
  "mileageHours",
] as const;

export type VoteFieldId = (typeof VOTE_FIELD_IDS)[number];

export const HANDWRITING_FIELD_IDS = new Set([
  "engineerSignOff",
  "customerSignature",
  "technician_signature",
  "customer_signature",
  "technicianName",
  "customerName",
  "mileageHours",
]);

export const FEATURE_FIELD_VOTE = "FEATURE_FIELD_VOTE";
