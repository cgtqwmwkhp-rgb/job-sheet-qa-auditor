/**
 * Build multi-engine field candidates from pipeline artifacts (Wave-4 B2).
 *
 * Pure helpers — documentProcessor only assembles maps; voting stays here.
 */

import type { EngineFieldCandidate } from "./types";
import { VOTE_FIELD_IDS } from "./types";

export type PreExtractedLike = Record<
  string,
  { value: string; confidence: number; pageNumber?: number } | undefined
>;

/**
 * Convert a 0–100 or 0–1 confidence into 0–1.
 */
export function toUnitConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw > 1) return Math.max(0, Math.min(1, raw / 100));
  return Math.max(0, Math.min(1, raw));
}

/**
 * Collect candidates for one field from named engine maps.
 */
export function collectFieldCandidates(
  fieldId: string,
  engines: Array<{
    engine: string;
    fields: PreExtractedLike;
    evidenceStrength?: EngineFieldCandidate["evidenceStrength"];
    evidence?: string;
  }>
): EngineFieldCandidate[] {
  const out: EngineFieldCandidate[] = [];
  for (const src of engines) {
    const hit = src.fields[fieldId];
    if (!hit?.value) continue;
    out.push({
      engine: src.engine,
      fieldId,
      value: hit.value,
      confidence: toUnitConfidence(hit.confidence),
      evidenceStrength: src.evidenceStrength,
      evidence: src.evidence,
    });
  }
  return out;
}

/**
 * Build candidate map for all vote-eligible fields present in any engine map.
 */
export function buildCandidateMap(
  engines: Array<{
    engine: string;
    fields: PreExtractedLike;
    evidenceStrength?: EngineFieldCandidate["evidenceStrength"];
    evidence?: string;
  }>
): Record<string, EngineFieldCandidate[]> {
  const fieldIds = new Set<string>();
  for (const id of VOTE_FIELD_IDS) fieldIds.add(id);
  for (const src of engines) {
    for (const k of Object.keys(src.fields)) fieldIds.add(k);
  }

  const byField: Record<string, EngineFieldCandidate[]> = {};
  for (const fieldId of Array.from(fieldIds)) {
    const cands = collectFieldCandidates(fieldId, engines);
    if (cands.length > 0) byField[fieldId] = cands;
  }
  return byField;
}
