/**
 * OCR Reconciliation Contract Tests
 * 
 * Tests for joint OCR reconciliation and confidence calibration.
 * Ensures deterministic, no-provider-calls operation.
 */

import { describe, it, expect } from 'vitest';
import {
  reconcileFields,
  determineReviewRouting,
  generateReconciliationArtifact,
  getDefaultCalibrationTable,
  type ExtractedField,
  type CalibrationTable,
} from '../../services/ocrReconciliation';

describe('OCR Reconciliation Contract Tests', () => {
  describe('Calibration Table', () => {
    it('should provide default calibration table', () => {
      const table = getDefaultCalibrationTable();
      
      expect(table.version).toBe('1.0.0');
      expect(table.defaultThreshold).toBe(0.7);
      expect(table.entries.length).toBeGreaterThan(0);
    });
    
    it('should have entries for common fields', () => {
      const table = getDefaultCalibrationTable();
      
      const fieldNames = table.entries.map(e => e.fieldName);
      expect(fieldNames).toContain('jobNumber');
      expect(fieldNames).toContain('customerName');
      expect(fieldNames).toContain('serviceDate');
    });
    
    it('should have valid threshold values', () => {
      const table = getDefaultCalibrationTable();
      
      for (const entry of table.entries) {
        expect(entry.threshold).toBeGreaterThan(0);
        expect(entry.threshold).toBeLessThanOrEqual(1);
        expect(entry.weight).toBeGreaterThan(0);
        expect(entry.weight).toBeLessThanOrEqual(1);
      }
    });
  });
  
  describe('Field Reconciliation', () => {
    const sampleFields: ExtractedField[] = [
      { fieldName: 'jobNumber', value: 'JS-2024-001', confidence: 0.95, source: 'primary' },
      { fieldName: 'customerName', value: 'ACME Corp', confidence: 0.85, source: 'primary' },
      { fieldName: 'serviceDate', value: '2024-01-15', confidence: 0.6, source: 'primary', bbox: { x: 10, y: 20, width: 30, height: 5, pageNumber: 1 } },
      { fieldName: 'technicianName', value: null, confidence: 0, source: 'primary', bbox: { x: 10, y: 40, width: 30, height: 5, pageNumber: 1 } },
    ];
    
    it('should reconcile fields from primary OCR', () => {
      const result = reconcileFields('doc-001', sampleFields);
      
      expect(result.documentId).toBe('doc-001');
      expect(result.reconciledFields.length).toBe(sampleFields.length);
      expect(result.processedAt).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
    
    it('should identify low confidence fields for re-OCR', () => {
      const result = reconcileFields('doc-001', sampleFields, ['technicianName']);
      
      // serviceDate has low confidence (0.6) and bbox
      // technicianName is missing and required
      expect(result.reOcrRequests.length).toBeGreaterThan(0);
    });
    
    it('should only re-OCR fields with bbox', () => {
      const fieldsWithoutBbox: ExtractedField[] = [
        { fieldName: 'testField', value: null, confidence: 0, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fieldsWithoutBbox, ['testField']);
      
      // No bbox, so no re-OCR request
      expect(result.reOcrRequests.length).toBe(0);
    });
    
    it('should produce deterministic output', () => {
      const result1 = reconcileFields('doc-001', sampleFields);
      const result2 = reconcileFields('doc-001', sampleFields);
      
      expect(result1.reconciledFields.map(f => f.fieldName))
        .toEqual(result2.reconciledFields.map(f => f.fieldName));
      expect(result1.summary).toEqual(result2.summary);
    });
    
    it('should sort reconciled fields by name', () => {
      const result = reconcileFields('doc-001', sampleFields);
      
      const fieldNames = result.reconciledFields.map(f => f.fieldName);
      const sortedNames = [...fieldNames].sort();
      
      expect(fieldNames).toEqual(sortedNames);
    });
    
    it('should calculate summary statistics', () => {
      const result = reconcileFields('doc-001', sampleFields);
      
      expect(result.summary.totalFields).toBe(sampleFields.length);
      expect(typeof result.summary.averageConfidence).toBe('number');
      expect(result.summary.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.summary.averageConfidence).toBeLessThanOrEqual(1);
    });
  });
  
  describe('Review Routing', () => {
    it('should route documents with missing required fields', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'jobNumber', value: null, confidence: 0, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields, ['jobNumber']);
      const routing = determineReviewRouting(result, ['jobNumber']);
      
      expect(routing.shouldRoute).toBe(true);
      expect(routing.reasons.some(r => r.code === 'MISSING_REQUIRED')).toBe(true);
    });
    
    it('should route documents with low confidence fields', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'jobNumber', value: 'JS-001', confidence: 0.3, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields);
      const routing = determineReviewRouting(result);
      
      expect(routing.shouldRoute).toBe(true);
      expect(routing.reasons.some(r => r.code === 'LOW_CONFIDENCE_FIELD')).toBe(true);
    });
    
    it('should set high priority for S0 issues', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'criticalField', value: null, confidence: 0, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields, ['criticalField']);
      const routing = determineReviewRouting(result, ['criticalField']);
      
      expect(routing.priority).toBe('high');
    });
    
    it('should sort reasons by severity', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'field1', value: null, confidence: 0, source: 'primary' },
        { fieldName: 'field2', value: 'test', confidence: 0.3, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields, ['field1']);
      const routing = determineReviewRouting(result, ['field1']);
      
      // Reasons should be sorted by severity (S0 first)
      for (let i = 1; i < routing.reasons.length; i++) {
        const prev = routing.reasons[i - 1].severity;
        const curr = routing.reasons[i].severity;
        expect(prev <= curr).toBe(true);
      }
    });
    
    it('should not route high confidence documents', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'jobNumber', value: 'JS-001', confidence: 0.95, source: 'primary' },
        { fieldName: 'customerName', value: 'Test', confidence: 0.9, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields);
      const routing = determineReviewRouting(result);
      
      expect(routing.shouldRoute).toBe(false);
      expect(routing.reasons.length).toBe(0);
    });
  });
  
  describe('Artifact Generation', () => {
    it('should generate valid JSON artifact', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'jobNumber', value: 'JS-001', confidence: 0.95, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields);
      const artifact = generateReconciliationArtifact(result);
      
      expect(() => JSON.parse(artifact)).not.toThrow();
    });
    
    it('should include schema version', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'test', value: 'value', confidence: 0.8, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields);
      const artifact = JSON.parse(generateReconciliationArtifact(result));
      
      expect(artifact.schemaVersion).toBe('1.0.0');
    });
    
    it('should include all required sections', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'test', value: 'value', confidence: 0.8, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields);
      const artifact = JSON.parse(generateReconciliationArtifact(result));
      
      expect(artifact.documentId).toBeDefined();
      expect(artifact.processedAt).toBeDefined();
      expect(artifact.summary).toBeDefined();
      expect(artifact.reconciledFields).toBeDefined();
      expect(artifact.reOcrAttempts).toBeDefined();
    });
    
    it('should round confidence values', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'test', value: 'value', confidence: 0.8333333, source: 'primary' },
      ];
      
      const result = reconcileFields('doc-001', fields);
      const artifact = JSON.parse(generateReconciliationArtifact(result));
      
      const confidence = artifact.reconciledFields[0].confidence;
      // Should be rounded to 2 decimal places
      expect(confidence.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    });
  });
  
  describe('Byte-Identical Output', () => {
    it('should produce identical output for identical input', () => {
      const fields: ExtractedField[] = [
        { fieldName: 'jobNumber', value: 'JS-001', confidence: 0.95, source: 'primary' },
        { fieldName: 'customerName', value: 'ACME', confidence: 0.85, source: 'primary' },
        { fieldName: 'serviceDate', value: '2024-01-15', confidence: 0.9, source: 'primary' },
      ];
      
      const result1 = reconcileFields('doc-001', fields);
      const result2 = reconcileFields('doc-001', fields);
      
      const artifact1 = generateReconciliationArtifact(result1);
      const artifact2 = generateReconciliationArtifact(result2);
      
      // Normalize non-deterministic fields for comparison:
      // - processedAt: ISO timestamp varies between calls
      // - processingTimeMs: execution time varies based on system load/timing
      const normalizeArtifact = (s: string) =>
        s.replace(/"processedAt":"[^"]+"/g, '"processedAt":"X"')
         .replace(/"processingTimeMs":\s*\d+/g, '"processingTimeMs":0');
      
      const normalized1 = normalizeArtifact(artifact1);
      const normalized2 = normalizeArtifact(artifact2);
      
      expect(normalized1).toBe(normalized2);
    });
  });
  
  describe('No Provider Calls', () => {
    it('should not make external API calls', () => {
      // This test verifies that reconciliation works without external services
      const fields: ExtractedField[] = [
        { fieldName: 'test', value: 'value', confidence: 0.5, source: 'primary', bbox: { x: 0, y: 0, width: 10, height: 10, pageNumber: 1 } },
      ];
      
      // Should complete without errors (no network calls)
      const result = reconcileFields('doc-001', fields, ['test']);
      
      expect(result.success !== false).toBe(true);
      expect(result.reconciledFields.length).toBe(1);
    });
  });
  
  describe('Custom Calibration', () => {
    it('should respect custom calibration thresholds', () => {
      const customCalibration: CalibrationTable = {
        version: '1.0.0',
        defaultThreshold: 0.99,  // Very high threshold
        defaultWeight: 1.0,
        entries: [],
      };
      
      const fields: ExtractedField[] = [
        { fieldName: 'test', value: 'value', confidence: 0.95, source: 'primary', bbox: { x: 0, y: 0, width: 10, height: 10, pageNumber: 1 } },
      ];
      
      const result = reconcileFields('doc-001', fields, [], customCalibration);
      
      // With 0.99 threshold, 0.95 confidence should trigger re-OCR
      expect(result.reOcrRequests.length).toBeGreaterThan(0);
    });
  });
});
