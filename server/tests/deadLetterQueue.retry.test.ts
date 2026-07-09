/**
 * Phase 1.10/1.1 — DLQ retry → documentProcessor orchestrator + hydrate helpers
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrateJobSheetProcessing = vi.fn();

vi.mock("../services/documentProcessor", () => ({
  orchestrateJobSheetProcessing: (...args: unknown[]) =>
    orchestrateJobSheetProcessing(...args),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import {
  addToDeadLetterQueue,
  clearDeadLetterQueue,
  getFailedJob,
  hydrateDeadLetterQueueFromDb,
  retryDeadLetterJob,
} from "../utils/deadLetterQueue";
import { runDlqRetryPass } from "../services/exceptionAnalytics/dlqRetryWorker";

describe("DLQ retry → documentProcessor orchestrator", () => {
  beforeEach(() => {
    clearDeadLetterQueue();
    orchestrateJobSheetProcessing.mockReset();
  });

  it("retryDeadLetterJob calls orchestrator and marks recovered", async () => {
    const job = addToDeadLetterQueue(42, "ocr", new Error("503"), {
      recoverable: true,
      metadata: { goldSpecId: 9 },
    });
    orchestrateJobSheetProcessing.mockResolvedValue({ success: true });

    const ok = await retryDeadLetterJob(job.id);
    expect(ok).toBe(true);
    expect(orchestrateJobSheetProcessing).toHaveBeenCalledWith({
      source: "dlq-retry",
      jobSheetId: 42,
      goldSpecId: 9,
    });
    expect(getFailedJob(job.id)).toBeUndefined();
  });

  it("retryDeadLetterJob defaults goldSpecId to 1 and increments on failure", async () => {
    const job = addToDeadLetterQueue(7, "analysis", new Error("timeout"), {
      recoverable: true,
      attempts: 1,
      maxAttempts: 3,
    });
    orchestrateJobSheetProcessing.mockRejectedValue(new Error("still failing"));

    const ok = await retryDeadLetterJob(job.id);
    expect(ok).toBe(false);
    expect(orchestrateJobSheetProcessing).toHaveBeenCalledWith({
      source: "dlq-retry",
      jobSheetId: 7,
      goldSpecId: 1,
    });
    expect(getFailedJob(job.id)?.attempts).toBe(2);
    expect(getFailedJob(job.id)?.recoverable).toBe(true);
  });

  it("default runDlqRetryPass recovers via orchestrator", async () => {
    addToDeadLetterQueue(55, "ocr", new Error("502"), { recoverable: true });
    orchestrateJobSheetProcessing.mockResolvedValue({ success: true });

    const result = await runDlqRetryPass({ limit: 5 });
    expect(result.recovered).toBe(1);
    expect(result.scanned).toBe(1);
    expect(orchestrateJobSheetProcessing).toHaveBeenCalled();
  });

  it("hydrateDeadLetterQueueFromDb is fail-safe when getDb returns null", async () => {
    await expect(hydrateDeadLetterQueueFromDb()).resolves.toBe(0);
  });
});
