import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DropIngestConfig } from "../config";
import { DropIngestPoller } from "../poller";
import { BlobDropSource, FolderDropSource } from "../sources";
import { MemoryDropStateStore } from "../stateStore";

function baseConfig(
  overrides: Partial<DropIngestConfig> = {}
): DropIngestConfig {
  return {
    enabled: true,
    mode: "folder",
    watchDir: null,
    blobConnectionString: null,
    blobContainer: "jobsheet-drops",
    blobPrefix: "",
    pollIntervalMs: 60_000,
    deviceId: "sharepoint-drop",
    baseUrl: "http://127.0.0.1:3000",
    archiveDir: null,
    statePath: null,
    maxFileBytes: 10 * 1024 * 1024,
    maxAttempts: 3,
    apiKey: "test-key",
    hmacSecret: "test-hmac",
    ingestPath: "/api/ingest/v1/job-sheets",
    credentialsReady: true,
    ...overrides,
  };
}

describe("DropIngestPoller", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("submits a new folder drop via signed ingest (no manual /upload)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "drop-ingest-"));
    tmpDirs.push(dir);
    await fs.writeFile(
      path.join(dir, "job-sheet.pdf"),
      Buffer.from("%PDF-1.4 drop")
    );

    const postUpload = vi.fn(async () => ({
      httpStatus: 201,
      status: "accepted" as const,
      body: { status: "accepted" },
      idempotent: false,
    }));

    const state = new MemoryDropStateStore();
    const poller = new DropIngestPoller({
      config: baseConfig({ watchDir: dir }),
      sources: [new FolderDropSource(dir, { maxFileBytes: 10_000_000 })],
      state,
      postUpload: postUpload as never,
      log: () => undefined,
    });

    const first = await poller.tick();
    expect(first.scanned).toBe(1);
    expect(first.submitted).toBe(1);
    expect(first.errors).toBe(0);
    expect(postUpload).toHaveBeenCalledTimes(1);
    const [, input] = postUpload.mock.calls[0];
    expect(input.fileName).toBe("job-sheet.pdf");
    expect(input.deviceId).toBe("sharepoint-drop");
    expect(input.externalJobId).toMatch(/^drop-folder-/);

    const second = await poller.tick();
    expect(second.skipped).toBe(1);
    expect(second.submitted).toBe(0);
    expect(postUpload).toHaveBeenCalledTimes(1);
  });

  it("marks blob duplicates without re-erroring", async () => {
    const postUpload = vi.fn(async () => ({
      httpStatus: 200,
      status: "duplicate" as const,
      body: { status: "duplicate" },
      idempotent: true,
    }));

    const source = new BlobDropSource({
      prefix: "incoming/",
      maxFileBytes: 10_000_000,
      list: async () => [{ name: "incoming/sheet.pdf", contentLength: 4 }],
      download: async () => Buffer.from("%PDF"),
    });

    const poller = new DropIngestPoller({
      config: baseConfig({ mode: "blob" }),
      sources: [source],
      state: new MemoryDropStateStore(),
      postUpload: postUpload as never,
      log: () => undefined,
    });

    const result = await poller.tick();
    expect(result.duplicates).toBe(1);
    expect(result.errors).toBe(0);
    expect(postUpload).toHaveBeenCalledTimes(1);
  });

  it("archives local file after successful ingest when archiveDir set", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "drop-ingest-"));
    const archive = path.join(dir, "archive");
    tmpDirs.push(dir);
    const filePath = path.join(dir, "done.pdf");
    await fs.writeFile(filePath, Buffer.from("%PDF-archive"));

    const postUpload = vi.fn(async () => ({
      httpStatus: 201,
      status: "accepted" as const,
      body: {},
      idempotent: false,
    }));

    const poller = new DropIngestPoller({
      config: baseConfig({ watchDir: dir, archiveDir: archive }),
      sources: [
        new FolderDropSource(dir, {
          maxFileBytes: 10_000_000,
          archiveDir: archive,
        }),
      ],
      state: new MemoryDropStateStore(),
      postUpload: postUpload as never,
      log: () => undefined,
    });

    await poller.tick();
    await expect(fs.access(filePath)).rejects.toBeTruthy();
    await expect(
      fs.access(path.join(archive, "done.pdf"))
    ).resolves.toBeUndefined();
  });

  it("records ingest HTTP errors without marking state", async () => {
    const postUpload = vi.fn(async () => ({
      httpStatus: 503,
      status: "error" as const,
      body: { error: "NOT_CONFIGURED" },
    }));

    const source = new BlobDropSource({
      prefix: "",
      maxFileBytes: 10_000_000,
      list: async () => [{ name: "a.pdf", contentLength: 3 }],
      download: async () => Buffer.from("pdf"),
    });
    const state = new MemoryDropStateStore();
    const poller = new DropIngestPoller({
      config: baseConfig({ maxAttempts: 5 }),
      sources: [source],
      state,
      postUpload: postUpload as never,
      log: () => undefined,
    });

    const result = await poller.tick();
    expect(result.errors).toBe(1);
    expect(result.poisoned).toBe(0);
    expect(state.has("blob:a.pdf")).toBe(false);
  });

  it("quarantines empty files as poison without re-submitting", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "drop-poison-"));
    tmpDirs.push(dir);
    await fs.writeFile(path.join(dir, "empty.pdf"), Buffer.alloc(0));

    const postUpload = vi.fn();
    const state = new MemoryDropStateStore();
    const poller = new DropIngestPoller({
      config: baseConfig({ watchDir: dir }),
      sources: [new FolderDropSource(dir, { maxFileBytes: 10_000_000 })],
      state,
      postUpload: postUpload as never,
      log: () => undefined,
    });

    const first = await poller.tick();
    expect(first.poisoned).toBe(1);
    expect(postUpload).not.toHaveBeenCalled();
    expect(state.get(`folder:empty.pdf`)?.ingestStatus).toBe("poison");

    const second = await poller.tick();
    expect(second.skipped).toBe(1);
    expect(second.poisoned).toBe(0);
  });

  it("dedupes by content hash across different keys (duplicate≈0)", async () => {
    const bytes = Buffer.from("%PDF-same-bytes");
    const postUpload = vi.fn(async () => ({
      httpStatus: 201,
      status: "accepted" as const,
      body: {},
      idempotent: false,
    }));

    const state = new MemoryDropStateStore();
    const sourceA = new BlobDropSource({
      prefix: "",
      maxFileBytes: 10_000_000,
      list: async () => [{ name: "a.pdf", contentLength: bytes.length }],
      download: async () => bytes,
    });
    const poller = new DropIngestPoller({
      config: baseConfig(),
      sources: [sourceA],
      state,
      postUpload: postUpload as never,
      log: () => undefined,
    });
    await poller.tick();
    expect(postUpload).toHaveBeenCalledTimes(1);

    const sourceB = new BlobDropSource({
      prefix: "",
      maxFileBytes: 10_000_000,
      list: async () => [{ name: "copy/a.pdf", contentLength: bytes.length }],
      download: async () => bytes,
    });
    const poller2 = new DropIngestPoller({
      config: baseConfig(),
      sources: [sourceB],
      state,
      postUpload: postUpload as never,
      log: () => undefined,
    });
    const second = await poller2.tick();
    expect(second.duplicates).toBe(1);
    expect(postUpload).toHaveBeenCalledTimes(1);
  });

  it("poisons after max transient attempts and stops retrying", async () => {
    const postUpload = vi.fn(async () => ({
      httpStatus: 503,
      status: "error" as const,
      body: { error: "upstream down" },
    }));
    const source = new BlobDropSource({
      prefix: "",
      maxFileBytes: 10_000_000,
      list: async () => [{ name: "retry.pdf", contentLength: 4 }],
      download: async () => Buffer.from("%PDF"),
    });
    const state = new MemoryDropStateStore();
    const attempts = new Map<string, number>();
    const poller = new DropIngestPoller({
      config: baseConfig({ maxAttempts: 2 }),
      sources: [source],
      state,
      postUpload: postUpload as never,
      attemptTracker: attempts,
      log: () => undefined,
    });

    const first = await poller.tick();
    expect(first.errors).toBe(1);
    expect(state.has("blob:retry.pdf")).toBe(false);

    const second = await poller.tick();
    expect(second.poisoned).toBe(1);
    expect(state.get("blob:retry.pdf")?.ingestStatus).toBe("poison");

    const third = await poller.tick();
    expect(third.skipped).toBe(1);
    expect(postUpload).toHaveBeenCalledTimes(2);
  });
});
