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
  buildPassSampleMissRateArtifact,
  derivePassSampleOutcomes,
  extractPassSampleRowFromReport,
  reviewRowToPassSampleOutcome,
  type PassSampleReviewOutcome,
  type PassSampleReviewRow,
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

  describe("missRateReport consumer", () => {
    it("maps review rows to sampled PASS outcomes", () => {
      const rows: PassSampleReviewRow[] = [
        {
          modelResult: "PASS",
          humanSampleRequested: true,
          humanFoundDefect: true,
        },
        { modelResult: "PASS", humanSampleRequested: false },
        { modelResult: "FAIL", humanSampleRequested: true },
      ];
      const outcomes = derivePassSampleOutcomes(rows);
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]).toEqual({
        sampled: true,
        humanFoundDefect: true,
      });
      expect(outcomes[1]).toEqual({
        sampled: false,
        humanFoundDefect: false,
      });
    });

    it("buildPassSampleMissRateArtifact wraps evaluatePassSampleMissRate", () => {
      const outcomes = Array.from({ length: 40 }, (_, i) => ({
        sampled: true,
        humanFoundDefect: i < 1,
      }));
      const artifact = buildPassSampleMissRateArtifact(outcomes, {
        asOf: "2026-07-15T12:00:00.000Z",
      });
      expect(artifact.status).toBe("pass");
      expect(artifact.asOf).toBe("2026-07-15T12:00:00.000Z");
      expect(artifact.metrics.missRate).toBeCloseTo(0.025, 5);
    });

    it("extracts sampling rows from persisted reportJson", () => {
      const row = extractPassSampleRowFromReport({
        featureFlagArtifacts: {
          samplingPolicy: {
            humanSampleRequested: true,
            overallResult: "PASS",
          },
        },
      });
      expect(row).toEqual({
        modelResult: "PASS",
        humanSampleRequested: true,
      });
      expect(
        reviewRowToPassSampleOutcome({
          modelResult: "PASS",
          humanSampleRequested: true,
          humanFoundDefect: false,
        })
      ).toEqual({ sampled: true, humanFoundDefect: false });
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
      expect(source).toMatch(/addArtifact\(\s*"samplingMissRate"/);
      expect(source).toContain("isSamplingPolicyEnabled()");
      expect(source).toContain("humanSampleRequested");
      expect(source).toContain("buildPassSampleMissRateArtifact");
      expect(source).toContain("samplingMissRate:");
      expect(source).toContain("listPassSampleReviewRows");
    });
  });
});
