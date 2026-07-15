/**
 * Review claim / lease types (Wave-4 D1).
 *
 * Exclusive sheet-level lock so two reviewers cannot mutate the same job
 * sheet without conflict. Lease expires unless heartbeated.
 */

export const DEFAULT_CLAIM_TTL_MS = 5 * 60 * 1000;

export interface ReviewClaimRecord {
  jobSheetId: number;
  claimedBy: number;
  claimToken: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export type ReviewClaimConflictReason =
  | "held_by_other"
  | "token_mismatch"
  | "expired"
  | "not_claimed";

export class ReviewClaimError extends Error {
  constructor(
    public readonly code: "CONFLICT" | "NOT_FOUND",
    message: string,
    public readonly reason?: ReviewClaimConflictReason,
    public readonly heldBy?: number
  ) {
    super(message);
    this.name = "ReviewClaimError";
  }
}

export interface ClaimReviewInput {
  jobSheetId: number;
  userId: number;
  /** Steal an expired (or same-user) claim. Never steals a live foreign claim. */
  force?: boolean;
  ttlMs?: number;
  now?: number;
}

export interface ClaimMutationGuardInput {
  jobSheetId: number;
  userId: number;
  /** Optional token — when provided must match the active claim. */
  claimToken?: string;
  now?: number;
}
