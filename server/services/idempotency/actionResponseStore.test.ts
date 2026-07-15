import { describe, expect, it, vi } from "vitest";
import { ActionResponseStore, getIdempotencyKey } from "./actionResponseStore";

describe("ActionResponseStore", () => {
  it("replays the prior response without running the mutation twice", async () => {
    const store = new ActionResponseStore();
    const action = vi.fn(async () => ({ actionId: "audit-log-1" }));
    const request = {
      scope: "audit-action:7:approve",
      key: "approve-123",
      body: { findingId: 42, reason: "Reviewed" },
      action,
    };

    await expect(store.execute(request)).resolves.toEqual({
      actionId: "audit-log-1",
    });
    await expect(store.execute(request)).resolves.toEqual({
      actionId: "audit-log-1",
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight response across a double submission", async () => {
    let release!: () => void;
    const store = new ActionResponseStore();
    const action = vi.fn(
      () =>
        new Promise<{ actionId: string }>(resolve => {
          release = () => resolve({ actionId: "audit-log-2" });
        })
    );
    const request = {
      scope: "audit-action:7:override",
      key: "override-123",
      body: { findingId: 42, reason: "Evidence accepted" },
      action,
    };

    const first = store.execute(request);
    const second = store.execute(request);
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);

    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { actionId: "audit-log-2" },
      { actionId: "audit-log-2" },
    ]);
  });

  it("rejects reuse of a key with a different request body", async () => {
    const store = new ActionResponseStore();
    await store.execute({
      scope: "audit-action:7:approve",
      key: "approve-123",
      body: { findingId: 42, reason: "Reviewed" },
      action: async () => ({ actionId: "audit-log-3" }),
    });

    await expect(
      store.execute({
        scope: "audit-action:7:approve",
        key: "approve-123",
        body: { findingId: 42, reason: "Different reason" },
        action: async () => ({ actionId: "should-not-run" }),
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/different request body/i),
    });
  });

  it("allows a retry when the original mutation fails", async () => {
    const store = new ActionResponseStore();
    const action = vi
      .fn<() => Promise<{ actionId: string }>>()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ actionId: "audit-log-4" });
    const request = {
      scope: "audit-action:7:approveJobSheet",
      key: "sheet-123",
      body: { jobSheetId: 12 },
      action,
    };

    await expect(store.execute(request)).rejects.toThrow(
      "database unavailable"
    );
    await expect(store.execute(request)).resolves.toEqual({
      actionId: "audit-log-4",
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("reads the standard Idempotency-Key request header", () => {
    expect(
      getIdempotencyKey({ headers: { "idempotency-key": "request-123" } })
    ).toBe("request-123");
  });
});
