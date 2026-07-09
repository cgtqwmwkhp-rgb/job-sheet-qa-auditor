/**
 * Pure template fingerprint collision checks (Phase 3.4)
 *
 * No DB, no templateRegistry — safe to unit/contract test in isolation.
 */

import type { CollisionResult, TemplateFingerprint } from "./types";

function isEmptyFingerprint(fingerprint: string): boolean {
  return fingerprint.trim().length === 0;
}

/**
 * Check whether a candidate template fingerprint collides with existing entries.
 *
 * - Empty fingerprint → invalid (collides with reason)
 * - Same templateId as an existing entry → ok (update/re-upload)
 * - Same fingerprint, different templateId → collide
 */
export function checkCollision(
  candidate: TemplateFingerprint,
  existing: TemplateFingerprint[]
): CollisionResult {
  if (isEmptyFingerprint(candidate.fingerprint)) {
    return {
      collides: true,
      reason: "Invalid fingerprint: fingerprint must be non-empty",
    };
  }

  const normalizedCandidate = candidate.fingerprint.trim();

  for (const entry of existing) {
    if (entry.templateId === candidate.templateId) {
      continue;
    }

    if (isEmptyFingerprint(entry.fingerprint)) {
      continue;
    }

    if (entry.fingerprint.trim() === normalizedCandidate) {
      return {
        collides: true,
        existingTemplateId: entry.templateId,
        reason: `Fingerprint already registered to template ${entry.templateId}`,
      };
    }
  }

  return { collides: false };
}
