/**
 * Stage 7 Contract Tests - Pipeline Orchestration
 * 
 * Tests for:
 * - Run lifecycle state machine
 * - Idempotency (same inputs return existing run)
 * - Replay from any state
 * - Mock-friendly execution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  RunStore, 
  createOrchestrator,
  isValidTransition,
  isTerminalState,
  STATE_TRANSITIONS,
  type RunState,
} from '../../services/orchestration';

describe('Stage 7: Pipeline Orchestration', () => {
  let store: RunStore;

  beforeEach(() => {
    store = new RunStore();
  });

  describe('State Machine', () => {
    it('should define valid state transitions', () => {
      // CREATED can only go to OCR_STARTED or FAILED
      expect(STATE_TRANSITIONS.CREATED).toContain('OCR_STARTED');
      expect(STATE_TRANSITIONS.CREATED).toContain('FAILED');
      expect(STATE_TRANSITIONS.CREATED).not.toContain('PERSISTED');
    });

    it('should validate transitions correctly', () => {
      expect(isValidTransition('CREATED', 'OCR_STARTED')).toBe(true);
      expect(isValidTransition('CREATED', 'PERSISTED')).toBe(false);
      expect(isValidTransition('OCR_STARTED', 'OCR_DONE')).toBe(true);
      expect(isValidTransition('OCR_STARTED', 'VALIDATED')).toBe(false);
    });

    it('should identify terminal states', () => {
      expect(isTerminalState('PERSISTED')).toBe(true);
      expect(isTerminalState('FAILED')).toBe(true);
      expect(isTerminalState('CREATED')).toBe(false);
      expect(isTerminalState('VALIDATED')).toBe(false);
    });

    it('should not allow transitions from terminal states', () => {
      const run = store.create({
        jobSheetId: 1,
        specVersion: '1.0.0',
      });

      // Transition to FAILED
      store.transition(run.id, 'FAILED', { error: 'Test error' });

      // Should throw when trying to transition from FAILED
      expect(() => store.transition(run.id, 'OCR_STARTED'))
        .toThrow('Cannot transition from terminal state');
    });
  });

  describe('Run Store', () => {
    it('should create runs with unique IDs', () => {
      const run1 = store.create({ jobSheetId: 1, specVersion: '1.0.0' });
      const run2 = store.create({ jobSheetId: 1, specVersion: '1.0.0', forceRerun: true });

      expect(run1.id).toBeDefined();
      expect(run2.id).toBeDefined();
      expect(run1.id).not.toBe(run2.id);
    });

    it('should generate deterministic input hash', () => {
      const hash1 = store.generateInputHash(1, '1.0.0');
      const hash2 = store.generateInputHash(1, '1.0.0');
      const hash3 = store.generateInputHash(2, '1.0.0');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('should generate unique hash with forceRerun', () => {
      const hash1 = store.generateInputHash(1, '1.0.0', { forceRerun: true });
      const hash2 = store.generateInputHash(1, '1.0.0', { forceRerun: true });

      expect(hash1).not.toBe(hash2);
    });

    it('should track state history', () => {
      const run = store.create({ jobSheetId: 1, specVersion: '1.0.0' });
      
      store.transition(run.id, 'OCR_STARTED');
      store.transition(run.id, 'OCR_DONE');
      store.transition(run.id, 'EXTRACTION_STARTED');

      const updated = store.findById(run.id)!;
      expect(updated.stateHistory.length).toBe(4); // CREATED + 3 transitions
      expect(updated.stateHistory[1].from).toBe('CREATED');
      expect(updated.stateHistory[1].to).toBe('OCR_STARTED');
    });

    it('should update timing metadata on transitions', () => {
      const run = store.create({ jobSheetId: 1, specVersion: '1.0.0' });
      
      store.transition(run.id, 'OCR_STARTED');
      const afterStart = store.findById(run.id)!;
      expect(afterStart.metadata.ocrStartedAt).toBeDefined();

      store.transition(run.id, 'OCR_DONE');
      const afterDone = store.findById(run.id)!;
      expect(afterDone.metadata.ocrCompletedAt).toBeDefined();
      expect(afterDone.metadata.ocrDurationMs).toBeDefined();
    });
  });

  describe('Idempotency', () => {
    it('should return existing run for same inputs', async () => {
      const orchestrator = createOrchestrator({ mockOcr: true, mockInterpreter: true });

      const result1 = await orchestrator.startRun({
        jobSheetId: 1,
        specVersion: '1.0.0',
      });

      const result2 = await orchestrator.startRun({
        jobSheetId: 1,
        specVersion: '1.0.0',
      });

      expect(result1.isExisting).toBe(false);
      expect(result2.isExisting).toBe(true);
      expect(result1.run.id).toBe(result2.run.id);
    });

    it('should create new run with forceRerun', async () => {
      // Use a fresh store to avoid idempotency from previous tests
      const freshStore = new RunStore();
      const orchestrator = createOrchestrator({ mockOcr: true, mockInterpreter: true });

      const result1 = await orchestrator.startRun({
        jobSheetId: 999, // Use unique jobSheetId to avoid collision
        specVersion: '1.0.0',
      });

      const result2 = await orchestrator.startRun({
        jobSheetId: 999,
        specVersion: '1.0.0',
        forceRerun: true,
      });

      // Both should be new runs (forceRerun bypasses idempotency)
      expect(result2.isExisting).toBe(false);
      expect(result1.run.id).not.toBe(result2.run.id);
    });

    it('should not return failed runs for idempotency', () => {
      const run = store.create({ jobSheetId: 1, specVersion: '1.0.0' });
      store.transition(run.id, 'FAILED', { error: 'Test error' });

      const found = store.findByInputHash(run.inputHash);
      expect(found).toBeUndefined();
    });
  });

  describe('Pipeline Execution', () => {
    it('should complete full pipeline successfully', async () => {
      const orchestrator = createOrchestrator({ mockOcr: true, mockInterpreter: true });

      const result = await orchestrator.startRun({
        jobSheetId: 1,
        specVersion: '1.0.0',
      });

      expect(result.run.state).toBe('PERSISTED');
      expect(result.run.completedAt).toBeDefined();
      expect(result.run.metadata.totalDurationMs).toBeDefined();
    });

    it('should track all timing metadata', async () => {
      const orchestrator = createOrchestrator({ mockOcr: true, mockInterpreter: true });

      const result = await orchestrator.startRun({
        jobSheetId: 1,
        specVersion: '1.0.0',
      });

      const { metadata } = result.run;
      expect(metadata.ocrStartedAt).toBeDefined();
      expect(metadata.ocrCompletedAt).toBeDefined();
      expect(metadata.extractionStartedAt).toBeDefined();
      expect(metadata.extractionCompletedAt).toBeDefined();
      expect(metadata.validationStartedAt).toBeDefined();
      expect(metadata.validationCompletedAt).toBeDefined();
      expect(metadata.persistenceStartedAt).toBeDefined();
      expect(metadata.persistenceCompletedAt).toBeDefined();
    });
  });

  describe('Replay', () => {
    it('should replay a run from beginning', async () => {
      const orchestrator = createOrchestrator({ mockOcr: true, mockInterpreter: true });

      const original = await orchestrator.startRun({
        jobSheetId: 1,
        specVersion: '1.0.0',
      });

      const replayed = await orchestrator.replayRun({
        runId: original.run.id,
      });

      expect(replayed.wasReplayed).toBe(true);
      expect(replayed.run.id).not.toBe(original.run.id);
      expect(replayed.run.state).toBe('PERSISTED');
    });

    it('should throw for non-existent run', async () => {
      const orchestrator = createOrchestrator({ mockOcr: true, mockInterpreter: true });

      await expect(orchestrator.replayRun({
        runId: 'non-existent',
      })).rejects.toThrow('Run not found');
    });
  });

  describe('Run Listing', () => {
    it('should list runs with pagination', () => {
      for (let i = 0; i < 10; i++) {
        store.create({ jobSheetId: i, specVersion: '1.0.0', forceRerun: true });
      }

      const page1 = store.list({ limit: 5, offset: 0 });
      const page2 = store.list({ limit: 5, offset: 5 });

      expect(page1.runs.length).toBe(5);
      expect(page2.runs.length).toBe(5);
      expect(page1.total).toBe(10);
    });

    it('should filter by state', () => {
      const run1 = store.create({ jobSheetId: 1, specVersion: '1.0.0', forceRerun: true });
      const run2 = store.create({ jobSheetId: 2, specVersion: '1.0.0', forceRerun: true });
      
      store.transition(run1.id, 'FAILED', { error: 'Test' });

      const failed = store.list({ state: 'FAILED' });
      const created = store.list({ state: 'CREATED' });

      expect(failed.runs.length).toBe(1);
      expect(failed.runs[0].id).toBe(run1.id);
      expect(created.runs.length).toBe(1);
      expect(created.runs[0].id).toBe(run2.id);
    });

    it('should sort by creation time (newest first)', async () => {
      // Add small delays to ensure different timestamps
      const run1 = store.create({ jobSheetId: 1, specVersion: '1.0.0', forceRerun: true });
      await new Promise(r => setTimeout(r, 5));
      const run2 = store.create({ jobSheetId: 2, specVersion: '1.0.0', forceRerun: true });
      await new Promise(r => setTimeout(r, 5));
      const run3 = store.create({ jobSheetId: 3, specVersion: '1.0.0', forceRerun: true });

      const { runs } = store.list();

      expect(runs[0].id).toBe(run3.id);
      expect(runs[1].id).toBe(run2.id);
      expect(runs[2].id).toBe(run1.id);
    });
  });

  describe('Retry Logic', () => {
    it('should increment retry count', () => {
      const run = store.create({ jobSheetId: 1, specVersion: '1.0.0', maxRetries: 3 });
      
      expect(store.incrementRetry(run.id)).toBe(true);
      expect(store.findById(run.id)!.retryCount).toBe(1);
      
      expect(store.incrementRetry(run.id)).toBe(true);
      expect(store.findById(run.id)!.retryCount).toBe(2);
      
      expect(store.incrementRetry(run.id)).toBe(true);
      expect(store.findById(run.id)!.retryCount).toBe(3);
      
      // Should fail on 4th attempt
      expect(store.incrementRetry(run.id)).toBe(false);
      expect(store.findById(run.id)!.retryCount).toBe(3);
    });
  });

  describe('Deterministic Ordering', () => {
    it('should maintain state history order', () => {
      const run = store.create({ jobSheetId: 1, specVersion: '1.0.0' });
      
      const states: RunState[] = [
        'OCR_STARTED', 'OCR_DONE',
        'EXTRACTION_STARTED', 'EXTRACTED',
        'VALIDATION_STARTED', 'VALIDATED',
        'PERSISTENCE_STARTED', 'PERSISTED'
      ];

      for (const state of states) {
        store.transition(run.id, state);
      }

      const updated = store.findById(run.id)!;
      
      // Verify order is preserved
      for (let i = 1; i < updated.stateHistory.length; i++) {
        const prev = updated.stateHistory[i - 1];
        const curr = updated.stateHistory[i];
        expect(curr.from).toBe(prev.to);
      }
    });
  });
});
