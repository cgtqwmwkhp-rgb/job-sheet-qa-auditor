/**
 * Template Selector Service
 * 
 * PR-B: Deterministic template selection based on document content.
 * 
 * CRITICAL RULES:
 * - LOW confidence (<50): NO auto-select, REVIEW_QUEUE required
 * - MEDIUM (50-79) with gap <10 from runner-up: NO auto-select, REVIEW_QUEUE required
 * - HIGH (>=80): Auto-processing allowed
 * - Deterministic ordering: score desc, then templateId asc
 */

import type {
  SelectionConfig,
  ConfidenceBand,
  SelectionScore,
  SelectionResult,
} from '../templateRegistry/types';
import {
  getActiveTemplates,
  getActiveVersion,
} from '../templateRegistry/registryService';
import { createSelectionTraceInMemory, type SelectionTraceArtifact } from '../templateRegistry/selectionTraceWriter';

/**
 * Extended selection result with trace
 */
export interface SelectionResultWithTrace extends SelectionResult {
  /** Selection trace artifact (always present) */
  trace: SelectionTraceArtifact;
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
  
  if (confidenceBand === 'HIGH') {
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
