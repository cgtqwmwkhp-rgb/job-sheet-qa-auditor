/**
 * Canonical Semantics Module
 * 
 * Enforces semantic rules for the document audit system:
 * - PASS status must NOT have a reasonCode (reasonCode is for failures only)
 * - FAIL/REVIEW status MUST have a canonical reasonCode
 * - Selection safety rules with confidence bands
 */

// ============================================================================
// Canonical Reason Codes
// ============================================================================

/**
 * Canonical reason codes for FAIL/REVIEW status only.
 * PASS status must NOT have a reasonCode.
 */
export const CANONICAL_REASON_CODES = [
  'MISSING_FIELD',
  'UNREADABLE_FIELD', 
  'LOW_CONFIDENCE',
  'INVALID_FORMAT',
  'CONFLICT',
  'OUT_OF_POLICY',
  'INCOMPLETE_EVIDENCE',
  'OCR_FAILURE',
  'PIPELINE_ERROR',
  'SPEC_GAP',
  'SECURITY_RISK',
] as const;

export type CanonicalReasonCode = typeof CANONICAL_REASON_CODES[number];

/**
 * Status values for validation results.
 * PASS = documentation is correct (no reasonCode)
 * FAIL = documentation has issues (requires reasonCode)
 * REVIEW = needs human review (requires reasonCode)
 */
export type ValidationStatus = 'PASS' | 'FAIL' | 'REVIEW';

// ============================================================================
// Selection Confidence Bands
// ============================================================================

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SelectionPolicy {
  /** Minimum score for HIGH confidence */
  highThreshold: number;
  /** Minimum score for MEDIUM confidence */
  mediumThreshold: number;
  /** Minimum gap between top two candidates for auto-select in MEDIUM band */
  ambiguityGap: number;
  /** Maximum time budget for selection (ms) */
  selectionBudgetMs: number;
}

export const DEFAULT_SELECTION_POLICY: SelectionPolicy = {
  highThreshold: 80,
  mediumThreshold: 50,
  ambiguityGap: 10,
  selectionBudgetMs: 5000,
};

// ============================================================================
// Selection Trace Types
// ============================================================================

export interface ScoredCandidate {
  templateId: string;
  score: number;
  confidenceBand: ConfidenceBand;
  tokensMatched: {
    requiredAll: string[];
    requiredAny: string[];
    optional: string[];
    excluded: string[];
  };
  formCodeMatch: boolean;
  contextMatches: {
    client: boolean;
    assetType: boolean;
    workType: boolean;
  };
}

export interface SelectionTrace {
  traceId: string;
  timestamp: string;
  inputHash: string;
  candidates: ScoredCandidate[];
  topCandidate: ScoredCandidate | null;
  runnerUp: ScoredCandidate | null;
  gap: number;
  confidenceBand: ConfidenceBand;
  decision: SelectionDecision;
  explicitTemplateId: string | null;
  durationMs: number;
}

export type SelectionDecision = 
  | { type: 'AUTO_SELECT'; templateId: string; reason: string }
  | { type: 'REVIEW_QUEUE'; reason: string; reasonCode: 'CONFLICT' | 'LOW_CONFIDENCE' }
  | { type: 'HARD_STOP'; reason: string; reasonCode: 'PIPELINE_ERROR'; fixPath: string };

// ============================================================================
// Validation Result Types (Updated)
// ============================================================================

export interface ValidatedField {
  ruleId: string;
  field: string;
  status: ValidationStatus;
  value: unknown;
  confidence: number;
  pageNumber?: number;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  /** Only present when status is FAIL or REVIEW */
  reasonCode?: CanonicalReasonCode;
  /** Evidence keys that support this validation */
  evidenceKeys?: string[];
}

// ============================================================================
// Runtime Guards
// ============================================================================

/**
 * Assert that a reason code is canonical.
 * Only call this when status is FAIL or REVIEW.
 * 
 * @throws Error if reasonCode is not canonical or if called for PASS status
 */
