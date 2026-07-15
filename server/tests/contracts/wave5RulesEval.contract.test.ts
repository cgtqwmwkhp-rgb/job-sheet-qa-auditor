/**
 * Wave-5/6 rules slice contract tests (FAULT, PARTS L1, ATTR, fitment).
 *
 * Fixtures only — no live OCR, DB, or network.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  exitCodeForReport,
  loadWave5RulesManifest,
  runWave5RulesSlice,
} from "../../../scripts/eval/wave5RulesSlice";

const MANIFEST_PATH = path.join(
  process.cwd(),
  "parity/fixtures/wave5-rules/manifest.json"
);

describe("Wave-5/6 Rules Slice Contract", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("manifest", () => {
    it("loads fixture manifest with all rule evaluators", () => {
      const manifest = loadWave5RulesManifest(MANIFEST_PATH);
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.cases.length).toBeGreaterThanOrEqual(7);

      const evaluators = new Set(manifest.cases.map(c => c.evaluator));
      expect(evaluators.has("faultReason")).toBe(true);
      expect(evaluators.has("partsUsed")).toBe(true);
      expect(evaluators.has("engineerAttribution")).toBe(true);
      expect(evaluators.has("partsAssetFitment")).toBe(true);
    });

    it("has on-disk fixtures for every case", () => {
      const manifest = loadWave5RulesManifest(MANIFEST_PATH);
      const fixturesDir = path.dirname(MANIFEST_PATH);
      for (const testCase of manifest.cases) {
        const fixturePath = path.join(fixturesDir, testCase.fixture);
        expect(fs.existsSync(fixturePath), testCase.fixture).toBe(true);
      }
    });
  });

  describe("runWave5RulesSlice metrics", () => {
    it("reports pass/fail/unavailable metrics for all cases", async () => {
      const report = await runWave5RulesSlice({ manifestPath: MANIFEST_PATH });

      expect(report.runId).toMatch(/^wave5-rules-/);
      expect(report.timestamp).toBeTruthy();
      expect(report.summary.total).toBe(7);
      expect(report.cases).toHaveLength(7);

      const syncCases = report.cases.filter(
        c => c.evaluator !== "partsAssetFitment"
      );
      expect(syncCases.every(c => c.status === "pass")).toBe(true);
      expect(report.summary.passed).toBeGreaterThanOrEqual(5);
      expect(report.summary.failed).toBe(0);

      const fitmentCases = report.cases.filter(
        c => c.evaluator === "partsAssetFitment"
      );
      expect(fitmentCases).toHaveLength(2);

      if (report.fitmentModuleAvailable) {
        expect(fitmentCases.every(c => c.status === "pass")).toBe(true);
        expect(report.status).toBe("pass");
        expect(exitCodeForReport(report)).toBe(0);
      } else {
        expect(fitmentCases.every(c => c.status === "unavailable")).toBe(true);
        expect(report.summary.unavailable).toBe(2);
        expect(report.status).toBe("unavailable");
        expect(exitCodeForReport(report)).toBe(2);
        expect(report.blockers.some(b => b.includes("not merged"))).toBe(true);
      }
    });

    it("asserts FAULT-C010 on placeholder fixture", async () => {
      const report = await runWave5RulesSlice({ manifestPath: MANIFEST_PATH });
      const faultCase = report.cases.find(
        c => c.id === "fault-c010-placeholder"
      );
      expect(faultCase).toBeDefined();
      expect(faultCase!.actualRuleIds).toContain("FAULT-C010");
    });

    it("asserts PARTS-C010/011/013 on parts line fixtures", async () => {
      const report = await runWave5RulesSlice({ manifestPath: MANIFEST_PATH });

      const c010 = report.cases.find(c => c.id === "parts-c010-pn-only");
      expect(c010!.actualRuleIds).toContain("PARTS-C010");

      const c011 = report.cases.find(c => c.id === "parts-c011-desc-only");
      expect(c011!.actualRuleIds).toContain("PARTS-C011");

      const c013 = report.cases.find(c => c.id === "parts-c013-complete");
      expect(c013!.actualRuleIds).toEqual(["PARTS-C013"]);
    });

    it("asserts ATTR-C010 on missing name fixture", async () => {
      const report = await runWave5RulesSlice({ manifestPath: MANIFEST_PATH });
      const attrCase = report.cases.find(c => c.id === "attr-c010-no-name");
      expect(attrCase!.actualRuleIds).toContain("ATTR-C010");
    });
  });
});
