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

  const complianceMetadata = {
    correlationId: "corr-48291",
    pipelineRunId: "run-48291",
    resolutionSnapshot: {
      status: "review_queued",
      resolvedAt: null,
      resolvedBy: null,
    },
    auditLogRefs: ["audit-log-811", "audit-log-812"],
    actor: {
      id: "pipeline-service",
      type: "service" as const,
      displayName: "QA Pipeline",
    },
  };

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
          ...complianceMetadata,
        },
        fixedNow
      );

      expect(pack).toEqual({
        packVersion: "1.0.0",
        jobSheetId: "js-48291",
        correlationId: "corr-48291",
        pipelineRunId: "run-48291",
        confidence: 0.81,
        findings: sampleFindings,
        reasons: ["mid-confidence band", "S1 finding present"],
        resolutionSnapshot: {
          status: "review_queued",
          resolvedAt: null,
          resolvedBy: null,
        },
        auditLogRefs: ["audit-log-811", "audit-log-812"],
        actor: {
          id: "pipeline-service",
          type: "service",
          displayName: "QA Pipeline",
        },
        generatedAt: "2026-07-09T12:00:00.000Z",
        contentHash:
          "sha256:fa60b95a039802b82c688a6aeaa653af4cf1c1067f39b628a23618ae63eb5d7c",
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
          ...complianceMetadata,
        },
        fixedNow
      );

      expect(pack.packVersion).toBe("1.0.0");
      expect(pack.jobSheetId).toBe("js-clean");
      expect(pack.correlationId).toBe("corr-48291");
      expect(pack.pipelineRunId).toBe("run-48291");
      expect(pack.confidence).toBe(0.97);
      expect(pack.findings).toEqual([]);
      expect(pack.reasons).toEqual([]);
      expect(pack.resolutionSnapshot).toEqual(
        complianceMetadata.resolutionSnapshot
      );
      expect(pack.auditLogRefs).toEqual(complianceMetadata.auditLogRefs);
      expect(pack.actor).toEqual(complianceMetadata.actor);
      expect(pack.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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
          ...complianceMetadata,
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
          ...complianceMetadata,
        },
        new Date("2026-07-09T00:00:00.000Z")
      );

      findings.push({ id: "f-extra", severity: "S2" });
      reasons.push("extra reason");

      expect(pack.findings).toHaveLength(1);
      expect(pack.reasons).toHaveLength(1);
    });

    it("includes all required compliance metadata fields", async () => {
      const { buildEvidencePack } = await import("../../services/evidencePack");
      const pack = buildEvidencePack(
        {
          jobSheetId: "js-metadata",
          confidence: 0.8,
          findings: sampleFindings,
          ...complianceMetadata,
        },
        new Date("2026-07-09T12:00:00.000Z")
      );

      for (const field of [
        "packVersion",
        "correlationId",
        "pipelineRunId",
        "resolutionSnapshot",
        "auditLogRefs",
        "contentHash",
        "actor",
      ]) {
        expect(pack).toHaveProperty(field);
      }
    });
  });

  describe("generateEvidencePack", () => {
    const input = {
      jobSheetId: "js-flagged",
      confidence: 0.81,
      findings: sampleFindings,
      ...complianceMetadata,
    };

    it("does not generate a pack while the flag is disabled", async () => {
      const { generateEvidencePack } = await import(
        "../../services/evidencePack"
      );

      expect(generateEvidencePack(input)).toBeUndefined();
    });

    it("generates a metadata-complete pack while the flag is enabled", async () => {
      process.env.FEATURE_EVIDENCE_PACK = "true";
      const { generateEvidencePack } = await import(
        "../../services/evidencePack"
      );

      const pack = generateEvidencePack(
        input,
        new Date("2026-07-09T12:00:00.000Z")
      );

      expect(pack).toMatchObject({
        correlationId: "corr-48291",
        pipelineRunId: "run-48291",
        actor: { id: "pipeline-service", type: "service" },
      });
      expect(pack?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
});
