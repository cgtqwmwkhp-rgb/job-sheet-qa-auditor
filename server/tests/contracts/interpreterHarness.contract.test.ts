/**
 * Interpreter A/B Harness Contract Tests
 * 
 * Tests for A/B evaluation of interpreter configurations.
 * Ensures deterministic, no-provider-calls operation.
 */

import { describe, it, expect } from 'vitest';
import {
  createEvaluationRun,
  runEvaluation,
  generateEvaluationReport,
  getDefaultConfigs,
  type TestCase,
  type InterpreterConfig,
} from '../../services/interpreterHarness';

describe('Interpreter A/B Harness Contract Tests', () => {
  const sampleTestCases: TestCase[] = [
    {
      id: 'tc-001',
      documentId: 'doc-001',
      inputMarkdown: '# Job Sheet\n\nJob Number: JS-2024-001\nCustomer: ACME Corp\nDate: 2024-01-15',
      expectedFields: [
        { fieldName: 'jobNumber', expectedValue: 'JS-2024-001' },
        { fieldName: 'customerName', expectedValue: 'ACME Corp' },
        { fieldName: 'serviceDate', expectedValue: '2024-01-15' },
      ],
    },
    {
      id: 'tc-002',
      documentId: 'doc-002',
      inputMarkdown: '# Service Report\n\nRef: SR-2024-002\nClient: Beta Inc\nCompleted: 2024-02-20',
      expectedFields: [
        { fieldName: 'jobNumber', expectedValue: 'SR-2024-002' },
        { fieldName: 'customerName', expectedValue: 'Beta Inc' },
        { fieldName: 'serviceDate', expectedValue: '2024-02-20' },
      ],
    },
  ];
  
  describe('Default Configurations', () => {
    it('should provide default A/B configs', () => {
      const configs = getDefaultConfigs();
      
      expect(configs.configA).toBeDefined();
      expect(configs.configB).toBeDefined();
      expect(configs.configA.id).not.toBe(configs.configB.id);
    });
    
    it('should have valid config structure', () => {
      const configs = getDefaultConfigs();
      
      for (const config of [configs.configA, configs.configB]) {
        expect(config.id).toBeDefined();
        expect(config.name).toBeDefined();
        expect(config.model).toBeDefined();
        expect(typeof config.temperature).toBe('number');
        expect(typeof config.maxTokens).toBe('number');
        expect(config.systemPrompt).toBeDefined();
        expect(config.userPromptTemplate).toBeDefined();
        expect(config.features).toBeDefined();
      }
    });
    
    it('should have different feature flags', () => {
      const configs = getDefaultConfigs();
      
      // Config B should have more features enabled
      expect(configs.configB.features.useChainOfThought).toBe(true);
      expect(configs.configB.features.useExamples).toBe(true);
    });
  });
  
  describe('Evaluation Run Creation', () => {
    it('should create evaluation run with defaults', () => {
      const run = createEvaluationRun('Test Run', sampleTestCases);
      
      expect(run.id).toBeDefined();
      expect(run.name).toBe('Test Run');
      expect(run.status).toBe('pending');
      expect(run.testCases).toEqual(sampleTestCases);
      expect(run.configA).toBeDefined();
      expect(run.configB).toBeDefined();
    });
    
    it('should accept custom configs', () => {
      const customConfig: InterpreterConfig = {
        id: 'custom-1',
        name: 'Custom Config',
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 2048,
        systemPrompt: 'Custom prompt',
        userPromptTemplate: 'Custom template',
        features: {
          useStructuredOutput: false,
          useExamples: false,
          useChainOfThought: false,
        },
      };
      
      const run = createEvaluationRun('Custom Run', sampleTestCases, customConfig);
      
      expect(run.configA.id).toBe('custom-1');
    });
  });
  
  describe('Evaluation Execution (Simulated)', () => {
    it('should run evaluation in simulated mode', async () => {
      const run = createEvaluationRun('Simulated Run', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      expect(result.status).toBe('completed');
      expect(result.resultsA.length).toBe(sampleTestCases.length);
      expect(result.resultsB.length).toBe(sampleTestCases.length);
    });
    
    it('should produce results for each test case', async () => {
      const run = createEvaluationRun('Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      for (const testCase of sampleTestCases) {
        const resultA = result.resultsA.find(r => r.testCaseId === testCase.id);
        const resultB = result.resultsB.find(r => r.testCaseId === testCase.id);
        
        expect(resultA).toBeDefined();
        expect(resultB).toBeDefined();
        expect(resultA?.configId).toBe(result.configA.id);
        expect(resultB?.configId).toBe(result.configB.id);
      }
    });
    
    it('should calculate metrics for each result', async () => {
      const run = createEvaluationRun('Metrics Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      for (const testResult of result.resultsA) {
        expect(testResult.metrics).toBeDefined();
        expect(testResult.metrics.accuracy).toBeGreaterThanOrEqual(0);
        expect(testResult.metrics.accuracy).toBeLessThanOrEqual(1);
        expect(testResult.metrics.f1Score).toBeGreaterThanOrEqual(0);
        expect(testResult.metrics.f1Score).toBeLessThanOrEqual(1);
      }
    });
    
    it('should produce deterministic results', async () => {
      const run1 = createEvaluationRun('Det Test 1', sampleTestCases);
      const run2 = createEvaluationRun('Det Test 2', sampleTestCases);
      
      // Use same configs
      run2.configA = run1.configA;
      run2.configB = run1.configB;
      
      const result1 = await runEvaluation(run1, { mode: 'simulated' });
      const result2 = await runEvaluation(run2, { mode: 'simulated' });
      
      // Results should be identical (excluding timestamps and IDs)
      expect(result1.resultsA.map(r => r.metrics))
        .toEqual(result2.resultsA.map(r => r.metrics));
      expect(result1.resultsB.map(r => r.metrics))
        .toEqual(result2.resultsB.map(r => r.metrics));
    });
  });
  
  describe('Evaluation Summary', () => {
    it('should generate summary after completion', async () => {
      const run = createEvaluationRun('Summary Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      expect(result.summary).toBeDefined();
      expect(result.summary?.configAMetrics).toBeDefined();
      expect(result.summary?.configBMetrics).toBeDefined();
    });
    
    it('should determine winner', async () => {
      const run = createEvaluationRun('Winner Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      expect(['A', 'B', 'tie']).toContain(result.summary?.winner);
      expect(result.summary?.winnerReason).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(result.summary?.confidenceLevel);
    });
    
    it('should include comparison deltas', async () => {
      const run = createEvaluationRun('Delta Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      expect(result.summary?.comparison).toBeDefined();
      expect(typeof result.summary?.comparison.accuracyDelta).toBe('number');
      expect(typeof result.summary?.comparison.latencyDelta).toBe('number');
      expect(typeof result.summary?.comparison.f1Delta).toBe('number');
    });
    
    it('should provide recommendations', async () => {
      const run = createEvaluationRun('Rec Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      expect(result.summary?.recommendations).toBeDefined();
      expect(Array.isArray(result.summary?.recommendations)).toBe(true);
    });
  });
  
  describe('Aggregate Metrics', () => {
    it('should calculate average metrics', async () => {
      const run = createEvaluationRun('Avg Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      const metricsA = result.summary?.configAMetrics;
      
      expect(metricsA?.avgAccuracy).toBeGreaterThanOrEqual(0);
      expect(metricsA?.avgAccuracy).toBeLessThanOrEqual(1);
      expect(metricsA?.avgF1Score).toBeGreaterThanOrEqual(0);
      expect(metricsA?.avgF1Score).toBeLessThanOrEqual(1);
    });
    
    it('should calculate latency percentiles', async () => {
      const run = createEvaluationRun('Latency Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      const metricsA = result.summary?.configAMetrics;
      
      expect(metricsA?.p50LatencyMs).toBeDefined();
      expect(metricsA?.p95LatencyMs).toBeDefined();
      expect(metricsA?.p99LatencyMs).toBeDefined();
      expect(metricsA?.p50LatencyMs).toBeLessThanOrEqual(metricsA?.p95LatencyMs || 0);
    });
    
    it('should calculate field-level metrics', async () => {
      const run = createEvaluationRun('Field Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      const fieldMetrics = result.summary?.configAMetrics.fieldMetrics;
      
      expect(fieldMetrics).toBeDefined();
      expect(Array.isArray(fieldMetrics)).toBe(true);
      
      if (fieldMetrics && fieldMetrics.length > 0) {
        expect(fieldMetrics[0].fieldName).toBeDefined();
        expect(fieldMetrics[0].accuracy).toBeGreaterThanOrEqual(0);
      }
    });
  });
  
  describe('Report Generation', () => {
    it('should generate valid JSON report', async () => {
      const run = createEvaluationRun('Report Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      const report = generateEvaluationReport(result);
      
      expect(() => JSON.parse(report)).not.toThrow();
    });
    
    it('should include schema version', async () => {
      const run = createEvaluationRun('Schema Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      const report = JSON.parse(generateEvaluationReport(result));
      
      expect(report.schemaVersion).toBe('1.0.0');
    });
    
    it('should include config summaries', async () => {
      const run = createEvaluationRun('Config Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      const report = JSON.parse(generateEvaluationReport(result));
      
      expect(report.configs.A).toBeDefined();
      expect(report.configs.B).toBeDefined();
      expect(report.configs.A.id).toBeDefined();
      expect(report.configs.B.id).toBeDefined();
    });
  });
  
  describe('Stable Ordering', () => {
    it('should maintain stable field ordering in results', async () => {
      const run = createEvaluationRun('Order Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      for (const testResult of result.resultsA) {
        const fieldNames = testResult.extractedFields.map(f => f.fieldName);
        const sortedNames = [...fieldNames].sort();
        
        expect(fieldNames).toEqual(sortedNames);
      }
    });
    
    it('should maintain stable field metrics ordering', async () => {
      const run = createEvaluationRun('Metrics Order Test', sampleTestCases);
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      const fieldMetrics = result.summary?.configAMetrics.fieldMetrics || [];
      const fieldNames = fieldMetrics.map(f => f.fieldName);
      const sortedNames = [...fieldNames].sort();
      
      expect(fieldNames).toEqual(sortedNames);
    });
  });
  
  describe('No External API Calls', () => {
    it('should complete without network calls in simulated mode', async () => {
      const run = createEvaluationRun('No API Test', sampleTestCases);
      
      // Should complete without errors (no network calls)
      const result = await runEvaluation(run, { mode: 'simulated' });
      
      expect(result.status).toBe('completed');
    });
  });
});
