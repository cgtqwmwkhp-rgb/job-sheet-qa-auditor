/**
 * Mock Interpreter Adapter
 * 
 * Test implementation for no-secrets CI testing.
 * Returns deterministic results for contract tests.
 */

import { getCorrelationId } from '../../utils/context';
import type {
  InterpreterAdapter,
  InterpretationResult,
  InterpretationInput,
  InterpreterOptions,
  InsightsArtifact,
  Insight,
} from './types';

/**
 * Mock insights for testing
 */
const MOCK_INSIGHTS: Insight[] = [
  {
    id: 'mock-insight-1',
    category: 'data-quality',
    severity: 'suggestion',
    title: 'Consider verifying date format',
    description: 'The date field uses a non-standard format that may benefit from manual verification.',
    affectedFields: ['date'],
    confidence: 0.75,
    reasoning: 'Date format differs from expected ISO 8601 standard.',
  },
  {
    id: 'mock-insight-2',
    category: 'completeness',
    severity: 'info',
    title: 'Optional fields available',
    description: 'Some optional fields could be populated for better record completeness.',
    affectedFields: ['notes', 'attachments'],
    confidence: 0.6,
    reasoning: 'Optional fields are empty but could provide additional context.',
  },
];

/**
 * Mock Interpreter Adapter implementation
 */
export class MockInterpreterAdapter implements InterpreterAdapter {
  readonly providerName = 'mock';
  readonly modelId = 'mock-interpreter-v1';
  
  private mockInsights: Insight[] = MOCK_INSIGHTS;
  private shouldFail = false;
  private enabled = true;
  
  /**
   * Set mock insights for testing
   */
  setMockInsights(insights: Insight[]): void {
    this.mockInsights = insights;
  }
  
  /**
   * Set whether the adapter should fail
   */
  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }
  
  /**
   * Set whether the adapter is enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Reset to default state
   */
  reset(): void {
    this.mockInsights = MOCK_INSIGHTS;
    this.shouldFail = false;
    this.enabled = true;
  }
  
  /**
   * Generate advisory insights (mock)
   */
  async interpret(
    input: InterpretationInput,
    options?: InterpreterOptions
  ): Promise<InterpretationResult> {
    const correlationId = getCorrelationId();
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 5));
    
    if (!this.enabled) {
      return {
        success: true,
        insights: [],
        model: this.modelId,
        correlationId,
        processingTimeMs: 0,
      };
    }
    
    if (this.shouldFail) {
      return {
        success: false,
        insights: [],
        model: this.modelId,
        correlationId,
        error: 'Mock error for testing',
        errorCode: 'MOCK_ERROR',
      };
    }
    
    let insights = [...this.mockInsights];
    
    // Apply options
    if (options?.minConfidence !== undefined) {
      insights = insights.filter(i => i.confidence >= options.minConfidence!);
    }
    
    if (options?.maxInsights !== undefined) {
      insights = insights.slice(0, options.maxInsights);
    }
    
    return {
      success: true,
      insights,
      summary: 'Mock interpretation summary for testing.',
      model: this.modelId,
      correlationId,
      processingTimeMs: 50,
    };
  }
  
  /**
   * Validate API key (always valid for mock)
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }
  
  /**
   * Generate insights artifact
   */
  generateArtifact(result: InterpretationResult, inputArtifacts: string[]): InsightsArtifact {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      correlationId: result.correlationId,
      model: result.model,
      isAdvisoryOnly: true,
      insights: result.insights,
      summary: result.summary,
      metadata: {
        processingTimeMs: result.processingTimeMs || 0,
        inputArtifacts,
      },
    };
  }
}

/**
 * Create mock interpreter adapter instance
 */
export function createMockInterpreter(): MockInterpreterAdapter {
  return new MockInterpreterAdapter();
}

/**
 * Singleton mock adapter for testing
 */
let mockInterpreterInstance: MockInterpreterAdapter | null = null;

export function getMockInterpreter(): MockInterpreterAdapter {
  if (!mockInterpreterInstance) {
    mockInterpreterInstance = new MockInterpreterAdapter();
  }
  return mockInterpreterInstance;
}

export function resetMockInterpreter(): void {
  if (mockInterpreterInstance) {
    mockInterpreterInstance.reset();
  }
}
