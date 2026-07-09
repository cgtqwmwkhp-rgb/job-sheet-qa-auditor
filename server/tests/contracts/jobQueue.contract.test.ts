/**
 * Phase 1.2 — async job queue contract tests.
 *
 * Mock-only: no OCR, AI, storage, or network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processJobSheet = vi.hoisted(() => vi.fn());
const orchestrateJobSheetProcessing = vi.hoisted(() => vi.fn());

vi.mock("../../services/documentProcessor", () => ({
  processJobSheet: (...args: unknown[]) => processJobSheet(...args),
  orchestrateJobSheetProcessing: (...args: unknown[]) =>
    orchestrateJobSheetProcessing(...args),
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
    orchestrateJobSheetProcessing.mockReset();
    processJobSheet.mockResolvedValue({ success: true });
    orchestrateJobSheetProcessing.mockResolvedValue({ success: true });
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
      source: "primary",
      jobSheetId: 12,
      documentUrl: "https://example.test/job-sheet.pdf",
      goldSpecId: 3,
      userId: 7,
    });
    const second = enqueueJobSheetProcessing({
      source: "primary",
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

    expect(orchestrateJobSheetProcessing).toHaveBeenCalledTimes(1);
    expect(getJobSheetProcessingJob(first.jobId)?.status).toBe("completed");
  });

  it("runs orchestrateJobSheetProcessing with the enqueued payload", async () => {
    enqueueJobSheetProcessing({
      source: "primary",
      jobSheetId: 31,
      documentUrl: "https://example.test/job-sheet-31.pdf",
      goldSpecId: 4,
      userId: 9,
    });

    await drainJobSheetProcessingQueue();

    expect(orchestrateJobSheetProcessing).toHaveBeenCalledWith({
      source: "primary",
      jobSheetId: 31,
      documentUrl: "https://example.test/job-sheet-31.pdf",
      goldSpecId: 4,
      userId: 9,
      templateVersionId: undefined,
    });
  });

  it("prefers orchestrateJobSheetProcessing when that export exists", () => {
    const orchestrate = vi.fn();
    const legacy = vi.fn();

    const selected = selectJobSheetProcessor({
      orchestrateJobSheetProcessing: orchestrate,
      processJobSheet: legacy,
    });

    expect(selected.mode).toBe("orchestrate");
    expect(selected.orchestrate).toBe(orchestrate);
  });
});
