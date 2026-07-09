/**
 * Shadow comparison + disagreement reporting (PR-21)
 */

import type {
  AuditOutcome,
  FieldDisagreement,
  JudgmentSnapshot,
  ShadowComparison,
  ShadowDisagreementReport,
  ChallengerStrategy,
} from "./types";
import { SHADOW_COMPARISON_SCHEMA_VERSION } from "./types";

export function fingerprintFinding(f: {
  ruleId: string;
  fieldName: string;
  reasonCode: string;
  severity: string;
}): string {
  return `${f.ruleId}|${f.fieldName}|${f.reasonCode}|${f.severity}`;
}

export function toJudgmentSnapshot(input: {
  overallResult: AuditOutcome;
  score: number;
  model: string;
  findings: Array<{
    ruleId: string;
    fieldName: string;
    reasonCode: string;
    severity: string;
  }>;
  extractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
}): JudgmentSnapshot {
  const fingerprints = input.findings
    .map(fingerprintFinding)
    .sort((a, b) => a.localeCompare(b));
  const keys = Object.keys(input.extractedFields).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    overallResult: input.overallResult,
    score: input.score,
    model: input.model,
    findingCount: input.findings.length,
    findingFingerprints: fingerprints,
    extractedFieldKeys: keys,
    extractedFields: input.extractedFields,
  };
}

function normalizeValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

export function compareExtractedFields(
  champion: JudgmentSnapshot["extractedFields"],
  challenger: JudgmentSnapshot["extractedFields"]
): FieldDisagreement[] {
  const keys = new Set([...Object.keys(champion), ...Object.keys(challenger)]);
  const disagreements: FieldDisagreement[] = [];

  for (const fieldName of Array.from(keys).sort((a, b) => a.localeCompare(b))) {
    const c = champion[fieldName];
    const t = challenger[fieldName];
    const cVal = normalizeValue(c?.value);
    const tVal = normalizeValue(t?.value);

    if (cVal == null && tVal == null) continue;
    if (cVal != null && tVal == null) {
      disagreements.push({
        fieldName,
        championValue: c?.value ?? null,
        challengerValue: null,
        kind: "only_champion",
      });
      continue;
    }
    if (cVal == null && tVal != null) {
      disagreements.push({
        fieldName,
        championValue: null,
        challengerValue: t?.value ?? null,
        kind: "only_challenger",
      });
      continue;
    }
    if (cVal !== tVal) {
      disagreements.push({
        fieldName,
        championValue: c?.value ?? null,
        challengerValue: t?.value ?? null,
        kind: "value_mismatch",
      });
    }
  }

  return disagreements;
}

export function compareFindingFingerprints(
  champion: string[],
  challenger: string[]
): {
  onlyInChampion: string[];
  onlyInChallenger: string[];
  shared: string[];
} {
  const cSet = new Set(champion);
  const tSet = new Set(challenger);
  const onlyInChampion = champion
    .filter(f => !tSet.has(f))
    .sort((a, b) => a.localeCompare(b));
  const onlyInChallenger = challenger
    .filter(f => !cSet.has(f))
    .sort((a, b) => a.localeCompare(b));
  const shared = champion
    .filter(f => tSet.has(f))
    .sort((a, b) => a.localeCompare(b));
  return { onlyInChampion, onlyInChallenger, shared };
}

export function buildShadowComparison(input: {
  mode: "shadow" | "canary";
  strategy: ChallengerStrategy;
  champion: JudgmentSnapshot;
  challenger: JudgmentSnapshot;
  latencyMs: number;
  canaryApplied: boolean;
  sampled: boolean;
  jobSheetId?: number;
  createdAt?: string;
}): ShadowComparison {
  const resultAgreed =
    input.champion.overallResult === input.challenger.overallResult;
  const fieldDisagreements = compareExtractedFields(
    input.champion.extractedFields,
    input.challenger.extractedFields
  );
  const findingDisagreements = compareFindingFingerprints(
    input.champion.findingFingerprints,
    input.challenger.findingFingerprints
  );
  const hasFindingDisagreement =
    findingDisagreements.onlyInChampion.length > 0 ||
    findingDisagreements.onlyInChallenger.length > 0;

  return {
    schemaVersion: SHADOW_COMPARISON_SCHEMA_VERSION,
    mode: input.mode,
    strategy: input.strategy,
    champion: input.champion,
    challenger: input.challenger,
    resultAgreed,
    resultDisagreement: !resultAgreed,
    scoreDelta:
      Math.round((input.challenger.score - input.champion.score) * 100) / 100,
    fieldDisagreements,
    findingDisagreements,
    hasDisagreement:
      !resultAgreed || fieldDisagreements.length > 0 || hasFindingDisagreement,
    latencyMs: input.latencyMs,
    canaryApplied: input.canaryApplied,
    sampled: input.sampled,
    jobSheetId: input.jobSheetId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildDisagreementReport(
  comparisons: ShadowComparison[]
): ShadowDisagreementReport {
  const total = comparisons.length;
  const disagreements = comparisons.filter(c => c.hasDisagreement);
  const resultDisagreements = comparisons.filter(c => c.resultDisagreement);
  const canaryAppliedCount = comparisons.filter(c => c.canaryApplied).length;

  const byOutcomePair: Record<string, number> = {};
  for (const c of comparisons) {
    const key = `${c.champion.overallResult}->${c.challenger.overallResult}`;
    byOutcomePair[key] = (byOutcomePair[key] ?? 0) + 1;
  }

  const fieldCounts = new Map<string, number>();
  for (const c of comparisons) {
    for (const d of c.fieldDisagreements) {
      fieldCounts.set(d.fieldName, (fieldCounts.get(d.fieldName) ?? 0) + 1);
    }
  }
  const topFieldDisagreements = Array.from(fieldCounts.entries())
    .map(([fieldName, count]) => ({ fieldName, count }))
    .sort((a, b) => b.count - a.count || a.fieldName.localeCompare(b.fieldName))
    .slice(0, 20);

  const avgScoreDelta =
    total === 0
      ? 0
      : Math.round(
          (comparisons.reduce((s, c) => s + c.scoreDelta, 0) / total) * 100
        ) / 100;

  const recentDisagreements = disagreements
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  return {
    totalComparisons: total,
    disagreementCount: disagreements.length,
    disagreementRate: total === 0 ? 0 : disagreements.length / total,
    resultDisagreementCount: resultDisagreements.length,
    resultDisagreementRate:
      total === 0 ? 0 : resultDisagreements.length / total,
    canaryAppliedCount,
    avgScoreDelta,
    byOutcomePair,
    topFieldDisagreements,
    recentDisagreements,
  };
}

/** Extract shadowComparison artifacts from audit reportJson rows. */
export function extractShadowComparisonsFromReports(
  reportJsons: unknown[]
): ShadowComparison[] {
  const out: ShadowComparison[] = [];
  for (const report of reportJsons) {
    if (!report || typeof report !== "object") continue;
    const shadow = (report as Record<string, unknown>).shadowComparison;
    if (!shadow || typeof shadow !== "object") continue;
    const c = shadow as ShadowComparison;
    if (c.schemaVersion !== SHADOW_COMPARISON_SCHEMA_VERSION) continue;
    if (!c.champion || !c.challenger) continue;
    out.push(c);
  }
  return out;
}
