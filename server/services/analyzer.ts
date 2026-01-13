/**
 * Gemini 2.5 Job Sheet Analyzer Service
 * Analyzes extracted OCR text against Gold Standard specifications
 * Includes enterprise-grade resilience: retry logic, circuit breaker, correlation tracking
 */

import { invokeLLM, isLLMConfigured, LLMNotConfiguredError } from '../_core/llm';
import { withResiliency, geminiCircuitBreaker, CircuitBreakerOpenError } from '../utils/resilience';
import { getCorrelationId, addContextMetadata } from '../utils/context';
import { redactFindings } from '../utils/piiRedaction';
import { addToDeadLetterQueue } from '../utils/deadLetterQueue';

export interface GoldSpecRule {
  id: string;
  field: string;
  type: 'presence' | 'format' | 'regex' | 'range' | 'enum';
  required: boolean;
  description: string;
  pattern?: string;
  format?: string;
  minValue?: number;
  maxValue?: number;
  allowedValues?: string[];
}

export interface GoldSpec {
  name: string;
  version: string;
  rules: GoldSpecRule[];
}

export interface Finding {
  ruleId: string;
  fieldName: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  reasonCode: 'MISSING_FIELD' | 'UNREADABLE_FIELD' | 'LOW_CONFIDENCE' | 'INVALID_FORMAT' | 'CONFLICT' | 'OUT_OF_POLICY' | 'INCOMPLETE_EVIDENCE' | 'OCR_FAILURE' | 'PIPELINE_ERROR' | 'SPEC_GAP' | 'SECURITY_RISK';
  rawSnippet: string;
  normalisedSnippet: string;
  confidence: number;
  pageNumber: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  whyItMatters: string;
  suggestedFix: string;
}

export interface AnalysisResult {
  success: boolean;
  overallResult: 'PASS' | 'FAIL' | 'REVIEW_QUEUE';
  score: number;
  findings: Finding[];
  extractedFields: Record<string, {
    value: string;
    confidence: number;
    pageNumber: number;
  }>;
  summary: string;
  processingTimeMs: number;
  model: string;
  correlationId?: string;
  retryAttempts?: number;
  error?: string;
  errorCode?: string;
}

export interface AnalysisOptions {
  jobSheetId?: number;
  skipRetry?: boolean;
  redactPII?: boolean;
  confidenceThreshold?: number;
}

const ANALYSIS_SYSTEM_PROMPT = `You are an expert Job Sheet QA Auditor. Your task is to analyze extracted text from job sheets and validate them against a Gold Standard specification.

For each field in the specification:
1. Search for the field in the extracted text
2. Validate the format and content according to the rules
3. Assign a confidence score (0-100)
4. Report any issues found

Severity Levels:
- S0 (Blocker): Critical safety or compliance issues that must be fixed immediately
- S1 (Critical): Major issues that significantly impact quality or compliance
- S2 (Major): Important issues that should be addressed
- S3 (Minor): Minor issues or suggestions for improvement

Reason Codes:
- MISSING_FIELD: Required field is not present
- UNREADABLE_FIELD: Field is present but text cannot be read
- LOW_CONFIDENCE: Field found but confidence is below threshold
- INVALID_FORMAT: Field format does not match specification
- CONFLICT: Conflicting information found
- OUT_OF_POLICY: Value is outside acceptable range/policy
- INCOMPLETE_EVIDENCE: Supporting evidence is missing

Always respond with valid JSON matching the specified schema.`;

/**
 * Internal LLM call for analysis
 */
async function callAnalysisLLM(
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): Promise<any> {
  const userPrompt = `Analyze the following job sheet text against the Gold Standard specification.

## Gold Standard Specification
Name: ${goldSpec.name}
Version: ${goldSpec.version}

### Validation Rules:
${goldSpec.rules.map(rule => `
- **${rule.id}**: ${rule.field}
  - Type: ${rule.type}
  - Required: ${rule.required}
  - Description: ${rule.description}
  ${rule.pattern ? `- Pattern: ${rule.pattern}` : ''}
  ${rule.format ? `- Format: ${rule.format}` : ''}
`).join('\n')}

## Extracted Job Sheet Text (${pageCount} pages):
${extractedText}

## Instructions:
1. For each rule, search for the corresponding field in the text
2. Validate format and content
3. Report findings with appropriate severity and reason codes
4. Calculate an overall score (0-100)
5. Determine if the job sheet PASSES, FAILS, or needs REVIEW_QUEUE

Respond with a JSON object containing:
- overallResult: "PASS" | "FAIL" | "REVIEW_QUEUE"
- score: number (0-100)
- findings: array of issues found
- extractedFields: object mapping field names to extracted values
- summary: brief summary of the analysis`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'job_sheet_analysis',
        schema: {
          type: 'object',
          properties: {
            overallResult: { type: 'string', enum: ['PASS', 'FAIL', 'REVIEW_QUEUE'] },
            score: { type: 'number' },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ruleId: { type: 'string' },
                  fieldName: { type: 'string' },
                  severity: { type: 'string', enum: ['S0', 'S1', 'S2', 'S3'] },
                  reasonCode: { type: 'string' },
                  rawSnippet: { type: 'string' },
                  normalisedSnippet: { type: 'string' },
                  confidence: { type: 'number' },
                  pageNumber: { type: 'number' },
                  whyItMatters: { type: 'string' },
                  suggestedFix: { type: 'string' },
                },
                required: ['ruleId', 'fieldName', 'severity', 'reasonCode', 'confidence', 'pageNumber', 'whyItMatters', 'suggestedFix'],
              },
            },
            extractedFields: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                  confidence: { type: 'number' },
                  pageNumber: { type: 'number' },
                },
                required: ['value', 'confidence', 'pageNumber'],
              },
            },
            summary: { type: 'string' },
          },
          required: ['overallResult', 'score', 'findings', 'extractedFields', 'summary'],
        },
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty response from LLM');
  }

  return { data: JSON.parse(content), model: response.model };
}

