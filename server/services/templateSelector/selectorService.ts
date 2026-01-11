/**
 * Template Selector Service
 * 
 * PR-B: Deterministic template selection based on document content.
 * PR-2: Multi-signal template recognition (tokens + layout + ROI + plausibility)
 * 
 * CRITICAL RULES:
 * - LOW confidence (<50): NO auto-select, REVIEW_QUEUE required
 * - MEDIUM (50-79) with gap <10 from runner-up: NO auto-select, REVIEW_QUEUE required
 * - HIGH (>=80): Auto-processing allowed
 * - Deterministic ordering: score desc, then templateId asc
 * - NO silent guess on ambiguity (block with explicit reason)
 */

import type {
  SelectionConfig,
  ConfidenceBand,
  SelectionScore,
  SelectionResult,
  RoiConfig,
  SpecJson,
} from '../templateRegistry/types';
import {
  getActiveTemplates,
  getActiveVersion,
} from '../templateRegistry/registryService';
import { createSelectionTraceInMemory, type SelectionTraceArtifact } from '../templateRegistry/selectionTraceWriter';
import {
  extractTokenSignal,
  extractLayoutSignal,
  extractRoiSignal,
  extractPlausibilitySignal,
  combineSignals,
  type SignalResult,
  type MultiSignalResult,
  type DocumentMetadata,
  type MultiSignalConfig,
  DEFAULT_SIGNAL_WEIGHTS,
} from './signalExtractors';

/**
 * Extended selection result with trace
 */
export interface SelectionResultWithTrace extends SelectionResult {
  /** Selection trace artifact (always present) */
  trace: SelectionTraceArtifact;
}

/**
 * PR-2: Extended selection score with multi-signal data
 */
export interface MultiSignalSelectionScore extends SelectionScore {
  /** Multi-signal analysis result */
  multiSignal?: MultiSignalResult;
}

/**
 * PR-2: Extended selection result with multi-signal data
 */
export interface MultiSignalSelectionResult extends SelectionResult {
  /** Whether multi-signal mode was used */
  multiSignalEnabled: boolean;
  /** Signal breakdown for top candidate */
  signalBreakdown?: MultiSignalResult;
  /** Candidates with multi-signal data */
  multiSignalCandidates?: MultiSignalSelectionScore[];
}

/**
 * PR-2: Input for multi-signal selection
 */
export interface MultiSignalInput {
  /** Document text (required) */
  documentText: string;
  /** Page texts for ROI analysis */
  pageTexts?: string[];
  /** Document metadata for layout analysis */
  metadata?: DocumentMetadata;
  /** Custom signal weights */
  signalWeights?: Partial<MultiSignalConfig>;
}

/**
 * Minimum score gap required for MEDIUM confidence auto-processing
 */
const MEDIUM_CONFIDENCE_MIN_GAP = 10;

/**
 * Confidence band thresholds
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 50,
  LOW: 0,
} as const;

/**
 * Tokenize text for matching
 * Normalizes to lowercase, removes punctuation, splits on whitespace
 */
export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Calculate selection score for a template against document tokens
 */
export function calculateScore(
  documentTokens: Set<string>,
  config: SelectionConfig
): { score: number; matchedTokens: string[]; missingRequired: string[] } {
  const matchedTokens: string[] = [];
  const missingRequired: string[] = [];
  
  let score = 0;
  const weights = config.tokenWeights ?? {};
  
  // Check requiredTokensAll (all must be present)
  let allRequiredPresent = true;
  for (const token of config.requiredTokensAll) {
    const normalizedToken = token.toLowerCase();
    if (documentTokens.has(normalizedToken)) {
      matchedTokens.push(token);
      score += (weights[token] ?? 10); // High weight for required tokens
    } else {
      allRequiredPresent = false;
      missingRequired.push(token);
    }
  }
  
  // If not all required tokens present, score is heavily penalized
  if (!allRequiredPresent) {
    score = Math.max(0, score - 50);
  }
  
  // Check requiredTokensAny (at least one must be present)
  let anyRequiredPresent = config.requiredTokensAny.length === 0; // True if no requirements
  for (const token of config.requiredTokensAny) {
    const normalizedToken = token.toLowerCase();
    if (documentTokens.has(normalizedToken)) {
      anyRequiredPresent = true;
      matchedTokens.push(token);
      score += (weights[token] ?? 5); // Medium weight
    }
  }
  
  if (!anyRequiredPresent && config.requiredTokensAny.length > 0) {
    score = Math.max(0, score - 30);
    missingRequired.push(`ANY(${config.requiredTokensAny.join(', ')})`);
  }
  
  // Check formCodeRegex (if present)
  if (config.formCodeRegex) {
    const regex = new RegExp(config.formCodeRegex, 'i');
    const textArray = Array.from(documentTokens);
    const fullText = textArray.join(' ');
    if (regex.test(fullText)) {
      score += 15;
      matchedTokens.push(`REGEX:${config.formCodeRegex}`);
    }
  }
  
  // Check optional tokens (boost score)
  for (const token of config.optionalTokens) {
    const normalizedToken = token.toLowerCase();
    if (documentTokens.has(normalizedToken)) {
      matchedTokens.push(token);
      score += (weights[token] ?? 2); // Lower weight for optional
    }
  }
  
  // Normalize score to 0-100
  const maxPossibleScore = 
    config.requiredTokensAll.length * 10 +
    Math.min(config.requiredTokensAny.length, 1) * 5 +
    (config.formCodeRegex ? 15 : 0) +
    config.optionalTokens.length * 2;
  
  const normalizedScore = maxPossibleScore > 0 
    ? Math.min(100, Math.round((score / maxPossibleScore) * 100))
    : 0;
  
  return {
    score: normalizedScore,
    matchedTokens,
    missingRequired,
  };
}

