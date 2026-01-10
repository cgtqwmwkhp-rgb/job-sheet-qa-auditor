/**
 * Selection Trace Writer
 * 
 * PR-D: Always-on selection trace artifact generation.
 * Writes deterministic JSON artifacts for every selection decision.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { SelectionResult, ConfidenceBand } from './types';

/**
 * Selection trace artifact structure
 */
export interface SelectionTraceArtifact {
  /** Artifact version for schema evolution */
  artifactVersion: '1.0.0';
  /** ISO timestamp of selection */
  timestamp: string;
  /** Job sheet ID being processed */
  jobSheetId: number;
  /** Input signals used for selection */
  inputSignals: {
    /** Token count from document */
    tokenCount: number;
    /** Sample of matched tokens (first 20) */
    tokenSample: string[];
    /** Document length in characters */
    documentLength: number;
  };
  /** Selection outcome */
  outcome: {
    /** Whether a template was selected */
    selected: boolean;
    /** Selected template ID (if selected) */
    templateId: number | null;
    /** Selected version ID (if selected) */
    versionId: number | null;
    /** Template slug (if selected) */
    templateSlug: string | null;
    /** Confidence band */
    confidenceBand: ConfidenceBand;
    /** Top score achieved */
    topScore: number;
    /** Runner-up score */
    runnerUpScore: number;
    /** Score delta (gap) */
    scoreDelta: number;
    /** Whether auto-processing was allowed */
    autoProcessingAllowed: boolean;
    /** Block reason if not allowed */
    blockReason: string | null;
  };
  /** All candidates with scores (deterministic order: score desc, templateId asc) */
  candidates: Array<{
    templateId: number;
    templateSlug: string;
    versionId: number;
    score: number;
    confidence: ConfidenceBand;
    matchedTokenCount: number;
    missingRequiredCount: number;
  }>;
}

/**
 * Artifacts directory path
 */
const ARTIFACTS_DIR = 'artifacts/selection';

/**
 * Ensure artifacts directory exists
 */
function ensureArtifactsDir(): void {
  if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
}

/**
 * Write a selection trace artifact
 * 
 * @param jobSheetId - Job sheet ID
 * @param result - Selection result
 * @param documentTokens - Tokens extracted from document
 * @param documentLength - Original document length
 * @returns Path to written artifact
 */
export function writeSelectionTrace(
  jobSheetId: number,
  result: SelectionResult,
  documentTokens: string[],
  documentLength: number
): string {
  ensureArtifactsDir();

  const artifact: SelectionTraceArtifact = {
    artifactVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    jobSheetId,
    inputSignals: {
      tokenCount: documentTokens.length,
      tokenSample: documentTokens.slice(0, 20),
      documentLength,
    },
    outcome: {
      selected: result.selected,
      templateId: result.templateId ?? null,
      versionId: result.versionId ?? null,
      templateSlug: result.candidates.find(c => c.templateId === result.templateId)?.templateSlug ?? null,
      confidenceBand: result.confidenceBand,
      topScore: result.topScore,
      runnerUpScore: result.runnerUpScore,
      scoreDelta: result.scoreGap,
      autoProcessingAllowed: result.autoProcessingAllowed,
      blockReason: result.blockReason ?? null,
    },
    candidates: result.candidates.map(c => ({
      templateId: c.templateId,
      templateSlug: c.templateSlug,
      versionId: c.versionId,
      score: c.score,
      confidence: c.confidence,
      matchedTokenCount: c.matchedTokens.length,
      missingRequiredCount: c.missingRequired.length,
    })),
  };

  // Deterministic filename with timestamp and jobSheetId
  const filename = `selection_trace_${jobSheetId}_${Date.now()}.json`;
  const filepath = join(ARTIFACTS_DIR, filename);

  // Write with deterministic JSON formatting
  writeFileSync(filepath, JSON.stringify(artifact, null, 2));

  return filepath;
}

/**
 * Create in-memory selection trace (for testing without file I/O)
 */
export function createSelectionTraceInMemory(
  jobSheetId: number,
  result: SelectionResult,
  documentTokens: string[],
  documentLength: number
): SelectionTraceArtifact {
  return {
    artifactVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    jobSheetId,
    inputSignals: {
      tokenCount: documentTokens.length,
      tokenSample: documentTokens.slice(0, 20),
      documentLength,
    },
    outcome: {
      selected: result.selected,
      templateId: result.templateId ?? null,
      versionId: result.versionId ?? null,
      templateSlug: result.candidates.find(c => c.templateId === result.templateId)?.templateSlug ?? null,
      confidenceBand: result.confidenceBand,
      topScore: result.topScore,
      runnerUpScore: result.runnerUpScore,
      scoreDelta: result.scoreGap,
      autoProcessingAllowed: result.autoProcessingAllowed,
      blockReason: result.blockReason ?? null,
    },
    candidates: result.candidates.map(c => ({
      templateId: c.templateId,
      templateSlug: c.templateSlug,
      versionId: c.versionId,
      score: c.score,
      confidence: c.confidence,
      matchedTokenCount: c.matchedTokens.length,
      missingRequiredCount: c.missingRequired.length,
    })),
  };
}
