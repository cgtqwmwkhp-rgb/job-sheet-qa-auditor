/**
 * Idempotency receipt store for machine ingest.
 *
 * Keys:
 * - byExternalJobId: primary Stripe-style idempotency key
 * - byContentHash: secondary dedupe when the same bytes arrive under a new id
 *
 * Process-local Map is the default (sufficient for single-replica / tests).
 * SharePointDrop and multi-replica can swap in a durable implementation later.
 */

import type { IngestReceipt } from "./types";

export interface IngestReceiptStore {
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

let defaultStore: IngestReceiptStore | null = null;

export function getDefaultReceiptStore(): IngestReceiptStore {
  if (!defaultStore) {
    defaultStore = new MemoryIngestReceiptStore();
  }
  return defaultStore;
}

/** Test helper — reset singleton between suites. */
export function resetDefaultReceiptStore(): void {
  defaultStore = new MemoryIngestReceiptStore();
}
