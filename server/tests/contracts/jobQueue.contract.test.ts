/**
 * Phase 1.2 — async job queue contract tests.
 *
 * Mock-only: no OCR, AI, storage, or network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processJobSheet = vi.hoisted(() => vi.fn());

vi.mock("../../services/documentProcessor", () => ({
  processJobSheet: (...args: unknown[]) => processJobSheet(...args),
}));

import {
  clearInMemoryJobSheetProcessingQueue,
  drainJobSheetProcessingQueue,
  enqueueJobSheetProcessing,
  getJobSheetProcessingJob,
  isAsyncProcessingEnabled,
  selectJobSheetProcessor,
} from "../../services/jobQueue";

describe("Async job queue — Phase 1.2", () => {
  const previousFeatureFlag = process.env.FEATURE_ASYNC_PROCESSING;

  beforeEach(() => {
    clearInMemoryJobSheetProcessingQueue();
    processJobSheet.mockReset();
    processJobSheet.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    await drainJobSheetProcessingQueue();
    clearInMemoryJobSheetProcessingQueue();

    if (previousFeatureFlag === undefined) {
      delete process.env.FEATURE_ASYNC_PROCESSING;
    } else {
      process.env.FEATURE_ASYNC_PROCESSING = previousFeatureFlag;
    }
  });

  it("is disabled by default and only enabled by the string true", () => {
    delete process.env.FEATURE_ASYNC_PROCESSING;
    expect(isAsyncProcessingEnabled()).toBe(false);

    process.env.FEATURE_ASYNC_PROCESSING = "false";
    expect(isAsyncProcessingEnabled()).toBe(false);

    process.env.FEATURE_ASYNC_PROCESSING = "true";
    expect(isAsyncProcessingEnabled()).toBe(true);
  });

  it("dedupes queued work by jobSheetId", async () => {
    const first = enqueueJobSheetProcessing({
      jobSheetId: 12,
      documentUrl: "https://example.test/job-sheet.pdf",
      goldSpecId: 3,
      userId: 7,
    });
    const second = enqueueJobSheetProcessing({
      jobSheetId: 12,
      documentUrl: "https://example.test/job-sheet.pdf",
      goldSpecId: 3,
      userId: 7,
    });

    expect(first.accepted).toBe(true);
    expect(first.async).toBe(true);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);

    await drainJobSheetProcessingQueue();

    expect(processJobSheet).toHaveBeenCalledTimes(1);
    expect(getJobSheetProcessingJob(first.jobId)?.status).toBe("completed");
  });

  it("runs processJobSheet with the enqueued processing payload", async () => {
    enqueueJobSheetProcessing({
      jobSheetId: 31,
      documentUrl: "https://example.test/job-sheet-31.pdf",
      goldSpecId: 4,
      userId: 9,
    });

    await drainJobSheetProcessingQueue();

    expect(processJobSheet).toHaveBeenCalledWith(
      31,
      "https://example.test/job-sheet-31.pdf",
      4,
      9
    );
  });

  it("prefers orchestrateJobSheetProcessing when that export exists", async () => {
    const orchestrateJobSheetProcessing = vi.fn();
    const fallbackProcessJobSheet = vi.fn();

    const processor = selectJobSheetProcessor({
      orchestrateJobSheetProcessing,
      processJobSheet: fallbackProcessJobSheet,
    });

    await processor(44, "https://example.test/job-sheet-44.pdf", 5, 10);

    expect(orchestrateJobSheetProcessing).toHaveBeenCalledWith(
      44,
      "https://example.test/job-sheet-44.pdf",
      5,
      10
    );
    expect(fallbackProcessJobSheet).not.toHaveBeenCalled();
  });
});
