import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../../_core/trpc";
import { auditActionsRouter } from "../../routers/auditActionsRouter";

vi.mock("../../db", () => ({
  getAuditFindingById: vi.fn(),
  getJobSheetById: vi.fn(),
  getAuditResultById: vi.fn(),
  updateFindingResolution: vi.fn(),
  logAction: vi.fn(),
  runTransaction: vi.fn(async fn => fn({})),
}));

import * as db from "../../db";

const testRouter = router({
  auditActions: auditActionsRouter,
});

function createCaller(
  role: "admin" | "qa_lead" = "qa_lead",
  idempotencyKey?: string
) {
  return testRouter.createCaller({
    req: idempotencyKey
      ? ({ headers: { "idempotency-key": idempotencyKey } } as any)
      : ({} as any),
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
    vi.clearAllMocks();
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

  it("replays approve with an Idempotency-Key without repeating the mutation", async () => {
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
    vi.mocked(db.getAuditResultById).mockResolvedValue(undefined);

    const input = { findingId: 10, reason: "Reviewer approved" };
    const first = await createCaller(
      "qa_lead",
      "approve-replay-10"
    ).auditActions.approve(input);
    const replay = await createCaller(
      "qa_lead",
      "approve-replay-10"
    ).auditActions.approve(input);

    expect(replay).toEqual(first);
    expect(db.updateFindingResolution).toHaveBeenCalledTimes(1);
    expect(db.logAction).toHaveBeenCalledTimes(1);
  });
});
