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
export { buildEvidencePack } from "./build";
export type { BuildEvidencePackInput } from "./build";

/**
 * Default: disabled when FEATURE_EVIDENCE_PACK unset.
 * Set FEATURE_EVIDENCE_PACK=true to enable.
 */
export function isEvidencePackEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
