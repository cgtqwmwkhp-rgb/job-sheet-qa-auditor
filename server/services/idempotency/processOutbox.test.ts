/**
 * Wave-4 C2 — durable process outbox + Idempotency-Key replay.
 * Fixtures only — no live OCR / LLM / network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProcessOutboxForTests,
  executeProcessOutbox,
  listProcessOutboxForTests,
  resumePendingProcessOutbox,
  seedPendingProcessOutboxForTests,
  setProcessOutboxBackendForTests,
} from "./processOutbox";

describe("processOutbox (Wave-4 C2)", () => {
  beforeEach(() => {
    clearProcessOutboxForTests();
    setProcessOutboxBackendForTests("memory");
  });

  afterEach(() => {
    clearProcessOutboxForTests();
    setProcessOutboxBackendForTests(null);
  });

  it("double-submit with the same Idempotency-Key runs the action once", async () => {
    const action = vi.fn(async () => ({
      accepted: true,
      async: true,
      jobId: "job-1",
      jobSheetId: 42,
      deduped: false,
    }));

    const request = {
      scope: "jobSheets.process:7",
      key: "client-key-abc",
      body: { id: 42, goldSpecId: 1 },
      action,
    };

    const first = await executeProcessOutbox(request);
    const second = await executeProcessOutbox(request);

    expect(second).toEqual(first);
    expect(action).toHaveBeenCalledTimes(1);
    expect(listProcessOutboxForTests()[0]?.status).toBe("completed");
  });

  it("shares an in-flight response across concurrent double-submit", async () => {
    let release!: () => void;
    const action = vi.fn(
      () =>
        new Promise<{ jobId: string }>(resolve => {
          release = () => resolve({ jobId: "job-inflight" });
        })
    );

    const request = {
      scope: "jobSheets.process:7",
      key: "client-key-inflight",
      body: { id: 99 },
      action,
    };

    const first = executeProcessOutbox(request);
    const second = executeProcessOutbox(request);

    await vi.waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });

    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { jobId: "job-inflight" },
      { jobId: "job-inflight" },
    ]);
  });

  it("rejects the same key with a different request body", async () => {
    await executeProcessOutbox({
      scope: "jobSheets.process:7",
      key: "client-key-body",
      body: { id: 1 },
      action: async () => ({ ok: true }),
    });

    await expect(
      executeProcessOutbox({
        scope: "jobSheets.process:7",
        key: "client-key-body",
        body: { id: 2 },
        action: async () => ({ ok: false }),
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/different request body/i),
    });
  });

  it("allows retry after a failed attempt", async () => {
    const action = vi
      .fn<() => Promise<{ ok: boolean }>>()
      .mockRejectedValueOnce(new Error("enqueue failed"))
      .mockResolvedValueOnce({ ok: true });

    const request = {
      scope: "jobSheets.process:7",
      key: "client-key-retry",
      body: { id: 5 },
      action,
    };

    await expect(executeProcessOutbox(request)).rejects.toThrow(
      "enqueue failed"
    );
    await expect(executeProcessOutbox(request)).resolves.toEqual({ ok: true });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("passes through when Idempotency-Key is absent", async () => {
    const action = vi.fn(async () => ({ ok: true }));
    await executeProcessOutbox({
      scope: "jobSheets.process:7",
      key: null,
      body: { id: 1 },
      action,
    });
    await executeProcessOutbox({
      scope: "jobSheets.process:7",
      key: "  ",
      body: { id: 1 },
      action,
    });
    expect(action).toHaveBeenCalledTimes(2);
    expect(listProcessOutboxForTests()).toHaveLength(0);
  });

  it("resume completes pending outbox against an active job without reenqueue", async () => {
    seedPendingProcessOutboxForTests({
      scope: "jobSheets.process:7",
      key: "client-key-resume-active",
      body: { id: 77 },
    });
    expect(listProcessOutboxForTests()[0]?.status).toBe("pending");

    const reenqueue = vi.fn(async () => ({ billed: true }));
    const resumed = await resumePendingProcessOutbox({
      findActiveJob: async id =>
        id === 77 ? { id: "job-already-queued", status: "queued" } : null,
      getJobSheetStatus: async () => "processing",
      reenqueue,
    });

    expect(resumed).toBe(1);
    expect(reenqueue).not.toHaveBeenCalled();
    expect(listProcessOutboxForTests()[0]).toMatchObject({
      status: "completed",
      responseJson: expect.objectContaining({
        jobId: "job-already-queued",
        deduped: true,
        reason: "outbox_resume",
      }),
    });
  });

  it("resume reenqueues once when sheet is still pending and no active job", async () => {
    seedPendingProcessOutboxForTests({
      scope: "jobSheets.process:3",
      key: "client-key-resume-reenqueue",
      body: { id: 55 },
    });

    const reenqueue = vi.fn(async () => ({
      accepted: true,
      async: true,
      jobId: "job-resumed",
      jobSheetId: 55,
      deduped: false,
    }));

    const resumed = await resumePendingProcessOutbox({
      findActiveJob: async () => null,
      getJobSheetStatus: async () => "pending",
      reenqueue,
    });

    expect(resumed).toBe(1);
    expect(reenqueue).toHaveBeenCalledTimes(1);
    expect(listProcessOutboxForTests()[0]?.status).toBe("completed");
    expect(listProcessOutboxForTests()[0]?.responseJson).toMatchObject({
      jobId: "job-resumed",
      deduped: false,
    });
  });

  it("resume marks terminal sheets completed without reenqueue (no double bill)", async () => {
    seedPendingProcessOutboxForTests({
      scope: "jobSheets.process:3",
      key: "client-key-resume-terminal",
      body: { id: 12 },
    });

    const reenqueue = vi.fn(async () => ({ billed: true }));
    const resumed = await resumePendingProcessOutbox({
      findActiveJob: async () => null,
      getJobSheetStatus: async () => "completed",
      reenqueue,
    });

    expect(resumed).toBe(1);
    expect(reenqueue).not.toHaveBeenCalled();
    expect(listProcessOutboxForTests()[0]?.responseJson).toMatchObject({
      reason: "outbox_resume_terminal",
      status: "completed",
      deduped: true,
    });
  });
});
