/**
 * Gemini Interpreter Adapter
 * 
 * Advisory interpretation using Gemini 2.5 Pro.
 * CRITICAL: Output is ADVISORY ONLY - must never affect canonical findings or validatedFields.
 * 
 * SECURITY: Uses safeLogger to prevent sensitive content from appearing in logs.
 */

import { createSafeLogger } from '../../utils/safeLogger';
import { getCorrelationId } from '../../utils/context';
import type {
  InterpreterAdapter,
  InterpretationResult,
  InterpretationInput,
  InterpreterOptions,
  InsightsArtifact,
  Insight,
  InterpreterConfig,
} from './types';
import { getInterpreterConfig } from './types';

const logger = createSafeLogger('GeminiInterpreter');

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * System prompt for Gemini interpretation
 */
const SYSTEM_PROMPT = `You are a document quality advisor for job sheet audits. Your role is to provide ADVISORY insights only.

IMPORTANT: Your insights are supplementary and must NOT affect the canonical audit findings or validation results.

Analyze the provided audit data and extracted fields to identify:
1. Potential data quality issues that may need human review
2. Patterns or anomalies in the document
3. Suggestions for improving document completeness
4. Areas where manual verification might be beneficial

Respond with a JSON object containing:
{
  "insights": [
    {
      "id": "unique-id",
      "category": "data-quality|completeness|consistency|anomaly",
      "severity": "info|suggestion|warning",
      "title": "Brief title",
      "description": "Detailed description",
      "affectedFields": ["field1", "field2"],
      "confidence": 0.0-1.0,
      "reasoning": "Why this insight was generated"
    }
  ],
  "summary": "Brief overall summary"
}

Keep insights actionable and specific. Do not repeat information already in the audit findings.`;

/**
 * Gemini Interpreter Adapter implementation
 */
export class GeminiInterpreterAdapter implements InterpreterAdapter {
  readonly providerName = 'gemini';
  private readonly config: InterpreterConfig;
  
  constructor(config?: Partial<InterpreterConfig>) {
    this.config = { ...getInterpreterConfig(), ...config };
  }
  
  get modelId(): string {
    return this.config.model;
  }
  
  /**
   * Generate advisory insights from canonical artifacts
   */
  async interpret(
    input: InterpretationInput,
    options: InterpreterOptions = {}
  ): Promise<InterpretationResult> {
    const startTime = Date.now();
    const correlationId = getCorrelationId();
    
    // Check if interpreter is enabled
    if (!this.config.enabled) {
      return {
        success: true,
        insights: [],
        model: this.config.model,
        correlationId,
        processingTimeMs: 0,
      };
    }
    
    if (!this.config.apiKey) {
      return {
        success: false,
        insights: [],
        model: this.config.model,
        correlationId,
        error: 'GEMINI_API_KEY not configured',
        errorCode: 'CONFIG_ERROR',
      };
    }
    
    // Build input content (excluding raw OCR unless explicitly enabled)
    const inputContent = this.buildInputContent(input, options);
    
    logger.info('Starting interpretation', {
      correlationId,
      model: this.config.model,
      hasAuditReport: !!input.auditReport,
      hasExtractedFields: !!input.extractedFields,
      includeRawOcr: options.includeRawOcr && !!input.rawOcrText,
    });
    
    try {
      const response = await this.callGeminiAPI(inputContent);
      const processingTimeMs = Date.now() - startTime;
      
      if (!response.success) {
        return {
          success: false,
          insights: [],
          model: this.config.model,
          correlationId,
          processingTimeMs,
          error: response.error,
          errorCode: response.errorCode,
        };
      }
      
      // Parse and validate insights
      const insights = this.parseInsights(response.content, options);
      
      logger.info('Interpretation complete', {
        correlationId,
        insightCount: insights.length,
        processingTimeMs,
      });
      
      return {
        success: true,
        insights,
        summary: response.summary,
        model: this.config.model,
        correlationId,
        processingTimeMs,
      };
      
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Interpretation failed', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs,
      });
      
