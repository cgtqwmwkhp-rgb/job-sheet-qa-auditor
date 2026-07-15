import type { Finding } from "../analyzer";
import type { MatchConfidence } from "../technicianAttribution";

export interface EngineerAttributionSignals {
  extractedName: string | null;
  displayName: string | null;
  technicianId: number | null;
  matchConfidence: MatchConfidence;
  matchedOn: string | null;
}

export interface ReportAttributionStamp {
  extractedName: string | null;
  displayName: string | null;
  technicianId: number | null;
  confidence: MatchConfidence;
  matchedOn: string | null;
}

export interface EngineerAttributionResult {
  signals: EngineerAttributionSignals;
  findings: Finding[];
  summary: string;
  attribution: ReportAttributionStamp;
}
