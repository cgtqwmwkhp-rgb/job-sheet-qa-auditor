/**
 * Wave-4 A2: post-override sheet truth recalculation + review labels → ECE.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFindingAction,
  deriveSheetResultFromFindings,
  type AuditActionDeps,
  type FindingRecord,
  type AuditResultRecord,
  type WaiverRecord,
} from "../../services/auditActions";
import {
  computeEce,
  ECE_MIN_SAMPLES,
  resolvedFindingsToPredictionSamples,
} from "../../services/calibration";

function createMemoryDeps(seed: {
  findings: FindingRecord[];
  audit: AuditResultRecord;
}) {
  const findings = new Map<number, FindingRecord>();
  const audits = new Map<number, AuditResultRecord>();
  const waivers = new Map<number, WaiverRecord>();
  let nextWaiverId = 1;
  const logs: Array<Record<string, unknown>> = [];
  const jobSheetStatuses = new Map<number, string>();

  for (const f of seed.findings) findings.set(f.id, { ...f });
  audits.set(seed.audit.id, { ...seed.audit });
  jobSheetStatuses.set(seed.audit.jobSheetId, "failed");

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
    getAuditResult: async id => audits.get(id),
    updateAuditResultStatus: async (id, result) => {
      const existing = audits.get(id);
      if (!existing) throw new Error("not found");
      audits.set(id, { ...existing, result });
    },
    updateJobSheetStatus: async (id, status) => {
      jobSheetStatuses.set(id, status);
    },
    createWaiver: async data => {
      const id = nextWaiverId++;
      waivers.set(id, {
        id,
        auditFindingId: data.auditFindingId,
        auditTrail: data.auditTrail,
      });
      return { id };
    },
    getWaiverByFindingId: async auditFindingId => {
      return (
        Array.from(waivers.values()).find(
          w => w.auditFindingId === auditFindingId && !w.revokedAt
        ) ?? undefined
      );
    },
    revokeWaiver: async (id, revokedBy) => {
      const waiver = waivers.get(id);
      if (!waiver) throw new Error("waiver not found");
      waivers.set(id, { ...waiver, revokedAt: new Date(), revokedBy });
    },
    logAction: async data => {
      logs.push(data as unknown as Record<string, unknown>);
    },
    listFindingsByAuditResultId: async auditResultId =>
      Array.from(findings.values()).filter(
        f => f.auditResultId === auditResultId
      ),
  };

  return { deps, findings, audits, jobSheetStatuses, logs };
}

describe("Sheet truth recalculation (Wave-4 A2)", () => {
  describe("deriveSheetResultFromFindings", () => {
    it("fails while open S0/S1 remain", () => {
      expect(
        deriveSheetResultFromFindings([
          { severity: "S0", resolutionStatus: "open" },
          { severity: "S2", resolutionStatus: "overridden" },
        ])
      ).toBe("fail");
    });

    it("passes after all critical findings are overridden", () => {
      expect(
        deriveSheetResultFromFindings([
          { severity: "S0", resolutionStatus: "overridden" },
          { severity: "S1", resolutionStatus: "overridden" },
        ])
      ).toBe("pass");
    });

    it("returns waived only when every finding is waived", () => {
      expect(
        deriveSheetResultFromFindings([
          { severity: "S1", resolutionStatus: "waived" },
          { severity: "S2", resolutionStatus: "waived" },
        ])
      ).toBe("waived");
    });

    it("review_queue when only minor findings remain open", () => {
      expect(
        deriveSheetResultFromFindings([
          { severity: "S0", resolutionStatus: "overridden" },
          { severity: "S3", resolutionStatus: "open" },
        ])
      ).toBe("review_queue");
    });
  });

  describe("applyFindingAction override recalc", () => {
    let mem: ReturnType<typeof createMemoryDeps>;

    beforeEach(() => {
      mem = createMemoryDeps({
        findings: [
          {
            id: 1,
            auditResultId: 10,
            resolutionStatus: "open",
            severity: "S0",
            fieldName: "signature",
          },
          {
            id: 2,
            auditResultId: 10,
            resolutionStatus: "open",
            severity: "S1",
            fieldName: "asset_id",
          },
        ],
        audit: { id: 10, jobSheetId: 100, result: "fail" },
      });
    });

    it("recalculates sheet to pass after last critical override", async () => {
      await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "override",
        reason: "False positive signature",
        userId: 7,
        trainingReasonCode: "ocr_misread",
      });
      expect(mem.audits.get(10)?.result).toBe("fail");

      const result = await applyFindingAction(mem.deps, {
        findingId: 2,
        action: "override",
        reason: "False positive asset",
        userId: 7,
        trainingReasonCode: "rule_wrong",
      });

      expect(result.auditResultStatus).toBe("pass");
      expect(result.jobSheetStatus).toBe("completed");
      expect(mem.audits.get(10)?.result).toBe("pass");
      expect(mem.jobSheetStatuses.get(100)).toBe("completed");
    });

    it("does not leave stale fail after single remaining S0 is waived", async () => {
      mem.findings.set(2, {
        id: 2,
        auditResultId: 10,
        resolutionStatus: "approved",
        severity: "S2",
      });

      const result = await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "waive",
        reason: "Accepted exception",
        userId: 7,
      });

      expect(result.auditResultStatus).toBe("pass");
      expect(mem.audits.get(10)?.result).toBe("pass");
    });
  });

  describe("review labels feed ECE", () => {
    it("human labels accumulate and unlock measurement at N≥200", () => {
      const rows = Array.from({ length: ECE_MIN_SAMPLES }, (_, i) => ({
        resolutionStatus: (i % 4 === 0 ? "approved" : "overridden") as
<<<<<<< HEAD
          | "approved"
          | "overridden",
=======
          "approved" | "overridden",
>>>>>>> fd854d7 (style: prettier format A2 changed files for CI lint gate)
        confidenceScore: 50 + (i % 50),
      }));

      const samples = resolvedFindingsToPredictionSamples(rows);
      const result = computeEce(samples);

      expect(samples.length).toBe(ECE_MIN_SAMPLES);
      expect(result.measurementReady).toBe(true);
      expect(result.ece).not.toBeNull();
      // Must not be theater-perfect zero with mixed overturns
      expect(result.ece!).toBeGreaterThan(0);
    });
  });
});