      return {
        success: false,
        insights: [],
        model: this.config.model,
        correlationId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'PROCESSING_ERROR',
      };
    }
  }
  
  /**
   * Build input content for Gemini
   */
  private buildInputContent(input: InterpretationInput, options: InterpreterOptions): string {
    const parts: string[] = [];
    
    if (input.auditReport) {
      parts.push('## Audit Report\n');
      parts.push('### Findings\n');
      parts.push(JSON.stringify(input.auditReport.findings, null, 2));
      parts.push('\n### Validated Fields\n');
      parts.push(JSON.stringify(input.auditReport.validatedFields, null, 2));
    }
    
    if (input.extractedFields) {
      parts.push('\n## Extracted Fields\n');
      parts.push(JSON.stringify(input.extractedFields, null, 2));
    }
    
    // Only include raw OCR if explicitly enabled
    if (options.includeRawOcr && input.rawOcrText && process.env.ENABLE_RAW_OCR_INSIGHTS === 'true') {
      parts.push('\n## Raw OCR Text (for context only)\n');
      // Truncate to prevent token overflow
      const truncated = input.rawOcrText.substring(0, 5000);
      parts.push(truncated);
      if (input.rawOcrText.length > 5000) {
        parts.push('\n[... truncated ...]');
      }
    }
    
    return parts.join('\n');
  }
  
  /**
   * Call Gemini API
   */
  private async callGeminiAPI(inputContent: string): Promise<{
    success: boolean;
    content?: any;
    summary?: string;
    error?: string;
    errorCode?: string;
  }> {
    const url = `${GEMINI_API_ENDPOINT}/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            { text: inputContent },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Gemini API error: ${response.status}`,
        errorCode: `HTTP_${response.status}`,
      };
    }
    
    const result = await response.json();
    
    // Extract content from Gemini response
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      return {
        success: false,
        error: 'Empty response from Gemini',
        errorCode: 'EMPTY_RESPONSE',
      };
    }
    
    try {
      const parsed = JSON.parse(content);
      return {
        success: true,
        content: parsed,
        summary: parsed.summary,
      };
    } catch {
      return {
        success: false,
        error: 'Invalid JSON response from Gemini',
        errorCode: 'INVALID_JSON',
      };
    }
  }
  
  /**
   * Parse and validate insights from Gemini response
   */
  private parseInsights(content: any, options: InterpreterOptions): Insight[] {
    if (!content?.insights || !Array.isArray(content.insights)) {
      return [];
    }
    
    let insights: Insight[] = content.insights
      .filter((i: any) => i && typeof i === 'object')
      .map((i: any, index: number) => ({
        id: i.id || `insight-${index + 1}`,
        category: i.category || 'general',
        severity: ['info', 'suggestion', 'warning'].includes(i.severity) ? i.severity : 'info',
        title: String(i.title || 'Untitled insight'),
        description: String(i.description || ''),
        affectedFields: Array.isArray(i.affectedFields) ? i.affectedFields : undefined,
        confidence: typeof i.confidence === 'number' ? Math.min(1, Math.max(0, i.confidence)) : 0.5,
        reasoning: i.reasoning ? String(i.reasoning) : undefined,
      }));
    
    // Apply confidence filter
    if (options.minConfidence !== undefined) {
      insights = insights.filter(i => i.confidence >= options.minConfidence!);
    }
    
    // Apply max insights limit
    if (options.maxInsights !== undefined) {
      insights = insights.slice(0, options.maxInsights);
    }
    
    return insights;
  }
  
  /**
   * Validate API key is configured
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (!this.config.apiKey) {
      return { valid: false, error: 'GEMINI_API_KEY not configured' };
    }
    
    try {
      const url = `${GEMINI_API_ENDPOINT}?key=${this.config.apiKey}`;
      const response = await fetch(url, { method: 'GET' });
      
      if (response.ok) {
        return { valid: true };
      } else {
        return { valid: false, error: `API validation failed: ${response.status}` };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Connection error',
      };
    }
  }
  
  /**
   * Generate insights artifact (strict JSON schema)
   */
  generateArtifact(result: InterpretationResult, inputArtifacts: string[]): InsightsArtifact {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      correlationId: result.correlationId,
      model: result.model,
      isAdvisoryOnly: true, // Always true - enforced
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
 * Create Gemini interpreter adapter instance
 */
export function createGeminiAdapter(config?: Partial<InterpreterConfig>): InterpreterAdapter {
  return new GeminiInterpreterAdapter(config);
}
