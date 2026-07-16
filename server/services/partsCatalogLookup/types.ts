import type { Finding } from "../analyzer";
import type { PartsUsedLine } from "../partsAssessment/types";

export type PartsCatalogVerifyOutcome = "match" | "mismatch" | "unavailable";

export interface ExaSearchResult {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
}

export interface PartsCatalogLineVerifyResult {
  line: PartsUsedLine;
  outcome: PartsCatalogVerifyOutcome;
  query: string;
  score: number;
  matchedResultCount: number;
  reason: string;
  /** Top Exa result URLs for operator evidence links (may be empty). */
  evidenceUrls: string[];
}

/** Slim shape persisted on reportJson.partsCatalogLineResults (cap 10). */
export interface PartsCatalogPersistedLineResult {
  partNumber: string;
  description: string;
  outcome: PartsCatalogVerifyOutcome;
  evidenceUrls: string[];
}

export interface PartsCatalogVerifySignals {
  enabled: boolean;
  lineCount: number;
  verifiedCount: number;
  matchCount: number;
  mismatchCount: number;
  unavailableCount: number;
  capped: boolean;
}

export interface PartsCatalogVerifyResult {
  signals: PartsCatalogVerifySignals;
  findings: Finding[];
  lineResults: PartsCatalogLineVerifyResult[];
  summary: string;
}
