/**
 * Processed-drop state so the poller does not re-POST the same object forever.
 * Memory by default; optional JSON file for durable restarts.
 *
 * Tracks accepted / duplicate / poison so retries are idempotent and
 * poison is never re-submitted (duplicate≈0; poison→DLQ/quarantine).
 */

import { promises as fs } from "fs";
import path from "path";

export type DropIngestStatus = "accepted" | "duplicate" | "poison";

export interface DropStateRecord {
  key: string;
  contentHash: string;
  processedAt: string;
  externalJobId: string;
  ingestStatus: DropIngestStatus;
  /** Consecutive transient failures before poison quarantine. */
  attempts?: number;
  poisonReason?: string;
  dlqJobId?: string;
}

export interface DropStateStore {
  has(key: string): boolean;
  get(key: string): DropStateRecord | undefined;
  /** True when this content hash was already accepted/duplicated/poisoned. */
  hasContentHash(contentHash: string): boolean;
  getByContentHash(contentHash: string): DropStateRecord | undefined;
  mark(record: DropStateRecord): Promise<void>;
  size(): number;
  entries(): DropStateRecord[];
}

export class MemoryDropStateStore implements DropStateStore {
  private readonly map = new Map<string, DropStateRecord>();
  private readonly byHash = new Map<string, string>();

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): DropStateRecord | undefined {
    return this.map.get(key);
  }

  hasContentHash(contentHash: string): boolean {
    return this.byHash.has(contentHash.toLowerCase());
  }

  getByContentHash(contentHash: string): DropStateRecord | undefined {
    const key = this.byHash.get(contentHash.toLowerCase());
    return key ? this.map.get(key) : undefined;
  }

  async mark(record: DropStateRecord): Promise<void> {
    this.map.set(record.key, record);
    if (record.contentHash) {
      this.byHash.set(record.contentHash.toLowerCase(), record.key);
    }
  }

  size(): number {
    return this.map.size;
  }

  entries(): DropStateRecord[] {
    return Array.from(this.map.values());
  }
}

export class FileDropStateStore implements DropStateStore {
  private readonly memory = new MemoryDropStateStore();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { records?: DropStateRecord[] };
      for (const rec of parsed.records ?? []) {
        if (rec?.key) await this.memory.mark(rec);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        console.warn(
          `[DropIngest] Failed to load state file ${this.filePath}:`,
          err
        );
      }
    }
    this.loaded = true;
  }

  has(key: string): boolean {
    return this.memory.has(key);
  }

  get(key: string): DropStateRecord | undefined {
    return this.memory.get(key);
  }

  hasContentHash(contentHash: string): boolean {
    return this.memory.hasContentHash(contentHash);
  }

  getByContentHash(contentHash: string): DropStateRecord | undefined {
    return this.memory.getByContentHash(contentHash);
  }

  async mark(record: DropStateRecord): Promise<void> {
    await this.load();
    await this.memory.mark(record);
    await this.persist();
  }

  size(): number {
    return this.memory.size();
  }

  entries(): DropStateRecord[] {
    return this.memory.entries();
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ version: 1, records: this.memory.entries() }, null, 2),
      "utf8"
    );
  }
}

export async function createDropStateStore(
  statePath: string | null
): Promise<DropStateStore> {
  if (!statePath) return new MemoryDropStateStore();
  const store = new FileDropStateStore(statePath);
  await store.load();
  return store;
}