/**
 * Determine confidence band from score
 */
export function getConfidenceBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Select the best template for a document
 * 
 * @param documentText - Extracted text from the document
 * @param metadata - Optional metadata for additional matching
 * @returns Selection result with candidates and confidence
 */
export function selectTemplate(
  documentText: string,
  metadata?: { client?: string; assetType?: string; workType?: string }
): SelectionResult {
  const documentTokens = new Set(tokenizeText(documentText));
  const activeTemplates = getActiveTemplates();
  
  // No active templates available
  if (activeTemplates.length === 0) {
    return {
      selected: false,
      confidenceBand: 'LOW',
      topScore: 0,
      runnerUpScore: 0,
      scoreGap: 0,
      candidates: [],
      matchedTokens: [],
      autoProcessingAllowed: false,
      blockReason: 'No active templates available',
    };
  }
  
  // Calculate scores for all active templates
  const candidates: SelectionScore[] = [];
  
  for (const template of activeTemplates) {
    const version = getActiveVersion(template.id);
    if (!version) continue;
    
    const config = version.selectionConfigJson as SelectionConfig;
    const { score, matchedTokens, missingRequired } = calculateScore(documentTokens, config);
    
    // Apply metadata boosting
    let adjustedScore = score;
    if (metadata) {
      if (metadata.client && template.client === metadata.client) {
        adjustedScore = Math.min(100, adjustedScore + 10);
      }
      if (metadata.assetType && template.assetType === metadata.assetType) {
        adjustedScore = Math.min(100, adjustedScore + 5);
      }
      if (metadata.workType && template.workType === metadata.workType) {
        adjustedScore = Math.min(100, adjustedScore + 5);
      }
    }
    
    candidates.push({
      templateId: template.id,
      versionId: version.id,
      templateSlug: template.templateId,
      score: adjustedScore,
      matchedTokens,
      missingRequired,
      confidence: getConfidenceBand(adjustedScore),
    });
  }
  
  // Sort deterministically: score desc, then templateId asc
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.templateSlug.localeCompare(b.templateSlug);
  });
  
  // Get top and runner-up
  const topCandidate = candidates[0];
  const runnerUp = candidates[1];
  
  const topScore = topCandidate?.score ?? 0;
  const runnerUpScore = runnerUp?.score ?? 0;
  const scoreGap = topScore - runnerUpScore;
  const confidenceBand = getConfidenceBand(topScore);
  
  // Determine if auto-processing is allowed
  let autoProcessingAllowed = false;
  let blockReason: string | undefined;
  
  // SPECIAL CASE: Single template mode (catch-all)
  // When only one template exists (default), always allow processing
  // This ensures the system works out-of-the-box before custom templates are added
  const isSingleTemplateMode = candidates.length === 1 && topCandidate?.templateSlug === 'default-job-sheet';
  
  if (isSingleTemplateMode) {
    // Default catch-all template - always allow processing
    autoProcessingAllowed = true;
    console.log(`[TemplateSelector] Single template mode: using default catch-all (score: ${topScore})`);
  } else if (confidenceBand === 'HIGH') {
    autoProcessingAllowed = true;
  } else if (confidenceBand === 'MEDIUM') {
    if (scoreGap >= MEDIUM_CONFIDENCE_MIN_GAP) {
      autoProcessingAllowed = true;
    } else {
      blockReason = `MEDIUM confidence with ambiguous gap (${scoreGap} < ${MEDIUM_CONFIDENCE_MIN_GAP})`;
    }
  } else {
    blockReason = `LOW confidence (${topScore} < ${CONFIDENCE_THRESHOLDS.MEDIUM})`;
  }
  
  return {
    selected: autoProcessingAllowed && topCandidate !== undefined,
    templateId: topCandidate?.templateId,
    versionId: topCandidate?.versionId,
    confidenceBand,
    topScore,
    runnerUpScore,
    scoreGap,
    candidates,
    matchedTokens: topCandidate?.matchedTokens ?? [],
    autoProcessingAllowed,
    blockReason,
  };
}

