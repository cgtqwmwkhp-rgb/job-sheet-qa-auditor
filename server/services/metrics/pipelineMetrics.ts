/**
 * Pipeline & OCR metrics for on-call health checks.
 *
 * Exposed via GET /metrics (ADR-003). Answers:
 * - Is OCR succeeding?  → ocr_requests_total{status}
 * - Is the pipeline healthy? → pipeline_jobs_total{status}, pipeline_stage_duration_seconds
 * - Is work backing up? → pipeline_dlq_depth
 *
 * In-memory per replica; production should migrate to prom-client when adopted.
 */

/** Histogram bucket upper bounds in seconds (Prometheus `le` labels). */
export const STAGE_DURATION_BUCKETS_SEC = [
  0.5, 1, 2, 5, 10, 30, 60, 120, 300,
] as const;

export type StageOutcome = "success" | "failed" | "skipped";

interface StageHistogramKey {
  stage: string;
  status: StageOutcome;
}

interface HistogramStore {
  buckets: number[];
  sumSec: number;
  count: number;
}

interface PipelineMetricsStore {
  ocrRequests: Record<"success" | "failed", number>;
  pipelineJobs: Record<"success" | "failed", number>;
  stageFailures: Map<string, number>;
  stageHistograms: Map<string, HistogramStore>;
}

function slugifyStage(stage: string): string {
  return (
    stage
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "unknown"
  );
}

function histogramKey(stage: string, status: StageOutcome): string {
  return `${slugifyStage(stage)}|${status}`;
}

let store: PipelineMetricsStore = {
  ocrRequests: { success: 0, failed: 0 },
  pipelineJobs: { success: 0, failed: 0 },
  stageFailures: new Map(),
  stageHistograms: new Map(),
};

function getOrCreateHistogram(key: string): HistogramStore {
  let hist = store.stageHistograms.get(key);
  if (!hist) {
    hist = {
      buckets: STAGE_DURATION_BUCKETS_SEC.map(() => 0),
      sumSec: 0,
      count: 0,
    };
    store.stageHistograms.set(key, hist);
  }
  return hist;
}

/**
 * Record a completed pipeline stage (duration + outcome).
 */
export function recordPipelineStage(
  stage: string,
  status: StageOutcome,
  durationMs: number
): void {
  const durationSec = Math.max(0, durationMs) / 1000;
  const key = histogramKey(stage, status);
  const hist = getOrCreateHistogram(key);
  hist.count++;
  hist.sumSec += durationSec;

  for (let i = 0; i < STAGE_DURATION_BUCKETS_SEC.length; i++) {
    if (durationSec <= STAGE_DURATION_BUCKETS_SEC[i]) {
      hist.buckets[i]++;
    }
  }

  if (status === "failed") {
    const slug = slugifyStage(stage);
    store.stageFailures.set(slug, (store.stageFailures.get(slug) ?? 0) + 1);
  }

  if (slugifyStage(stage) === "ocr_text_extraction") {
    recordOcrRequest(status === "success");
  }
}

/**
 * Record OCR request outcome (also invoked from recordPipelineStage for OCR stage).
 */
export function recordOcrRequest(success: boolean): void {
  if (success) {
    store.ocrRequests.success++;
  } else {
    store.ocrRequests.failed++;
  }
}

/**
 * Record terminal pipeline job outcome.
 */
export function recordPipelineJobComplete(success: boolean): void {
  if (success) {
    store.pipelineJobs.success++;
  } else {
    store.pipelineJobs.failed++;
  }
}

/**
 * Reset store (tests only).
 */
export function resetPipelineMetrics(): void {
  store = {
    ocrRequests: { success: 0, failed: 0 },
    pipelineJobs: { success: 0, failed: 0 },
    stageFailures: new Map(),
    stageHistograms: new Map(),
  };
}

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function parseHistogramKey(key: string): StageHistogramKey {
  const [stage, status] = key.split("|");
  return {
    stage: stage ?? "unknown",
    status: (status as StageOutcome) ?? "failed",
  };
}

/**
 * Format pipeline metrics in Prometheus exposition format.
 *
 * @param dlqDepth - optional DLQ depth sampled at scrape time
 */
export function formatPipelinePrometheusMetrics(dlqDepth?: number): string {
  const lines: string[] = [];

  lines.push("# HELP ocr_requests_total OCR extraction attempts by outcome");
  lines.push("# TYPE ocr_requests_total counter");
  for (const status of ["success", "failed"] as const) {
    lines.push(
      `ocr_requests_total{status="${status}"} ${store.ocrRequests[status]}`
    );
  }

  lines.push("# HELP pipeline_jobs_total Completed pipeline jobs by outcome");
  lines.push("# TYPE pipeline_jobs_total counter");
  for (const status of ["success", "failed"] as const) {
    lines.push(
      `pipeline_jobs_total{status="${status}"} ${store.pipelineJobs[status]}`
    );
  }

  if (store.stageFailures.size > 0) {
    lines.push(
      "# HELP pipeline_stage_failures_total Pipeline stage failures by stage"
    );
    lines.push("# TYPE pipeline_stage_failures_total counter");
    const stages = Array.from(store.stageFailures.keys()).sort();
    for (const stage of stages) {
      lines.push(
        `pipeline_stage_failures_total{stage="${escapeLabel(stage)}"} ${store.stageFailures.get(stage)}`
      );
    }
  }

  if (store.stageHistograms.size > 0) {
    lines.push(
      "# HELP pipeline_stage_duration_seconds Pipeline stage duration in seconds"
    );
    lines.push("# TYPE pipeline_stage_duration_seconds histogram");

    const keys = Array.from(store.stageHistograms.keys()).sort();
    for (const key of keys) {
      const { stage, status } = parseHistogramKey(key);
      const hist = store.stageHistograms.get(key)!;
      const base = `pipeline_stage_duration_seconds_bucket{stage="${escapeLabel(stage)}",status="${escapeLabel(status)}",le=`;

      let cumulative = 0;
      for (let i = 0; i < STAGE_DURATION_BUCKETS_SEC.length; i++) {
        cumulative += hist.buckets[i];
        lines.push(`${base}"${STAGE_DURATION_BUCKETS_SEC[i]}"} ${cumulative}`);
      }
      lines.push(`${base}"+Inf"} ${hist.count}`);
      lines.push(
        `pipeline_stage_duration_seconds_sum{stage="${escapeLabel(stage)}",status="${escapeLabel(status)}"} ${hist.sumSec}`
      );
      lines.push(
        `pipeline_stage_duration_seconds_count{stage="${escapeLabel(stage)}",status="${escapeLabel(status)}"} ${hist.count}`
      );
    }
  }

  if (typeof dlqDepth === "number") {
    lines.push(
      "# HELP pipeline_dlq_depth Unresolved jobs in dead-letter queue"
    );
    lines.push("# TYPE pipeline_dlq_depth gauge");
    lines.push(`pipeline_dlq_depth ${dlqDepth}`);
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}