export function assertCanonicalReasonCode(
  status: ValidationStatus,
  reasonCode: string | undefined
): asserts reasonCode is CanonicalReasonCode | undefined {
  if (status === 'PASS') {
    if (reasonCode !== undefined && reasonCode !== null) {
      throw new Error(
        `SEMANTIC_VIOLATION: PASS status must NOT have a reasonCode. ` +
        `Got reasonCode="${reasonCode}". Remove the reasonCode for PASS status.`
      );
    }
    return;
  }
  
  // FAIL or REVIEW must have a canonical reason code
  if (!reasonCode) {
    throw new Error(
      `SEMANTIC_VIOLATION: ${status} status MUST have a reasonCode. ` +
      `Provide one of: ${CANONICAL_REASON_CODES.join(', ')}`
    );
  }
  
  if (!CANONICAL_REASON_CODES.includes(reasonCode as CanonicalReasonCode)) {
    throw new Error(
      `SEMANTIC_VIOLATION: "${reasonCode}" is not a canonical reason code. ` +
      `Use one of: ${CANONICAL_REASON_CODES.join(', ')}`
    );
  }
}

/**
 * Create a validated field with proper semantic enforcement.
 */
export function createValidatedField(params: {
  ruleId: string;
  field: string;
  status: ValidationStatus;
  value: unknown;
  confidence: number;
  pageNumber?: number;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  reasonCode?: string;
  evidenceKeys?: string[];
}): ValidatedField {
  // Enforce semantic rules
  assertCanonicalReasonCode(params.status, params.reasonCode);
  
  const result: ValidatedField = {
    ruleId: params.ruleId,
    field: params.field,
    status: params.status,
    value: params.value,
    confidence: params.confidence,
    severity: params.severity,
    message: params.message,
  };
  
  if (params.pageNumber !== undefined) {
    result.pageNumber = params.pageNumber;
  }
  
  // Only include reasonCode for FAIL/REVIEW
  if (params.status !== 'PASS' && params.reasonCode) {
    result.reasonCode = params.reasonCode as CanonicalReasonCode;
  }
  
  if (params.evidenceKeys && params.evidenceKeys.length > 0) {
    result.evidenceKeys = params.evidenceKeys;
  }
  
  return result;
}

// ============================================================================
// Selection Safety Functions
// ============================================================================

/**
 * Determine confidence band from score.
 */
export function getConfidenceBand(score: number, policy: SelectionPolicy = DEFAULT_SELECTION_POLICY): ConfidenceBand {
  if (score >= policy.highThreshold) return 'HIGH';
  if (score >= policy.mediumThreshold) return 'MEDIUM';
  return 'LOW';
}

/**
 * Make a selection decision based on candidates and policy.
 */
export function makeSelectionDecision(
  candidates: ScoredCandidate[],
  explicitTemplateId: string | null,
  policy: SelectionPolicy = DEFAULT_SELECTION_POLICY
): SelectionDecision {
  // If explicit templateId provided, use it
  if (explicitTemplateId) {
    const explicit = candidates.find(c => c.templateId === explicitTemplateId);
    if (explicit) {
      return {
        type: 'AUTO_SELECT',
        templateId: explicitTemplateId,
        reason: 'Explicit templateId provided',
      };
    }
    // Explicit templateId not found in candidates
    return {
      type: 'HARD_STOP',
      reason: `Explicit templateId "${explicitTemplateId}" not found in candidates`,
      reasonCode: 'PIPELINE_ERROR',
      fixPath: 'Verify templateId exists and is active',
    };
  }
  
  // No candidates
  if (candidates.length === 0) {
    return {
      type: 'HARD_STOP',
      reason: 'No template candidates found',
      reasonCode: 'PIPELINE_ERROR',
      fixPath: 'Ensure at least one template is active and matches document fingerprint',
    };
  }
  
  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const runnerUp = sorted[1] || null;
  const gap = runnerUp ? top.score - runnerUp.score : Infinity;
  
  // HIGH confidence: auto-select
  if (top.confidenceBand === 'HIGH') {
    return {
      type: 'AUTO_SELECT',
      templateId: top.templateId,
      reason: `HIGH confidence (score=${top.score})`,
    };
  }
  
  // MEDIUM confidence: auto-select only if gap >= ambiguityGap
  if (top.confidenceBand === 'MEDIUM') {
    if (gap >= policy.ambiguityGap) {
      return {
        type: 'AUTO_SELECT',
        templateId: top.templateId,
        reason: `MEDIUM confidence with clear gap (score=${top.score}, gap=${gap})`,
      };
    }
    // Ambiguous - send to review queue
    return {
      type: 'REVIEW_QUEUE',
      reason: `MEDIUM confidence with ambiguous candidates (score=${top.score}, gap=${gap}, threshold=${policy.ambiguityGap})`,
      reasonCode: 'CONFLICT',
    };
  }
  
  // LOW confidence: HARD STOP - cannot proceed without explicit templateId
  return {
    type: 'HARD_STOP',
    reason: `LOW confidence (score=${top.score}) - cannot auto-select`,
    reasonCode: 'PIPELINE_ERROR',
    fixPath: 'Provide explicit templateId or improve document quality',
  };
}

