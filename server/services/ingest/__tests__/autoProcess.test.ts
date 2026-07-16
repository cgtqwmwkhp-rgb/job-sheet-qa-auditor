/**
 * PR6: FEATURE_INGEST_AUTO_PROCESS enqueues once on accept, never on duplicate.
 * Durable receipt store survives process-restart (fresh cache, same DB rows).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadIngestConfig } from "../config";
import { acceptIngestUpload } from "../ingestService";
import {
  MapIngestReceiptDurableBackend,
  MemoryIngestReceiptStore,
  MysqlIngestReceiptStore,
} from "../receiptStore";
import type { IngestReceipt } from "../types";

const PDF_BYTES = Buffer.from("%PDF-1.4 auto-process fixture content");

describe("ingest auto-process (PR6)", () => {
  const config = loadIngestConfig({
    INGEST_API_KEY: "k".repeat(32),
    INGEST_HMAC_SECRET: "s".repeat(32),
    INGEST_SYSTEM_USER_ID: "1",
  });

  const prevFlag = process.env.FEATURE_INGEST_AUTO_PROCESS;

  beforeEach(() => {
    process.env.FEATURE_INGEST_AUTO_PROCESS = "true";
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.FEATURE_INGEST_AUTO_PROCESS;
    } else {
      process.env.FEATURE_INGEST_AUTO_PROCESS = prevFlag;
    }
  });

  it("enqueues processing once on accepted upload with jobSheetId", async () => {
    const store = new MemoryIngestReceiptStore();
    const enqueueProcessing = vi.fn(async () => ({ accepted: true }));
    let persistCalls = 0;

    const first = await acceptIngestUpload(
      {
        config,
        store,
        persist: async () => {
          persistCalls += 1;
          return {
            fileKey: "ingest/test/auto.pdf",
            fileUrl: "https://example.test/auto.pdf",
            jobSheetId: 42,
          };
        },
        enqueueProcessing,
      },
      {
        externalJobId: "ext-auto-1",
        deviceId: "tablet-1",
        fileName: "sheet.pdf",
        fileType: "application/pdf",
        fileBuffer: PDF_BYTES,
      }
    );

    expect(first.status).toBe("accepted");
    expect(persistCalls).toBe(1);
    expect(enqueueProcessing).toHaveBeenCalledTimes(1);
    expect(enqueueProcessing).toHaveBeenCalledWith({
      source: "ingest",
      jobSheetId: 42,
      documentUrl: "https://example.test/auto.pdf",
      contentHash: expect.any(String),
    });
  });

  it("does not enqueue on duplicate replay", async () => {
    const store = new MemoryIngestReceiptStore();
    const enqueueProcessing = vi.fn(async () => ({ accepted: true }));
    const persist = async () => ({
      fileKey: "ingest/test/dup.pdf",
      fileUrl: "https://example.test/dup.pdf",
      jobSheetId: 99,
    });

    const input = {
      externalJobId: "ext-dup-1",
      deviceId: "tablet-1",
      fileName: "sheet.pdf",
      fileType: "application/pdf" as const,
      fileBuffer: PDF_BYTES,
    };

    await acceptIngestUpload(
      { config, store, persist, enqueueProcessing },
      input
    );
    const second = await acceptIngestUpload(
      { config, store, persist, enqueueProcessing },
      input
    );

    expect(second.status).toBe("duplicate");
    expect(enqueueProcessing).toHaveBeenCalledTimes(1);
  });

  it("skips enqueue when FEATURE_INGEST_AUTO_PROCESS is not true", async () => {
    delete process.env.FEATURE_INGEST_AUTO_PROCESS;
    const store = new MemoryIngestReceiptStore();
    const enqueueProcessing = vi.fn(async () => ({ accepted: true }));

    await acceptIngestUpload(
      {
        config,
        store,
        persist: async () => ({
          fileKey: "ingest/test/off.pdf",
          fileUrl: "https://example.test/off.pdf",
          jobSheetId: 7,
        }),
        enqueueProcessing,
      },
      {
        externalJobId: "ext-flag-off",
        deviceId: "tablet-1",
        fileName: "sheet.pdf",
        fileType: "application/pdf",
        fileBuffer: PDF_BYTES,
      }
    );

    expect(enqueueProcessing).not.toHaveBeenCalled();
  });

  it("skips enqueue when jobSheetId is null", async () => {
    const store = new MemoryIngestReceiptStore();
    const enqueueProcessing = vi.fn(async () => ({ accepted: true }));

    await acceptIngestUpload(
      {
        config,
        store,
        persist: async () => ({
          fileKey: "ingest/test/nosheet.pdf",
          fileUrl: "https://example.test/nosheet.pdf",
          jobSheetId: null,
        }),
        enqueueProcessing,
      },
      {
        externalJobId: "ext-nosheet",
        deviceId: "tablet-1",
        fileName: "sheet.pdf",
        fileType: "application/pdf",
        fileBuffer: PDF_BYTES,
      }
    );

    expect(enqueueProcessing).not.toHaveBeenCalled();
  });

  it("durable receipt survives restart (shared DB row, fresh cache)", async () => {
    const dbRows = new Map<string, IngestReceipt>();
    const durable = new MapIngestReceiptDurableBackend(dbRows);

    const storeA = new MysqlIngestReceiptStore({ durable });
    const receipt: IngestReceipt = {
      ingestId: "ing-durable-1",
      externalJobId: "ext-durable-1",
      deviceId: "tablet-9",
      contentHash: "a".repeat(64),
      fileName: "durable.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 12,
      fileKey: "ingest/durable.pdf",
      fileUrl: "https://example.test/durable.pdf",
      jobSheetId: 501,
      createdAt: new Date().toISOString(),
    };

    await storeA.put(receipt);
    expect(dbRows.size).toBe(1);

    // Simulate process restart: new store instance, empty memory cache, same DB.
    const storeB = new MysqlIngestReceiptStore({ durable });
    const byExternal = await storeB.getByExternalJobId("ext-durable-1");
    const byHash = await storeB.getByContentHash("a".repeat(64));

    expect(byExternal).toMatchObject({
      ingestId: "ing-durable-1",
      jobSheetId: 501,
      fileUrl: "https://example.test/durable.pdf",
    });
    expect(byHash?.ingestId).toBe("ing-durable-1");
  });
});
