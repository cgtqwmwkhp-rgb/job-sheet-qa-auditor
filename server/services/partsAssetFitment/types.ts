import type { Finding } from "../analyzer";
import type { PartsUsedLine } from "../partsAssessment/types";

export type PartsAssetFitmentOutcome = "match" | "conflict" | "unavailable";

export interface PartsAssetFitmentLineResult {
  line: PartsUsedLine;
  outcome: PartsAssetFitmentOutcome;
  query: string;
  score: number;
  matchedResultCount: number;
  reason: string;
}

export interface PartsAssetFitmentSignals {
  enabled: boolean;
  makeModel?: string;
  lineCount: number;
  verifiedCount: number;
  matchCount: number;
  conflictCount: number;
  unavailableCount: number;
  missingAssetContext: boolean;
  capped: boolean;
}

export interface PartsAssetFitmentResult {
  signals: PartsAssetFitmentSignals;
  findings: Finding[];
  lineResults: PartsAssetFitmentLineResult[];
  summary: string;
}
