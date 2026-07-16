/**
 * Unify legacy GoldSpec IDs with ROI/canonical IDs before multi-engine vote.
 * Does NOT cross-map signatures (customerSignature ≠ engineerSignOff).
 */

import type { PreExtractedLike } from "./buildCandidates";

/** Bidirectional aliases for vote fusion only (job / asset / date). */
export const VOTE_FIELD_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["jobNumber", "jobReference"],
  ["serialNumber", "assetId"],
  ["dateOfService", "date"],
];

/**
 * Dual-emit aliased keys so crop `jobReference` and ensemble `jobNumber`
 * land in the same vote bucket when either side is present.
 */
export function aliasPreExtractedForVote(
  fields: PreExtractedLike | undefined
): PreExtractedLike | undefined {
  if (!fields) return undefined;
  const out: PreExtractedLike = { ...fields };
  for (const [a, b] of VOTE_FIELD_ALIASES) {
    if (out[a] && !out[b]) out[b] = out[a];
    if (out[b] && !out[a]) out[a] = out[b];
  }
  return out;
}
