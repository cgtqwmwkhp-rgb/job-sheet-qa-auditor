/**
 * Training signal contract tests (TrainLoop R2/R3).
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  applyFindingAction,
  captureFieldCorrection,
  type AuditActionDeps,
  type FindingRecord,
  type AuditResultRecord,
} from "../../services/auditActions";
import {
  TRAINING_REASON_CODES,
  buildTrainingSignal,
  extractTrainingSignal,
  normalizeTrainingReasonCode,
  resolveJobSheetsForFindings,
  withTrainingSignalDetails,
} from "../../services/trainingSignals";

function createMemoryDeps() {
  const findings = new Map<number, FindingRecord>();
  const audits = new Map<number, AuditResultRecord>();
  const logs: Array<Record<string, unknown>> = [];

  findings.set(1, {
    id: 1,
    auditResultId: 10,
    resolutionStatus: "open",
    fieldName: "tyre_psi",
    rawSnippet: "32",
    normalisedSnippet: "32",
    ruleId: "TYRE_PSI_RANGE",
    reasonCode: "OUT_OF_POLICY",
  });
  audits.set(10, { id: 10, jobSheetId: 100, result: "fail" });

  const deps: AuditActionDeps = {
    getFinding: async id => findings.get(id),
    updateFindingResolution: async (id, data) => {
      const existing = findings.get(id);
      if (!existing) throw new Error("not found");
      findings.set(id, {
        ...existing,
        resolutionStatus: data.resolutionStatus,
        resolutionReason: data.resolutionReason,
        resolvedBy: data.resolvedBy,
        resolvedAt: data.resolvedAt ?? null,
        previousResolutionStatus: data.previousResolutionStatus,
      });
    },
    updateFindingSnippet: async (id, data) => {
      const existing = findings.get(id);
      if (!existing) throw new Error("not found");
      findings.set(id, {
        ...existing,
        normalisedSnippet: data.normalisedSnippet,
      });
    },
    getAuditResult: async id => audits.get(id),
    updateAuditResultStatus: async (id, result) => {
      const existing = audits.get(id);
      if (!existing) throw new Error("not found");
      audits.set(id, { ...existing, result });
    },
    updateJobSheetStatus: async () => {},
    createWaiver: async data => ({ id: data.auditFindingId }),
    getWaiverByFindingId: async () => undefined,
    revokeWaiver: async () => {},
    logAction: async data => {
      logs.push(data as unknown as Record<string, unknown>);
    },
  };

  return { deps, logs, findings, audits };
}

describe("Training signals contract", () => {
  describe("taxonomy", () => {
    it("exports required reason codes", () => {
      expect(TRAINING_REASON_CODES).toEqual([
        "ocr_misread",
        "roi_misaligned",
        "rule_wrong",
        "template_mismatch",
        "true_defect",
      ]);
    });

    it("defaults unknown codes to true_defect", () => {
      expect(normalizeTrainingReasonCode(undefined)).toBe("true_defect");
      expect(normalizeTrainingReasonCode("bogus")).toBe("true_defect");
      expect(normalizeTrainingReasonCode("ocr_misread")).toBe("ocr_misread");
    });
  });

  describe("buildTrainingSignal", () => {
    it("builds structured override payload", () => {
      const signal = buildTrainingSignal({
        signalType: "override",
        findingId: 42,
        trainingReasonCode: "rule_wrong",
        auditResultId: 10,
        jobSheetId: 100,
        ruleId: "RULE_X",
        findingReasonCode: "OUT_OF_POLICY",
        reviewerReason: "Threshold too strict for this fleet",
      });

      expect(signal.signalType).toBe("override");
      expect(signal.reasonCode).toBe("rule_wrong");
      expect(signal.findingId).toBe(42);
      expect(signal.jobSheetId).toBe(100);
      expect(signal.reviewerReason).toContain("Threshold");
      expect(signal.capturedAt).toMatch(/^\d{4}-/);
    });
  });

  describe("persistence via auditActions", () => {
    let mem: ReturnType<typeof createMemoryDeps>;

    beforeEach(() => {
      mem = createMemoryDeps();
    });

    it("FIELD_CORRECTION log includes trainingSignal metadata", async () => {
      await captureFieldCorrection(mem.deps, {
        findingId: 1,
        correctedValue: "36",
        userId: 7,
        trainingReasonCode: "ocr_misread",
      });

      const log = mem.logs.find(l => l.action === "FIELD_CORRECTION");
      expect(log).toBeTruthy();
      const signal = extractTrainingSignal(
        (log!.details as Record<string, unknown>) ?? {}
      );
      expect(signal).not.toBeNull();
      expect(signal!.signalType).toBe("field_correction");
      expect(signal!.reasonCode).toBe("ocr_misread");
      expect(signal!.ruleId).toBe("TYRE_PSI_RANGE");
      expect(signal!.jobSheetId).toBe(100);
      expect(signal!.correctedValue).toBe("36");
    });

    it("FINDING_OVERRIDE log includes trainingSignal metadata", async () => {
      await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "override",
        reason: "False positive on cold-weather PSI",
        userId: 3,
        trainingReasonCode: "rule_wrong",
      });

      const log = mem.logs.find(l => l.action === "FINDING_OVERRIDE");
      expect(log).toBeTruthy();
      const signal = extractTrainingSignal(
        (log!.details as Record<string, unknown>) ?? {}
      );
      expect(signal).not.toBeNull();
      expect(signal!.signalType).toBe("override");
      expect(signal!.reasonCode).toBe("rule_wrong");
      expect(signal!.reviewerReason).toContain("False positive");
    });

    it("defaults training reason when omitted on field correction", async () => {
      await captureFieldCorrection(mem.deps, {
        findingId: 1,
        correctedValue: "34",
        userId: 1,
      });

      const log = mem.logs.find(l => l.action === "FIELD_CORRECTION");
      const signal = extractTrainingSignal(
        (log!.details as Record<string, unknown>) ?? {}
      );
      expect(signal?.reasonCode).toBe("true_defect");
    });
  });

  describe("resolveJobSheetsForFindings", () => {
    it("maps finding ids to distinct job sheets", async () => {
      const mem = createMemoryDeps();
      findingsSecond(mem);

      const samples = await resolveJobSheetsForFindings(mem.deps, [1, 2]);
      expect(samples).toHaveLength(2);
      expect(samples.map(s => s.jobSheetId).sort()).toEqual([100, 101]);
    });
  });

  describe("source wiring", () => {
    it("auditActionsRouter exposes trainingReasonCode + resolveSampleAudits", () => {
      const routerPath = path.resolve(
        __dirname,
        "../../routers/auditActionsRouter.ts"
      );
      const content = fs.readFileSync(routerPath, "utf-8");
      expect(content).toContain("trainingReasonCode");
      expect(content).toContain("resolveSampleAudits");
      expect(content).toContain("trainingReasonCodes");
    });

    it("DefectAnalysis worst-rules table includes Studio + audit CTAs", () => {
      const pagePath = path.resolve(
        __dirname,
        "../../../client/src/pages/analytics/DefectAnalysis.tsx"
      );
      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain("WorstRuleActions");
      expect(content).toContain("template-studio");
      expect(content).toContain("resolveSampleAudits");
    });

    it("ReviewWorkstationPane exposes training reason picker on override/correction", () => {
      const panePath = path.resolve(
        __dirname,
        "../../../client/src/components/review/ReviewWorkstationPane.tsx"
      );
      const content = fs.readFileSync(panePath, "utf-8");
      expect(content).toContain("trainingReasonLabels");
      expect(content).toContain("overrideTrainingReason");
      expect(content).toContain("correctionTrainingReason");
      expect(content).toContain("trainingReasonCode");
      expect(content).toContain("Training reason");
    });
  });
});

function findingsSecond(mem: ReturnType<typeof createMemoryDeps>) {
  mem.findings.set(2, {
    id: 2,
    auditResultId: 11,
    resolutionStatus: "open",
    fieldName: "date",
    ruleId: "DATE_FMT",
    reasonCode: "INVALID_FORMAT",
  });
  mem.audits.set(11, { id: 11, jobSheetId: 101, result: "fail" });
}

describe("withTrainingSignalDetails", () => {
  it("merges signal without dropping existing keys", () => {
    const signal = buildTrainingSignal({
      signalType: "field_correction",
      findingId: 1,
      trainingReasonCode: "roi_misaligned",
    });
    const merged = withTrainingSignalDetails({ fieldName: "x" }, signal);
    expect(merged.fieldName).toBe("x");
    expect(extractTrainingSignal(merged)?.reasonCode).toBe("roi_misaligned");
  });
});
