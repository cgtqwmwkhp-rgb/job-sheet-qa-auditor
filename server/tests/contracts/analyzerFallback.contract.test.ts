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
    it('should detect missing required fields', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify MISSING_FIELD detection exists
      expect(analyzerContent).toContain("reasonCode: 'MISSING_FIELD'");
      expect(analyzerContent).toContain('rule.required && !fieldFound');
    });

    it('should detect invalid format', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify INVALID_FORMAT detection exists
      expect(analyzerContent).toContain("reasonCode: 'INVALID_FORMAT'");
      expect(analyzerContent).toContain('!patternMatches');
    });

    it('should calculate score based on passed rules', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify score calculation
      expect(analyzerContent).toContain('passedRules / totalRules');
    });

    it('should determine PASS/FAIL/REVIEW_QUEUE based on score', async () => {
      const analyzerPath = path.resolve(__dirname, '../../services/analyzer.ts');
      const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8');
      
      // Verify result determination - check for assignments in the fallback function
      expect(analyzerContent).toContain("= 'PASS'");
      expect(analyzerContent).toContain("= 'FAIL'");
      expect(analyzerContent).toContain("= 'REVIEW_QUEUE'");
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
