/**
 * Gemini 2.5 Job Sheet Analyzer Service
 * Analyzes extracted OCR text against Gold Standard specifications
 */

import { invokeLLM } from '../_core/llm';

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
  error?: string;
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
 * Analyze job sheet text against a Gold Standard specification
 */
export async function analyzeJobSheet(
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number = 1
): Promise<AnalysisResult> {
  const startTime = Date.now();

  try {
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

    const analysisData = JSON.parse(content);
    const processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      overallResult: analysisData.overallResult,
      score: analysisData.score,
      findings: analysisData.findings || [],
      extractedFields: analysisData.extractedFields || {},
      summary: analysisData.summary,
      processingTimeMs,
      model: response.model || 'gemini-2.5-flash',
    };
  } catch (error) {
    console.error('[Analyzer] Analysis error:', error);
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
      processingTimeMs: Date.now() - startTime,
      model: 'gemini-2.5-flash',
      error: error instanceof Error ? error.message : 'Unknown analysis error',
    };
  }
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
