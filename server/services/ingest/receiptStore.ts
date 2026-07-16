/**
 * Idempotency receipt store for machine ingest.
 *
 * Keys:
 * - byExternalJobId: primary Stripe-style idempotency key
 * - byContentHash: secondary dedupe when the same bytes arrive under a new id
 *
 * Default production path: MySQL-backed store with an in-process memory cache.
 * Process-local Map remains available for unit tests and DB-less environments.
 */

import { eq, sql } from "drizzle-orm";
import { ingestReceipts } from "../../../drizzle/schema";
import { getDb } from "../../db";
import type { IngestReceipt } from "./types";

export interface IngestReceiptStore {
  getByExternalJobId(externalJobId: string): Promise<IngestReceipt | undefined>;
  getByContentHash(contentHash: string): Promise<IngestReceipt | undefined>;
  put(receipt: IngestReceipt): Promise<void>;
  clear(): Promise<void>;
}

/** Optional durable backend for tests (shared Map = simulated DB). */
export interface IngestReceiptDurableBackend {
  getByExternalJobId(externalJobId: string): Promise<IngestReceipt | undefined>;
  getByContentHash(contentHash: string): Promise<IngestReceipt | undefined>;
  put(receipt: IngestReceipt): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryIngestReceiptStore implements IngestReceiptStore {
  private byExternalJobId = new Map<string, IngestReceipt>();
  private byContentHash = new Map<string, IngestReceipt>();

  async getByExternalJobId(
    externalJobId: string
  ): Promise<IngestReceipt | undefined> {
    return this.byExternalJobId.get(externalJobId);
  }

  async getByContentHash(
    contentHash: string
  ): Promise<IngestReceipt | undefined> {
    return this.byContentHash.get(contentHash);
  }

  async put(receipt: IngestReceipt): Promise<void> {
    this.byExternalJobId.set(receipt.externalJobId, receipt);
    this.byContentHash.set(receipt.contentHash, receipt);
  }

  async clear(): Promise<void> {
    this.byExternalJobId.clear();
    this.byContentHash.clear();
  }
}

const DDL = `
CREATE TABLE IF NOT EXISTS ingest_receipts (
  ingestId VARCHAR(64) NOT NULL,
  externalJobId VARCHAR(128) NOT NULL,
  contentHash VARCHAR(64) NOT NULL,
  deviceId VARCHAR(128) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  fileType VARCHAR(64) NOT NULL,
  fileSizeBytes INT NOT NULL,
  fileKey VARCHAR(512) NOT NULL,
  fileUrl TEXT NOT NULL,
  jobSheetId INT NULL,
  createdAt TIMESTAMP NOT NULL,
  PRIMARY KEY (ingestId),
  UNIQUE KEY ingest_receipts_external_hash_unique (externalJobId, contentHash),
  KEY ingest_receipts_externalJobId_idx (externalJobId),
  KEY ingest_receipts_contentHash_idx (contentHash)
)
`;

function rowToReceipt(row: typeof ingestReceipts.$inferSelect): IngestReceipt {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString();
  return {
    ingestId: row.ingestId,
    externalJobId: row.externalJobId,
    deviceId: row.deviceId,
    contentHash: row.contentHash,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSizeBytes: row.fileSizeBytes,
    fileKey: row.fileKey,
    fileUrl: row.fileUrl,
    jobSheetId: row.jobSheetId ?? null,
    createdAt,
  };
}

/** In-memory stand-in for MySQL — shared across store instances = durable restart. */
export class MapIngestReceiptDurableBackend
  implements IngestReceiptDurableBackend
{
  constructor(private readonly rows: Map<string, IngestReceipt>) {}

  async getByExternalJobId(
    externalJobId: string
  ): Promise<IngestReceipt | undefined> {
    for (const receipt of Array.from(this.rows.values())) {
      if (receipt.externalJobId === externalJobId) return { ...receipt };
    }
    return undefined;
  }

  async getByContentHash(
    contentHash: string
  ): Promise<IngestReceipt | undefined> {
    for (const receipt of Array.from(this.rows.values())) {
      if (receipt.contentHash === contentHash) return { ...receipt };
    }
    return undefined;
  }

  async put(receipt: IngestReceipt): Promise<void> {
    this.rows.set(receipt.ingestId, { ...receipt });
  }

  async clear(): Promise<void> {
    this.rows.clear();
  }
}

/**
 * MySQL (or injected durable backend) + process-local memory cache.
 * clearMemoryCache() simulates a process restart while keeping durable rows.
 */
export class MysqlIngestReceiptStore implements IngestReceiptStore {
  private cache = new MemoryIngestReceiptStore();
  private schemaReady: Promise<void> | null = null;
  private readonly durable: IngestReceiptDurableBackend | null;

