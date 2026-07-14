import { isDurableJobQueueEnabled } from "./config";
import {
  createInProcessDurableBackend,
  mysqlDurableJobQueueBackend,
} from "./durableQueue";
import { inMemoryJobQueueBackend } from "./inMemoryQueue";
import type { JobQueueBackend } from "./types";

let backendOverride: JobQueueBackend | null = null;

/**
 * Test seam: inject a durable in-process store to prove restart survival
 * without MySQL. Production uses MySQL when FEATURE_DURABLE_JOB_QUEUE=true.
 */
export function setJobQueueBackendForTests(
  backend: JobQueueBackend | null
): void {
  backendOverride = backend;
}

export function createTestDurableBackend(): JobQueueBackend {
  return createInProcessDurableBackend();
}

export function getJobQueueBackend(): JobQueueBackend {
  if (backendOverride) return backendOverride;
  if (isDurableJobQueueEnabled()) return mysqlDurableJobQueueBackend;
  return inMemoryJobQueueBackend;
}

/** True when MySQL durable mode or a test durable backend is active. */
export function isDurableBackendActive(): boolean {
  return backendOverride != null || isDurableJobQueueEnabled();
}
