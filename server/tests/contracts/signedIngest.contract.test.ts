/**
 * Contract: signed ingest router is mounted and uses machine auth (no Entra).
 * PR6: auto-process enqueue + durable ingest_receipts.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { loadIngestConfig } from "../../services/ingest/config";
import { acceptIngestUpload } from "../../services/ingest/ingestService";
import {
  MapIngestReceiptDurableBackend,
  MemoryIngestReceiptStore,
  MysqlIngestReceiptStore,
} from "../../services/ingest/receiptStore";
import type { IngestReceipt } from "../../services/ingest/types";

describe("Signed ingest API contract (PR-IO-INGEST)", () => {
  const ingestDir = path.resolve(__dirname, "../../services/ingest");
  const indexCorePath = path.resolve(__dirname, "../../_core/index.ts");
  const repoRoot = path.resolve(__dirname, "../../..");

  let coreIndex: string;
  let routerSrc: string;
  let serviceSrc: string;
  let hmacSrc: string;

  beforeAll(() => {
    coreIndex = fs.readFileSync(indexCorePath, "utf-8");
    routerSrc = fs.readFileSync(path.join(ingestDir, "router.ts"), "utf-8");
    serviceSrc = fs.readFileSync(
      path.join(ingestDir, "ingestService.ts"),
      "utf-8"
    );
    hmacSrc = fs.readFileSync(path.join(ingestDir, "hmac.ts"), "utf-8");
  });

  it("mounts ingestRouter at /api/ingest", () => {
    expect(coreIndex).toContain('app.use("/api/ingest", ingestRouter)');
    expect(coreIndex).toContain('from "../services/ingest"');
  });

  it("stashes rawBody for HMAC over the exact request bytes", () => {
    expect(coreIndex).toContain("rawBody");
    expect(coreIndex).toMatch(/verify:\s*\(/);
  });

  it("exposes POST /v1/job-sheets and health without Easy Auth", () => {
    expect(routerSrc).toContain('"/v1/job-sheets"');
    expect(routerSrc).toContain('"/health"');
    expect(routerSrc).not.toContain("sdk.authenticateRequest");
    expect(routerSrc).not.toContain("x-ms-client-principal");
    expect(routerSrc).toContain("x-api-key");
    expect(routerSrc).toContain("x-ingest-signature");
  });

  it("health advertises entraRequired: false", () => {
    expect(routerSrc).toContain("entraRequired: false");
  });

  it("idempotency keys on externalJobId and content hash", () => {
    expect(serviceSrc).toContain("getByExternalJobId");
    expect(serviceSrc).toContain("getByContentHash");
    expect(serviceSrc).toContain("external_job_id_and_hash");
    expect(serviceSrc).toContain("content_hash");
    expect(serviceSrc).toContain("CONFLICT");
  });

  it("signs with HMAC-SHA256 timing-safe compare", () => {
    expect(hmacSrc).toContain("createHmac");
    expect(hmacSrc).toContain("timingSafeEqual");
    expect(hmacSrc).toContain("INGEST_HMAC_SECRET");
  });

  it("documents required env vars in config module", () => {
    const configSrc = fs.readFileSync(
      path.join(ingestDir, "config.ts"),
      "utf-8"
    );
    expect(configSrc).toContain("INGEST_API_KEY");
    expect(configSrc).toContain("INGEST_HMAC_SECRET");
    expect(configSrc).toContain("INGEST_SYSTEM_USER_ID");
  });

  it("ships drizzle migration 0013_ingest_receipts with unique externalJobId+contentHash", () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, "drizzle/0013_ingest_receipts.sql"),
      "utf-8"
    );
    expect(migration).toContain("ingest_receipts");
    expect(migration).toContain("externalJobId");
    expect(migration).toContain("contentHash");
    expect(migration).toContain("jobSheetId");
    expect(migration).toContain("fileUrl");
    expect(migration).toContain("createdAt");
    expect(migration).toMatch(/UNIQUE\(`externalJobId`,`contentHash`\)/);

    const journal = fs.readFileSync(
      path.join(repoRoot, "drizzle/meta/_journal.json"),
      "utf-8"
    );
    expect(journal).toContain("0013_ingest_receipts");

    const catalog = fs.readFileSync(
      path.join(
        repoRoot,
        "server/services/featureFlagMatrix/catalog.ts"
      ),
      "utf-8"
    );
    expect(catalog).toContain("FEATURE_INGEST_AUTO_PROCESS");
  });
});

describe("Signed ingest auto-process contract (PR6 IngestAutoProcess)", () => {
  const config = loadIngestConfig({
    INGEST_API_KEY: "k".repeat(32),
    INGEST_HMAC_SECRET: "s".repeat(32),
    INGEST_SYSTEM_USER_ID: "1",
  });
  const prevFlag = process.env.FEATURE_INGEST_AUTO_PROCESS;
  const PDF_BYTES = Buffer.from("%PDF-1.4 signed-ingest contract fixture");

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

  it("enqueues once on accept and not on duplicate", async () => {
    const store = new MemoryIngestReceiptStore();
    const enqueueProcessing = vi.fn(async () => ({ ok: true }));
    const persist = async () => ({
      fileKey: "ingest/contract/a.pdf",
      fileUrl: "https://example.test/contract-a.pdf",
      jobSheetId: 77,
    });
    const input = {
      externalJobId: "contract-ext-1",
      deviceId: "dev-1",
      fileName: "a.pdf",
      fileType: "application/pdf" as const,
      fileBuffer: PDF_BYTES,
    };

    const accepted = await acceptIngestUpload(
      { config, store, persist, enqueueProcessing },
      input
    );
    const duplicate = await acceptIngestUpload(
      { config, store, persist, enqueueProcessing },
      input
    );

    expect(accepted.status).toBe("accepted");
    expect(duplicate.status).toBe("duplicate");
    expect(enqueueProcessing).toHaveBeenCalledTimes(1);
    expect(enqueueProcessing).toHaveBeenCalledWith({
      source: "ingest",
      jobSheetId: 77,
      documentUrl: "https://example.test/contract-a.pdf",
      contentHash: expect.any(String),
    });
  });

  it("durable receipt survives restart via shared DB row", async () => {
    const dbRows = new Map<string, IngestReceipt>();
    const durable = new MapIngestReceiptDurableBackend(dbRows);
    const storeA = new MysqlIngestReceiptStore({ durable });

    await storeA.put({
      ingestId: "contract-ing-1",
      externalJobId: "contract-ext-durable",
      deviceId: "dev-2",
      contentHash: "b".repeat(64),
      fileName: "b.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 8,
      fileKey: "ingest/contract/b.pdf",
      fileUrl: "https://example.test/contract-b.pdf",
      jobSheetId: 88,
      createdAt: new Date().toISOString(),
    });

    const storeB = new MysqlIngestReceiptStore({ durable });
    const loaded = await storeB.getByExternalJobId("contract-ext-durable");
    expect(loaded?.jobSheetId).toBe(88);
    expect(loaded?.fileUrl).toBe("https://example.test/contract-b.pdf");
    expect(loaded?.contentHash).toBe("b".repeat(64));
  });
});