/**
 * Create a selection trace artifact for persistence (legacy interface)
 */
export function createSelectionTraceArtifact(
  jobSheetId: number,
  result: SelectionResult
): object {
  return {
    jobSheetId,
    timestamp: new Date().toISOString(),
    selected: result.selected,
    templateId: result.templateId ?? null,
    versionId: result.versionId ?? null,
    confidenceBand: result.confidenceBand,
    topScore: result.topScore,
    runnerUpScore: result.runnerUpScore,
    scoreGap: result.scoreGap,
    autoProcessingAllowed: result.autoProcessingAllowed,
    blockReason: result.blockReason ?? null,
    candidates: result.candidates.map(c => ({
      templateId: c.templateId,
      templateSlug: c.templateSlug,
      score: c.score,
      confidence: c.confidence,
      matchedTokens: c.matchedTokens,
      missingRequired: c.missingRequired,
    })),
  };
}

/**
 * PR-D: Select template with always-on trace
 * 
 * @param documentText - Extracted text from document
 * @param jobSheetId - Job sheet ID for trace
 * @param metadata - Optional matching metadata
 * @returns Selection result with trace artifact
 */
export function selectTemplateWithTrace(
  documentText: string,
  jobSheetId: number,
  metadata?: { client?: string; assetType?: string; workType?: string }
): SelectionResultWithTrace {
  const documentTokens = tokenizeText(documentText);
  const result = selectTemplate(documentText, metadata);
  
  // Always create trace - whether selected or blocked
  const trace = createSelectionTraceInMemory(
    jobSheetId,
    result,
    documentTokens,
    documentText.length
  );
  
  return {
    ...result,
    trace,
  };
}

// ============================================================================
// PR-2: MULTI-SIGNAL TEMPLATE RECOGNITION
// ============================================================================

/**
 * PR-2: Select template using multi-signal recognition
 * 
 * Uses 4 signal types:
 * 1. Token signals - keyword matching
 * 2. Layout signals - page count, sections, form type
 * 3. ROI signals - expected regions present
 * 4. Plausibility signals - field patterns found
 * 
 * @param input - Multi-signal input with document data
 * @param matchMetadata - Optional client/asset/work type matching
 * @returns Multi-signal selection result
 */
