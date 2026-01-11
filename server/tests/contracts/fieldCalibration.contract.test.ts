/**
 * Field Calibration Contract Tests
 * 
 * PR-4: Verifies critical field calibration with:
 * - Per-field confidence thresholds
 * - Template-specific calibration profiles
 * - Extraction quality guardrails
 * - Anomaly detection
 * 
 * NON-NEGOTIABLES:
 * - Canonical reason codes only
 * - Deterministic threshold application
 * - All calibration decisions logged
 */

import { describe, it, expect } from 'vitest';
import {
  createCalibrationProfile,
  applyFieldCalibration,
  assessExtractionQuality,
  runExtractionGuardrails,
  THRESHOLD_LEVELS,
  DEFAULT_ANOMALY_THRESHOLDS,
  ALWAYS_CRITICAL_FIELDS,
  type CalibrationProfile,
  type ExtractedFieldForCalibration,
  type FieldCalibration,
  type ThresholdLevel,
} from '../../services/extraction/fieldCalibration';
import { DEFAULT_SPEC_JSON } from '../../services/templateRegistry/defaultTemplate';

describe('Field Calibration', () => {
  describe('Threshold Levels', () => {
    it('should have all threshold levels defined', () => {
      expect(THRESHOLD_LEVELS.strict).toBeDefined();
      expect(THRESHOLD_LEVELS.standard).toBeDefined();
      expect(THRESHOLD_LEVELS.lenient).toBeDefined();
    });

    it('strict should have highest thresholds', () => {
      expect(THRESHOLD_LEVELS.strict.globalMinConfidence)
        .toBeGreaterThan(THRESHOLD_LEVELS.standard.globalMinConfidence);
      expect(THRESHOLD_LEVELS.strict.criticalFieldMinConfidence)
        .toBeGreaterThan(THRESHOLD_LEVELS.standard.criticalFieldMinConfidence);
    });

    it('lenient should have lowest thresholds', () => {
      expect(THRESHOLD_LEVELS.lenient.globalMinConfidence)
        .toBeLessThan(THRESHOLD_LEVELS.standard.globalMinConfidence);
      expect(THRESHOLD_LEVELS.lenient.criticalFieldMinConfidence)
        .toBeLessThan(THRESHOLD_LEVELS.standard.criticalFieldMinConfidence);
    });
  });

  describe('Critical Fields', () => {
    it('should define always-critical fields', () => {
      expect(ALWAYS_CRITICAL_FIELDS.size).toBeGreaterThan(0);
      expect(ALWAYS_CRITICAL_FIELDS.has('customerSignature')).toBe(true);
      expect(ALWAYS_CRITICAL_FIELDS.has('dateOfService')).toBe(true);
    });
  });

  describe('Calibration Profile Creation', () => {
    it('should create profile from spec', () => {
      const profile = createCalibrationProfile('test-template', DEFAULT_SPEC_JSON);
      
      expect(profile.templateId).toBe('test-template');
      expect(profile.thresholdLevel).toBe('standard');
      expect(profile.fieldCalibrations.size).toBeGreaterThan(0);
    });

    it('should mark critical fields as isCritical', () => {
      const profile = createCalibrationProfile('test-template', DEFAULT_SPEC_JSON);
      
      const signatureCalib = profile.fieldCalibrations.get('customerSignature');
      expect(signatureCalib?.isCritical).toBe(true);
      
      const dateCalib = profile.fieldCalibrations.get('dateOfService');
      expect(dateCalib?.isCritical).toBe(true);
    });

    it('should apply correct thresholds based on level', () => {
      const strictProfile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'strict');
      const lenientProfile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'lenient');
      
      expect(strictProfile.globalMinConfidence)
        .toBeGreaterThan(lenientProfile.globalMinConfidence);
    });

    it('should include anomaly thresholds', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      
      expect(profile.anomalyThresholds).toBeDefined();
      expect(profile.anomalyThresholds.maxMissingCriticalFields).toBeGreaterThanOrEqual(0);
    });

    it('should set requireRoiForCriticalFields in strict mode', () => {
      const strictProfile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'strict');
      const standardProfile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      
      expect(strictProfile.requireRoiForCriticalFields).toBe(true);
      expect(standardProfile.requireRoiForCriticalFields).toBe(false);
    });
  });

  describe('Field Calibration Application', () => {
    const standardCalibration: FieldCalibration = {
      fieldId: 'testField',
      minConfidence: 80,
      reviewThreshold: 50,
      isCritical: false,
      allowedMethods: ['ocr', 'regex'],
      maxRetries: 1,
    };

    it('should accept field with confidence above threshold', () => {
      const extracted: ExtractedFieldForCalibration = {
        fieldId: 'testField',
        value: 'test value',
        confidence: 90,
        extracted: true,
        source: 'ocr',
      };
      
      const result = applyFieldCalibration(extracted, standardCalibration);
      
      expect(result.accepted).toBe(true);
      expect(result.needsReview).toBe(false);
    });

    it('should flag for review when confidence is between thresholds', () => {
      const extracted: ExtractedFieldForCalibration = {
        fieldId: 'testField',
        value: 'test value',
        confidence: 60, // Between 50 (review) and 80 (min)
        extracted: true,
        source: 'ocr',
      };
      
      const result = applyFieldCalibration(extracted, standardCalibration);
      
      expect(result.accepted).toBe(false);
      expect(result.needsReview).toBe(true);
    });

    it('should reject when confidence below review threshold', () => {
      const extracted: ExtractedFieldForCalibration = {
        fieldId: 'testField',
        value: 'test value',
        confidence: 30,
        extracted: true,
        source: 'ocr',
      };
      
      const result = applyFieldCalibration(extracted, standardCalibration);
      
      expect(result.accepted).toBe(false);
      expect(result.needsReview).toBe(false);
    });

    it('should penalize non-allowed extraction methods', () => {
      const extracted: ExtractedFieldForCalibration = {
        fieldId: 'testField',
        value: 'test value',
        confidence: 85,
        extracted: true,
        source: 'inference', // Not in allowedMethods
      };
      
      const result = applyFieldCalibration(extracted, standardCalibration);
      
      expect(result.adjustedConfidence).toBeLessThan(85);
      expect(result.notes.some(n => n.includes('not preferred'))).toBe(true);
    });

    it('should penalize failed validation pattern', () => {
      const calibWithPattern: FieldCalibration = {
        ...standardCalibration,
        validationPattern: '^\\d{4}$', // Expects 4 digits
      };
      
      const extracted: ExtractedFieldForCalibration = {
        fieldId: 'testField',
        value: 'not-digits',
        confidence: 90,
        extracted: true,
        source: 'ocr',
      };
      
      const result = applyFieldCalibration(extracted, calibWithPattern);
      
      expect(result.adjustedConfidence).toBeLessThan(90);
      expect(result.notes.some(n => n.includes('validation pattern'))).toBe(true);
    });

    it('should penalize ROI mismatch for critical fields', () => {
      const criticalCalib: FieldCalibration = {
        ...standardCalibration,
        isCritical: true,
      };
      
      const extracted: ExtractedFieldForCalibration = {
        fieldId: 'testField',
        value: 'test value',
        confidence: 90,
        extracted: true,
        source: 'ocr',
        roiMatch: false,
      };
      
      const result = applyFieldCalibration(extracted, criticalCalib);
      
      expect(result.adjustedConfidence).toBeLessThan(90);
      expect(result.notes.some(n => n.includes('ROI'))).toBe(true);
    });
  });

  describe('Quality Assessment', () => {
    it('should calculate overall quality score', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
        { fieldId: 'dateOfService', value: '01/01/2026', confidence: 90, extracted: true, source: 'ocr' },
        { fieldId: 'serialNumber', value: 'SN-12345-AB', confidence: 80, extracted: true, source: 'regex' },
      ];
      
      const assessment = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment.overallScore).toBeGreaterThan(0);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(assessment.grade);
    });

    it('should detect missing critical fields', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      const extractedFields: ExtractedFieldForCalibration[] = [
        // customerSignature is critical but not extracted
        { fieldId: 'customerSignature', value: null, confidence: 0, extracted: false, source: 'ocr' },
        { fieldId: 'dateOfService', value: '01/01/2026', confidence: 90, extracted: true, source: 'ocr' },
      ];
      
      const assessment = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment.issues.some(i => 
        i.type === 'missing_field' && i.severity === 'critical'
      )).toBe(true);
    });

    it('should flag low confidence as issue', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 30, extracted: true, source: 'ocr' },
      ];
      
      const assessment = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment.issues.some(i => i.type === 'low_confidence')).toBe(true);
    });

    it('should detect anomalies when thresholds exceeded', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      // Set strict anomaly thresholds
      profile.anomalyThresholds.maxMissingCriticalFields = 0;
      
      const extractedFields: ExtractedFieldForCalibration[] = [
        // Critical field marked as not extracted
        { fieldId: 'customerSignature', value: null, confidence: 0, extracted: false, source: 'ocr' },
        { fieldId: 'partsUsed', value: 'parts', confidence: 80, extracted: true, source: 'ocr' },
      ];
      
      const assessment = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment.anomalyDetected).toBe(true);
    });

    it('should fail quality gates when critical field missing', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      const extractedFields: ExtractedFieldForCalibration[] = [
        // Critical field not extracted
        { fieldId: 'customerSignature', value: null, confidence: 0, extracted: false, source: 'ocr' },
        { fieldId: 'partsUsed', value: 'filter', confidence: 90, extracted: true, source: 'ocr' },
      ];
      
      const assessment = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment.passedQualityGates).toBe(false);
    });

    it('should provide recommendations for review', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 55, extracted: true, source: 'ocr' },
      ];
      
      const assessment = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Guardrails', () => {
    it('should run all guardrails', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.guardrailId !== undefined)).toBe(true);
    });

    it('G001: should fail when no fields extracted', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: null, confidence: 0, extracted: false, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g001 = results.find(r => r.guardrailId === 'G001');
      
      expect(g001?.passed).toBe(false);
      expect(g001?.severity).toBe('blocking');
    });

    it('G002: should fail when critical fields have low confidence', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'strict');
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 20, extracted: true, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g002 = results.find(r => r.guardrailId === 'G002');
      
      expect(g002?.passed).toBe(false);
    });

    it('G003: should detect conflicting extractions', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig1', confidence: 85, extracted: true, source: 'ocr' },
        { fieldId: 'customerSignature', value: 'sig2', confidence: 80, extracted: true, source: 'regex' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g003 = results.find(r => r.guardrailId === 'G003');
      
      expect(g003?.passed).toBe(false);
      expect(g003?.details).toContain('customerSignature');
    });

    it('G004: should check anomaly score', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const results = runExtractionGuardrails(extractedFields, profile);
      const g004 = results.find(r => r.guardrailId === 'G004');
      
      expect(g004).toBeDefined();
      expect(g004?.details).toContain('Anomaly score');
    });
  });

  describe('Determinism', () => {
    it('should produce identical calibration profiles', () => {
      const profile1 = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      const profile2 = createCalibrationProfile('test', DEFAULT_SPEC_JSON, 'standard');
      
      expect(profile1.globalMinConfidence).toBe(profile2.globalMinConfidence);
      expect(profile1.fieldCalibrations.size).toBe(profile2.fieldCalibrations.size);
    });

    it('should produce identical quality assessments', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const assessment1 = assessExtractionQuality(extractedFields, profile);
      const assessment2 = assessExtractionQuality(extractedFields, profile);
      
      expect(assessment1.overallScore).toBe(assessment2.overallScore);
      expect(assessment1.grade).toBe(assessment2.grade);
      expect(assessment1.passedQualityGates).toBe(assessment2.passedQualityGates);
    });

    it('should produce identical guardrail results', () => {
      const profile = createCalibrationProfile('test', DEFAULT_SPEC_JSON);
      const extractedFields: ExtractedFieldForCalibration[] = [
        { fieldId: 'customerSignature', value: 'sig', confidence: 85, extracted: true, source: 'ocr' },
      ];
      
      const results1 = runExtractionGuardrails(extractedFields, profile);
      const results2 = runExtractionGuardrails(extractedFields, profile);
      
      expect(results1.map(r => r.passed)).toEqual(results2.map(r => r.passed));
    });
  });
});
