import type { Finding } from "../analyzer";

export interface PartsUsedLine {
  partNumber: string | null;
  description: string | null;
  qty?: string | null;
  raw: string;
}

export interface PartsAssessmentSignals {
  partsImplied: boolean;
  partsUsedPresent: boolean;
  repairsPresent: boolean;
  consumablesYes: boolean;
  lineCount: number;
  completeCount: number;
  incompleteCount: number;
  snippet: string;
}

export interface PartsAssessmentResult {
  signals: PartsAssessmentSignals;
  findings: Finding[];
  summary: string;
}
