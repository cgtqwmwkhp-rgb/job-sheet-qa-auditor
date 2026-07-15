/**
 * Drop poller: list watched-folder / Blob candidates → signed ingest POST.
 *
 * Challenge bar: Library drop → audit without manual /upload.
 * Wave-4 B3: retry idempotent; content-hash dedupe ≈0; poison → DLQ/quarantine.
 */

import type { DropIngestConfig } from "./config";
import {
  buildExternalJobId,
  guessFileType,
  postSignedIngestUpload,
  sha256Hex,
  type DropIngestUploadResponse,
} from "./ingestClient";
import { classifyDropPoison, quarantineDropPoison } from "./poison";
import type { DropCandidate, DropSource } from "./sources";
import type { DropStateStore } from "./stateStore";

const ALLOWED_DROP_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export interface DropPollTickResult {
  scanned: number;
  submitted: number;
  duplicates: number;
  skipped: number;
  errors: number;
  poisoned: number;
  details: Array<{
    key: string;
    outcome: "accepted" | "duplicate" | "skipped" | "error" | "poison";
    externalJobId?: string;
    message?: string;
  }>;
}

export interface DropPollerDeps {
  config: DropIngestConfig;
  sources: DropSource[];
  state: DropStateStore;
  postUpload?: typeof postSignedIngestUpload;
  now?: () => Date;
  log?: (msg: string, extra?: unknown) => void;
  /** In-flight attempt counts for keys not yet marked in state. */
  attemptTracker?: Map<string, number>;
}

