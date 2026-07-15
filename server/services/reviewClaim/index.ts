/**
 * Review claim / lease (Wave-4 D1).
 *
 * Challenge bar: two reviewers cannot mutate the same sheet without conflict.
 */

export {
  DEFAULT_CLAIM_TTL_MS,
  ReviewClaimError,
  type ClaimMutationGuardInput,
  type ClaimReviewInput,
  type ReviewClaimConflictReason,
  type ReviewClaimRecord,
} from "./types";

export {
  buildClaimRecord,
  canAcquireClaim,
  canMutateUnderClaim,
  isClaimActive,
  nextExpiry,
} from "./claimLogic";

export {
  assertReviewClaimAllowsMutation,
  claimReview,
  clearReviewClaimsForTests,
  getReviewClaim,
  heartbeatReviewClaim,
  listReviewClaimsForTests,
  releaseReviewClaim,
  setReviewClaimBackendForTests,
} from "./store";
