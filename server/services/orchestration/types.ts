/**
 * Orchestration Types - Stage 7
 * 
 * Types for pipeline run lifecycle, idempotency, and replay.
 */

/**
 * Pipeline run states (ordered lifecycle)
 */
export type RunState = 
  | 'CREATED'
  | 'OCR_STARTED'
  | 'OCR_DONE'
  | 'EXTRACTION_STARTED'
  | 'EXTRACTED'
  | 'VALIDATION_STARTED'
  | 'VALIDATED'
  | 'PERSISTENCE_STARTED'
  | 'PERSISTED'
  | 'FAILED';

/**
 * State transition rules
 */
export const STATE_TRANSITIONS: Record<RunState, RunState[]> = {
  CREATED: ['OCR_STARTED', 'FAILED'],
  OCR_STARTED: ['OCR_DONE', 'FAILED'],
  OCR_DONE: ['EXTRACTION_STARTED', 'FAILED'],
  EXTRACTION_STARTED: ['EXTRACTED', 'FAILED'],
  EXTRACTED: ['VALIDATION_STARTED', 'FAILED'],
  VALIDATION_STARTED: ['VALIDATED', 'FAILED'],
  VALIDATED: ['PERSISTENCE_STARTED', 'FAILED'],
  PERSISTENCE_STARTED: ['PERSISTED', 'FAILED'],
  PERSISTED: [], // Terminal state
  FAILED: [], // Terminal state
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: RunState, to: RunState): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: RunState): boolean {
  return state === 'PERSISTED' || state === 'FAILED';
}

/**
 * Pipeline run record
 */
export interface PipelineRun {
  id: string;
  jobSheetId: number;
  specVersion: string;
  inputHash: string;
  state: RunState;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
  metadata: RunMetadata;
  stateHistory: StateTransition[];
}

/**
 * Run metadata
 */
export interface RunMetadata {
  ocrStartedAt?: Date;
  ocrCompletedAt?: Date;
  ocrDurationMs?: number;
  extractionStartedAt?: Date;
  extractionCompletedAt?: Date;
  extractionDurationMs?: number;
  validationStartedAt?: Date;
  validationCompletedAt?: Date;
  validationDurationMs?: number;
  persistenceStartedAt?: Date;
  persistenceCompletedAt?: Date;
  persistenceDurationMs?: number;
  totalDurationMs?: number;
  usedMockOcr?: boolean;
  usedMockInterpreter?: boolean;
}

/**
 * State transition record
 */
export interface StateTransition {
  from: RunState;
  to: RunState;
  timestamp: Date;
  reason?: string;
  error?: string;
}

/**
 * Run creation options
 */
export interface CreateRunOptions {
  jobSheetId: number;
  specVersion: string;
  forceRerun?: boolean;
  useMockOcr?: boolean;
  useMockInterpreter?: boolean;
  maxRetries?: number;
}

/**
 * Replay options
 */
export interface ReplayOptions {
  runId: string;
  fromState?: RunState;
  useMockOcr?: boolean;
  useMockInterpreter?: boolean;
}

/**
 * Run result
 */
export interface RunResult {
  run: PipelineRun;
  isExisting: boolean;
  wasReplayed: boolean;
}
