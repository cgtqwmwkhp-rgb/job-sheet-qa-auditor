/**
 * Drop poller: list watched-folder / Blob candidates → signed ingest POST.
 *
 * Challenge bar: Library drop → audit without manual /upload.
 */

import type { DropIngestConfig } from "./config";
import {
  buildExternalJobId,
  guessFileType,
  postSignedIngestUpload,
  sha256Hex,
  type DropIngestUploadResponse,
} from "./ingestClient";
import type { DropCandidate, DropSource } from "./sources";
import type { DropStateStore } from "./stateStore";

export interface DropPollTickResult {
  scanned: number;
  submitted: number;
  duplicates: number;
  skipped: number;
  errors: number;
  details: Array<{
    key: string;
    outcome: "accepted" | "duplicate" | "skipped" | "error";
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
}

export class DropIngestPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastTick: DropPollTickResult | null = null;
  private readonly postUpload: typeof postSignedIngestUpload;
  private readonly now: () => Date;
  private readonly log: (msg: string, extra?: unknown) => void;

  constructor(private readonly deps: DropPollerDeps) {
    this.postUpload = deps.postUpload ?? postSignedIngestUpload;
    this.now = deps.now ?? (() => new Date());
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
    // Kick immediately, then on interval.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    // Don't keep the process alive solely for the poller in tests.
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

    if (result.submitted || result.duplicates || result.errors) {
      this.log("Tick complete", {
        scanned: result.scanned,
        submitted: result.submitted,
        duplicates: result.duplicates,
        skipped: result.skipped,
        errors: result.errors,
      });
    }

    return result;
  }

  private async submitCandidate(candidate: DropCandidate): Promise<{
    status: "accepted" | "duplicate" | "error";
    externalJobId: string;
    message?: string;
  }> {
    const { config } = this.deps;
    const fileBuffer = await candidate.read();
    if (fileBuffer.length === 0) {
      return {
        status: "error",
        externalJobId: "",
        message: "Empty file",
      };
    }
    if (fileBuffer.length > config.maxFileBytes) {
      return {
        status: "error",
        externalJobId: "",
        message: `File exceeds max size (${config.maxFileBytes} bytes)`,
      };
    }

    const contentHash = sha256Hex(fileBuffer);
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
        fileType: guessFileType(candidate.fileName),
        fileBuffer,
        contentHash,
      }
    );

    if (response.status === "accepted" || response.status === "duplicate") {
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

    return { status: "error", externalJobId, message };
  }
}
