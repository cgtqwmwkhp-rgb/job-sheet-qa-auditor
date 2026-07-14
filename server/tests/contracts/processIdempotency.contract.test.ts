/**
 * PR-OPS-IDEMPOTENT — process/enqueue content-hash OCR idempotency.
 *
 * Fixtures only — no live OCR, LLM, storage, or network.
 * Challenge bar: same content hash cannot double-bill OCR.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROCESS_OCR_SCOPE,
  buildProcessOcrIdempotencyKey,
  resolveProcessIdempotency,
  toProcessDedupeResponse,
} from "../../services/idempotency";
import {
  clearInMemoryJobSheetProcessingQueue,
  drainJobSheetProcessingQueue,
  enqueueJobSheetProcessing,
} from "../../services/jobQueue";

const orchestrateJobSheetProcessing = vi.hoisted(() => vi.fn());

vi.mock("../../services/documentProcessor", () => ({
  orchestrateJobSheetProcessing: (...args: unknown[]) =>
    orchestrateJobSheetProcessing(...args),
  processJobSheet: vi.fn(),
}));

describe("Process OCR idempotency (PR-OPS-IDEMPOTENT)", () => {
  beforeEach(() => {
    clearInMemoryJobSheetProcessingQueue();
    orchestrateJobSheetProcessing.mockReset();
    orchestrateJobSheetProcessing.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    await drainJobSheetProcessingQueue();
    clearInMemoryJobSheetProcessingQueue();
  });

  describe("buildProcessOcrIdempotencyKey", () => {
    it("scopes keys under process-ocr and normalizes hash case", () => {
      const a = buildProcessOcrIdempotencyKey("AbC123");
      const b = buildProcessOcrIdempotencyKey("abc123");
      expect(a).toBe(b);
      expect(a.startsWith(`${PROCESS_OCR_SCOPE}:`)).toBe(true);
    });
  });

  describe("resolveProcessIdempotency", () => {
    it("dedupes when a sibling is already processing the same content hash", async () => {
      const decision = await resolveProcessIdempotency({
        jobSheetId: 20,
        status: "pending",
        contentHash: "deadbeef",
        lookup: {
          findInFlightByContentHash: async () => ({
            id: 10,
            status: "processing",
            fileHash: "deadbeef",
          }),
          findProcessedByContentHash: async () => null,
        },
      });

      expect(decision).toMatchObject({
        action: "dedupe",
        reason: "in_flight",
        reusedFromJobSheetId: 10,
        contentHash: "deadbeef",
      });
    });

    it("dedupes when the same content hash already completed OCR", async () => {
      const decision = await resolveProcessIdempotency({
        jobSheetId: 21,
        status: "pending",
        contentHash: "cafebabe",
        lookup: {
          findInFlightByContentHash: async () => null,
          findProcessedByContentHash: async () => ({
            id: 11,
            status: "completed",
            fileHash: "cafebabe",
          }),
        },
      });

      expect(decision).toMatchObject({
        action: "dedupe",
        reason: "already_processed",
        reusedFromJobSheetId: 11,
      });
    });

    it("proceeds with idempotency key when no sibling exists", async () => {
      const decision = await resolveProcessIdempotency({
        jobSheetId: 22,
        status: "pending",
        contentHash: "00112233",
        lookup: {
          findInFlightByContentHash: async () => null,
          findProcessedByContentHash: async () => null,
        },
      });

      expect(decision.action).toBe("proceed");
      if (decision.action === "proceed") {
        expect(decision.idempotencyKey).toBe(
          buildProcessOcrIdempotencyKey("00112233")
        );
      }
    });

    it("proceeds without hash when fileHash is missing", async () => {
      const decision = await resolveProcessIdempotency({
        jobSheetId: 23,
        status: "pending",
        contentHash: null,
        lookup: {
          findInFlightByContentHash: async () => {
            throw new Error("should not lookup without hash");
          },
          findProcessedByContentHash: async () => {
            throw new Error("should not lookup without hash");
          },
        },
      });

      expect(decision).toEqual({ action: "proceed_without_hash" });
    });
  });

  describe("enqueue content-hash contract", () => {
    it("dedupes primary enqueue by contentHash across different jobSheetIds", async () => {
      const hash = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
      const key = buildProcessOcrIdempotencyKey(hash);

      const first = enqueueJobSheetProcessing({
        source: "primary",
        jobSheetId: 101,
        documentUrl: "https://example.test/a.pdf",
        contentHash: hash,
        idempotencyKey: key,
        userId: 1,
      });
      const second = enqueueJobSheetProcessing({
        source: "primary",
        jobSheetId: 102,
        documentUrl: "https://example.test/b.pdf",
        contentHash: hash,
        idempotencyKey: key,
        userId: 1,
      });

      expect(first.deduped).toBe(false);
      expect(second.deduped).toBe(true);
      expect(second.jobId).toBe(first.jobId);
      expect(second.jobSheetId).toBe(102);
      expect(second.contentHash).toBe(hash);

      await drainJobSheetProcessingQueue();

      // Single OCR/orchestration bill for the content hash
      expect(orchestrateJobSheetProcessing).toHaveBeenCalledTimes(1);
    });

    it("does not content-hash dedupe reprocess against primary", async () => {
      const hash = "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";

      const primary = enqueueJobSheetProcessing({
        source: "primary",
        jobSheetId: 201,
        documentUrl: "https://example.test/p.pdf",
        contentHash: hash,
        idempotencyKey: buildProcessOcrIdempotencyKey(hash),
      });
      const reprocess = enqueueJobSheetProcessing({
        source: "reprocess",
        jobSheetId: 202,
        documentUrl: "https://example.test/r.pdf",
        // reprocess intentionally omits contentHash
      });

      expect(primary.deduped).toBe(false);
      expect(reprocess.deduped).toBe(false);
      expect(reprocess.jobId).not.toBe(primary.jobId);

      await drainJobSheetProcessingQueue();
      expect(orchestrateJobSheetProcessing).toHaveBeenCalledTimes(2);
    });
  });

  describe("dedupe response shape", () => {
    it("returns accepted+deduped without requiring a new OCR job", () => {
      const key = buildProcessOcrIdempotencyKey("abc");
      const response = toProcessDedupeResponse({
        jobSheetId: 9,
        contentHash: "abc",
        idempotencyKey: key,
        reason: "already_processed",
        reusedFromJobSheetId: 3,
        async: true,
      });

      expect(response).toEqual({
        accepted: true,
        async: true,
        deduped: true,
        jobSheetId: 9,
        contentHash: "abc",
        idempotencyKey: key,
        reason: "already_processed",
        reusedFromJobSheetId: 3,
        jobId: undefined,
        status: "processing",
      });
    });
  });
});
