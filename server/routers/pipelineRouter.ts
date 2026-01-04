/**
 * Pipeline Router - Stage 5
 * 
 * Provides API endpoints for pipeline run management.
 * Supports mock-friendly execution for no-secrets CI.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';

/**
 * Pipeline run states
 */
export type PipelineRunState = 
  | 'CREATED'
  | 'OCR_DONE'
  | 'EXTRACTED'
  | 'VALIDATED'
  | 'PERSISTED'
  | 'FAILED';

/**
 * Pipeline run response
 */
export interface PipelineRunResponse {
  id: number;
  jobSheetId: number;
  state: PipelineRunState;
  correlationId: string;
  inputHash: string;
  specVersion: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata: {
    ocrTimeMs?: number;
    extractionTimeMs?: number;
    validationTimeMs?: number;
    totalTimeMs?: number;
  };
}

/**
 * In-memory pipeline store for testing
 */
const pipelineStore = {
  runs: new Map<number, PipelineRunResponse>(),
  nextId: 1,
};

/**
 * Generate deterministic correlation ID
 */
function generateCorrelationId(): string {
  return `run-${Date.now()}-${pipelineStore.nextId}`;
}

/**
 * Generate input hash for idempotency
 */
function generateInputHash(jobSheetId: number, specVersion: string, options?: Record<string, unknown>): string {
  const input = JSON.stringify({ jobSheetId, specVersion, options: options ?? {} });
  // Simple hash for testing - production would use crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hash-${Math.abs(hash).toString(16)}`;
}

/**
 * Reset pipeline store (for testing)
 */
export function resetPipelineStore(): void {
  pipelineStore.runs.clear();
  pipelineStore.nextId = 1;
}

/**
 * Create a mock pipeline run (for testing)
 */
export function createMockPipelineRun(
  jobSheetId: number,
  specVersion: string = '1.0.0',
  state: PipelineRunState = 'CREATED'
): PipelineRunResponse {
  const id = pipelineStore.nextId++;
  const run: PipelineRunResponse = {
    id,
    jobSheetId,
    state,
    correlationId: generateCorrelationId(),
    inputHash: generateInputHash(jobSheetId, specVersion),
    specVersion,
    startedAt: new Date().toISOString(),
    metadata: {},
  };
  
  pipelineStore.runs.set(id, run);
  return run;
}

/**
 * Pipeline router
 */
export const pipelineRouter = router({
  /**
   * Start a new pipeline run
   * Mock-friendly: uses mock adapters when API keys not present
   */
  startRun: protectedProcedure
    .input(z.object({
      jobSheetId: z.number(),
      specVersion: z.string().default('1.0.0'),
      options: z.object({
        forceRerun: z.boolean().default(false),
        useMockOcr: z.boolean().default(false),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const opts = input.options ?? { forceRerun: false, useMockOcr: false };
      const inputHash = generateInputHash(input.jobSheetId, input.specVersion, opts);
      
      // Check for existing run with same input hash (idempotency)
      if (!opts.forceRerun) {
        const existingRun = Array.from(pipelineStore.runs.values())
          .find(r => r.inputHash === inputHash && r.state !== 'FAILED');
        
        if (existingRun) {
          return {
            run: existingRun,
            isExisting: true,
          };
        }
      }
      
      // Create new run
      const id = pipelineStore.nextId++;
      const run: PipelineRunResponse = {
        id,
        jobSheetId: input.jobSheetId,
        state: 'CREATED',
        correlationId: generateCorrelationId(),
        inputHash,
        specVersion: input.specVersion,
        startedAt: new Date().toISOString(),
        metadata: {},
      };
      
      pipelineStore.runs.set(id, run);
      
      // Simulate async processing (in real implementation, this would be async)
      // For mock mode, immediately complete
      if (opts.useMockOcr || !process.env.MISTRAL_API_KEY) {
        run.state = 'PERSISTED';
        run.completedAt = new Date().toISOString();
        run.metadata = {
          ocrTimeMs: 50,
          extractionTimeMs: 30,
          validationTimeMs: 20,
          totalTimeMs: 100,
        };
      }
      
      return {
        run,
        isExisting: false,
      };
    }),

  /**
   * Get pipeline run status
   */
  getRunStatus: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const run = pipelineStore.runs.get(input.runId);
      if (!run) {
        return null;
      }
      return run;
    }),

  /**
   * List pipeline runs for a job sheet
   */
  listRuns: protectedProcedure
    .input(z.object({
      jobSheetId: z.number().optional(),
      state: z.enum(['CREATED', 'OCR_DONE', 'EXTRACTED', 'VALIDATED', 'PERSISTED', 'FAILED']).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const opts = input ?? { limit: 50, offset: 0 };
      
      // Get all runs and sort by ID (deterministic)
      let runs = Array.from(pipelineStore.runs.values())
        .sort((a, b) => a.id - b.id);
      
      // Filter by job sheet if specified
      if (opts.jobSheetId !== undefined) {
        runs = runs.filter(r => r.jobSheetId === opts.jobSheetId);
      }
      
      // Filter by state if specified
      if (opts.state) {
        runs = runs.filter(r => r.state === opts.state);
      }
      
      // Apply pagination
      const paginated = runs.slice(opts.offset, opts.offset + opts.limit);
      
      return {
        items: paginated,
        total: runs.length,
        limit: opts.limit,
        offset: opts.offset,
      };
    }),

  /**
   * Cancel a pipeline run
   */
  cancelRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const run = pipelineStore.runs.get(input.runId);
      if (!run) {
        return { success: false, error: 'Run not found' };
      }
      
      if (run.state === 'PERSISTED' || run.state === 'FAILED') {
        return { success: false, error: 'Run already completed' };
      }
      
      run.state = 'FAILED';
      run.error = 'Cancelled by user';
      run.completedAt = new Date().toISOString();
      
      return { success: true };
    }),
});

export type PipelineRouter = typeof pipelineRouter;
