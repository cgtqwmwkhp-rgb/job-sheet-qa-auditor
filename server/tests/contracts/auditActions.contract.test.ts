/**
 * Audit Actions Contract Tests (PR-10)
 *
 * Verifies waive / override / flag / approve / undo / bulkApprove
 * against an in-memory deps mock — no live DB or OCR/LLM.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  applyFindingAction,
  undoFindingAction,
  bulkApproveFindings,
  approveJobSheet,
  undoJobSheetApprove,
  captureFieldCorrection,
  undoFieldCorrection,
  mapActionToStatus,
  canUndo,
  buildUndoToken,
  parseUndoToken,
  type AuditActionDeps,
  type FindingRecord,
  type AuditResultRecord,
  type WaiverRecord,
  AuditActionError,
} from "../../services/auditActions";

function createMemoryDeps() {
  const findings = new Map<number, FindingRecord>();
  const audits = new Map<number, AuditResultRecord>();
  const waivers = new Map<number, WaiverRecord>();
  let nextWaiverId = 1;
  const logs: Array<Record<string, unknown>> = [];
  const jobSheetStatuses = new Map<number, string>();

  findings.set(1, {
    id: 1,
    auditResultId: 10,
    resolutionStatus: "open",
    severity: "S0",
    fieldName: "site_name",
    rawSnippet: "Acme Site",
    normalisedSnippet: "Acme Site",
  });
  findings.set(2, {
    id: 2,
    auditResultId: 10,
    resolutionStatus: "open",
    severity: "S2",
    fieldName: "date",
    rawSnippet: "01/01/2024",
    normalisedSnippet: "01/01/2024",
  });
  audits.set(10, {
    id: 10,
    jobSheetId: 100,
    result: "fail",
  });
  jobSheetStatuses.set(100, "completed");

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
    getAuditResultByJobSheetId: async jobSheetId =>
      Array.from(audits.values()).find(
        audit => audit.jobSheetId === jobSheetId
      ),
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
          w =>
            w.auditFindingId === auditFindingId &&
            !(w as WaiverRecord & { revokedAt?: Date }).revokedAt
        ) ?? undefined
      );
    },
    revokeWaiver: async (id, revokedBy) => {
      const waiver = waivers.get(id);
      if (!waiver) throw new Error("waiver not found");
      waivers.set(id, {
        ...waiver,
        revokedAt: new Date(),
        revokedBy,
      });
    },
    logAction: async data => {
      logs.push(data as unknown as Record<string, unknown>);
    },
    listFindingsByAuditResultId: async auditResultId =>
      Array.from(findings.values()).filter(
        f => f.auditResultId === auditResultId
      ),
  };

  return { deps, findings, audits, waivers, logs, jobSheetStatuses };
}

describe("Audit Actions Contract (PR-10)", () => {
  describe("source structure", () => {
    it("auditActions service module exists", () => {
      const indexPath = path.resolve(
        __dirname,
        "../../services/auditActions/index.ts"
      );
      const typesPath = path.resolve(
        __dirname,
        "../../services/auditActions/types.ts"
      );
      expect(fs.existsSync(indexPath)).toBe(true);
      expect(fs.existsSync(typesPath)).toBe(true);
    });

    it("auditActionsRouter is registered on appRouter", () => {
      const routersPath = path.resolve(__dirname, "../../routers.ts");
      const content = fs.readFileSync(routersPath, "utf-8");
      expect(content).toContain("auditActionsRouter");
      expect(content).toContain("auditActions:");
    });

    it("schema includes finding resolutionStatus", () => {
      const schemaPath = path.resolve(__dirname, "../../../drizzle/schema.ts");
      const content = fs.readFileSync(schemaPath, "utf-8");
      expect(content).toContain("resolutionStatus");
      expect(content).toContain("previousResolutionStatus");
      expect(content).toContain('revokedAt: timestamp("revokedAt")');
      expect(content).toContain('revokedBy: int("revokedBy")');
    });

    it("revokes waivers without hard-deleting their audit evidence", () => {
      const dbPath = path.resolve(__dirname, "../../db.ts");
      const dbSource = fs.readFileSync(dbPath, "utf-8");
      expect(dbSource).toContain("export async function revokeWaiver");
      expect(dbSource).toContain("isNull(waivers.revokedAt)");
      expect(dbSource).not.toContain("db.delete(waivers)");
    });

    it("auditActionsRouter wraps compliance mutations in DB transactions", () => {
      const routerPath = path.resolve(
        __dirname,
        "../../routers/auditActionsRouter.ts"
      );
      const dbPath = path.resolve(__dirname, "../../db.ts");
      const router = fs.readFileSync(routerPath, "utf-8");
      const dbSource = fs.readFileSync(dbPath, "utf-8");
      expect(router).toContain("runAuditAction");
      expect(router).toContain("withTransaction");
      expect(router).toContain("required: true");
      expect(dbSource).toContain("export async function runTransaction");
    });

    it("AuditResults wires Flag and Override handlers", () => {
      const pagePath = path.resolve(
        __dirname,
        "../../../client/src/pages/AuditResults.tsx"
      );
      const panePath = path.resolve(
        __dirname,
        "../../../client/src/components/review/ReviewWorkstationPane.tsx"
      );
      const page = fs.readFileSync(pagePath, "utf-8");
      const pane = fs.readFileSync(panePath, "utf-8");
      expect(page).toContain("ReviewWorkstationPane");
      expect(pane).toContain("auditActions.flag");
      expect(pane).toContain("auditActions.override");
      expect(pane).toContain("handleFlagForReview");
      expect(pane).toContain("onOverride");
      expect(pane).toContain('label: "Undo"');
    });

    it("AuditResults wires sheet approve parity with Hold Queue gates", () => {
      const pagePath = path.resolve(
        __dirname,
        "../../../client/src/pages/AuditResults.tsx"
      );
      const page = fs.readFileSync(pagePath, "utf-8");
      expect(page).toContain("auditActions.approveJobSheet");
      expect(page).toContain("auditActions.undoJobSheetApprove");
      expect(page).toContain("handleApprove");
      expect(page).toContain("handleReject");
      expect(page).toContain("showJobSheetActions");
      expect(page).toContain("onApproveJobSheet");
      expect(page).toContain('status === "review_queue"');
      expect(page).toContain("Approved from audit results");
      expect(page).toContain('label: "Undo"');
      // Same mutation surface as Hold Queue (qaLeadProcedure on server).
      expect(page).not.toContain("onApprove: () => undefined");
    });

    it("HoldQueue wires Approve and Bulk Approve", () => {
      const pagePath = path.resolve(
        __dirname,
        "../../../client/src/pages/HoldQueue.tsx"
      );
      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain("auditActions.approveJobSheet");
      expect(content).toContain("handleBulkApprove");
      expect(content).toContain("handleApprove");
      expect(content).toContain('label: "Undo"');
    });
  });

  describe("helpers", () => {
    it("maps actions to resolution statuses", () => {
      expect(mapActionToStatus("waive")).toBe("waived");
      expect(mapActionToStatus("override")).toBe("overridden");
      expect(mapActionToStatus("flag")).toBe("flagged");
      expect(mapActionToStatus("approve")).toBe("approved");
    });

    it("canUndo is false only for open", () => {
      expect(canUndo("open")).toBe(false);
      expect(canUndo("waived")).toBe(true);
      expect(canUndo("flagged")).toBe(true);
    });

    it("builds and parses undo tokens", () => {
      const token = buildUndoToken(42, "open", "overridden");
      expect(token).toBe("undo:42:open->overridden");
      expect(parseUndoToken(token)).toEqual({
        findingId: 42,
        fromStatus: "open",
        toStatus: "overridden",
      });
      expect(parseUndoToken("bad")).toBeNull();
    });
  });

  describe("applyFindingAction", () => {
    let mem: ReturnType<typeof createMemoryDeps>;

    beforeEach(() => {
      mem = createMemoryDeps();
    });

    it("overrides a finding and records previous status", async () => {
      const result = await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "override",
        reason: "False positive",
        userId: 7,
      });

      expect(result.success).toBe(true);
      expect(result.resolutionStatus).toBe("overridden");
      expect(result.previousResolutionStatus).toBe("open");
      expect(result.undoToken).toContain("undo:1:");
      expect(mem.findings.get(1)?.resolutionStatus).toBe("overridden");
      expect(mem.logs.some(l => l.action === "FINDING_OVERRIDE")).toBe(true);
    });

    it("waives a finding and recalculates sheet from remaining findings", async () => {
      const result = await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "waive",
        reason: "Approved exception",
        userId: 7,
      });

      expect(result.waiverId).toBeDefined();
      expect(mem.waivers.size).toBe(1);
      // Finding 2 (S2) still open → review_queue, not stale fail / blanket waived
      expect(mem.audits.get(10)?.result).toBe("review_queue");
      expect(result.auditResultStatus).toBe("review_queue");
    });

    it("flags a finding and moves job sheet to review_queue", async () => {
      const result = await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "flag",
        reason: "Needs human review",
        userId: 7,
      });

      expect(result.jobSheetStatus).toBe("review_queue");
      expect(mem.jobSheetStatuses.get(100)).toBe("review_queue");
      expect(mem.audits.get(10)?.result).toBe("review_queue");
    });

    it("approves a finding", async () => {
      const result = await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "approve",
        reason: "Looks correct",
        userId: 7,
      });

      expect(result.resolutionStatus).toBe("approved");
      expect(mem.findings.get(1)?.resolutionStatus).toBe("approved");
    });

    it("throws when finding is missing", async () => {
      await expect(
        applyFindingAction(mem.deps, {
          findingId: 999,
          action: "flag",
          reason: "x",
          userId: 1,
        })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("undoFindingAction", () => {
    it("soft-undoes override back to open", async () => {
      const mem = createMemoryDeps();
      await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "override",
        reason: "fp",
        userId: 1,
      });

      const undone = await undoFindingAction(mem.deps, {
        findingId: 1,
        userId: 1,
      });

      expect(undone.action).toBe("undo");
      expect(undone.resolutionStatus).toBe("open");
      expect(mem.findings.get(1)?.resolutionStatus).toBe("open");
      expect(mem.logs.some(l => l.action === "FINDING_UNDO")).toBe(true);
    });

    it("undoing waive revokes the waiver while preserving its audit trail", async () => {
      const mem = createMemoryDeps();
      await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "waive",
        reason: "exception",
        userId: 1,
      });
      expect(mem.waivers.size).toBe(1);

      const undone = await undoFindingAction(mem.deps, {
        findingId: 1,
        userId: 1,
      });

      expect(undone.revokedWaiverId).toBeDefined();
      expect(mem.waivers.size).toBe(1);
      const waiver = mem.waivers.get(
        undone.revokedWaiverId!
      ) as WaiverRecord & {
        auditTrail: unknown;
        revokedAt?: Date;
        revokedBy?: number;
      };
      expect(waiver.auditTrail).toEqual([
        expect.objectContaining({ action: "CREATED", reason: "exception" }),
      ]);
      expect(waiver.revokedAt).toBeInstanceOf(Date);
      expect(waiver.revokedBy).toBe(1);
      expect(await mem.deps.getWaiverByFindingId(1)).toBeUndefined();
    });

    it("throws when nothing to undo", async () => {
      const mem = createMemoryDeps();
      await expect(
        undoFindingAction(mem.deps, { findingId: 1, userId: 1 })
      ).rejects.toThrow(/no action to undo/i);
    });
  });

  describe("bulkApproveFindings", () => {
    it("approves multiple findings and skips already-approved", async () => {
      const mem = createMemoryDeps();
      await applyFindingAction(mem.deps, {
        findingId: 2,
        action: "approve",
        reason: "already",
        userId: 1,
      });

      const result = await bulkApproveFindings(mem.deps, {
        findingIds: [1, 2, 999],
        reason: "Bulk ok",
        userId: 1,
      });

      expect(result.approvedIds).toEqual([1]);
      expect(result.skippedIds).toContain(2);
      expect(result.skippedIds).toContain(999);
      expect(result.undoTokens).toHaveLength(1);
    });
  });

  describe("job sheet approve / undo", () => {
    it("rejects approval while a Major finding is open", async () => {
      const mem = createMemoryDeps();

      await expect(
        approveJobSheet(mem.deps, {
          jobSheetId: 100,
          userId: 1,
          previousStatus: "review_queue",
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      } satisfies Partial<AuditActionError>);
      expect(mem.logs.some(log => log.action === "JOB_SHEET_APPROVE")).toBe(
        false
      );
    });

    it("rejects an open actionable photo-pair cost risk", async () => {
      const mem = createMemoryDeps();
      mem.findings.set(1, {
        ...mem.findings.get(1)!,
        severity: "S2",
        ruleId: "PHOTO-C012",
      });

      await expect(
        approveJobSheet(mem.deps, {
          jobSheetId: 100,
          userId: 1,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("approves after Majors and photo cost risks are disposed", async () => {
      const mem = createMemoryDeps();
      mem.findings.set(1, {
        ...mem.findings.get(1)!,
        resolutionStatus: "overridden",
      });
      mem.findings.set(3, {
        id: 3,
        auditResultId: 10,
        resolutionStatus: "waived",
        severity: "S2",
        ruleId: "PHOTO-C013",
      });

      const result = await approveJobSheet(mem.deps, {
        jobSheetId: 100,
        userId: 1,
        previousStatus: "review_queue",
      });

      expect(result.newStatus).toBe("completed");
      expect(mem.jobSheetStatuses.get(100)).toBe("completed");
      expect(result.undoToken).toContain("undo-js:100:");
    });

    it("allows approval when an open Major has a corrected value", async () => {
      const mem = createMemoryDeps();
      mem.findings.set(1, {
        ...mem.findings.get(1)!,
        normalisedSnippet: "Corrected site",
      });

      await expect(
        approveJobSheet(mem.deps, {
          jobSheetId: 100,
          userId: 1,
        })
      ).resolves.toMatchObject({ newStatus: "completed" });
    });

    it("undoes job sheet approve", async () => {
      const mem = createMemoryDeps();
      mem.findings.set(1, {
        ...mem.findings.get(1)!,
        resolutionStatus: "approved",
      });
      await approveJobSheet(mem.deps, {
        jobSheetId: 100,
        userId: 1,
        previousStatus: "review_queue",
      });

      const undone = await undoJobSheetApprove(mem.deps, {
        jobSheetId: 100,
        userId: 1,
        restoreStatus: "review_queue",
      });

      expect(undone.newStatus).toBe("review_queue");
      expect(mem.jobSheetStatuses.get(100)).toBe("review_queue");
    });
  });

  describe("captureFieldCorrection (PR-13)", () => {
    it("updates normalisedSnippet and logs FIELD_CORRECTION", async () => {
      const mem = createMemoryDeps();
      const result = await captureFieldCorrection(mem.deps, {
        findingId: 1,
        fieldName: "site_name",
        originalValue: "Acme Site",
        correctedValue: "ACME Industrial Site",
        userId: 7,
        trainingReasonCode: "ocr_misread",
      });

      expect(result.success).toBe(true);
      expect(result.correctedValue).toBe("ACME Industrial Site");
      expect(result.previousSnippet).toBe("Acme Site");
      expect(mem.findings.get(1)?.normalisedSnippet).toBe(
        "ACME Industrial Site"
      );
      const fcLog = mem.logs.find(l => l.action === "FIELD_CORRECTION");
      expect(fcLog).toBeTruthy();
      const details = fcLog!.details as Record<string, unknown>;
      expect(details.trainingSignal).toBeTruthy();
    });

    it("undoes a field correction", async () => {
      const mem = createMemoryDeps();
      const captured = await captureFieldCorrection(mem.deps, {
        findingId: 1,
        correctedValue: "Fixed value",
        userId: 1,
      });

      await undoFieldCorrection(mem.deps, {
        findingId: 1,
        previousSnippet: captured.previousSnippet,
        userId: 1,
      });

      expect(mem.findings.get(1)?.normalisedSnippet).toBe("Acme Site");
      expect(mem.logs.some(l => l.action === "FIELD_CORRECTION_UNDO")).toBe(
        true
      );
    });

    it("rejects empty corrected values", async () => {
      const mem = createMemoryDeps();
      await expect(
        captureFieldCorrection(mem.deps, {
          findingId: 1,
          correctedValue: "   ",
          userId: 1,
        })
      ).rejects.toThrow(/required/i);
    });
  });

  describe("no live network", () => {
    it("service source has no fetch / https calls", () => {
      const indexPath = path.resolve(
        __dirname,
        "../../services/auditActions/index.ts"
      );
      const content = fs.readFileSync(indexPath, "utf-8");
      expect(content).not.toMatch(/fetch\s*\(/);
      expect(content).not.toContain("https://");
      expect(content).not.toContain("openai");
      expect(content).not.toContain("mistral");
    });
  });
});
