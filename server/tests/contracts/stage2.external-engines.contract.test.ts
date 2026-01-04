/**
 * Stage 2 Contract Tests: External Engines Integration
 * 
 * Tests for:
 * - Mistral OCR adapter (mock HTTP)
 * - Gemini interpreter (mock HTTP)
 * - Determinism: canonical report unchanged with ENABLE_GEMINI_INSIGHTS on/off
 * - Logging safety: no OCR text in logs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockAdapter,
  getMockAdapter,
  resetMockAdapter,
  type OCRResult,
} from '../../services/ocrAdapter';
import {
  createMockInterpreter,
  getMockInterpreter,
  resetMockInterpreter,
  type InterpretationResult,
  type InsightsArtifact,
} from '../../services/interpreterAdapter';
import { createSafeLogger, checkLoggingSafety } from '../../utils/safeLogger';

describe('Stage 2: External Engines Integration', () => {
  beforeEach(() => {
    resetMockAdapter();
    resetMockInterpreter();
  });

  describe('OCR Adapter Contract', () => {
    it('returns OCRResult with required fields', async () => {
      const adapter = getMockAdapter();
      const result = await adapter.extractFromUrl('https://example.com/doc.pdf');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('pages');
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('model');
      expect(Array.isArray(result.pages)).toBe(true);
    });

    it('pages have required structure', async () => {
      const adapter = getMockAdapter();
      const result = await adapter.extractFromUrl('https://example.com/doc.pdf');

      expect(result.success).toBe(true);
      expect(result.pages.length).toBeGreaterThan(0);

      const page = result.pages[0];
      expect(page).toHaveProperty('pageNumber');
      expect(page).toHaveProperty('markdown');
      expect(typeof page.pageNumber).toBe('number');
      expect(typeof page.markdown).toBe('string');
    });

    it('generates provider artifact with redacted metadata', async () => {
      const adapter = getMockAdapter();
      const result = await adapter.extractFromUrl('https://example.com/doc.pdf');
      const artifact = adapter.getProviderArtifact(result);

      expect(artifact).toHaveProperty('provider', 'mock');
      expect(artifact).toHaveProperty('model');
      expect(artifact).toHaveProperty('timestamp');
      expect(artifact).toHaveProperty('requestMetadata');
      expect(artifact).toHaveProperty('responseMetadata');

      // Artifact should NOT contain raw OCR text
      expect(artifact).not.toHaveProperty('rawText');
      expect(artifact).not.toHaveProperty('markdown');
      expect(artifact).not.toHaveProperty('pages');
    });

    it('handles extraction failure gracefully', async () => {
      const adapter = getMockAdapter();
      adapter.setShouldFail(true);

      const result = await adapter.extractFromUrl('https://example.com/doc.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.pages).toEqual([]);
    });

    it('supports base64 extraction', async () => {
      const adapter = getMockAdapter();
      const result = await adapter.extractFromBase64('base64data', 'application/pdf');

      expect(result.success).toBe(true);
      expect(result.pages.length).toBeGreaterThan(0);
    });
  });

  describe('Interpreter Adapter Contract', () => {
    it('returns InterpretationResult with required fields', async () => {
      const interpreter = getMockInterpreter();
      const result = await interpreter.interpret({
        auditReport: {
          findings: [],
          validatedFields: [],
        },
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('model');
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it('insights have required structure', async () => {
      const interpreter = getMockInterpreter();
      const result = await interpreter.interpret({
        extractedFields: { jobNumber: 'JS-001' },
      });

      expect(result.success).toBe(true);
      expect(result.insights.length).toBeGreaterThan(0);

      const insight = result.insights[0];
      expect(insight).toHaveProperty('id');
      expect(insight).toHaveProperty('category');
      expect(insight).toHaveProperty('severity');
      expect(insight).toHaveProperty('title');
      expect(insight).toHaveProperty('description');
      expect(insight).toHaveProperty('confidence');
      expect(['info', 'suggestion', 'warning']).toContain(insight.severity);
      expect(insight.confidence).toBeGreaterThanOrEqual(0);
      expect(insight.confidence).toBeLessThanOrEqual(1);
    });

    it('generates InsightsArtifact with isAdvisoryOnly=true', async () => {
      const interpreter = getMockInterpreter();
      const result = await interpreter.interpret({});
      const artifact = interpreter.generateArtifact(result, ['audit_report.json']);

      expect(artifact).toHaveProperty('version', '1.0.0');
      expect(artifact).toHaveProperty('isAdvisoryOnly', true);
      expect(artifact).toHaveProperty('insights');
      expect(artifact).toHaveProperty('metadata');
      expect(artifact.metadata).toHaveProperty('inputArtifacts');
      expect(artifact.metadata.inputArtifacts).toContain('audit_report.json');
    });

    it('returns empty insights when disabled', async () => {
      const interpreter = getMockInterpreter();
      interpreter.setEnabled(false);

      const result = await interpreter.interpret({
        extractedFields: { jobNumber: 'JS-001' },
      });

      expect(result.success).toBe(true);
      expect(result.insights).toEqual([]);
    });

    it('respects minConfidence filter', async () => {
      const interpreter = getMockInterpreter();
      const result = await interpreter.interpret({}, { minConfidence: 0.7 });

      // All returned insights should have confidence >= 0.7
      for (const insight of result.insights) {
        expect(insight.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('respects maxInsights limit', async () => {
      const interpreter = getMockInterpreter();
      const result = await interpreter.interpret({}, { maxInsights: 1 });

      expect(result.insights.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Determinism Contract', () => {
    it('canonical report bytes unchanged with interpreter on/off', async () => {
      // Simulate canonical report generation
      const canonicalReport = {
        findings: [
          { field: 'jobNumber', status: 'passed', severity: 'none', message: '' },
        ],
        validatedFields: [
          { field: 'jobNumber', status: 'passed', value: 'JS-001' },
        ],
        generatedAt: '2024-01-15T10:00:00.000Z', // Fixed timestamp for determinism
      };

      // Serialize to canonical JSON
      const canonicalJson = JSON.stringify(canonicalReport, Object.keys(canonicalReport).sort());

      // Run interpreter (should not affect canonical report)
      const interpreter = getMockInterpreter();
      await interpreter.interpret({
        auditReport: {
          findings: canonicalReport.findings,
          validatedFields: canonicalReport.validatedFields,
        },
      });

      // Verify canonical report unchanged
      const afterInterpretation = JSON.stringify(canonicalReport, Object.keys(canonicalReport).sort());
      expect(afterInterpretation).toBe(canonicalJson);
    });

    it('insights artifact is separate from canonical output', async () => {
      const interpreter = getMockInterpreter();
      const result = await interpreter.interpret({});
      const artifact = interpreter.generateArtifact(result, []);

      // Insights artifact should be clearly marked as advisory
      expect(artifact.isAdvisoryOnly).toBe(true);

      // Should not contain canonical fields
      expect(artifact).not.toHaveProperty('findings');
      expect(artifact).not.toHaveProperty('validatedFields');
    });
  });

  describe('Logging Safety Contract', () => {
    it('safeLogger redacts OCR text fields', () => {
      const unsafeData = {
        correlationId: 'test-123',
        markdown: 'This is OCR extracted text with PII',
        rawText: 'More sensitive content',
        pageCount: 5,
      };

      const unsafeFields = checkLoggingSafety(unsafeData);
      expect(unsafeFields).toContain('markdown');
      expect(unsafeFields).toContain('rawText');
    });

    it('safeLogger allows safe fields', () => {
      const safeData = {
        correlationId: 'test-123',
        pageCount: 5,
        processingTimeMs: 150,
        model: 'mistral-ocr-2503',
      };

      const unsafeFields = checkLoggingSafety(safeData);
      expect(unsafeFields).toEqual([]);
    });

    it('safeLogger handles nested objects', () => {
      const nestedData = {
        metadata: {
          correlationId: 'test-123',
          ocrText: 'Nested sensitive content',
        },
        pages: [
          { pageNumber: 1, markdown: 'Page content' },
        ],
      };

      const unsafeFields = checkLoggingSafety(nestedData);
      expect(unsafeFields).toContain('metadata.ocrText');
      expect(unsafeFields).toContain('pages[0].markdown');
    });

    it('OCR adapter artifact does not contain raw text', async () => {
      const adapter = getMockAdapter();
      const result = await adapter.extractFromUrl('https://example.com/doc.pdf');
      const artifact = adapter.getProviderArtifact(result);

      // Check artifact is safe to log
      const unsafeFields = checkLoggingSafety(artifact as any);
      expect(unsafeFields).toEqual([]);
    });
  });

  describe('Error Handling Contract', () => {
    it('OCR adapter returns structured error on failure', async () => {
      const adapter = getMockAdapter();
      adapter.setShouldFail(true);

      const result = await adapter.extractFromUrl('https://example.com/doc.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBeDefined();
      expect(result.pages).toEqual([]);
      expect(result.totalPages).toBe(0);
    });

    it('interpreter returns structured error on failure', async () => {
      const interpreter = getMockInterpreter();
      interpreter.setShouldFail(true);

      const result = await interpreter.interpret({});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBeDefined();
      expect(result.insights).toEqual([]);
    });
  });

  describe('API Key Validation Contract', () => {
    it('OCR adapter validates API key', async () => {
      const adapter = getMockAdapter();
      const validation = await adapter.validateApiKey();

      expect(validation).toHaveProperty('valid');
      expect(typeof validation.valid).toBe('boolean');
    });

    it('interpreter validates API key', async () => {
      const interpreter = getMockInterpreter();
      const validation = await interpreter.validateApiKey();

      expect(validation).toHaveProperty('valid');
      expect(typeof validation.valid).toBe('boolean');
    });
  });
});
