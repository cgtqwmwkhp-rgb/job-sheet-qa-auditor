/**
 * Hardening Regression Tests
 * 
 * Tests for hardening changes:
 * - Phase A: Fail-closed SSOT enforcement in staging/prod
 * - Phase B: Versioned selection weights in traces
 * - Phase C: Guardrail S0-S3 severity + deterministic stop behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Phase A imports
import {
  getSsotMode,
  isFailClosedEnvironment,
} from '../../services/templateRegistry/defaultTemplate';

// Phase B imports
import {
  SIGNAL_WEIGHTS_VERSION,
  DEFAULT_SIGNAL_WEIGHTS,
  getVersionedWeights,
  combineSignals,
  type SignalResult,
} from '../../services/templateSelector/signalExtractors';

// Phase C imports
import {
  getSeverityStopBehavior,
  runExtractionGuardrails,
  evaluateGuardrailResults,
  createCalibrationProfile,
  type GuardrailSeverity,
  type ExtractedFieldForCalibration,
} from '../../services/extraction/fieldCalibration';
import { DEFAULT_SPEC_JSON } from '../../services/templateRegistry/defaultTemplate';

describe('Hardening Regression Tests', () => {
  
  // =========================================================================
  // PHASE A: FAIL-CLOSED SSOT ENFORCEMENT
  // =========================================================================
  
  describe('Phase A: Fail-Closed SSOT Enforcement', () => {
    const originalEnv: Record<string, string | undefined> = {};
    
    beforeEach(() => {
      // Save original env
      originalEnv.APP_ENV = process.env.APP_ENV;
      originalEnv.NODE_ENV = process.env.NODE_ENV;
      originalEnv.TEMPLATE_SSOT_MODE = process.env.TEMPLATE_SSOT_MODE;
      
      // Clear env
      delete process.env.APP_ENV;
      delete process.env.NODE_ENV;
      delete process.env.TEMPLATE_SSOT_MODE;
    });
    
    afterEach(() => {
      // Restore original env
      process.env.APP_ENV = originalEnv.APP_ENV;
      process.env.NODE_ENV = originalEnv.NODE_ENV;
      process.env.TEMPLATE_SSOT_MODE = originalEnv.TEMPLATE_SSOT_MODE;
    });
    
    it('should ALWAYS return strict in production regardless of TEMPLATE_SSOT_MODE', () => {
      process.env.APP_ENV = 'production';
      process.env.TEMPLATE_SSOT_MODE = 'permissive'; // Attempt to override
      
      expect(getSsotMode()).toBe('strict');
    });
    
    it('should ALWAYS return strict in staging regardless of TEMPLATE_SSOT_MODE', () => {
      process.env.APP_ENV = 'staging';
      process.env.TEMPLATE_SSOT_MODE = 'permissive'; // Attempt to override
      
      expect(getSsotMode()).toBe('strict');
    });
    
    it('should allow override in development', () => {
      process.env.APP_ENV = 'development';
      process.env.TEMPLATE_SSOT_MODE = 'strict';
      
      expect(getSsotMode()).toBe('strict');
    });
    
    it('should default to permissive in development without override', () => {
      process.env.APP_ENV = 'development';
      // No TEMPLATE_SSOT_MODE set
      
      expect(getSsotMode()).toBe('permissive');
    });
    
    it('should identify fail-closed environments correctly', () => {
      process.env.APP_ENV = 'production';
      expect(isFailClosedEnvironment()).toBe(true);
      
      process.env.APP_ENV = 'staging';
      expect(isFailClosedEnvironment()).toBe(true);
      
      process.env.APP_ENV = 'development';
      expect(isFailClosedEnvironment()).toBe(false);
    });
    
    it('should use NODE_ENV when APP_ENV not set', () => {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = 'production';
      
      expect(getSsotMode()).toBe('strict');
      expect(isFailClosedEnvironment()).toBe(true);
    });
  });
  
  // =========================================================================
  // PHASE B: VERSIONED SELECTION WEIGHTS
  // =========================================================================
  
  describe('Phase B: Versioned Selection Weights', () => {
    it('should have signal weights version defined', () => {
      expect(SIGNAL_WEIGHTS_VERSION).toBeDefined();
      expect(typeof SIGNAL_WEIGHTS_VERSION).toBe('string');
      expect(SIGNAL_WEIGHTS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
    
    it('should have default signal weights defined', () => {
      expect(DEFAULT_SIGNAL_WEIGHTS.tokenWeight).toBe(0.40);
      expect(DEFAULT_SIGNAL_WEIGHTS.layoutWeight).toBe(0.20);
      expect(DEFAULT_SIGNAL_WEIGHTS.roiWeight).toBe(0.25);
      expect(DEFAULT_SIGNAL_WEIGHTS.plausibilityWeight).toBe(0.15);
    });
    
    it('should generate versioned weights with timestamp', () => {
      const before = new Date().toISOString();
      const weights = getVersionedWeights();
      const after = new Date().toISOString();
      
      expect(weights.version).toBe(SIGNAL_WEIGHTS_VERSION);
      expect(weights.effectiveAt).toBeDefined();
      expect(weights.effectiveAt >= before).toBe(true);
      expect(weights.effectiveAt <= after).toBe(true);
    });
    
    it('should include custom weights in versioned output', () => {
      const weights = getVersionedWeights({
        tokenWeight: 0.5,
        layoutWeight: 0.3,
      });
      
      expect(weights.tokenWeight).toBe(0.5);
      expect(weights.layoutWeight).toBe(0.3);
      expect(weights.roiWeight).toBe(0.25); // Default
      expect(weights.version).toBe(SIGNAL_WEIGHTS_VERSION);
    });
    
    it('should include weightsUsed in combined signal result', () => {
      const signals: SignalResult[] = [
        {
          type: 'token',
          score: 80,
          weight: 0.4,
          confidence: 'HIGH',
          evidence: { matched: [], missing: [], details: {} },
        },
      ];
      
      const result = combineSignals(signals);
      
      expect(result.weightsUsed).toBeDefined();
      expect(result.weightsUsed.version).toBe(SIGNAL_WEIGHTS_VERSION);
      expect(result.weightsUsed.effectiveAt).toBeDefined();
    });
    
    it('should include custom weights in combined signal weightsUsed', () => {
      const signals: SignalResult[] = [
        {
          type: 'token',
          score: 80,
          weight: 0.4,
          confidence: 'HIGH',
          evidence: { matched: [], missing: [], details: {} },
        },
      ];
      
      const result = combineSignals(signals, { tokenWeight: 0.6 });
      
      expect(result.weightsUsed.tokenWeight).toBe(0.6);
    });
    
    it('should include weightsUsed even for empty signals', () => {
      const result = combineSignals([]);
      
      expect(result.weightsUsed).toBeDefined();
      expect(result.weightsUsed.version).toBe(SIGNAL_WEIGHTS_VERSION);
    });
  });
  
  // =========================================================================
  // PHASE C: GUARDRAIL S0-S3 SEVERITY + DETERMINISTIC STOP
  // =========================================================================
  
  describe('Phase C: Guardrail Severity Mapping', () => {
    it('should map S0 to STOP_IMMEDIATELY', () => {
      expect(getSeverityStopBehavior('S0')).toBe('STOP_IMMEDIATELY');
    });
    
    it('should map S1 to REVIEW_QUEUE', () => {
      expect(getSeverityStopBehavior('S1')).toBe('REVIEW_QUEUE');
    });
    
    it('should map S2 to CONTINUE_FLAGGED', () => {
      expect(getSeverityStopBehavior('S2')).toBe('CONTINUE_FLAGGED');
    });
    
    it('should map S3 to CONTINUE', () => {
      expect(getSeverityStopBehavior('S3')).toBe('CONTINUE');
    });
  });
  
  describe('Phase C: Guardrail Results Include S0-S3', () => {
    it('should include severity and stopBehavior in guardrail results', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      
      for (const result of results) {
        expect(['S0', 'S1', 'S2', 'S3']).toContain(result.severity);
        expect(['STOP_IMMEDIATELY', 'REVIEW_QUEUE', 'CONTINUE_FLAGGED', 'CONTINUE'])
          .toContain(result.stopBehavior);
        expect(['blocking', 'warning']).toContain(result.legacySeverity);
      }
    });
    
    it('G001 should have S0 severity (Blocker)', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'test', value: null, confidence: 0, extracted: false, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g001 = results.find(r => r.guardrailId === 'G001');
      
      expect(g001?.severity).toBe('S0');
      expect(g001?.passed).toBe(false);
      expect(g001?.stopBehavior).toBe('STOP_IMMEDIATELY');
    });
    
    it('G002 should have S1 severity (Critical)', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 20, extracted: true, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g002 = results.find(r => r.guardrailId === 'G002');
      
      expect(g002?.severity).toBe('S1');
    });
    
    it('G003 and G004 should have S2 severity (Major)', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g003 = results.find(r => r.guardrailId === 'G003');
      const g004 = results.find(r => r.guardrailId === 'G004');
      
      expect(g003?.severity).toBe('S2');
      expect(g004?.severity).toBe('S2');
    });
  });
  
  describe('Phase C: Deterministic Stop Behavior', () => {
    it('should not stop when all guardrails pass', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const guardrailResults = runExtractionGuardrails(extractedFields, profile);
      const evaluation = evaluateGuardrailResults(guardrailResults);
      
      expect(evaluation.shouldStop).toBe(false);
      expect(evaluation.overallBehavior).toBe('CONTINUE');
      expect(evaluation.failedGuardrails.length).toBe(0);
    });
    
    it('should STOP_IMMEDIATELY when S0 guardrail fails', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'test', value: null, confidence: 0, extracted: false, source: 'ocr' },
      ];
      
      const guardrailResults = runExtractionGuardrails(extractedFields, profile);
      const evaluation = evaluateGuardrailResults(guardrailResults);
      
      expect(evaluation.shouldStop).toBe(true);
      expect(evaluation.overallBehavior).toBe('STOP_IMMEDIATELY');
      expect(evaluation.stopReason).toContain('G001');
    });
    
    it('should prioritize STOP_IMMEDIATELY over REVIEW_QUEUE', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      // No fields extracted (G001 fails) and low confidence critical (G002 fails)
      const extractedFields: ExtractedFieldForCalibration[] = [];
      
      const guardrailResults = runExtractionGuardrails(extractedFields, profile);
      const evaluation = evaluateGuardrailResults(guardrailResults);
      
      expect(evaluation.overallBehavior).toBe('STOP_IMMEDIATELY');
    });
    
    it('should produce deterministic stop reasons', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [];
      
      const result1 = evaluateGuardrailResults(runExtractionGuardrails(extractedFields, profile));
      const result2 = evaluateGuardrailResults(runExtractionGuardrails(extractedFields, profile));
      
      expect(result1.shouldStop).toBe(result2.shouldStop);
      expect(result1.overallBehavior).toBe(result2.overallBehavior);
      expect(result1.stopReason).toBe(result2.stopReason);
    });
  });
  
  // =========================================================================
  // CROSS-PHASE: INTEGRATION
  // =========================================================================
  
  describe('Cross-Phase Integration', () => {
    it('should have all hardening changes compatible', () => {
      // Phase A: SSOT mode function exists
      expect(typeof getSsotMode).toBe('function');
      expect(typeof isFailClosedEnvironment).toBe('function');
      
      // Phase B: Weights versioning exists
      expect(typeof SIGNAL_WEIGHTS_VERSION).toBe('string');
      expect(typeof getVersionedWeights).toBe('function');
      
      // Phase C: Severity mapping exists
      expect(typeof getSeverityStopBehavior).toBe('function');
      expect(typeof evaluateGuardrailResults).toBe('function');
    });
  });
});
