/**
 * Idempotency challenge tests: externalJobId + content hash dedupe.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { calculateHash } from "../../../utils/fileValidation";
import { loadIngestConfig } from "../config";
import { acceptIngestUpload } from "../ingestService";
import { MemoryIngestReceiptStore } from "../receiptStore";
import { IngestError } from "../types";

const PDF_BYTES = Buffer.from("%PDF-1.4 minimal fixture content");

describe("ingest idempotency (externalJobId + hash)", () => {
  const config = loadIngestConfig({
    INGEST_API_KEY: "k".repeat(32),
    INGEST_HMAC_SECRET: "s".repeat(32),
    INGEST_SYSTEM_USER_ID: "1",
  });

  let store: MemoryIngestReceiptStore;
  let persistCalls: number;

  beforeEach(() => {
    store = new MemoryIngestReceiptStore();
    persistCalls = 0;
  });

  const persist = async () => {
    persistCalls += 1;
    return {
      fileKey: `ingest/test/${persistCalls}.pdf`,
      fileUrl: `file://ingest/test/${persistCalls}.pdf`,
      jobSheetId: 100 + persistCalls,
    };
  };

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      externalJobId: "ext-job-001",
      deviceId: "tablet-42",
      fileName: "field-sheet.pdf",
      fileType: "application/pdf" as const,
      fileBuffer: PDF_BYTES,
      ...overrides,
    };
  }

  it("accepts first upload and returns jobSheetId", async () => {
    const result = await acceptIngestUpload(
      { config, store, persist },
      baseInput()
    );

    expect(result.status).toBe("accepted");
    expect(result.idempotent).toBe(false);
    if (result.status === "accepted") {
      expect(result.receipt.externalJobId).toBe("ext-job-001");
      expect(result.receipt.deviceId).toBe("tablet-42");
      expect(result.receipt.contentHash).toBe(calculateHash(PDF_BYTES));
      expect(result.receipt.jobSheetId).toBe(101);
    }
    expect(persistCalls).toBe(1);
  });

  it("replays same externalJobId + same hash without re-persisting", async () => {
    const first = await acceptIngestUpload(
      { config, store, persist },
      baseInput()
    );
    const second = await acceptIngestUpload(
      { config, store, persist },
      baseInput()
    );

    expect(second.status).toBe("duplicate");
    expect(second.idempotent).toBe(true);
    if (second.status === "duplicate") {
      expect(second.dedupeReason).toBe("external_job_id_and_hash");
      expect(second.receipt.ingestId).toBe(
        first.status === "accepted"
          ? first.receipt.ingestId
          : second.receipt.ingestId
      );
    }
    expect(persistCalls).toBe(1);
  });

  it("conflicts when externalJobId is reused with different bytes", async () => {
    await acceptIngestUpload({ config, store, persist }, baseInput());

    await expect(
      acceptIngestUpload(
        { config, store, persist },
        baseInput({
          fileBuffer: Buffer.from("%PDF-1.4 different payload bytes!!"),
        })
      )
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<IngestError>);

    expect(persistCalls).toBe(1);
  });

  it("dedupes by content hash across different externalJobIds", async () => {
    const first = await acceptIngestUpload(
      { config, store, persist },
      baseInput({ externalJobId: "ext-a" })
    );
    const second = await acceptIngestUpload(
      { config, store, persist },
      baseInput({ externalJobId: "ext-b" })
    );

    expect(second.status).toBe("duplicate");
    if (second.status === "duplicate") {
      expect(second.dedupeReason).toBe("content_hash");
      expect(second.receipt.externalJobId).toBe("ext-a");
      expect(second.receipt.ingestId).toBe(
        first.status === "accepted" ? first.receipt.ingestId : ""
      );
    }
    expect(persistCalls).toBe(1);
  });

  it("rejects mismatched client contentHash", async () => {
    await expect(
      acceptIngestUpload(
        { config, store, persist },
        baseInput({ contentHash: "a".repeat(64) })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(persistCalls).toBe(0);
  });

  it("requires no Entra — works with API-key-gated config only", async () => {
    expect(config.enabled).toBe(true);
    // Smoke: machine path has no user/session fields on the accept API
    const result = await acceptIngestUpload(
      { config, store, persist },
      baseInput({ externalJobId: "machine-only-1" })
    );
    expect(result.status).toBe("accepted");
  });
});