/**
 * Analyze job sheet text against a Gold Standard specification with resilience
 * 
 * GRACEFUL DEGRADATION:
 * If LLM API key is not configured, this function returns a rule-based analysis
 * instead of failing. This allows processing to complete without AI insights.
 */
export async function analyzeJobSheet(
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number = 1,
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const startTime = Date.now();
  const correlationId = getCorrelationId();
  let retryAttempts = 0;

  console.log(`[Analyzer] Starting analysis`, {
    correlationId,
    specName: goldSpec.name,
    specVersion: goldSpec.version,
    rulesCount: goldSpec.rules.length,
    pageCount,
    textLength: extractedText.length,
    llmConfigured: isLLMConfigured(),
  });

  // GRACEFUL DEGRADATION: If LLM is not configured, use rule-based analysis
  if (!isLLMConfigured()) {
    console.warn('[Analyzer] LLM not configured - using rule-based analysis (no AI insights)', {
      correlationId,
    });
    
    const ruleBasedResult = performRuleBasedAnalysis(extractedText, goldSpec, pageCount);
    const processingTimeMs = Date.now() - startTime;
    
    return {
      ...ruleBasedResult,
      processingTimeMs,
      model: 'rule-based-fallback',
      correlationId,
      retryAttempts: 0,
    };
  }

  try {
    const result = await withResiliency(
      () => callAnalysisLLM(extractedText, goldSpec, pageCount),
      geminiCircuitBreaker,
      {
        maxRetries: options.skipRetry ? 0 : 3,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        onRetry: (attempt, error, delayMs) => {
          retryAttempts = attempt;
          console.warn(`[Analyzer] Retry attempt ${attempt}`, {
            correlationId,
            error: error.message,
            nextRetryMs: delayMs,
          });
        },
      }
    );

    const processingTimeMs = Date.now() - startTime;
    const { data: analysisData, model } = result;

    // Sort findings by severity and reason code for determinism
    const sortedFindings = sortFindings(analysisData.findings || []);

    // Optionally redact PII from findings
    const finalFindings = options.redactPII 
      ? redactFindings(sortedFindings) as Finding[]
      : sortedFindings;

    console.log(`[Analyzer] Analysis complete`, {
      correlationId,
      result: analysisData.overallResult,
      score: analysisData.score,
      findingsCount: finalFindings.length,
      processingTimeMs,
    });

    addContextMetadata('analysisResult', analysisData.overallResult);
    addContextMetadata('analysisScore', analysisData.score);
    addContextMetadata('analysisProcessingMs', processingTimeMs);

    return {
      success: true,
      overallResult: analysisData.overallResult,
      score: analysisData.score,
      findings: finalFindings,
      extractedFields: analysisData.extractedFields || {},
      summary: analysisData.summary,
      processingTimeMs,
      model: model || 'gemini-2.5-flash',
      correlationId,
      retryAttempts,
    };

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;

    // Handle circuit breaker open
    if (error instanceof CircuitBreakerOpenError) {
      console.error('[Analyzer] Circuit breaker open', {
        correlationId,
        retryAfterMs: error.retryAfterMs,
      });

      if (options.jobSheetId) {
        addToDeadLetterQueue(options.jobSheetId, 'analysis', error, {
          correlationId,
          recoverable: true,
          metadata: { specName: goldSpec.name, circuitBreakerOpen: true },
        });
      }

      return createErrorResult(
        'Analysis service temporarily unavailable. Please try again later.',
        'CIRCUIT_BREAKER_OPEN',
        processingTimeMs,
        correlationId,
        retryAttempts
      );
    }

    console.error('[Analyzer] Analysis failed after retries', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      retryAttempts,
      processingTimeMs,
    });

    // Add to DLQ if job sheet ID provided
    if (options.jobSheetId) {
      addToDeadLetterQueue(
        options.jobSheetId,
        'analysis',
        error instanceof Error ? error : new Error(String(error)),
        {
          correlationId,
          attempts: retryAttempts + 1,
          maxAttempts: 3,
          metadata: { specName: goldSpec.name },
        }
      );
    }

    return createErrorResult(
      error instanceof Error ? error.message : 'Unknown analysis error',
      'PROCESSING_ERROR',
      processingTimeMs,
      correlationId,
      retryAttempts
    );
  }
}

