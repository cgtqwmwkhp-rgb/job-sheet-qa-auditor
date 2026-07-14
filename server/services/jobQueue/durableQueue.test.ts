/**
 * Durable job queue evidence — restart survival + cross-instance dedupe.
 * Uses an in-process durable store (same semantics as MySQL activeDedupeKey).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processJobSheet = vi.hoisted(() => vi.fn());
const orchestrateJobSheetProcessing = vi.hoisted(() => vi.fn());

vi.mock("../documentProcessor", () => ({
  processJobSheet: (...args: unknown[]) => processJobSheet(...args),
  orchestrateJobSheetProcessing: (...args: unknown[]) =>
    orchestrateJobSheetProcessing(...args),
}));

import {
  clearJobSheetProcessingQueue,
  createTestDurableBackend,
  drainJobSheetProcessingQueue,
  enqueueJobSheetProcessing,
  getJobSheetProcessingJobAsync,
  recoverJobSheetProcessingQueue,
  setJobQueueBackendForTests,
  stopJobSheetProcessingPoller,
} from "./index";
import type { JobQueueBackend } from "./types";

describe("Durable job queue — restart + scale-out dedupe", () => {
  let shared: JobQueueBackend;
  const previousStale = process.env.JOB_QUEUE_STALE_LOCK_MS;

  beforeEach(() => {
    stopJobSheetProcessingPoller();
    shared = createTestDurableBackend();
    setJobQueueBackendForTests(shared);
    processJobSheet.mockReset();
    orchestrateJobSheetProcessing.mockReset();
    processJobSheet.mockResolvedValue({ success: true });
    orchestrateJobSheetProcessing.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    await drainJobSheetProcessingQueue();
    await clearJobSheetProcessingQueue();
    stopJobSheetProcessingPoller();
    setJobQueueBackendForTests(null);
    if (previousStale === undefined) {
      delete process.env.JOB_QUEUE_STALE_LOCK_MS;
    } else {
      process.env.JOB_QUEUE_STALE_LOCK_MS = previousStale;
    }
  });

  it("survives a worker restart with the same durable store", async () => {
    // Enqueue directly into the durable store (no live worker yet).
    const { job, deduped } = await Promise.resolve(
      shared.enqueue({
        source: "primary",
        jobSheetId: 101,
        documentUrl: "https://example.test/durable.pdf",
        goldSpecId: 1,
        userId: 2,
      })
    );
    expect(deduped).toBe(false);
    expect(job.status).toBe("queued");

    // Simulate process death: detach backend, then reattach same store.
    setJobQueueBackendForTests(null);
    stopJobSheetProcessingPoller();

    setJobQueueBackendForTests(shared);
    const stillQueued = await getJobSheetProcessingJobAsync(job.id);
    expect(stillQueued?.status).toBe("queued");
    expect(stillQueued?.payload.jobSheetId).toBe(101);

    await drainJobSheetProcessingQueue();

    expect(orchestrateJobSheetProcessing).toHaveBeenCalledTimes(1);
    expect(orchestrateJobSheetProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        jobSheetId: 101,
        documentUrl: "https://example.test/durable.pdf",
      })
    );
    const completed = await getJobSheetProcessingJobAsync(job.id);
    expect(completed?.status).toBe("completed");
  });

  it("dedupes across instances sharing the durable store", async () => {
    const first = await Promise.resolve(
      shared.enqueue({
        source: "primary",
        jobSheetId: 55,
        documentUrl: "https://example.test/a.pdf",
      })
    );
    // Second instance / replica hits the same durable store.
    const second = await Promise.resolve(
      shared.enqueue({
        source: "reprocess",
        jobSheetId: 55,
        documentUrl: "https://example.test/a.pdf",
      })
    );

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.job.id).toBe(first.job.id);

    // Public API also reports durable + same dedupe when backend injected.
    const viaApi = await Promise.resolve(
      enqueueJobSheetProcessing({
        source: "primary",
        jobSheetId: 55,
        documentUrl: "https://example.test/a.pdf",
      })
    );
    expect(viaApi.deduped).toBe(true);
    expect(viaApi.jobId).toBe(first.job.id);
    expect(viaApi.durable).toBe(true);

    await drainJobSheetProcessingQueue();
    expect(orchestrateJobSheetProcessing).toHaveBeenCalledTimes(1);
  });

  it("reclaims stale running jobs after crash", async () => {
    process.env.JOB_QUEUE_STALE_LOCK_MS = "1";

    const { job } = await Promise.resolve(
      shared.enqueue({
        source: "primary",
        jobSheetId: 77,
        documentUrl: "https://example.test/stale.pdf",
      })
    );

    const claimed = await shared.dequeue();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("running");

    if (claimed?.startedAt) {
      claimed.startedAt = new Date(Date.now() - 1000);
    }

    const reclaimed = await recoverJobSheetProcessingQueue();
    expect(reclaimed).toBe(1);

    await drainJobSheetProcessingQueue();
    expect(orchestrateJobSheetProcessing).toHaveBeenCalledTimes(1);
    const done = await getJobSheetProcessingJobAsync(job.id);
    expect(done?.status).toBe("completed");
  });
});
