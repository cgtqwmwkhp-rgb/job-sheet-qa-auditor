export function isAsyncProcessingEnabled(): boolean {
  return process.env.FEATURE_ASYNC_PROCESSING === "true";
}

/**
 * Durable MySQL-backed queue (survives restart + scale-out dedupe).
 * Requires FEATURE_ASYNC_PROCESSING=true and DATABASE_URL.
 * Default OFF — in-memory queue remains the local/dev path.
 */
export function isDurableJobQueueEnabled(): boolean {
  return (
    isAsyncProcessingEnabled() &&
    process.env.FEATURE_DURABLE_JOB_QUEUE === "true"
  );
}

export function getJobQueueWorkerId(): string {
  if (process.env.JOB_QUEUE_WORKER_ID?.trim()) {
    return process.env.JOB_QUEUE_WORKER_ID.trim();
  }
  return `worker-${process.pid}`;
}

/** Running jobs older than this are reclaimed as queued on recover. */
export function getStaleLockMs(): number {
  const raw = process.env.JOB_QUEUE_STALE_LOCK_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60 * 1000;
}