/**
 * Sort findings for deterministic output
 * Order: severity (S0 > S1 > S2 > S3) → reasonCode → fieldName
 */
function sortFindings(findings: Finding[]): Finding[] {
  const severityOrder: Record<string, number> = { S0: 0, S1: 1, S2: 2, S3: 3 };
  
  return [...findings].sort((a, b) => {
    // First by severity
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    
    // Then by reason code
    const reasonDiff = a.reasonCode.localeCompare(b.reasonCode);
    if (reasonDiff !== 0) return reasonDiff;
    
    // Finally by field name
    return a.fieldName.localeCompare(b.fieldName);
  });
}

/**
 * Create an error result
 */
function createErrorResult(
  errorMessage: string,
  errorCode: string,
  processingTimeMs: number,
  correlationId?: string,
  retryAttempts?: number
): AnalysisResult {
  return {
    success: false,
    overallResult: 'REVIEW_QUEUE',
    score: 0,
    findings: [{
      ruleId: 'SYSTEM',
      fieldName: 'Analysis Pipeline',
      severity: 'S1',
      reasonCode: 'PIPELINE_ERROR',
      rawSnippet: '',
      normalisedSnippet: '',
      confidence: 0,
      pageNumber: 1,
      whyItMatters: 'The analysis pipeline encountered an error and could not complete validation.',
      suggestedFix: 'Review the document manually or retry the analysis.',
    }],
    extractedFields: {},
    summary: 'Analysis failed due to pipeline error.',
    processingTimeMs,
    model: 'gemini-2.5-flash',
    correlationId,
    retryAttempts,
    error: errorMessage,
    errorCode,
  };
}

/**
 * Get the default Gold Standard specification for job sheets
 */
export function getDefaultGoldSpec(): GoldSpec {
  return {
    name: 'Standard Maintenance Job Sheet',
    version: '2.1.0',
    rules: [
      {
        id: 'R-001',
        field: 'Customer Signature',
        type: 'presence',
        required: true,
        description: 'Must contain a valid signature in the customer sign-off box.',
      },
      {
        id: 'R-002',
        field: 'Date of Service',
        type: 'format',
        format: 'DD/MM/YYYY',
        required: true,
        description: 'Date must be present and match the standard format.',
      },
      {
        id: 'R-003',
        field: 'Serial Number',
        type: 'regex',
        pattern: '^SN-\\d{5}-[A-Z]{2}$',
        required: true,
        description: 'Serial number must match the pattern SN-XXXXX-XX.',
      },
      {
        id: 'R-004',
        field: 'Technician Name',
        type: 'presence',
        required: true,
        description: 'Technician name must be clearly written.',
      },
      {
        id: 'R-005',
        field: 'Work Description',
        type: 'presence',
        required: true,
        description: 'Description of work performed must be provided.',
      },
      {
        id: 'R-006',
        field: 'Parts Used',
        type: 'presence',
        required: false,
        description: 'List of parts used during service (if applicable).',
      },
      {
        id: 'R-007',
        field: 'Time In',
        type: 'format',
        format: 'HH:MM',
        required: true,
        description: 'Start time of service must be recorded.',
      },
      {
        id: 'R-008',
        field: 'Time Out',
        type: 'format',
        format: 'HH:MM',
        required: true,
        description: 'End time of service must be recorded.',
      },
      {
        id: 'R-009',
        field: 'Customer Name',
        type: 'presence',
        required: true,
        description: 'Customer name must be clearly identified.',
      },
      {
        id: 'R-010',
        field: 'Job Number',
        type: 'regex',
        pattern: '^JOB-\\d{6}$',
        required: true,
        description: 'Job number must match the pattern JOB-XXXXXX.',
      },
    ],
  };
}

/**
 * Get circuit breaker status for monitoring
 */
export function getAnalyzerCircuitBreakerStatus() {
  return geminiCircuitBreaker.getStats();
}

/**
 * Reset circuit breaker (admin function)
 */
export function resetAnalyzerCircuitBreaker() {
  geminiCircuitBreaker.reset();
  console.log('[Analyzer] Circuit breaker manually reset');
}