export function selectTemplateMultiSignal(
  input: MultiSignalInput,
  matchMetadata?: { client?: string; assetType?: string; workType?: string }
): MultiSignalSelectionResult {
  const documentTokens = new Set(tokenizeText(input.documentText));
  const activeTemplates = getActiveTemplates();
  const pageTexts = input.pageTexts ?? [input.documentText];
  
  // No active templates available
  if (activeTemplates.length === 0) {
    return {
      selected: false,
      confidenceBand: 'LOW',
      topScore: 0,
      runnerUpScore: 0,
      scoreGap: 0,
      candidates: [],
      matchedTokens: [],
      autoProcessingAllowed: false,
      blockReason: 'No active templates available',
      multiSignalEnabled: true,
    };
  }
  
  // Calculate multi-signal scores for all active templates
  const candidates: MultiSignalSelectionScore[] = [];
  
  for (const template of activeTemplates) {
    const version = getActiveVersion(template.id);
    if (!version) continue;
    
    const selectionConfig = version.selectionConfigJson as SelectionConfig;
    const roiConfig = version.roiJson as RoiConfig | null;
    const specJson = version.specJson as SpecJson;
    
    // Extract all signals
    const signals: SignalResult[] = [];
    
    // 1. Token signal
    const tokenSignal = extractTokenSignal(
      documentTokens,
      selectionConfig,
      selectionConfig.tokenWeights ?? {}
    );
    signals.push(tokenSignal);
    
    // 2. Layout signal (if metadata provided)
    if (input.metadata) {
      const layoutSignal = extractLayoutSignal(input.metadata, {
        minPages: 1,
        maxPages: 10, // Default expectations
        formType: 'printed',
      });
      signals.push(layoutSignal);
    }
    
    // 3. ROI signal (if ROI config exists)
    const roiSignal = extractRoiSignal(
      input.documentText,
      pageTexts,
      roiConfig ?? undefined
    );
    signals.push(roiSignal);
    
    // 4. Plausibility signal (based on spec fields)
    const expectedFields = specJson.fields.map(f => ({
      field: f.field,
      type: f.type,
      pattern: specJson.rules.find(r => r.field === f.field)?.pattern,
    }));
    const plausibilitySignal = extractPlausibilitySignal(
      input.documentText,
      expectedFields
    );
    signals.push(plausibilitySignal);
    
    // Combine signals
    const multiSignal = combineSignals(signals, input.signalWeights);
    
    // Apply metadata boosting
    let adjustedScore = multiSignal.combinedScore;
    if (matchMetadata) {
      if (matchMetadata.client && template.client === matchMetadata.client) {
        adjustedScore = Math.min(100, adjustedScore + 10);
      }
      if (matchMetadata.assetType && template.assetType === matchMetadata.assetType) {
        adjustedScore = Math.min(100, adjustedScore + 5);
      }
      if (matchMetadata.workType && template.workType === matchMetadata.workType) {
        adjustedScore = Math.min(100, adjustedScore + 5);
      }
    }
    
    candidates.push({
      templateId: template.id,
      versionId: version.id,
      templateSlug: template.templateId,
      score: adjustedScore,
      matchedTokens: tokenSignal.evidence.matched,
      missingRequired: tokenSignal.evidence.missing,
      confidence: multiSignal.confidence,
      multiSignal,
    });
  }
  
  // Sort deterministically: score desc, then templateId asc
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.templateSlug.localeCompare(b.templateSlug);
  });
  
  // Get top and runner-up
  const topCandidate = candidates[0];
  const runnerUp = candidates[1];
  
  const topScore = topCandidate?.score ?? 0;
  const runnerUpScore = runnerUp?.score ?? 0;
  const scoreGap = topScore - runnerUpScore;
  const confidenceBand = getConfidenceBand(topScore);
  
  // Determine if auto-processing is allowed (strict rules)
  let autoProcessingAllowed = false;
  let blockReason: string | undefined;
  
  if (confidenceBand === 'HIGH') {
    autoProcessingAllowed = true;
  } else if (confidenceBand === 'MEDIUM') {
    if (scoreGap >= MEDIUM_CONFIDENCE_MIN_GAP) {
      autoProcessingAllowed = true;
    } else {
      // PR-2: Enhanced ambiguity detection
      blockReason = buildAmbiguityBlockReason(topCandidate, runnerUp, scoreGap);
    }
  } else {
    // PR-2: Enhanced low confidence detection
    blockReason = buildLowConfidenceBlockReason(topCandidate);
  }
  
  return {
    selected: autoProcessingAllowed && topCandidate !== undefined,
    templateId: topCandidate?.templateId,
    versionId: topCandidate?.versionId,
    confidenceBand,
    topScore,
    runnerUpScore,
    scoreGap,
    candidates: candidates.map(c => ({
      templateId: c.templateId,
      versionId: c.versionId,
      templateSlug: c.templateSlug,
      score: c.score,
      matchedTokens: c.matchedTokens,
      missingRequired: c.missingRequired,
      confidence: c.confidence,
    })),
    matchedTokens: topCandidate?.matchedTokens ?? [],
    autoProcessingAllowed,
    blockReason,
    multiSignalEnabled: true,
    signalBreakdown: topCandidate?.multiSignal,
    multiSignalCandidates: candidates,
  };
}

/**
 * Build detailed ambiguity block reason
 */
function buildAmbiguityBlockReason(
  top: MultiSignalSelectionScore | undefined,
  runnerUp: MultiSignalSelectionScore | undefined,
  gap: number
): string {
  if (!top || !runnerUp) {
    return `MEDIUM confidence with insufficient candidates`;
  }
  
  const weakSignals = top.multiSignal?.combinedEvidence.weakSignals ?? [];
  const weakSignalNote = weakSignals.length > 0
    ? ` Weak signals: ${weakSignals.join(', ')}.`
    : '';
  
  return `AMBIGUITY_BLOCK: Score gap ${gap} < ${MEDIUM_CONFIDENCE_MIN_GAP} between ` +
         `"${top.templateSlug}" (${top.score}) and "${runnerUp.templateSlug}" (${runnerUp.score}).${weakSignalNote}`;
}

/**
 * Build detailed low confidence block reason
 */
function buildLowConfidenceBlockReason(
  top: MultiSignalSelectionScore | undefined
): string {
  if (!top) {
    return `LOW_CONFIDENCE_BLOCK: No candidates scored above threshold`;
  }
  
  const signals = top.multiSignal?.signals ?? [];
  const lowSignals = signals.filter(s => s.confidence === 'LOW');
  
  if (lowSignals.length > 0) {
    const lowDetails = lowSignals.map(s => `${s.type}:${s.score}`).join(', ');
    return `LOW_CONFIDENCE_BLOCK: Top candidate "${top.templateSlug}" scored ${top.score}. ` +
           `Low signals: [${lowDetails}]`;
  }
  
  return `LOW_CONFIDENCE_BLOCK: Top candidate "${top.templateSlug}" scored ${top.score} < 50`;
}
