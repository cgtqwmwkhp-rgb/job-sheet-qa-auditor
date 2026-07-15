import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  committed: {
    auditIds: [] as number[],
    jobSheetStatuses: [] as Array<{ id: number; status: string }>,
  },
}));

vi.mock("../db", () => ({
  runTransaction: vi.fn(async callback => {
    const tx = {
      auditIds: [] as number[],
      jobSheetStatuses: [] as Array<{ id: number; status: string }>,
    };

    const result = await callback(tx);
    database.committed.auditIds.push(...tx.auditIds);
    database.committed.jobSheetStatuses.push(...tx.jobSheetStatuses);
    return result;
  }),
  createAuditResult: vi.fn(async (_data, tx) => {
    tx.auditIds.push(101);
    return { id: 101 };
  }),
  createAuditFindings: vi.fn(async () => {
    throw new Error("findings insert failed");
  }),
  updateJobSheetStatus: vi.fn(async (id, status, tx) => {
    tx.jobSheetStatuses.push({ id, status });
  }),
}));

import * as db from "../db";
import { completeJobSheetProcessing } from "./transactions";

describe("completeJobSheetProcessing", () => {
  beforeEach(() => {
    database.committed.auditIds = [];
    database.committed.jobSheetStatuses = [];
    vi.clearAllMocks();
  });

  it("rolls back status and audit when findings creation fails", async () => {
    await expect(
      completeJobSheetProcessing(42, "completed", {} as any, [{} as any])
    ).rejects.toThrow("findings insert failed");

    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(db.updateJobSheetStatus).toHaveBeenCalledWith(
      42,
      "completed",
      expect.any(Object)
    );
    expect(db.createAuditResult).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object)
    );
    expect(db.createAuditFindings).toHaveBeenCalledWith(
      [expect.objectContaining({ auditResultId: 101 })],
      expect.any(Object)
    );
    expect(database.committed).toEqual({
      auditIds: [],
      jobSheetStatuses: [],
    });
  });
});
