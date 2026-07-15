import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../../_core/trpc";
import { auditActionsRouter } from "../../routers/auditActionsRouter";

vi.mock("../../db", () => ({
  getAuditFindingById: vi.fn(),
  getJobSheetById: vi.fn(),
}));

import * as db from "../../db";

const testRouter = router({
  auditActions: auditActionsRouter,
});

function createCaller(role: "admin" | "qa_lead" = "qa_lead") {
  return testRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: {
      id: 1,
      openId: "audit-actions-contract-user",
      name: "Audit Actions Contract User",
      email: "audit-actions-contract@example.com",
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  });
}

describe("Audit actions router error contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns NOT_FOUND when a target finding is missing", async () => {
    vi.mocked(db.getAuditFindingById).mockResolvedValue(undefined);

    await expect(
      createCaller().auditActions.flag({
        findingId: 404,
        reason: "Requires review",
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Finding 404 not found",
    });
  });

  it("returns CONFLICT when an undo has no prior action", async () => {
    vi.mocked(db.getAuditFindingById).mockResolvedValue({
      id: 10,
      auditResultId: 20,
      resolutionStatus: "open",
      resolutionReason: null,
      resolvedBy: null,
      resolvedAt: null,
      previousResolutionStatus: null,
      fieldName: "assetId",
      rawSnippet: null,
      normalisedSnippet: null,
    });

    await expect(
      createCaller().auditActions.undo({ findingId: 10 })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Finding 10 has no action to undo",
    });
  });

  it("returns NOT_FOUND when a job sheet is missing", async () => {
    vi.mocked(db.getJobSheetById).mockResolvedValue(undefined);

    await expect(
      createCaller().auditActions.approveJobSheet({
        jobSheetId: 404,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Job sheet not found",
    });
  });
});
