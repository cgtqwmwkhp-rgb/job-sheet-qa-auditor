/**
 * Interpreter A/B Harness Types
 * 
 * Types for running A/B evaluations between different interpreter
 * configurations (prompts, models, parameters).
 */

/**
 * Interpreter configuration for A/B testing
 */
export interface InterpreterConfig {
  id: string;
  name: string;
  description?: string;
  
  // Model configuration
  model: string;
  temperature: number;
  maxTokens: number;
  
  // Prompt configuration
  systemPrompt: string;
  userPromptTemplate: string;
  
  // Feature flags
  features: {
    useStructuredOutput: boolean;
    useExamples: boolean;
    useChainOfThought: boolean;
  };
}

/**
 * Test case for evaluation
 */
export interface TestCase {
  id: string;
  documentId: string;
  inputMarkdown: string;
  expectedFields: ExpectedField[];
  metadata?: Record<string, unknown>;
}

/**
 * Expected field value for evaluation
 */
export interface ExpectedField {
  fieldName: string;
  expectedValue: string | null;
  tolerance?: 'exact' | 'fuzzy' | 'contains';
}

/**
 * Result from running a single test case
 */
export interface TestCaseResult {
  testCaseId: string;
  configId: string;
  
  // Timing
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  
  // Results
  success: boolean;
  extractedFields: ExtractedFieldResult[];
  
  // Metrics
  metrics: {
    accuracy: number;        // 0-1: % of fields correctly extracted
    precision: number;       // 0-1: correct / (correct + false positives)
    recall: number;          // 0-1: correct / (correct + false negatives)
    f1Score: number;         // 0-1: harmonic mean of precision and recall
    fieldMatchRate: number;  // 0-1: % of expected fields found
  };
  
  // Errors
  error?: string;
  errorCode?: string;
}

/**
 * Extracted field result with comparison
 */
export interface ExtractedFieldResult {
  fieldName: string;
  extractedValue: string | null;
  expectedValue: string | null;
  match: 'exact' | 'fuzzy' | 'partial' | 'missing' | 'extra';
  confidence: number;
}

/**
 * A/B evaluation run
 */
export interface EvaluationRun {
  id: string;
  name: string;
  description?: string;
  
  // Configs being compared
  configA: InterpreterConfig;
  configB: InterpreterConfig;
  
  // Test cases
  testCases: TestCase[];
  
  // Timing
  startedAt: string;
  completedAt?: string;
  
  // Status
  status: 'pending' | 'running' | 'completed' | 'failed';
  
  // Results
  resultsA: TestCaseResult[];
  resultsB: TestCaseResult[];
  
  // Summary
  summary?: EvaluationSummary;
}

/**
 * Summary of A/B evaluation
 */
export interface EvaluationSummary {
  // Overall metrics
  configAMetrics: AggregateMetrics;
  configBMetrics: AggregateMetrics;
  
  // Winner determination
  winner: 'A' | 'B' | 'tie';
  winnerReason: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  
  // Detailed comparison
  comparison: {
    accuracyDelta: number;    // A - B (positive = A better)
    latencyDelta: number;     // A - B (negative = A faster)
    f1Delta: number;          // A - B (positive = A better)
  };
  
  // Recommendations
  recommendations: string[];
}

/**
 * Aggregate metrics across all test cases
 */
export interface AggregateMetrics {
  configId: string;
  configName: string;
  
  // Counts
  totalTests: number;
  passedTests: number;
  failedTests: number;
  
  // Averages
  avgAccuracy: number;
  avgPrecision: number;
  avgRecall: number;
  avgF1Score: number;
  avgLatencyMs: number;
  
  // Percentiles
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  
  // Field-level breakdown
  fieldMetrics: FieldMetric[];
}

/**
 * Metrics for a specific field
 */
export interface FieldMetric {
  fieldName: string;
  accuracy: number;
  extractionRate: number;
  avgConfidence: number;
}

/**
 * Default interpreter configurations for testing
 */
export function getDefaultConfigs(): { configA: InterpreterConfig; configB: InterpreterConfig } {
  return {
    configA: {
      id: 'baseline-v1',
      name: 'Baseline (Current)',
      description: 'Current production configuration',
      model: 'gemini-2.0-flash',
      temperature: 0.1,
      maxTokens: 4096,
      systemPrompt: 'You are a document extraction assistant. Extract structured data from job sheets.',
      userPromptTemplate: 'Extract the following fields from this document:\n\n{{markdown}}\n\nReturn JSON with the extracted fields.',
      features: {
        useStructuredOutput: true,
        useExamples: false,
        useChainOfThought: false,
      },
    },
    configB: {
      id: 'candidate-v2',
      name: 'Candidate (New)',
      description: 'New configuration with chain-of-thought',
      model: 'gemini-2.0-flash',
      temperature: 0.0,
      maxTokens: 8192,
      systemPrompt: 'You are an expert document analyst. Carefully analyze job sheets and extract all relevant information with high precision.',
      userPromptTemplate: 'Analyze this job sheet document step by step:\n\n{{markdown}}\n\nFirst, identify all sections. Then extract each field. Finally, return JSON.',
      features: {
        useStructuredOutput: true,
        useExamples: true,
        useChainOfThought: true,
      },
    },
  };
}