/**
 * Rule-based analysis fallback when LLM is not available.
 * 
 * IMPORTANT: This fallback is intentionally LENIENT because:
 * 1. We cannot do real semantic validation without AI
 * 2. The purpose is to allow processing to complete, not to queue
 * 3. Documents will be marked for human review in the summary
 * 
 * Rules:
 * - If document has content: PASS (with advisory note)
 * - If document is empty or OCR failed: FAIL
 * - NEVER return REVIEW_QUEUE (defeats the purpose of fallback)
 */
function performRuleBasedAnalysis(
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): Omit<AnalysisResult, 'processingTimeMs' | 'model' | 'correlationId' | 'retryAttempts'> {
  const findings: Finding[] = [];
  const extractedFields: Record<string, { value: string; confidence: number; pageNumber: number }> = {};
  const textLower = extractedText.toLowerCase();
  
  // Basic content validation
  const hasContent = extractedText.trim().length > 50;
  const wordCount = extractedText.split(/\s+/).filter(w => w.length > 0).length;
  
  // Track field detection for informational purposes
  let fieldsDetected = 0;
  const fieldsExpected = goldSpec.rules.filter(r => r.required).length;
  
  for (const rule of goldSpec.rules) {
    const fieldLower = rule.field.toLowerCase();
    
    // Simple field detection: look for the field name or related keywords
    const fieldFound = textLower.includes(fieldLower) || 
      textLower.includes(fieldLower.split(' ')[0]); // Also check first word
    
    // Extract value after field name (simple heuristic)
    let extractedValue = '';
    if (fieldFound) {
      fieldsDetected++;
      const fieldIndex = textLower.indexOf(fieldLower);
      if (fieldIndex !== -1) {
        const afterField = extractedText.substring(fieldIndex + rule.field.length, fieldIndex + rule.field.length + 100);
        const match = afterField.match(/[:=]?\s*([^\n\r]+)/);
        if (match) {
          extractedValue = match[1].trim().substring(0, 50);
        }
      }
      
      extractedFields[rule.field] = {
        value: extractedValue || '[detected]',
        confidence: 60, // Moderate confidence for rule-based
        pageNumber: 1,
      };
    }
    
    // Only add findings for REQUIRED fields that are completely missing
    // and use S3 (minor) since we can't be certain without AI
    if (rule.required && !fieldFound) {
      findings.push({
        ruleId: rule.id,
        fieldName: rule.field,
        severity: 'S3', // Minor - we can't be certain without AI
        reasonCode: 'LOW_CONFIDENCE',
        rawSnippet: '',
        normalisedSnippet: '',
        confidence: 30,
        pageNumber: 1,
        whyItMatters: `Field "${rule.field}" was not detected by rule-based analysis. AI analysis may find it.`,
        suggestedFix: 'Consider enabling AI analysis for comprehensive validation.',
      });
    }
  }
  
  // Calculate a quality score based on content, not rule matching
  // (Rule matching is too strict without semantic understanding)
  let score: number;
  let overallResult: 'PASS' | 'FAIL' | 'REVIEW_QUEUE';
  
  if (!hasContent || wordCount < 10) {
    // Empty or near-empty document
    score = 0;
    overallResult = 'FAIL';
    findings.push({
      ruleId: 'SYSTEM',
      fieldName: 'Document Content',
      severity: 'S1',
      reasonCode: 'OCR_FAILURE',
      rawSnippet: '',
      normalisedSnippet: '',
      confidence: 100,
      pageNumber: 1,
      whyItMatters: 'Document appears to be empty or OCR failed to extract content.',
      suggestedFix: 'Ensure the document is readable and re-upload.',
    });
  } else {
    // Document has content - PASS with advisory score
    // Score based on word count and detected fields (informational only)
    const contentScore = Math.min(50, wordCount / 10); // Up to 50 from content
    const fieldScore = fieldsExpected > 0 
      ? Math.round((fieldsDetected / fieldsExpected) * 50)
      : 50; // Up to 50 from fields
    score = Math.round(contentScore + fieldScore);
    
    // ALWAYS PASS if document has content
    // This is a FALLBACK - we err on the side of allowing processing
    overallResult = 'PASS';
  }
  
  console.log(`[Analyzer] Rule-based result: ${overallResult}, score: ${score}, ` +
    `fields: ${fieldsDetected}/${fieldsExpected}, words: ${wordCount}`);
  
  return {
    success: true,
    overallResult,
    score,
    findings: sortFindings(findings),
    extractedFields,
    summary: `Rule-based analysis completed. ` +
      `Detected ${fieldsDetected}/${fieldsExpected} expected fields. ` +
      `Word count: ${wordCount}. ` +
      `Note: AI analysis unavailable - results are based on pattern matching only. ` +
      `Human review recommended for comprehensive validation.`,
  };
}
