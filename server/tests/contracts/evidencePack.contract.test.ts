/**
 * Review Evidence Pack Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, routers, or riskRouting.
 * Verifies feature flag default-off, pack building, empty findings,
 * and ISO generatedAt timestamps.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FindingSummary } from "../../services/evidencePack/types";

describe("Evidence Pack Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_EVIDENCE_PACK;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const sampleFindings: FindingSummary[] = [
    {
      id: "f-001",
      severity: "S1",
      fieldKey: "Job Number",
      message: "Low OCR confidence on job number",
    },
    {
      id: "f-002",
      severity: "S2",
      fieldKey: "Serial Number",
      message: "Value missing from extraction",
    },
  ];

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_EVIDENCE_PACK unset", async () => {
      const { isEvidencePackEnabled } = await import(
        "../../services/evidencePack"
      );
      expect(isEvidencePackEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_EVIDENCE_PACK=true", async () => {
      process.env.FEATURE_EVIDENCE_PACK = "true";
      const { isEvidencePackEnabled } = await import(
        "../../services/evidencePack"
      );
      expect(isEvidencePackEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", async () => {
      process.env.FEATURE_EVIDENCE_PACK = "1";
      const { isEvidencePackEnabled } = await import(
        "../../services/evidencePack"
      );
      expect(isEvidencePackEnabled()).toBe(false);

      process.env.FEATURE_EVIDENCE_PACK = "false";
      vi.resetModules();
      const { isEvidencePackEnabled: isDisabled } = await import(
        "../../services/evidencePack"
      );
      expect(isDisabled()).toBe(false);
    });
  });

  describe("buildEvidencePack", () => {
    it("builds a pack with findings and reasons", async () => {
      const { buildEvidencePack } = await import("../../services/evidencePack");
      const fixedNow = new Date("2026-07-09T12:00:00.000Z");

      const pack = buildEvidencePack(
        {
          jobSheetId: "js-48291",
          confidence: 0.81,
          findings: sampleFindings,
          reasons: ["mid-confidence band", "S1 finding present"],
        },
        fixedNow
      );

      expect(pack).toEqual({
        jobSheetId: "js-48291",
        confidence: 0.81,
        findings: sampleFindings,
        reasons: ["mid-confidence band", "S1 finding present"],
        generatedAt: "2026-07-09T12:00:00.000Z",
      });
    });

    it("handles empty findings with empty reasons by default", async () => {
      const { buildEvidencePack } = await import("../../services/evidencePack");
      const fixedNow = new Date("2026-07-09T15:30:00.000Z");

      const pack = buildEvidencePack(
        {
          jobSheetId: "js-clean",
          confidence: 0.97,
          findings: [],
        },
        fixedNow
      );

      expect(pack.jobSheetId).toBe("js-clean");
      expect(pack.confidence).toBe(0.97);
      expect(pack.findings).toEqual([]);
      expect(pack.reasons).toEqual([]);
      expect(pack.generatedAt).toBe("2026-07-09T15:30:00.000Z");
    });

    it("emits ISO 8601 generatedAt from provided clock", async () => {
      const { buildEvidencePack } = await import("../../services/evidencePack");
      const fixedNow = new Date("2026-03-15T08:45:30.123Z");

      const pack = buildEvidencePack(
        {
          jobSheetId: "js-iso",
          confidence: 0.65,
          findings: [{ id: "f-iso", severity: "S3" }],
        },
        fixedNow
      );

      expect(pack.generatedAt).toBe("2026-03-15T08:45:30.123Z");
      expect(pack.generatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it("does not mutate input arrays", async () => {
      const { buildEvidencePack } = await import("../../services/evidencePack");
      const findings = [{ id: "f-mut", severity: "S1" }];
      const reasons = ["original reason"];

      const pack = buildEvidencePack(
        {
          jobSheetId: "js-mut",
          confidence: 0.7,
          findings,
          reasons,
        },
        new Date("2026-07-09T00:00:00.000Z")
      );

      findings.push({ id: "f-extra", severity: "S2" });
      reasons.push("extra reason");

      expect(pack.findings).toHaveLength(1);
      expect(pack.reasons).toHaveLength(1);
    });
  });
});
