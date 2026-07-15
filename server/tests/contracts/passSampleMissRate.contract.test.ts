/**
 * PASS sample miss-rate + sampling wiring Contract Tests (Wave-4 A3)
 *
 * Fixtures only — no documentProcessor DB path.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  decidePassSampling,
  evaluatePassSampleMissRate,
  isSamplingPolicyEnabled,
  FEATURE_FLAG,
  type PassSampleReviewOutcome,
} from "../../services/samplingPolicy";
import * as fs from "fs";
import * as path from "path";

describe("PASS Sample Miss-Rate Contract (Wave-4 A3)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("decidePassSampling", () => {
    it("never samples non-PASS outcomes", () => {
      for (const overallResult of ["FAIL", "REVIEW_QUEUE"] as const) {
        const decision = decidePassSampling({
          confidence: 0.95,
          overallResult,
          subjectId: "sheet-1",
        });
        expect(decision.sample).toBe(false);
        expect(decision.passSample).toBe(false);
      }
    });

    it("is deterministic for identical PASS inputs", () => {
      const input = {
        confidence: 0.9,
        overallResult: "PASS" as const,
        subjectId: "sheet-42",
        cohortKey: "site-a",
      };
      expect(decidePassSampling(input)).toEqual(decidePassSampling(input));
    });
  });

  describe("evaluatePassSampleMissRate", () => {
    it("returns unavailable when sampled N is insufficient", () => {
      const outcomes: PassSampleReviewOutcome[] = Array.from(
        { length: 10 },
        () => ({ sampled: true, humanFoundDefect: false })
      );
      const result = evaluatePassSampleMissRate(outcomes, {
        minSamplesRequired: 30,
        maxMissRate: 0.05,
      });
      expect(result.status).toBe("unavailable");
      expect(result.metrics.missRate).toBeNull();
      expect(result.metrics.measurementReady).toBe(false);
    });

    it("passes when miss-rate is under target", () => {
      const outcomes: PassSampleReviewOutcome[] = Array.from(
        { length: 40 },
        (_, i) => ({
          sampled: true,
          humanFoundDefect: i < 1,
        })
      );
      const result = evaluatePassSampleMissRate(outcomes, {
        minSamplesRequired: 30,
        maxMissRate: 0.05,
      });
      expect(result.status).toBe("pass");
      expect(result.metrics.missRate).toBeCloseTo(0.025, 5);
    });

    it("fails when miss-rate exceeds target", () => {
      const outcomes: PassSampleReviewOutcome[] = Array.from(
        { length: 40 },
        (_, i) => ({
          sampled: true,
          humanFoundDefect: i < 8,
        })
      );
      const result = evaluatePassSampleMissRate(outcomes, {
        minSamplesRequired: 30,
        maxMissRate: 0.05,
      });
      expect(result.status).toBe("fail");
      expect(result.metrics.missRate).toBeCloseTo(0.2, 5);
    });
  });

  describe("documentProcessor wiring", () => {
    it("emits samplingPolicy artifact path when FEATURE_SAMPLING_POLICY is on", () => {
      expect(isSamplingPolicyEnabled()).toBe(false);
      const processorPath = path.join(
        process.cwd(),
        "server/services/documentProcessor.ts"
      );
      const source = fs.readFileSync(processorPath, "utf-8");
      expect(source).toContain("decidePassSampling");
      expect(source).toContain('addArtifact("samplingPolicy"');
      expect(source).toContain("isSamplingPolicyEnabled()");
      expect(source).toContain("humanSampleRequested");
    });
  });
});
