/**
 * Wave-4 D1 — review claim/lease unit tests.
 * Fixtures only — no live DB.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canAcquireClaim,
  canMutateUnderClaim,
  claimReview,
  clearReviewClaimsForTests,
  heartbeatReviewClaim,
  isClaimActive,
  releaseReviewClaim,
  ReviewClaimError,
  setReviewClaimBackendForTests,
  type ReviewClaimRecord,
} from "./index";

function makeClaim(
  overrides: Partial<ReviewClaimRecord> = {}
): ReviewClaimRecord {
  const now = Date.now();
  return {
    jobSheetId: 42,
    claimedBy: 1,
    claimToken: "11111111-1111-1111-1111-111111111111",
    expiresAt: now + 60_000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("reviewClaim logic", () => {
  it("treats expired claims as inactive", () => {
    const now = 1_000_000;
    expect(isClaimActive(makeClaim({ expiresAt: now - 1 }), now)).toBe(false);
    expect(isClaimActive(makeClaim({ expiresAt: now + 1 }), now)).toBe(true);
  });

  it("blocks acquire when another reviewer holds a live lease", () => {
    const now = 1_000_000;
    const decision = canAcquireClaim(
      makeClaim({ claimedBy: 1, expiresAt: now + 10_000 }),
      2,
      now
    );
    expect(decision).toEqual({
      ok: false,
      reason: "held_by_other",
      heldBy: 1,
    });
  });

  it("allows acquire after lease expiry", () => {
    const now = 1_000_000;
    const decision = canAcquireClaim(
      makeClaim({ claimedBy: 1, expiresAt: now - 1 }),
      2,
      now
    );
    expect(decision).toEqual({ ok: true });
  });

  it("blocks mutation when another reviewer holds the claim", () => {
    const now = 1_000_000;
    const decision = canMutateUnderClaim(
      makeClaim({ claimedBy: 1, expiresAt: now + 10_000 }),
      2,
      undefined,
      now
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toBe("held_by_other");
      expect(decision.heldBy).toBe(1);
    }
  });

  it("allows mutation when no active claim", () => {
    expect(canMutateUnderClaim(null, 2, undefined, Date.now())).toEqual({
      ok: true,
    });
  });
});

describe("reviewClaim store (memory)", () => {
  beforeEach(() => {
    setReviewClaimBackendForTests("memory");
    clearReviewClaimsForTests();
  });

  afterEach(() => {
    clearReviewClaimsForTests();
    setReviewClaimBackendForTests(null);
  });

  it("second reviewer cannot steal a live claim", async () => {
    const first = await claimReview({ jobSheetId: 10, userId: 1 });
    expect(first.claimedBy).toBe(1);

    await expect(
      claimReview({ jobSheetId: 10, userId: 2 })
    ).rejects.toBeInstanceOf(ReviewClaimError);

    await expect(
      claimReview({ jobSheetId: 10, userId: 2, force: true })
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "held_by_other" });
  });

  it("same reviewer can renew and heartbeat", async () => {
    const claimed = await claimReview({
      jobSheetId: 11,
      userId: 5,
      now: 1_000_000,
      ttlMs: 5_000,
    });

    const renewed = await claimReview({
      jobSheetId: 11,
      userId: 5,
      now: 1_002_000,
      ttlMs: 5_000,
    });
    expect(renewed.claimToken).toBe(claimed.claimToken);
    expect(renewed.expiresAt).toBe(1_007_000);

    const beat = await heartbeatReviewClaim({
      jobSheetId: 11,
      userId: 5,
      claimToken: claimed.claimToken,
      now: 1_003_000,
      ttlMs: 5_000,
    });
    expect(beat.expiresAt).toBe(1_008_000);
  });

  it("release frees the sheet for another reviewer", async () => {
    const claimed = await claimReview({ jobSheetId: 12, userId: 1 });
    await releaseReviewClaim({
      jobSheetId: 12,
      userId: 1,
      claimToken: claimed.claimToken,
    });

    const second = await claimReview({ jobSheetId: 12, userId: 2 });
    expect(second.claimedBy).toBe(2);
    expect(second.claimToken).not.toBe(claimed.claimToken);
  });

  it("expired claim can be taken by another reviewer", async () => {
    await claimReview({
      jobSheetId: 13,
      userId: 1,
      now: 1_000_000,
      ttlMs: 100,
    });

    const second = await claimReview({
      jobSheetId: 13,
      userId: 2,
      now: 1_000_200,
      ttlMs: 5_000,
    });
    expect(second.claimedBy).toBe(2);
  });
});
