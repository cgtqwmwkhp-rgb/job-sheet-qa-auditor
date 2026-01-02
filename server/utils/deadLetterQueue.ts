/**
 * Dead Letter Queue (DLQ) for Failed Processing Jobs
 * Captures failed jobs for manual review and recovery
 */

import { v4 as uuidv4 } from 'uuid';

export interface FailedJob {
  id: string;
  jobSheetId: number;
  correlationId?: string;
  stage: 'upload' | 'ocr' | 'analysis' | 'storage';
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date;
  createdAt: Date;
  metadata: Record<string, unknown>;
  recoverable: boolean;
}

export interface DLQStats {
  totalFailed: number;
  byStage: Record<string, number>;
  recoverable: number;
  unrecoverable: number;
  oldestJob?: Date;
}

// In-memory DLQ (in production, this would be Redis or a database table)
const deadLetterQueue: Map<string, FailedJob> = new Map();

// Maximum jobs to keep in DLQ
const MAX_DLQ_SIZE = 1000;

/**
 * Add a failed job to the dead letter queue
 */
export function addToDeadLetterQueue(
  jobSheetId: number,
  stage: FailedJob['stage'],
  error: Error,
  options: {
    correlationId?: string;
    attempts?: number;
    maxAttempts?: number;
    metadata?: Record<string, unknown>;
    recoverable?: boolean;
  } = {}
): FailedJob {
  // Enforce size limit by removing oldest jobs
  if (deadLetterQueue.size >= MAX_DLQ_SIZE) {
    const oldestKey = deadLetterQueue.keys().next().value;
    if (oldestKey) {
      deadLetterQueue.delete(oldestKey);
    }
  }

  const failedJob: FailedJob = {
    id: uuidv4(),
    jobSheetId,
    correlationId: options.correlationId,
    stage,
    error: {
      message: error.message,
      code: (error as any).code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
    attempts: options.attempts || 1,
    maxAttempts: options.maxAttempts || 3,
    lastAttemptAt: new Date(),
    createdAt: new Date(),
    metadata: options.metadata || {},
    recoverable: options.recoverable ?? isRecoverableError(error),
  };

  deadLetterQueue.set(failedJob.id, failedJob);

  console.error(`[DLQ] Job added: ${failedJob.id}`, {
    jobSheetId,
    stage,
    error: error.message,
    recoverable: failedJob.recoverable,
  });

  return failedJob;
}

/**
 * Determine if an error is potentially recoverable
 */
function isRecoverableError(error: Error): boolean {
  const recoverablePatterns = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate limit',
    'timeout',
    '429',
    '500',
    '502',
    '503',
    '504',
    'circuit breaker',
  ];

  const errorString = (error.message + (error as any).code).toLowerCase();
  return recoverablePatterns.some(pattern => 
    errorString.includes(pattern.toLowerCase())
  );
}

/**
 * Get a failed job by ID
 */
export function getFailedJob(id: string): FailedJob | undefined {
  return deadLetterQueue.get(id);
}

/**
 * Get all failed jobs
 */
export function getAllFailedJobs(): FailedJob[] {
  return Array.from(deadLetterQueue.values());
}

/**
 * Get failed jobs by stage
 */
export function getFailedJobsByStage(stage: FailedJob['stage']): FailedJob[] {
  return getAllFailedJobs().filter(job => job.stage === stage);
}

/**
 * Get failed jobs for a specific job sheet
 */
export function getFailedJobsByJobSheetId(jobSheetId: number): FailedJob[] {
  return getAllFailedJobs().filter(job => job.jobSheetId === jobSheetId);
}

/**
 * Get recoverable failed jobs
 */
export function getRecoverableJobs(): FailedJob[] {
  return getAllFailedJobs().filter(job => job.recoverable);
}

/**
 * Remove a job from the DLQ (after successful recovery or manual resolution)
 */
export function removeFromDeadLetterQueue(id: string): boolean {
  return deadLetterQueue.delete(id);
}

/**
 * Mark a job as recovered (remove from DLQ)
 */
export function markAsRecovered(id: string): boolean {
  const job = deadLetterQueue.get(id);
  if (job) {
    console.log(`[DLQ] Job recovered: ${id}`, { jobSheetId: job.jobSheetId });
    return deadLetterQueue.delete(id);
  }
  return false;
}

/**
 * Update attempt count for a job
 */
export function incrementAttempts(id: string): FailedJob | undefined {
  const job = deadLetterQueue.get(id);
  if (job) {
    job.attempts++;
    job.lastAttemptAt = new Date();
    
    // Mark as unrecoverable if max attempts exceeded
    if (job.attempts >= job.maxAttempts) {
      job.recoverable = false;
    }
    
    return job;
  }
  return undefined;
}

/**
 * Get DLQ statistics
 */
export function getDLQStats(): DLQStats {
  const jobs = getAllFailedJobs();
  
  const byStage: Record<string, number> = {};
  let recoverable = 0;
  let unrecoverable = 0;
  let oldestJob: Date | undefined;

  for (const job of jobs) {
    byStage[job.stage] = (byStage[job.stage] || 0) + 1;
    
    if (job.recoverable) {
      recoverable++;
    } else {
      unrecoverable++;
    }
    
    if (!oldestJob || job.createdAt < oldestJob) {
      oldestJob = job.createdAt;
    }
  }

  return {
    totalFailed: jobs.length,
    byStage,
    recoverable,
    unrecoverable,
    oldestJob,
  };
}

/**
 * Clear all jobs from the DLQ
 */
export function clearDeadLetterQueue(): number {
  const count = deadLetterQueue.size;
  deadLetterQueue.clear();
  console.log(`[DLQ] Cleared ${count} jobs`);
  return count;
}

/**
 * Clear old jobs from the DLQ (older than specified hours)
 */
export function clearOldJobs(maxAgeHours: number = 72): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let cleared = 0;

  const entries = Array.from(deadLetterQueue.entries());
  for (const [id, job] of entries) {
    if (job.createdAt < cutoff) {
      deadLetterQueue.delete(id);
      cleared++;
    }
  }

  if (cleared > 0) {
    console.log(`[DLQ] Cleared ${cleared} old jobs (older than ${maxAgeHours}h)`);
  }

  return cleared;
}

/**
 * Export DLQ for persistence (e.g., before shutdown)
 */
export function exportDLQ(): FailedJob[] {
  return getAllFailedJobs();
}

/**
 * Import jobs into DLQ (e.g., after restart)
 */
export function importDLQ(jobs: FailedJob[]): number {
  let imported = 0;
  for (const job of jobs) {
    if (!deadLetterQueue.has(job.id)) {
      deadLetterQueue.set(job.id, job);
      imported++;
    }
  }
  console.log(`[DLQ] Imported ${imported} jobs`);
  return imported;
}
