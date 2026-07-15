/**
 * Pure review evidence pack builder (Phase 3.x)
 *
 * No DB, routers, or riskRouting — safe to unit/contract test in isolation.
 */

import { createHash } from "node:crypto";
import {
  REVIEW_EVIDENCE_PACK_VERSION,
  type EvidencePackActor,
  type FindingSummary,
  type ResolutionSnapshot,
  type ReviewEvidencePack,
} from "./types";

export interface BuildEvidencePackInput {
  jobSheetId: string;
  /** Request-wide ID used to correlate the originating pipeline work. */
  correlationId: string;
  /** Stable ID of the pipeline execution that produced this review. */
  pipelineRunId: string;
  confidence: number;
  findings: FindingSummary[];
  reasons?: string[];
  resolutionSnapshot: ResolutionSnapshot;
  auditLogRefs: string[];
  actor: EvidencePackActor;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function contentHash(pack: Omit<ReviewEvidencePack, "contentHash">): string {
  const canonicalJson = JSON.stringify(canonicalize(pack));
  return `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`;
}

/**
 * Build a structured review evidence pack from routing/review inputs.
 */
export function buildEvidencePack(
  input: BuildEvidencePackInput,
  now: Date = new Date()
): ReviewEvidencePack {
  const pack: Omit<ReviewEvidencePack, "contentHash"> = {
    packVersion: REVIEW_EVIDENCE_PACK_VERSION,
    jobSheetId: input.jobSheetId,
    correlationId: input.correlationId,
    pipelineRunId: input.pipelineRunId,
    confidence: input.confidence,
    findings: [...input.findings],
    reasons: input.reasons ? [...input.reasons] : [],
    resolutionSnapshot: { ...input.resolutionSnapshot },
    auditLogRefs: [...input.auditLogRefs],
    actor: { ...input.actor },
    generatedAt: now.toISOString(),
  };

  return { ...pack, contentHash: contentHash(pack) };
}
