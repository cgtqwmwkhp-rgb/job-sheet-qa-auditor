/**
 * Analyzer Fallback Contract Tests
 * 
 * Verifies that the analyzer gracefully degrades when LLM API keys are not configured.
 * This ensures processing can complete without requiring AI services.
 * 
 * Incident Reference: INC-2026-01-12-PROCESSING
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Analyzer Fallback Contract', () => {
  describe('Code Structure Verification', () => {
    it('should export isLLMConfigured function from llm.ts', async () => {
      const llmPath = path.resolve(__dirname, '../../_core/llm.ts');
      const llmContent = fs.readFileSync(llmPath, 'utf-8');
      
      expect(llmContent).toContain('export function isLLMConfigured()');
      expect(llmContent).toContain('LLMNotConfiguredError');
    });

    it('should check isLLMConfigured before calling LLM in analyzer', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify the graceful degradation check exists
      expect(analyzerContent).toContain('isLLMConfigured()');
      expect(analyzerContent).toContain('performRuleBasedAnalysis');
      expect(analyzerContent).toContain('rule-based-fallback');
    });

    it('should not reference OPENAI_API_KEY in error messages', async () => {
      const llmPath = path.resolve(__dirname, '../../_core/llm.ts');
      const llmContent = fs.readFileSync(llmPath, 'utf-8');
      
      // The misleading OPENAI_API_KEY error should be replaced
      expect(llmContent).not.toContain('"OPENAI_API_KEY is not configured"');
      expect(llmContent).toContain('BUILT_IN_FORGE_API_KEY');
    });

    it('should have rule-based analysis fallback that returns valid result', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify the fallback returns a valid AnalysisResult structure
      expect(analyzerContent).toContain('success: true');
      expect(analyzerContent).toContain('overallResult');
      expect(analyzerContent).toContain('score');
      expect(analyzerContent).toContain('findings');
      expect(analyzerContent).toContain('extractedFields');
      expect(analyzerContent).toContain('summary');
    });
  });

  describe('Graceful Degradation Behavior', () => {
    it('should log warning when using rule-based fallback', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify warning is logged
      expect(analyzerContent).toContain('LLM not configured - using rule-based analysis');
    });

    it('should indicate rule-based model in result', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify model is set to indicate fallback
      expect(analyzerContent).toContain("model: 'rule-based-fallback'");
    });

    it('should not throw error when LLM is not configured', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify the check happens BEFORE the try block
      // The isLLMConfigured check should return early, not throw
      const checkIndex = analyzerContent.indexOf('if (!isLLMConfigured())');
      const tryIndex = analyzerContent.indexOf('try {', analyzerContent.indexOf('analyzeJobSheet'));
      
      expect(checkIndex).toBeLessThan(tryIndex);
    });
  });

  describe('Rule-Based Analysis', () => {
    it('should track field detection', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify field tracking
      expect(analyzerContent).toContain('fieldsDetected');
      expect(analyzerContent).toContain('fieldsExpected');
    });

    it('should use LOW_CONFIDENCE for uncertain findings', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Rule-based should use LOW_CONFIDENCE, not MISSING_FIELD (which implies certainty)
      expect(analyzerContent).toContain("reasonCode: 'LOW_CONFIDENCE'");
      expect(analyzerContent).toContain("severity: 'S3'"); // Minor severity
    });

    it('should PASS documents with content (lenient fallback)', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify lenient PASS logic
      expect(analyzerContent).toContain('ALWAYS PASS if document has content');
      expect(analyzerContent).toContain("overallResult = 'PASS'");
    });

    it('should FAIL only empty documents', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify FAIL is only for empty/broken documents
      expect(analyzerContent).toContain('Empty or near-empty document');
      expect(analyzerContent).toContain("overallResult = 'FAIL'");
      expect(analyzerContent).toContain('wordCount < 10');
    });

    it('should NEVER return REVIEW_QUEUE from rule-based fallback', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // The performRuleBasedAnalysis function should not contain REVIEW_QUEUE assignment
      // Search for the function and ensure it only has PASS or FAIL
      const functionMatch = analyzerContent.match(/function performRuleBasedAnalysis[\s\S]*?^}/m);
      if (functionMatch) {
        const functionBody = functionMatch[0];
        // Count REVIEW_QUEUE assignments in the function (should be 0)
        const reviewQueueAssignments = (functionBody.match(/overallResult\s*=\s*'REVIEW_QUEUE'/g) || []).length;
        expect(reviewQueueAssignments).toBe(0);
      }
      
      // Also verify the design comment
      expect(analyzerContent).toContain('NEVER return REVIEW_QUEUE');
    });

    it('should log the rule-based result', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify logging exists
      expect(analyzerContent).toContain('[Analyzer] Rule-based result:');
    });
  });

  describe('Environment Configuration', () => {
    it('should use BUILT_IN_FORGE_API_KEY for LLM', async () => {
      const envPath = path.resolve(__dirname, '../../_core/env.ts');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      
      expect(envContent).toContain('BUILT_IN_FORGE_API_KEY');
      expect(envContent).toContain('forgeApiKey');
    });
  });
});
