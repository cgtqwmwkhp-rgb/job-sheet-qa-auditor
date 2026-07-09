/**
 * Review Load Balancer Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, routers, or live assignment I/O.
 * Verifies feature flag default-off, least-loaded selection, capacity limits,
 * and empty/null handling.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isReviewLoadEnabled,
  assignToLeastLoaded,
  type ReviewerLoad,
} from "../../services/reviewLoad";

describe("Review Load Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_REVIEW_LOAD unset", () => {
      expect(isReviewLoadEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_REVIEW_LOAD=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isReviewLoadEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isReviewLoadEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isReviewLoadEnabled()).toBe(false);
    });
  });

  describe("assignToLeastLoaded", () => {
    const jobSheetId = "js-1001";

    it("returns null for empty reviewer list", () => {
      expect(assignToLeastLoaded(jobSheetId, [])).toBeNull();
    });

    it("returns null when all reviewers are at capacity", () => {
      const reviewers: ReviewerLoad[] = [
        { reviewerId: "alice", openItems: 5, capacity: 5 },
        { reviewerId: "bob", openItems: 10, capacity: 10 },
      ];

      expect(assignToLeastLoaded(jobSheetId, reviewers)).toBeNull();
    });

    it("picks the reviewer with the lowest openItems/capacity ratio", () => {
      const reviewers: ReviewerLoad[] = [
        { reviewerId: "alice", openItems: 4, capacity: 10 },
        { reviewerId: "bob", openItems: 2, capacity: 10 },
        { reviewerId: "carol", openItems: 1, capacity: 5 },
      ];

      expect(assignToLeastLoaded(jobSheetId, reviewers)).toEqual({
        jobSheetId,
        reviewerId: "carol",
      });
    });

    it("respects capacity and excludes reviewers at or over limit", () => {
      const reviewers: ReviewerLoad[] = [
        { reviewerId: "alice", openItems: 3, capacity: 3 },
        { reviewerId: "bob", openItems: 1, capacity: 4 },
      ];

      expect(assignToLeastLoaded(jobSheetId, reviewers)).toEqual({
        jobSheetId,
        reviewerId: "bob",
      });
    });

    it("breaks ratio ties by lower openItems then reviewerId", () => {
      const reviewers: ReviewerLoad[] = [
        { reviewerId: "bob", openItems: 2, capacity: 4 },
        { reviewerId: "alice", openItems: 1, capacity: 2 },
        { reviewerId: "carol", openItems: 3, capacity: 6 },
      ];

      expect(assignToLeastLoaded(jobSheetId, reviewers)).toEqual({
        jobSheetId,
        reviewerId: "alice",
      });
    });
  });
});