export class DropIngestPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastTick: DropPollTickResult | null = null;
  private readonly postUpload: typeof postSignedIngestUpload;
  private readonly now: () => Date;
  private readonly log: (msg: string, extra?: unknown) => void;
  private readonly attempts: Map<string, number>;

  constructor(private readonly deps: DropPollerDeps) {
    this.postUpload = deps.postUpload ?? postSignedIngestUpload;
    this.now = deps.now ?? (() => new Date());
    this.attempts = deps.attemptTracker ?? new Map();
    this.log =
      deps.log ??
      ((msg, extra) => {
        if (extra !== undefined) console.log(`[DropIngest] ${msg}`, extra);
        else console.log(`[DropIngest] ${msg}`);
      });
  }

  getStatus(): {
    running: boolean;
    lastTick: DropPollTickResult | null;
    processedCount: number;
  } {
    return {
      running: this.timer != null,
      lastTick: this.lastTick,
      processedCount: this.deps.state.size(),
    };
  }

  start(): void {
    if (this.timer) return;
    const interval = this.deps.config.pollIntervalMs;
    this.log(`Starting poller (interval=${interval}ms)`);
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log("Stopped poller");
    }
  }

  async tick(): Promise<DropPollTickResult> {
    if (this.ticking) {
      return (
        this.lastTick ?? {
          scanned: 0,
          submitted: 0,
          duplicates: 0,
          skipped: 0,
          errors: 0,
          poisoned: 0,
          details: [],
        }
      );
    }
    this.ticking = true;
    const result: DropPollTickResult = {
      scanned: 0,
      submitted: 0,
      duplicates: 0,
      skipped: 0,
      errors: 0,
      poisoned: 0,
      details: [],
    };

    try {
      const candidates: DropCandidate[] = [];
      for (const source of this.deps.sources) {
        try {
          const listed = await source.listCandidates();
          candidates.push(...listed);
        } catch (err) {
          result.errors += 1;
          result.details.push({
            key: `source:${source.kind}`,
            outcome: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          this.log(`Source ${source.kind} list failed`, err);
        }
      }

      result.scanned = candidates.length;

      for (const candidate of candidates) {
        if (this.deps.state.has(candidate.key)) {
          result.skipped += 1;
          result.details.push({ key: candidate.key, outcome: "skipped" });
          continue;
        }

        try {
          const outcome = await this.submitCandidate(candidate);
          if (outcome.status === "accepted") {
            result.submitted += 1;
            result.details.push({
              key: candidate.key,
              outcome: "accepted",
              externalJobId: outcome.externalJobId,
            });
          } else if (outcome.status === "duplicate") {
            result.duplicates += 1;
            result.details.push({
              key: candidate.key,
              outcome: "duplicate",
              externalJobId: outcome.externalJobId,
            });
          } else if (outcome.status === "poison") {
            result.poisoned += 1;
            result.details.push({
              key: candidate.key,
              outcome: "poison",
              externalJobId: outcome.externalJobId,
              message: outcome.message,
            });
          } else {
            result.errors += 1;
            result.details.push({
              key: candidate.key,
              outcome: "error",
              externalJobId: outcome.externalJobId,
              message: outcome.message,
            });
          }
        } catch (err) {
          result.errors += 1;
          result.details.push({
            key: candidate.key,
            outcome: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          this.log(`Failed to ingest ${candidate.key}`, err);
        }
      }
    } finally {
      this.ticking = false;
      this.lastTick = result;
    }

    if (
      result.submitted ||
      result.duplicates ||
      result.errors ||
      result.poisoned
    ) {
      this.log("Tick complete", {
        scanned: result.scanned,
        submitted: result.submitted,
        duplicates: result.duplicates,
        skipped: result.skipped,
        errors: result.errors,
        poisoned: result.poisoned,
      });
    }

    return result;
  }

  private async submitCandidate(candidate: DropCandidate): Promise<{
    status: "accepted" | "duplicate" | "error" | "poison";
    externalJobId: string;
    message?: string;
  }> {
    const { config } = this.deps;
    const fileBuffer = await candidate.read();
    const fileType = guessFileType(candidate.fileName);

    if (fileBuffer.length === 0) {
      return this.poisonCandidate(candidate, {
        emptyFile: true,
        message: "Empty file",
        contentHash: "",
        externalJobId: "",
      });
    }
    if (fileBuffer.length > config.maxFileBytes) {
      return this.poisonCandidate(candidate, {
        oversized: true,
        message: `File exceeds max size (${config.maxFileBytes} bytes)`,
        contentHash: sha256Hex(fileBuffer),
        externalJobId: "",
      });
    }
    if (!ALLOWED_DROP_TYPES.has(fileType)) {
      return this.poisonCandidate(candidate, {
        unsupportedType: true,
        message: `Unsupported file type: ${fileType}`,
        contentHash: sha256Hex(fileBuffer),
        externalJobId: "",
      });
    }

    const contentHash = sha256Hex(fileBuffer);

    // Content-hash dedupe: same bytes under a different key → skip re-POST.
    const priorByHash = this.deps.state.getByContentHash(contentHash);
    if (priorByHash && priorByHash.key !== candidate.key) {
      await this.deps.state.mark({
        key: candidate.key,
        contentHash,
        processedAt: this.now().toISOString(),
        externalJobId: priorByHash.externalJobId,
        ingestStatus: "duplicate",
      });
      if (candidate.afterSuccess) {
        try {
          await candidate.afterSuccess();
        } catch (err) {
          this.log(`afterSuccess failed for ${candidate.key}`, err);
        }
      }
      return {
        status: "duplicate",
        externalJobId: priorByHash.externalJobId,
        message: `content-hash duplicate of ${priorByHash.key}`,
      };
    }

    const externalJobId = buildExternalJobId({
      source: candidate.source,
      relativeKey: candidate.relativeKey,
      contentHash,
    });

    const response: DropIngestUploadResponse = await this.postUpload(
      {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        hmacSecret: config.hmacSecret,
        ingestPath: config.ingestPath,
      },
      {
        externalJobId,
        deviceId: config.deviceId,
        fileName: candidate.fileName,
        fileType,
        fileBuffer,
        contentHash,
      }
    );

    if (response.status === "accepted" || response.status === "duplicate") {
      this.attempts.delete(candidate.key);
      await this.deps.state.mark({
        key: candidate.key,
        contentHash,
        processedAt: this.now().toISOString(),
        externalJobId,
        ingestStatus: response.status,
      });
      if (candidate.afterSuccess) {
        try {
          await candidate.afterSuccess();
        } catch (err) {
          this.log(`afterSuccess failed for ${candidate.key}`, err);
        }
      }
      return { status: response.status, externalJobId };
    }

    const message =
      typeof response.body === "object" &&
      response.body &&
      "error" in (response.body as Record<string, unknown>)
        ? String((response.body as { error?: unknown }).error)
        : `HTTP ${response.httpStatus}`;

    const nextAttempts = (this.attempts.get(candidate.key) ?? 0) + 1;
    this.attempts.set(candidate.key, nextAttempts);

    const decision = classifyDropPoison({
      message,
      httpStatus: response.httpStatus,
      attempts: nextAttempts,
      maxAttempts: config.maxAttempts,
    });

    if (decision.isPoison && decision.reason) {
      return this.poisonCandidate(candidate, {
        message: decision.message,
        contentHash,
        externalJobId,
        httpStatus: response.httpStatus,
        reason: decision.reason,
        attempts: nextAttempts,
      });
    }

    return { status: "error", externalJobId, message };
  }

  private async poisonCandidate(
    candidate: DropCandidate,
    opts: {
      message: string;
      contentHash: string;
      externalJobId: string;
      emptyFile?: boolean;
      oversized?: boolean;
      unsupportedType?: boolean;
      httpStatus?: number;
      reason?: import("./poison").PoisonReason;
      attempts?: number;
    }
  ): Promise<{
    status: "poison";
    externalJobId: string;
    message: string;
  }> {
    const attempts =
      opts.attempts ?? (this.attempts.get(candidate.key) ?? 0) + 1;
    this.attempts.set(candidate.key, attempts);

    const decision = classifyDropPoison({
      message: opts.message,
      httpStatus: opts.httpStatus,
      attempts,
      maxAttempts: this.deps.config.maxAttempts,
      emptyFile: opts.emptyFile,
      oversized: opts.oversized,
      unsupportedType: opts.unsupportedType,
    });
    const reason = opts.reason ?? decision.reason ?? "corrupt";

    const dlqJob = quarantineDropPoison({
      dropKey: candidate.key,
      externalJobId: opts.externalJobId || undefined,
      contentHash: opts.contentHash || undefined,
      reason,
      message: decision.message,
      attempts,
      httpStatus: opts.httpStatus,
    });

    await this.deps.state.mark({
      key: candidate.key,
      contentHash: opts.contentHash || `poison:${candidate.key}`,
      processedAt: this.now().toISOString(),
      externalJobId: opts.externalJobId || `poison:${candidate.key}`,
      ingestStatus: "poison",
      attempts,
      poisonReason: reason,
      dlqJobId: dlqJob.id,
    });

    this.attempts.delete(candidate.key);
    this.log(`Poison quarantined ${candidate.key}`, {
      reason,
      dlqJobId: dlqJob.id,
      message: decision.message,
    });

    return {
      status: "poison",
      externalJobId: opts.externalJobId,
      message: decision.message,
    };
  }
}
