/**
 * Wave-4 D1 — review claim/lock + atomic bulk resolve contract tests.
 *
 * Challenge bar:
 * - two reviewers cannot mutate same sheet without conflict
 * - bulk waive last S0/S1 → sheet flips correctly in one tx
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  applyFindingAction,
  bulkResolveFindings,
  AuditActionError,
  type AuditActionDeps,
  type FindingRecord,
  type AuditResultRecord,
  type WaiverRecord,
} from "../../services/auditActions";
import {
  canAcquireClaim,
  canMutateUnderClaim,
} from "../../services/reviewClaim";

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
  });
  findings.set(2, {
    id: 2,
    auditResultId: 10,
    resolutionStatus: "open",
    severity: "S1",
    fieldName: "date",
  });
  findings.set(3, {
    id: 3,
    auditResultId: 10,
    resolutionStatus: "open",
    severity: "S2",
    fieldName: "notes",
  });
  audits.set(10, {
    id: 10,
    jobSheetId: 100,
    result: "fail",
  });
  jobSheetStatuses.set(100, "failed");

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
    getWaiverByFindingId: async findingId =>
      Array.from(waivers.values()).find(w => w.auditFindingId === findingId),
    revokeWaiver: async () => undefined,
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

describe("Review claim + atomic bulk resolve (Wave-4 D1)", () => {
  describe("wiring", () => {
    it("auditActionsRouter exposes claim + bulkResolve + expectedStatus", () => {
      const routerPath = path.resolve(
        __dirname,
        "../../routers/auditActionsRouter.ts"
      );
      const src = fs.readFileSync(routerPath, "utf-8");
      expect(src).toContain("claimReview");
      expect(src).toContain("heartbeatClaim");
      expect(src).toContain("releaseClaim");
      expect(src).toContain("bulkResolve");
      expect(src).toContain("expectedStatus");
      expect(src).toContain("assertReviewClaimAllowsMutation");
      expect(src).toContain("reviewClaimSupported: true");
    });

    it("resolveFindingsBatch runs inside runTransaction", () => {
      const txPath = path.resolve(__dirname, "../../db/transactions.ts");
      const src = fs.readFileSync(txPath, "utf-8");
      expect(src).toContain("bulkResolveFindings");
      expect(src).toContain("runTransaction");
    });

    it("schema declares review_claims", () => {
      const schemaPath = path.resolve(__dirname, "../../../drizzle/schema.ts");
      const src = fs.readFileSync(schemaPath, "utf-8");
      expect(src).toContain("review_claims");
      expect(src).toContain("claimToken");
      expect(src).toContain("claimedBy");
    });
  });

  describe("claim conflict", () => {
    it("blocks second reviewer from acquiring a live claim", () => {
      const now = Date.now();
      const held = {
        jobSheetId: 1,
        claimedBy: 10,
        claimToken: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      };
      expect(canAcquireClaim(held, 20, now).ok).toBe(false);
      expect(canMutateUnderClaim(held, 20, undefined, now).ok).toBe(false);
      expect(canMutateUnderClaim(held, 10, held.claimToken, now).ok).toBe(true);
    });
  });

  describe("expectedStatus optimistic concurrency", () => {
    let mem: ReturnType<typeof createMemoryDeps>;

    beforeEach(() => {
      mem = createMemoryDeps();
    });

    it("rejects stale waive when expectedStatus does not match", async () => {
      await applyFindingAction(mem.deps, {
        findingId: 1,
        action: "approve",
        reason: "first reviewer",
        userId: 1,
      });

      await expect(
        applyFindingAction(mem.deps, {
          findingId: 1,
          action: "waive",
          reason: "second reviewer stale",
          userId: 2,
          expectedStatus: "open",
        })
      ).rejects.toBeInstanceOf(AuditActionError);

      await expect(
        applyFindingAction(mem.deps, {
          findingId: 1,
          action: "waive",
          reason: "second reviewer stale",
          userId: 2,
          expectedStatus: "open",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("atomic bulk resolve + sheet truth", () => {
    let mem: ReturnType<typeof createMemoryDeps>;

    beforeEach(() => {
      mem = createMemoryDeps();
    });

    it("bulk waive last S0/S1 flips sheet from fail in one recalc", async () => {
      // Leave S2 open → after waiving S0+S1, expect review_queue
      const result = await bulkResolveFindings(mem.deps, {
        findingIds: [1, 2],
        action: "waive",
        reason: "Bulk waive critical findings after QA review",
        userId: 7,
        expectedStatus: "open",
      });

      expect(result.resolvedIds).toEqual([1, 2]);
      expect(result.auditResultStatus).toBe("review_queue");
      expect(result.jobSheetStatus).toBe("review_queue");
      expect(mem.audits.get(10)?.result).toBe("review_queue");
      expect(mem.jobSheetStatuses.get(100)).toBe("review_queue");
      expect(mem.findings.get(1)?.resolutionStatus).toBe("waived");
      expect(mem.findings.get(2)?.resolutionStatus).toBe("waived");
      expect(mem.findings.get(3)?.resolutionStatus).toBe("open");
    });

    it("bulk waive all findings flips sheet to waived", async () => {
      const result = await bulkResolveFindings(mem.deps, {
        findingIds: [1, 2, 3],
        action: "waive",
        reason: "Bulk waive entire sheet findings after QA review",
        userId: 7,
      });

      expect(result.resolvedIds).toEqual([1, 2, 3]);
      expect(result.auditResultStatus).toBe("waived");
      expect(result.jobSheetStatus).toBe("completed");
      expect(mem.audits.get(10)?.result).toBe("waived");
    });

    it("bulk resolve aborts when expectedStatus conflicts mid-batch", async () => {
      mem.findings.set(2, {
        ...mem.findings.get(2)!,
        resolutionStatus: "approved",
      });

      await expect(
        bulkResolveFindings(mem.deps, {
          findingIds: [1, 2],
          action: "waive",
          reason: "Should conflict on finding 2",
          userId: 7,
          expectedStatus: "open",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });

      // Pre-validation: no writes before conflict.
      expect(mem.findings.get(1)?.resolutionStatus).toBe("open");
      expect(mem.findings.get(2)?.resolutionStatus).toBe("approved");
    });
  });
});
