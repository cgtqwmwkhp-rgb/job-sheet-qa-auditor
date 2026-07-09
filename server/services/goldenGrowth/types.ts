/**
 * Golden-set growth types (Phase 2.8)
 */

export interface CorrectionInput {
  jobSheetId: string;
  fieldKey: string;
  normalisedSnippet: string;
  correctedValue: string;
  severity?: string;
}

export interface GoldenFixtureCandidate {
  id: string;
  sourceJobSheetId: string;
  fieldKey: string;
  expectedValue: string;
  snippet: string;
  createdAt: string;
}
