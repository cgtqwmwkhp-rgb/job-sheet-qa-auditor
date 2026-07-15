/**
 * Drop sources: local watched folder (SharePoint library sync) and Azure Blob prefix.
 */

import { promises as fs } from "fs";
import path from "path";
import type { DropIngestConfig } from "./config";

export interface DropCandidate {
  /** Stable key for state / idempotency (source-scoped). */
  key: string;
  source: "folder" | "blob";
  /** Relative path / blob name. */
  relativeKey: string;
  fileName: string;
  sizeBytes: number;
  /** Read file bytes. */
  read: () => Promise<Buffer>;
  /** Optional post-success hook (e.g. archive local file). */
  afterSuccess?: () => Promise<void>;
}

export interface DropSource {
  readonly kind: "folder" | "blob";
  listCandidates(): Promise<DropCandidate[]>;
}

const SUPPORTED_EXT = /\.(pdf|png|jpe?g|tiff?|webp)$/i;

function isSupportedFileName(name: string): boolean {
  return SUPPORTED_EXT.test(name);
}

/**
 * Recursively list files under a watched folder (SharePoint OneDrive sync / local drop).
 */
export class FolderDropSource implements DropSource {
  readonly kind = "folder" as const;

  constructor(
    private readonly watchDir: string,
    private readonly options: {
      maxFileBytes: number;
      archiveDir?: string | null;
    }
  ) {}

  async listCandidates(): Promise<DropCandidate[]> {
    const root = path.resolve(this.watchDir);
    const archiveRoot = this.options.archiveDir
      ? path.resolve(this.options.archiveDir)
      : null;
    const files: string[] = [];
    await walkFiles(root, files, archiveRoot);

    const out: DropCandidate[] = [];
    for (const abs of files) {
      const fileName = path.basename(abs);
      if (!isSupportedFileName(fileName)) continue;
      if (fileName.startsWith(".")) continue;

      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      // Zero-byte files are listed so the poller can poison→DLQ (not silently skip).
      if (stat.size > this.options.maxFileBytes) continue;

      const relativeKey = path.relative(root, abs).split(path.sep).join("/");
      const key = `folder:${relativeKey}`;
      const archiveDir = this.options.archiveDir
        ? path.resolve(this.options.archiveDir)
        : null;

      out.push({
        key,
        source: "folder",
        relativeKey,
        fileName,
        sizeBytes: stat.size,
        read: () => fs.readFile(abs),
        afterSuccess: archiveDir
          ? async () => {
              const destDir = path.join(archiveDir, path.dirname(relativeKey));
              await fs.mkdir(destDir, { recursive: true });
              const dest = path.join(destDir, fileName);
              await fs.rename(abs, dest);
            }
          : undefined,
      });
    }
    return out;
  }
}

async function walkFiles(
  dir: string,
  acc: string[],
  archiveRoot: string | null
): Promise<void> {
  const resolvedDir = path.resolve(dir);
  if (
    archiveRoot &&
    (resolvedDir === archiveRoot ||
      resolvedDir.startsWith(archiveRoot + path.sep))
  ) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common sync/noise folders
      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === ".drop-ingest-archive"
      ) {
        continue;
      }
      await walkFiles(full, acc, archiveRoot);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
}

export type BlobListItem = {
  name: string;
  contentLength?: number;
};

export type BlobLister = () => Promise<BlobListItem[]>;
export type BlobDownloader = (name: string) => Promise<Buffer>;

/**
 * Azure Blob drop container/prefix poller.
 * Uses injectable list/download for unit tests; production wires @azure/storage-blob.
 */
export class BlobDropSource implements DropSource {
  readonly kind = "blob" as const;

  constructor(
    private readonly options: {
      prefix: string;
      maxFileBytes: number;
      list: BlobLister;
      download: BlobDownloader;
    }
  ) {}

  async listCandidates(): Promise<DropCandidate[]> {
    const items = await this.options.list();
    const prefix = this.options.prefix;
    const out: DropCandidate[] = [];

    for (const item of items) {
      const name = item.name;
      if (!name || (prefix && !name.startsWith(prefix))) continue;
      const fileName = name.split("/").pop() || name;
      if (!isSupportedFileName(fileName)) continue;
      if (fileName.startsWith(".")) continue;

      const size = item.contentLength ?? 0;
      if (size > this.options.maxFileBytes) continue;
      // Allow unknown size (0) — download will validate length.

      const key = `blob:${name}`;
      out.push({
        key,
        source: "blob",
        relativeKey: name,
        fileName,
        sizeBytes: size,
        read: () => this.options.download(name),
      });
    }
    return out;
  }
}

/**
 * Build a production Azure blob source using @azure/storage-blob (lazy import).
 */
export async function createAzureBlobDropSource(
  config: DropIngestConfig
): Promise<BlobDropSource> {
  if (!config.blobConnectionString) {
    throw new Error("DROP_INGEST blob source requires a connection string");
  }

  const azure = await import("@azure/storage-blob");
  const service = azure.BlobServiceClient.fromConnectionString(
    config.blobConnectionString
  );
  const container = service.getContainerClient(config.blobContainer);

  const list: BlobLister = async () => {
    const items: BlobListItem[] = [];
    const iter = container.listBlobsFlat();
    for await (const page of iter.byPage()) {
      for (const blob of page) {
        items.push({ name: blob.name });
      }
    }
    return items;
  };

  const download: BlobDownloader = async (name: string) => {
    const client = container.getBlockBlobClient(name);
    if (!(await client.exists())) {
      throw new Error(`Blob not found: ${name}`);
    }
    const response = await fetch(client.url);
    if (!response.ok) {
      throw new Error(`Failed to download blob ${name}: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  };

  return new BlobDropSource({
    prefix: config.blobPrefix,
    maxFileBytes: config.maxFileBytes,
    list,
    download,
  });
}

export function createFolderDropSource(
  config: DropIngestConfig
): FolderDropSource {
  if (!config.watchDir) {
    throw new Error("DROP_INGEST folder source requires DROP_INGEST_WATCH_DIR");
  }
  return new FolderDropSource(config.watchDir, {
    maxFileBytes: config.maxFileBytes,
    archiveDir: config.archiveDir,
  });
}
