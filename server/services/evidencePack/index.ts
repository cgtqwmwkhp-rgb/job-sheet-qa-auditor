/**
 * Review evidence pack module (Phase 3.x)
 *
 * Structured evidence packs for review workflows.
 * Feature-flagged via FEATURE_EVIDENCE_PACK (default OFF).
 *
 * Distinct from riskRouting.EvidencePack — not wired into documentProcessor yet.
 */

export const FEATURE_FLAG = "FEATURE_EVIDENCE_PACK";

export * from "./types";
import { buildEvidencePack, type BuildEvidencePackInput } from "./build";

export { buildEvidencePack };
export type { BuildEvidencePackInput } from "./build";

/**
 * Default: disabled when FEATURE_EVIDENCE_PACK unset.
 * Set FEATURE_EVIDENCE_PACK=true to enable.
 */
export function isEvidencePackEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

/**
 * Generate an evidence pack only while the feature is explicitly enabled.
 * Callers should use this entry point at review-generation boundaries.
 */
export function generateEvidencePack(
  input: BuildEvidencePackInput,
  now?: Date
) {
  if (!isEvidencePackEnabled()) return undefined;
  return buildEvidencePack(input, now);
}