/**
 * Create a deterministic input hash for selection trace.
 */
export function createInputHash(text: string): string {
  // Simple hash for determinism
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a unique trace ID.
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sel_${timestamp}_${random}`;
}

// ============================================================================
// Selection Trace Builder
// ============================================================================

export class SelectionTraceBuilder {
  private traceId: string;
  private startTime: number;
  private inputHash: string = '';
  private candidates: ScoredCandidate[] = [];
  private explicitTemplateId: string | null = null;
  private policy: SelectionPolicy;
  
  constructor(policy: SelectionPolicy = DEFAULT_SELECTION_POLICY) {
    this.traceId = generateTraceId();
    this.startTime = Date.now();
    this.policy = policy;
  }
  
  setInputHash(text: string): this {
    this.inputHash = createInputHash(text);
    return this;
  }
  
  setExplicitTemplateId(templateId: string | null): this {
    this.explicitTemplateId = templateId;
    return this;
  }
  
  addCandidate(candidate: ScoredCandidate): this {
    this.candidates.push(candidate);
    return this;
  }
  
  setCandidates(candidates: ScoredCandidate[]): this {
    this.candidates = candidates;
    return this;
  }
  
  build(): SelectionTrace {
    const durationMs = Date.now() - this.startTime;
    
    // Sort candidates by score descending (deterministic)
    const sorted = [...this.candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.templateId.localeCompare(b.templateId); // Stable sort by ID
    });
    
    const topCandidate = sorted[0] || null;
    const runnerUp = sorted[1] || null;
    const gap = topCandidate && runnerUp ? topCandidate.score - runnerUp.score : Infinity;
    const confidenceBand = topCandidate ? topCandidate.confidenceBand : 'LOW';
    
    const decision = makeSelectionDecision(sorted, this.explicitTemplateId, this.policy);
    
    return {
      traceId: this.traceId,
      timestamp: new Date().toISOString(),
      inputHash: this.inputHash,
      candidates: sorted,
      topCandidate,
      runnerUp,
      gap: gap === Infinity ? -1 : gap,
      confidenceBand,
      decision,
      explicitTemplateId: this.explicitTemplateId,
      durationMs,
    };
  }
}

// ============================================================================
// Artifact Persistence
// ============================================================================

export interface SelectionArtifact {
  version: '1.0.0';
  trace: SelectionTrace;
}

/**
 * Create a selection artifact for persistence.
 */
export function createSelectionArtifact(trace: SelectionTrace): SelectionArtifact {
  return {
    version: '1.0.0',
    trace,
  };
}

/**
 * Serialize selection artifact to deterministic JSON.
 */
export function serializeSelectionArtifact(artifact: SelectionArtifact): string {
  // Sort keys for deterministic output
  return JSON.stringify(artifact, Object.keys(artifact).sort(), 2);
}
