/**
 * Pipeline Orchestrator - Stage 7
 * 
 * Orchestrates the full document processing pipeline with:
 * - Idempotency (same inputs return existing run)
 * - State machine lifecycle
 * - Replay from any state
 * - Mock-friendly execution
 */

import type { 
  PipelineRun, 
  RunState, 
  CreateRunOptions, 
  ReplayOptions, 
  RunResult 
} from './types';
import { isTerminalState } from './types';
import { runStore } from './runStore';

/**
 * Pipeline step result
 */
interface StepResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Pipeline step executor
 */
type StepExecutor<T = unknown> = (run: PipelineRun) => Promise<StepResult<T>>;

/**
 * Pipeline Orchestrator
 * 
 * Manages the full lifecycle of document processing runs.
 */
export class PipelineOrchestrator {
  private mockOcr: boolean;
  private mockInterpreter: boolean;

  constructor(options?: { mockOcr?: boolean; mockInterpreter?: boolean }) {
    this.mockOcr = options?.mockOcr ?? false;
    this.mockInterpreter = options?.mockInterpreter ?? false;
  }

  /**
   * Start a new pipeline run with idempotency
   */
  async startRun(options: CreateRunOptions): Promise<RunResult> {
    // Check for existing run (idempotency)
    if (!options.forceRerun) {
      const inputHash = runStore.generateInputHash(options.jobSheetId, options.specVersion);
      const existingRun = runStore.findByInputHash(inputHash);
      
      if (existingRun) {
        return {
          run: existingRun,
          isExisting: true,
          wasReplayed: false,
        };
      }
    }

    // Create new run
    const run = runStore.create({
      ...options,
      useMockOcr: options.useMockOcr ?? this.mockOcr,
      useMockInterpreter: options.useMockInterpreter ?? this.mockInterpreter,
    });

    // Execute pipeline
    await this.executePipeline(run);

    return {
      run: runStore.findById(run.id)!,
      isExisting: false,
      wasReplayed: false,
    };
  }

  /**
   * Replay a run from a specific state
   */
  async replayRun(options: ReplayOptions): Promise<RunResult> {
    const run = runStore.findById(options.runId);
    if (!run) {
      throw new Error(`Run not found: ${options.runId}`);
    }

    // For replay, we create a new run with forceRerun
    const newRun = runStore.create({
      jobSheetId: run.jobSheetId,
      specVersion: run.specVersion,
      forceRerun: true,
      useMockOcr: options.useMockOcr ?? run.metadata.usedMockOcr,
      useMockInterpreter: options.useMockInterpreter ?? run.metadata.usedMockInterpreter,
    });

    // Execute from the specified state
    const fromState = options.fromState ?? 'CREATED';
    await this.executePipelineFrom(newRun, fromState);

    return {
      run: runStore.findById(newRun.id)!,
      isExisting: false,
      wasReplayed: true,
    };
  }

  /**
   * Execute the full pipeline
   */
  private async executePipeline(run: PipelineRun): Promise<void> {
    await this.executePipelineFrom(run, 'CREATED');
  }

  /**
   * Execute pipeline from a specific state
   */
  private async executePipelineFrom(run: PipelineRun, fromState: RunState): Promise<void> {
    const states: RunState[] = [
      'OCR_STARTED', 'OCR_DONE',
      'EXTRACTION_STARTED', 'EXTRACTED',
      'VALIDATION_STARTED', 'VALIDATED',
      'PERSISTENCE_STARTED', 'PERSISTED'
    ];

    // Find starting index
    const startIndex = this.getStateIndex(fromState, states);

    for (let i = startIndex; i < states.length; i++) {
      const state = states[i];
      
      try {
        const result = await this.executeStep(run, state);
        
        if (!result.success) {
          runStore.transition(run.id, 'FAILED', { 
            error: result.error,
            reason: `Step ${state} failed` 
          });
          return;
        }

        runStore.transition(run.id, state, { reason: `Step ${state} completed` });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        runStore.transition(run.id, 'FAILED', { 
          error: errorMessage,
          reason: `Step ${state} threw exception` 
        });
        return;
      }
    }
  }

  /**
   * Get state index for starting execution
   */
  private getStateIndex(fromState: RunState, states: RunState[]): number {
    if (fromState === 'CREATED') return 0;
    
    const index = states.indexOf(fromState);
    if (index === -1) return 0;
    
    // Start from the next state after the given one
    return Math.max(0, index);
  }

  /**
   * Execute a single pipeline step
   */
  private async executeStep(run: PipelineRun, state: RunState): Promise<StepResult> {
    switch (state) {
      case 'OCR_STARTED':
        return this.executeOcrStart(run);
      case 'OCR_DONE':
        return this.executeOcrComplete(run);
      case 'EXTRACTION_STARTED':
        return this.executeExtractionStart(run);
      case 'EXTRACTED':
        return this.executeExtractionComplete(run);
      case 'VALIDATION_STARTED':
        return this.executeValidationStart(run);
      case 'VALIDATED':
        return this.executeValidationComplete(run);
      case 'PERSISTENCE_STARTED':
        return this.executePersistenceStart(run);
      case 'PERSISTED':
        return this.executePersistenceComplete(run);
      default:
        return { success: true };
    }
  }

  // Step executors (mock implementations for Stage 7)
  
  private async executeOcrStart(_run: PipelineRun): Promise<StepResult> {
    // In production, this would start OCR processing
    await this.simulateDelay(10);
    return { success: true };
  }

  private async executeOcrComplete(_run: PipelineRun): Promise<StepResult> {
    // In production, this would verify OCR completion
    await this.simulateDelay(10);
    return { success: true, data: { text: 'Extracted text content' } };
  }

  private async executeExtractionStart(_run: PipelineRun): Promise<StepResult> {
    await this.simulateDelay(10);
    return { success: true };
  }

  private async executeExtractionComplete(_run: PipelineRun): Promise<StepResult> {
    await this.simulateDelay(10);
    return { success: true, data: { fields: [] } };
  }

  private async executeValidationStart(_run: PipelineRun): Promise<StepResult> {
    await this.simulateDelay(10);
    return { success: true };
  }

  private async executeValidationComplete(_run: PipelineRun): Promise<StepResult> {
    await this.simulateDelay(10);
    return { success: true, data: { validatedFields: [], findings: [] } };
  }

  private async executePersistenceStart(_run: PipelineRun): Promise<StepResult> {
    await this.simulateDelay(10);
    return { success: true };
  }

  private async executePersistenceComplete(_run: PipelineRun): Promise<StepResult> {
    await this.simulateDelay(10);
    return { success: true, data: { auditId: 1 } };
  }

  /**
   * Simulate processing delay
   */
  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create orchestrator instance
 */
export function createOrchestrator(options?: { 
  mockOcr?: boolean; 
  mockInterpreter?: boolean 
}): PipelineOrchestrator {
  return new PipelineOrchestrator(options);
}

// Default instance for production
export const orchestrator = new PipelineOrchestrator({
  mockOcr: process.env.USE_MOCK_OCR === 'true',
  mockInterpreter: process.env.USE_MOCK_INTERPRETER === 'true',
});
