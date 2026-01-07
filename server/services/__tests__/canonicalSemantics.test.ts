/**
 * Canonical Semantics Tests
 * 
 * Tests for semantic enforcement rules:
 * - PASS status must NOT have reasonCode
 * - FAIL/REVIEW status MUST have canonical reasonCode
 * - Selection safety with confidence bands
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_REASON_CODES,
  assertCanonicalReasonCode,
  createValidatedField,
  getConfidenceBand,
  makeSelectionDecision,
  createInputHash,
  generateTraceId,
  SelectionTraceBuilder,
  createSelectionArtifact,
  serializeSelectionArtifact,
  DEFAULT_SELECTION_POLICY,
  type ScoredCandidate,
  type ConfidenceBand,
} from '../canonicalSemantics';

describe('Canonical Semantics', () => {
  describe('Reason Code Semantics', () => {
    describe('assertCanonicalReasonCode', () => {
      it('allows PASS status without reasonCode', () => {
        expect(() => assertCanonicalReasonCode('PASS', undefined)).not.toThrow();
      });

      it('throws when PASS status has reasonCode', () => {
        expect(() => assertCanonicalReasonCode('PASS', 'VALID')).toThrow('SEMANTIC_VIOLATION');
        expect(() => assertCanonicalReasonCode('PASS', 'MISSING_FIELD')).toThrow('SEMANTIC_VIOLATION');
      });

      it('throws when PASS status has "VALID" reasonCode', () => {
        // This is the key semantic rule: PASS must NOT have reasonCode="VALID"
        expect(() => assertCanonicalReasonCode('PASS', 'VALID')).toThrow(
          /PASS status must NOT have a reasonCode/
        );
      });

      it('requires reasonCode for FAIL status', () => {
        expect(() => assertCanonicalReasonCode('FAIL', undefined)).toThrow('SEMANTIC_VIOLATION');
      });

      it('requires reasonCode for REVIEW status', () => {
        expect(() => assertCanonicalReasonCode('REVIEW', undefined)).toThrow('SEMANTIC_VIOLATION');
      });

      it('accepts all canonical reason codes for FAIL', () => {
        for (const code of CANONICAL_REASON_CODES) {
          expect(() => assertCanonicalReasonCode('FAIL', code)).not.toThrow();
        }
      });

      it('rejects non-canonical reason codes', () => {
        expect(() => assertCanonicalReasonCode('FAIL', 'VALID')).toThrow('not a canonical');
        expect(() => assertCanonicalReasonCode('FAIL', 'UNKNOWN_CODE')).toThrow('not a canonical');
        expect(() => assertCanonicalReasonCode('FAIL', 'valid')).toThrow('not a canonical');
      });
    });

    describe('createValidatedField', () => {
      it('creates PASS field without reasonCode', () => {
        const field = createValidatedField({
          ruleId: 'FIELD_TEST',
          field: 'testField',
          status: 'PASS',
          value: 'test value',
          confidence: 0.95,
          severity: 'info',
          message: 'Field validated',
        });

        expect(field.status).toBe('PASS');
        expect(field.reasonCode).toBeUndefined();
      });

      it('throws when creating PASS field with reasonCode', () => {
        expect(() => createValidatedField({
          ruleId: 'FIELD_TEST',
          field: 'testField',
          status: 'PASS',
          value: 'test value',
          confidence: 0.95,
          severity: 'info',
          message: 'Field validated',
          reasonCode: 'VALID', // This should throw
        })).toThrow('SEMANTIC_VIOLATION');
      });

      it('creates FAIL field with reasonCode', () => {
        const field = createValidatedField({
          ruleId: 'FIELD_TEST',
          field: 'testField',
          status: 'FAIL',
          value: null,
          confidence: 0,
          severity: 'major',
          message: 'Field missing',
          reasonCode: 'MISSING_FIELD',
        });

        expect(field.status).toBe('FAIL');
        expect(field.reasonCode).toBe('MISSING_FIELD');
      });

      it('throws when creating FAIL field without reasonCode', () => {
        expect(() => createValidatedField({
          ruleId: 'FIELD_TEST',
          field: 'testField',
          status: 'FAIL',
          value: null,
          confidence: 0,
          severity: 'major',
          message: 'Field missing',
          // Missing reasonCode
        })).toThrow('SEMANTIC_VIOLATION');
      });

      it('includes evidenceKeys when provided', () => {
        const field = createValidatedField({
          ruleId: 'FIELD_TEST',
          field: 'testField',
          status: 'FAIL',
          value: null,
          confidence: 0,
          severity: 'major',
          message: 'Field missing',
          reasonCode: 'MISSING_FIELD',
          evidenceKeys: ['page1', 'ocr_result'],
        });

        expect(field.evidenceKeys).toEqual(['page1', 'ocr_result']);
      });
    });
  });

  describe('Selection Safety', () => {
    describe('getConfidenceBand', () => {
      it('returns HIGH for scores >= 80', () => {
        expect(getConfidenceBand(80)).toBe('HIGH');
        expect(getConfidenceBand(90)).toBe('HIGH');
        expect(getConfidenceBand(100)).toBe('HIGH');
      });

      it('returns MEDIUM for scores >= 50 and < 80', () => {
        expect(getConfidenceBand(50)).toBe('MEDIUM');
        expect(getConfidenceBand(65)).toBe('MEDIUM');
        expect(getConfidenceBand(79)).toBe('MEDIUM');
      });

      it('returns LOW for scores < 50', () => {
        expect(getConfidenceBand(0)).toBe('LOW');
        expect(getConfidenceBand(25)).toBe('LOW');
        expect(getConfidenceBand(49)).toBe('LOW');
      });
    });

    describe('makeSelectionDecision', () => {
      const createCandidate = (templateId: string, score: number): ScoredCandidate => ({
        templateId,
        score,
        confidenceBand: getConfidenceBand(score),
        tokensMatched: { requiredAll: [], requiredAny: [], optional: [], excluded: [] },
        formCodeMatch: false,
        contextMatches: { client: false, assetType: false, workType: false },
      });

      it('auto-selects with HIGH confidence', () => {
        const candidates = [createCandidate('TEMPLATE_A', 85)];
        const decision = makeSelectionDecision(candidates, null);

        expect(decision.type).toBe('AUTO_SELECT');
        if (decision.type === 'AUTO_SELECT') {
          expect(decision.templateId).toBe('TEMPLATE_A');
          expect(decision.reason).toContain('HIGH confidence');
        }
      });

      it('auto-selects with MEDIUM confidence and clear gap', () => {
        const candidates = [
          createCandidate('TEMPLATE_A', 70),
          createCandidate('TEMPLATE_B', 55), // Gap of 15 >= 10
        ];
        const decision = makeSelectionDecision(candidates, null);

        expect(decision.type).toBe('AUTO_SELECT');
        if (decision.type === 'AUTO_SELECT') {
          expect(decision.templateId).toBe('TEMPLATE_A');
          expect(decision.reason).toContain('MEDIUM confidence with clear gap');
        }
      });

      it('sends to REVIEW_QUEUE with MEDIUM confidence and ambiguous gap', () => {
        const candidates = [
          createCandidate('TEMPLATE_A', 70),
          createCandidate('TEMPLATE_B', 65), // Gap of 5 < 10
        ];
        const decision = makeSelectionDecision(candidates, null);

        expect(decision.type).toBe('REVIEW_QUEUE');
        if (decision.type === 'REVIEW_QUEUE') {
          expect(decision.reasonCode).toBe('CONFLICT');
          expect(decision.reason).toContain('ambiguous');
        }
      });

      it('HARD STOPS with LOW confidence', () => {
        const candidates = [createCandidate('TEMPLATE_A', 40)];
        const decision = makeSelectionDecision(candidates, null);

        expect(decision.type).toBe('HARD_STOP');
        if (decision.type === 'HARD_STOP') {
          expect(decision.reasonCode).toBe('PIPELINE_ERROR');
          expect(decision.fixPath).toBeDefined();
          expect(decision.reason).toContain('LOW confidence');
        }
      });

      it('uses explicit templateId when provided', () => {
        const candidates = [
          createCandidate('TEMPLATE_A', 40),
          createCandidate('TEMPLATE_B', 30),
        ];
        const decision = makeSelectionDecision(candidates, 'TEMPLATE_B');

        expect(decision.type).toBe('AUTO_SELECT');
        if (decision.type === 'AUTO_SELECT') {
          expect(decision.templateId).toBe('TEMPLATE_B');
          expect(decision.reason).toContain('Explicit templateId');
        }
      });

      it('HARD STOPS when explicit templateId not found', () => {
        const candidates = [createCandidate('TEMPLATE_A', 85)];
        const decision = makeSelectionDecision(candidates, 'TEMPLATE_X');

        expect(decision.type).toBe('HARD_STOP');
        if (decision.type === 'HARD_STOP') {
          expect(decision.reasonCode).toBe('PIPELINE_ERROR');
          expect(decision.reason).toContain('not found');
        }
      });

      it('HARD STOPS when no candidates', () => {
        const decision = makeSelectionDecision([], null);

        expect(decision.type).toBe('HARD_STOP');
        if (decision.type === 'HARD_STOP') {
          expect(decision.reasonCode).toBe('PIPELINE_ERROR');
          expect(decision.reason).toContain('No template candidates');
        }
      });
    });
  });

  describe('Selection Trace', () => {
    describe('createInputHash', () => {
      it('creates deterministic hash', () => {
        const hash1 = createInputHash('test document text');
        const hash2 = createInputHash('test document text');
        expect(hash1).toBe(hash2);
      });

      it('creates different hashes for different inputs', () => {
        const hash1 = createInputHash('document A');
        const hash2 = createInputHash('document B');
        expect(hash1).not.toBe(hash2);
      });

      it('returns 8-character hex string', () => {
        const hash = createInputHash('test');
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
      });
    });

    describe('generateTraceId', () => {
      it('generates unique IDs', () => {
        const id1 = generateTraceId();
        const id2 = generateTraceId();
        expect(id1).not.toBe(id2);
      });

      it('starts with sel_ prefix', () => {
        const id = generateTraceId();
        expect(id).toMatch(/^sel_/);
      });
    });

    describe('SelectionTraceBuilder', () => {
      const createCandidate = (templateId: string, score: number): ScoredCandidate => ({
        templateId,
        score,
        confidenceBand: getConfidenceBand(score),
        tokensMatched: { requiredAll: ['TOKEN1'], requiredAny: [], optional: [], excluded: [] },
        formCodeMatch: true,
        contextMatches: { client: true, assetType: false, workType: false },
      });

      it('builds complete selection trace', () => {
        const builder = new SelectionTraceBuilder();
        const trace = builder
          .setInputHash('test document')
          .setCandidates([
            createCandidate('TEMPLATE_A', 85),
            createCandidate('TEMPLATE_B', 60),
          ])
          .build();

        expect(trace.traceId).toMatch(/^sel_/);
        expect(trace.timestamp).toBeDefined();
        expect(trace.inputHash).toBeDefined();
        expect(trace.candidates.length).toBe(2);
        expect(trace.topCandidate?.templateId).toBe('TEMPLATE_A');
        expect(trace.runnerUp?.templateId).toBe('TEMPLATE_B');
        expect(trace.gap).toBe(25);
        expect(trace.confidenceBand).toBe('HIGH');
        expect(trace.decision.type).toBe('AUTO_SELECT');
        expect(trace.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('sorts candidates deterministically', () => {
        const builder = new SelectionTraceBuilder();
        const trace = builder
          .setCandidates([
            createCandidate('TEMPLATE_B', 70),
            createCandidate('TEMPLATE_A', 70), // Same score, should sort by ID
          ])
          .build();

        // Same score, sorted alphabetically by templateId
        expect(trace.candidates[0].templateId).toBe('TEMPLATE_A');
        expect(trace.candidates[1].templateId).toBe('TEMPLATE_B');
      });

      it('handles explicit templateId', () => {
        const builder = new SelectionTraceBuilder();
        const trace = builder
          .setExplicitTemplateId('TEMPLATE_B')
          .setCandidates([
            createCandidate('TEMPLATE_A', 85),
            createCandidate('TEMPLATE_B', 60),
          ])
          .build();

        expect(trace.explicitTemplateId).toBe('TEMPLATE_B');
        expect(trace.decision.type).toBe('AUTO_SELECT');
        if (trace.decision.type === 'AUTO_SELECT') {
          expect(trace.decision.templateId).toBe('TEMPLATE_B');
        }
      });
    });
  });

  describe('Artifact Persistence', () => {
    it('creates selection artifact with version', () => {
      const builder = new SelectionTraceBuilder();
      const trace = builder
        .setCandidates([{
          templateId: 'TEMPLATE_A',
          score: 85,
          confidenceBand: 'HIGH',
          tokensMatched: { requiredAll: [], requiredAny: [], optional: [], excluded: [] },
          formCodeMatch: false,
          contextMatches: { client: false, assetType: false, workType: false },
        }])
        .build();

      const artifact = createSelectionArtifact(trace);

      expect(artifact.version).toBe('1.0.0');
      expect(artifact.trace).toBe(trace);
    });

    it('serializes artifact deterministically', () => {
      const builder = new SelectionTraceBuilder();
      const trace = builder
        .setInputHash('test')
        .setCandidates([{
          templateId: 'TEMPLATE_A',
          score: 85,
          confidenceBand: 'HIGH',
          tokensMatched: { requiredAll: [], requiredAny: [], optional: [], excluded: [] },
          formCodeMatch: false,
          contextMatches: { client: false, assetType: false, workType: false },
        }])
        .build();

      const artifact = createSelectionArtifact(trace);
      const json1 = serializeSelectionArtifact(artifact);
      const json2 = serializeSelectionArtifact(artifact);

      expect(json1).toBe(json2);
    });
  });

  describe('Non-Negotiable: PASS must never emit reasonCode="VALID"', () => {
    it('enforces PASS without reasonCode in all scenarios', () => {
      // Scenario 1: Direct assertion
      expect(() => assertCanonicalReasonCode('PASS', 'VALID')).toThrow();

      // Scenario 2: Creating validated field
      expect(() => createValidatedField({
        ruleId: 'TEST',
        field: 'test',
        status: 'PASS',
        value: 'ok',
        confidence: 1,
        severity: 'info',
        message: 'ok',
        reasonCode: 'VALID',
      })).toThrow();

      // Scenario 3: Any other reasonCode with PASS
      expect(() => createValidatedField({
        ruleId: 'TEST',
        field: 'test',
        status: 'PASS',
        value: 'ok',
        confidence: 1,
        severity: 'info',
        message: 'ok',
        reasonCode: 'MISSING_FIELD',
      })).toThrow();
    });

    it('VALID is not a canonical reason code', () => {
      expect(CANONICAL_REASON_CODES).not.toContain('VALID');
    });
  });

  describe('Non-Negotiable: LOW confidence hard stop', () => {
    it('cannot proceed without explicit templateId on LOW confidence', () => {
      const candidates = [{
        templateId: 'TEMPLATE_A',
        score: 30,
        confidenceBand: 'LOW' as ConfidenceBand,
        tokensMatched: { requiredAll: [], requiredAny: [], optional: [], excluded: [] },
        formCodeMatch: false,
        contextMatches: { client: false, assetType: false, workType: false },
      }];

      const decision = makeSelectionDecision(candidates, null);

      expect(decision.type).toBe('HARD_STOP');
      if (decision.type === 'HARD_STOP') {
        expect(decision.reasonCode).toBe('PIPELINE_ERROR');
        expect(decision.fixPath).toContain('explicit templateId');
      }
    });

    it('can proceed with explicit templateId on LOW confidence', () => {
      const candidates = [{
        templateId: 'TEMPLATE_A',
        score: 30,
        confidenceBand: 'LOW' as ConfidenceBand,
        tokensMatched: { requiredAll: [], requiredAny: [], optional: [], excluded: [] },
        formCodeMatch: false,
        contextMatches: { client: false, assetType: false, workType: false },
      }];

      const decision = makeSelectionDecision(candidates, 'TEMPLATE_A');

      expect(decision.type).toBe('AUTO_SELECT');
    });
  });
});