  constructor(options?: { durable?: IngestReceiptDurableBackend }) {
    this.durable = options?.durable ?? null;
  }

  /** Drop in-process cache only (durable rows remain). */
  async clearMemoryCache(): Promise<void> {
    await this.cache.clear();
  }

  private async ensureMysql(): Promise<boolean> {
    if (this.durable) return true;
    const db = await getDb();
    if (!db) return false;
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        const client = await getDb();
        if (!client) throw new Error("Database not available");
        await client.execute(sql.raw(DDL));
      })().catch(err => {
        this.schemaReady = null;
        throw err;
      });
    }
    await this.schemaReady;
    return true;
  }

  private async loadByExternalJobId(
    externalJobId: string
  ): Promise<IngestReceipt | undefined> {
    if (this.durable) {
      return this.durable.getByExternalJobId(externalJobId);
    }
    const db = await getDb();
    if (!db) return undefined;
    const rows = await db
      .select()
      .from(ingestReceipts)
      .where(eq(ingestReceipts.externalJobId, externalJobId))
      .limit(1);
    return rows[0] ? rowToReceipt(rows[0]) : undefined;
  }

  private async loadByContentHash(
    contentHash: string
  ): Promise<IngestReceipt | undefined> {
    if (this.durable) {
      return this.durable.getByContentHash(contentHash);
    }
    const db = await getDb();
    if (!db) return undefined;
    const rows = await db
      .select()
      .from(ingestReceipts)
      .where(eq(ingestReceipts.contentHash, contentHash))
      .limit(1);
    return rows[0] ? rowToReceipt(rows[0]) : undefined;
  }

  private async persist(receipt: IngestReceipt): Promise<void> {
    if (this.durable) {
      await this.durable.put(receipt);
      return;
    }
    const db = await getDb();
    if (!db) return;
    await db
      .insert(ingestReceipts)
      .values({
        ingestId: receipt.ingestId,
        externalJobId: receipt.externalJobId,
        contentHash: receipt.contentHash,
        deviceId: receipt.deviceId,
        fileName: receipt.fileName,
        fileType: receipt.fileType,
        fileSizeBytes: receipt.fileSizeBytes,
        fileKey: receipt.fileKey,
        fileUrl: receipt.fileUrl,
        jobSheetId: receipt.jobSheetId,
        createdAt: new Date(receipt.createdAt),
      })
      .onDuplicateKeyUpdate({
        set: {
          deviceId: receipt.deviceId,
          fileName: receipt.fileName,
          fileType: receipt.fileType,
          fileSizeBytes: receipt.fileSizeBytes,
          fileKey: receipt.fileKey,
          fileUrl: receipt.fileUrl,
          jobSheetId: receipt.jobSheetId,
        },
      });
  }

  async getByExternalJobId(
    externalJobId: string
  ): Promise<IngestReceipt | undefined> {
    const cached = await this.cache.getByExternalJobId(externalJobId);
    if (cached) return cached;

    const ready = await this.ensureMysql();
    if (!ready && !this.durable) return undefined;

    const row = await this.loadByExternalJobId(externalJobId);
    if (row) await this.cache.put(row);
    return row;
  }

  async getByContentHash(
    contentHash: string
  ): Promise<IngestReceipt | undefined> {
    const cached = await this.cache.getByContentHash(contentHash);
    if (cached) return cached;

    const ready = await this.ensureMysql();
    if (!ready && !this.durable) return undefined;

    const row = await this.loadByContentHash(contentHash);
    if (row) await this.cache.put(row);
    return row;
  }

  async put(receipt: IngestReceipt): Promise<void> {
    const ready = await this.ensureMysql();
    if (ready || this.durable) {
      await this.persist(receipt);
    }
    await this.cache.put(receipt);
  }

  async clear(): Promise<void> {
    await this.cache.clear();
    if (this.durable) {
      await this.durable.clear();
      return;
    }
    const db = await getDb();
    if (!db) return;
    try {
      await db.execute(sql.raw("DELETE FROM ingest_receipts"));
    } catch {
      // Table may not exist in ephemeral test DBs.
    }
  }
}

let defaultStore: IngestReceiptStore | null = null;

export function getDefaultReceiptStore(): IngestReceiptStore {
  if (!defaultStore) {
    defaultStore = new MysqlIngestReceiptStore();
  }
  return defaultStore;
}

/** Test helper — reset singleton between suites. */
export function resetDefaultReceiptStore(): void {
  defaultStore = new MysqlIngestReceiptStore();
}

/** Test helper — inject a store (memory or durable). */
export function setDefaultReceiptStoreForTests(
  store: IngestReceiptStore | null
): void {
  defaultStore = store;
}
