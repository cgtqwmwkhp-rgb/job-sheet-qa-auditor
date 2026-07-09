/**
 * Release Bar Contract Tests (Phase 3.6)
 *
 * Fixtures only — no CI, deploy hooks, or network I/O.
 * Verifies feature flag default-off and quarantine exit evaluation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SmokeCheck } from "../../services/releaseBar/types";

const ALL_PASSING_CHECKS: SmokeCheck[] = [
  { id: "health", name: "Health endpoint", required: true, passed: true },
  { id: "version", name: "Version endpoint", required: true, passed: true },
  { id: "metrics", name: "Metrics snapshot", required: false, passed: true },
];

describe("Release Bar Contract (Phase 3.6)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_RELEASE_BAR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_RELEASE_BAR unset", async () => {
      const { isReleaseBarEnabled } = await import("../../services/releaseBar");
      expect(isReleaseBarEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_RELEASE_BAR=true", async () => {
      process.env.FEATURE_RELEASE_BAR = "true";
      const { isReleaseBarEnabled } = await import("../../services/releaseBar");
      expect(isReleaseBarEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", async () => {
      process.env.FEATURE_RELEASE_BAR = "1";
      const { isReleaseBarEnabled } = await import("../../services/releaseBar");
      expect(isReleaseBarEnabled()).toBe(false);
      process.env.FEATURE_RELEASE_BAR = "false";
      expect(isReleaseBarEnabled()).toBe(false);
    });
  });

  describe("DEFAULT_CRITERIA", () => {
    it("requires zero open Sev1, zero failing smoke, and E2E pass", async () => {
      const { DEFAULT_CRITERIA } = await import("../../services/releaseBar");

      expect(DEFAULT_CRITERIA).toEqual({
        maxOpenSev1: 0,
        maxFailingSmoke: 0,
        requireE2E: true,
      });
    });
  });

  describe("evaluateReleaseBar", () => {
    it("is ready when all required smoke checks pass with E2E", async () => {
      const { evaluateReleaseBar, DEFAULT_CRITERIA } = await import(
        "../../services/releaseBar"
      );

      const result = evaluateReleaseBar(ALL_PASSING_CHECKS, DEFAULT_CRITERIA, {
        openSev1: 0,
        e2ePassed: true,
      });

      expect(result.ready).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.checks).toEqual(ALL_PASSING_CHECKS);
    });

    it("blocks when a required smoke check fails", async () => {
      const { evaluateReleaseBar, DEFAULT_CRITERIA } = await import(
        "../../services/releaseBar"
      );

      const checks: SmokeCheck[] = [
        { id: "health", name: "Health endpoint", required: true, passed: false },
        { id: "version", name: "Version endpoint", required: true, passed: true },
      ];

      const result = evaluateReleaseBar(checks, DEFAULT_CRITERIA, {
        e2ePassed: true,
      });

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain(
        "Required smoke check failed: Health endpoint (health)"
      );
    });

    it("blocks when a required smoke check is unset", async () => {
      const { evaluateReleaseBar, DEFAULT_CRITERIA } = await import(
        "../../services/releaseBar"
      );

      const checks: SmokeCheck[] = [
        { id: "health", name: "Health endpoint", required: true },
        { id: "version", name: "Version endpoint", required: true, passed: true },
      ];

      const result = evaluateReleaseBar(checks, DEFAULT_CRITERIA, {
        e2ePassed: true,
      });

      expect(result.ready).toBe(false);
      expect(result.blockers.some(blocker => blocker.includes("health"))).toBe(
        true
      );
    });

    it("blocks when open Sev1 exceeds criteria", async () => {
      const { evaluateReleaseBar, DEFAULT_CRITERIA } = await import(
        "../../services/releaseBar"
      );

      const result = evaluateReleaseBar(ALL_PASSING_CHECKS, DEFAULT_CRITERIA, {
        openSev1: 2,
        e2ePassed: true,
      });

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain(
        "Open Sev1 incidents (2) exceed max (0)"
      );
    });

    it("blocks when E2E is required but not passed", async () => {
      const { evaluateReleaseBar, DEFAULT_CRITERIA } = await import(
        "../../services/releaseBar"
      );

      const result = evaluateReleaseBar(ALL_PASSING_CHECKS, DEFAULT_CRITERIA, {
        openSev1: 0,
        e2ePassed: false,
      });

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain("E2E tests have not passed");
    });

    it("blocks when failing smoke count exceeds maxFailingSmoke", async () => {
      const { evaluateReleaseBar } = await import("../../services/releaseBar");

      const checks: SmokeCheck[] = [
        { id: "health", name: "Health endpoint", required: false, passed: true },
        { id: "metrics", name: "Metrics snapshot", required: false, passed: false },
        { id: "cache", name: "Cache warm", required: false, passed: false },
      ];

      const result = evaluateReleaseBar(
        checks,
        { maxOpenSev1: 0, maxFailingSmoke: 1, requireE2E: false },
        { e2ePassed: false }
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain(
        "Failing smoke checks (2) exceed max (1)"
      );
    });

    it("allows optional failing smoke when within maxFailingSmoke", async () => {
      const { evaluateReleaseBar } = await import("../../services/releaseBar");

      const checks: SmokeCheck[] = [
        { id: "health", name: "Health endpoint", required: true, passed: true },
        { id: "metrics", name: "Metrics snapshot", required: false, passed: false },
      ];

      const result = evaluateReleaseBar(
        checks,
        { maxOpenSev1: 0, maxFailingSmoke: 1, requireE2E: false },
        { openSev1: 0 }
      );

      expect(result.ready).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it("skips E2E blocker when requireE2E is false", async () => {
      const { evaluateReleaseBar } = await import("../../services/releaseBar");

      const result = evaluateReleaseBar(
        ALL_PASSING_CHECKS,
        { maxOpenSev1: 0, maxFailingSmoke: 0, requireE2E: false },
        { e2ePassed: false }
      );

      expect(result.ready).toBe(true);
      expect(result.blockers).toEqual([]);
    });
  });
});
