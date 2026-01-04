/**
 * Gemini Interpreter Types
 * 
 * Defines the advisory interpreter interface for document insights.
 * CRITICAL: Gemini output is ADVISORY ONLY - must never affect canonical findings or validatedFields.
 */

/**
 * Insight severity levels
 */
export type InsightSeverity = 'info' | 'suggestion' | 'warning';

/**
 * Single insight from Gemini interpretation
 */
export interface Insight {
  id: string;
  category: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  affectedFields?: string[];
  confidence: number; // 0-1
  reasoning?: string;
}

/**
 * Gemini interpretation result
 */
export interface InterpretationResult {
  success: boolean;
  insights: Insight[];
  summary?: string;
  model: string;
  correlationId?: string;
  processingTimeMs?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Insights artifact schema (strict JSON)
 */
export interface InsightsArtifact {
  version: '1.0.0';
  generatedAt: string;
  correlationId?: string;
  model: string;
  isAdvisoryOnly: true; // Always true - enforced
  insights: Insight[];
  summary?: string;
  metadata: {
    processingTimeMs: number;
    inputArtifacts: string[];
  };
}

/**
 * Input for Gemini interpretation
 * Uses canonical artifacts, NOT raw OCR text (unless explicitly enabled)
 */
export interface InterpretationInput {
  /**
   * Canonical audit report (findings, validatedFields)
   */
  auditReport?: {
    findings: Array<{
      field: string;
      status: string;
      severity: string;
      message: string;
    }>;
    validatedFields: Array<{
      field: string;
      status: string;
      value?: string;
    }>;
  };
  
  /**
   * Extracted fields from document
   */
  extractedFields?: Record<string, string | number | boolean | null>;
  
  /**
   * Raw OCR text - only included if ENABLE_RAW_OCR_INSIGHTS is set
   * WARNING: Contains PII - use with caution
   */
  rawOcrText?: string;
}

/**
 * Interpreter options
 */
export interface InterpreterOptions {
  /**
   * Enable raw OCR text in interpretation (default: false)
   * WARNING: May expose PII to external service
   */
  includeRawOcr?: boolean;
  
  /**
   * Maximum insights to return
   */
  maxInsights?: number;
  
  /**
   * Minimum confidence threshold (0-1)
   */
  minConfidence?: number;
  
  /**
   * Skip retry on failure
   */
  skipRetry?: boolean;
}

/**
 * Interpreter adapter interface
 */
export interface InterpreterAdapter {
  /**
   * Provider name for logging
   */
  readonly providerName: string;
  
  /**
   * Model identifier
   */
  readonly modelId: string;
  
  /**
   * Generate advisory insights from canonical artifacts
   */
  interpret(input: InterpretationInput, options?: InterpreterOptions): Promise<InterpretationResult>;
  
  /**
   * Validate API key is configured
   */
  validateApiKey(): Promise<{ valid: boolean; error?: string }>;
  
  /**
   * Generate insights artifact (strict JSON schema)
   */
  generateArtifact(result: InterpretationResult, inputArtifacts: string[]): InsightsArtifact;
}

/**
 * Interpreter configuration from environment
 */
export interface InterpreterConfig {
  enabled: boolean;
  model: string;
  apiKey?: string;
  maxRetries: number;
  baseDelayMs: number;
}

/**
 * Get interpreter configuration from environment
 */
export function getInterpreterConfig(): InterpreterConfig {
  return {
    enabled: process.env.ENABLE_GEMINI_INSIGHTS === 'true',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    apiKey: process.env.GEMINI_API_KEY,
    maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10),
    baseDelayMs: parseInt(process.env.GEMINI_BASE_DELAY_MS || '1000', 10),
  };
}
