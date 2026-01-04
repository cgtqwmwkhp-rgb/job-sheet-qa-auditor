/**
 * Run Store - Stage 7
 * 
 * In-memory store for pipeline runs with idempotency support.
 * Production would use database persistence.
 */

import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import type { PipelineRun, RunState, CreateRunOptions, StateTransition } from './types';
import { isValidTransition, isTerminalState } from './types';

/**
 * In-memory run store
 */
class RunStore {
  private runs = new Map<string, PipelineRun>();
  private inputHashIndex = new Map<string, string>(); // inputHash -> runId

  /**
   * Generate deterministic input hash for idempotency
   */
  generateInputHash(jobSheetId: number, specVersion: string, options?: { forceRerun?: boolean }): string {
    // Force rerun generates unique hash
    if (options?.forceRerun) {
      return createHash('sha256')
        .update(`${jobSheetId}:${specVersion}:${Date.now()}:${nanoid()}`)
        .digest('hex')
        .substring(0, 16);
    }
    
    // Normal hash is deterministic
    return createHash('sha256')
      .update(`${jobSheetId}:${specVersion}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Find existing run by input hash
   */
  findByInputHash(inputHash: string): PipelineRun | undefined {
    const runId = this.inputHashIndex.get(inputHash);
    if (!runId) return undefined;
    
    const run = this.runs.get(runId);
    if (!run) return undefined;
    
    // Only return non-failed runs for idempotency
    if (run.state === 'FAILED') return undefined;
    
    return run;
  }

  /**
   * Find run by ID
   */
  findById(id: string): PipelineRun | undefined {
    return this.runs.get(id);
  }

  /**
   * Find runs by job sheet ID
   */
  findByJobSheetId(jobSheetId: number): PipelineRun[] {
    return Array.from(this.runs.values())
      .filter(r => r.jobSheetId === jobSheetId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Create a new run
   */
  create(options: CreateRunOptions): PipelineRun {
    const inputHash = this.generateInputHash(
      options.jobSheetId,
      options.specVersion,
      { forceRerun: options.forceRerun }
    );
    
    const id = nanoid();
    const now = new Date();
    
    const run: PipelineRun = {
      id,
      jobSheetId: options.jobSheetId,
      specVersion: options.specVersion,
      inputHash,
      state: 'CREATED',
      correlationId: `run-${id}`,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      metadata: {
        usedMockOcr: options.useMockOcr,
        usedMockInterpreter: options.useMockInterpreter,
      },
      stateHistory: [{
        from: 'CREATED',
        to: 'CREATED',
        timestamp: now,
        reason: 'Run created',
      }],
    };
    
    this.runs.set(id, run);
    this.inputHashIndex.set(inputHash, id);
    
    return run;
  }

  /**
   * Transition run to a new state
   */
  transition(
    runId: string,
    toState: RunState,
    options?: { reason?: string; error?: string }
  ): PipelineRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    
    if (isTerminalState(run.state)) {
      throw new Error(`Cannot transition from terminal state: ${run.state}`);
    }
    
    if (!isValidTransition(run.state, toState)) {
      throw new Error(`Invalid transition: ${run.state} -> ${toState}`);
    }
    
    const now = new Date();
    const transition: StateTransition = {
      from: run.state,
      to: toState,
      timestamp: now,
      reason: options?.reason,
      error: options?.error,
    };
    
    // Update timing metadata
    this.updateTimingMetadata(run, toState, now);
    
    run.stateHistory.push(transition);
    run.state = toState;
    run.updatedAt = now;
    
    if (options?.error) {
      run.error = options.error;
    }
    
    if (isTerminalState(toState)) {
      run.completedAt = now;
      if (run.metadata.ocrStartedAt) {
        run.metadata.totalDurationMs = now.getTime() - run.metadata.ocrStartedAt.getTime();
      }
    }
    
    return run;
  }

  /**
   * Update timing metadata based on state
   */
  private updateTimingMetadata(run: PipelineRun, state: RunState, now: Date): void {
    switch (state) {
      case 'OCR_STARTED':
        run.metadata.ocrStartedAt = now;
        break;
      case 'OCR_DONE':
        run.metadata.ocrCompletedAt = now;
        if (run.metadata.ocrStartedAt) {
          run.metadata.ocrDurationMs = now.getTime() - run.metadata.ocrStartedAt.getTime();
        }
        break;
      case 'EXTRACTION_STARTED':
        run.metadata.extractionStartedAt = now;
        break;
      case 'EXTRACTED':
        run.metadata.extractionCompletedAt = now;
        if (run.metadata.extractionStartedAt) {
          run.metadata.extractionDurationMs = now.getTime() - run.metadata.extractionStartedAt.getTime();
        }
        break;
      case 'VALIDATION_STARTED':
        run.metadata.validationStartedAt = now;
        break;
      case 'VALIDATED':
        run.metadata.validationCompletedAt = now;
        if (run.metadata.validationStartedAt) {
          run.metadata.validationDurationMs = now.getTime() - run.metadata.validationStartedAt.getTime();
        }
        break;
      case 'PERSISTENCE_STARTED':
        run.metadata.persistenceStartedAt = now;
        break;
      case 'PERSISTED':
        run.metadata.persistenceCompletedAt = now;
        if (run.metadata.persistenceStartedAt) {
          run.metadata.persistenceDurationMs = now.getTime() - run.metadata.persistenceStartedAt.getTime();
        }
        break;
    }
  }

  /**
   * Increment retry count
   */
  incrementRetry(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    
    if (run.retryCount >= run.maxRetries) {
      return false;
    }
    
    run.retryCount++;
    run.updatedAt = new Date();
    return true;
  }

  /**
   * List all runs with optional filtering
   */
  list(options?: {
    state?: RunState;
    limit?: number;
    offset?: number;
  }): { runs: PipelineRun[]; total: number } {
    let runs = Array.from(this.runs.values());
    
    if (options?.state) {
      runs = runs.filter(r => r.state === options.state);
    }
    
    // Sort by creation time (newest first)
    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const total = runs.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    
    runs = runs.slice(offset, offset + limit);
    
    return { runs, total };
  }

  /**
   * Clear all runs (for testing)
   */
  clear(): void {
    this.runs.clear();
    this.inputHashIndex.clear();
  }
}

// Singleton instance
export const runStore = new RunStore();

// Export for testing
export { RunStore };
