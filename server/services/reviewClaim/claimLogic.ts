/**
 * Pure review-claim decision helpers (Wave-4 D1).
 * No DB — unit-testable in isolation.
 */

import {
  DEFAULT_CLAIM_TTL_MS,
  type ReviewClaimRecord,
  type ReviewClaimConflictReason,
} from "./types";

export function isClaimActive(
  claim: ReviewClaimRecord | null | undefined,
  now: number = Date.now()
): claim is ReviewClaimRecord {
  return Boolean(claim && claim.expiresAt > now);
}

export function canAcquireClaim(
  existing: ReviewClaimRecord | null | undefined,
  userId: number,
  now: number = Date.now(),
  force = false
):
  | { ok: true }
  | { ok: false; reason: ReviewClaimConflictReason; heldBy: number } {
  if (!isClaimActive(existing, now)) {
    return { ok: true };
  }

  if (existing.claimedBy === userId) {
    return { ok: true };
  }

  // Live foreign claim — never steal, even with force (force only reclaims expired).
  if (!force) {
    return {
      ok: false,
      reason: "held_by_other",
      heldBy: existing.claimedBy,
    };
  }

  return {
    ok: false,
    reason: "held_by_other",
    heldBy: existing.claimedBy,
  };
}

export function canMutateUnderClaim(
  existing: ReviewClaimRecord | null | undefined,
  userId: number,
  claimToken: string | undefined,
  now: number = Date.now()
):
  | { ok: true }
  | { ok: false; reason: ReviewClaimConflictReason; heldBy?: number } {
  if (!isClaimActive(existing, now)) {
    // No active claim — mutation allowed (expectedStatus still guards findings).
    return { ok: true };
  }

  if (existing.claimedBy !== userId) {
    return {
      ok: false,
      reason: "held_by_other",
      heldBy: existing.claimedBy,
    };
  }

  if (claimToken != null && claimToken !== existing.claimToken) {
    return { ok: false, reason: "token_mismatch", heldBy: existing.claimedBy };
  }

  return { ok: true };
}

export function nextExpiry(
  now: number = Date.now(),
  ttlMs: number = DEFAULT_CLAIM_TTL_MS
): number {
  return now + ttlMs;
}

export function buildClaimRecord(input: {
  jobSheetId: number;
  userId: number;
  claimToken: string;
  now?: number;
  ttlMs?: number;
  createdAt?: number;
}): ReviewClaimRecord {
  const now = input.now ?? Date.now();
  return {
    jobSheetId: input.jobSheetId,
    claimedBy: input.userId,
    claimToken: input.claimToken,
    expiresAt: nextExpiry(now, input.ttlMs),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}
