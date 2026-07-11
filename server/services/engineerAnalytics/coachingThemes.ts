/**
 * Map findings into coaching themes for analytical feedback packs.
 * Themes are behavioural, not raw rule dumps.
 */

import type { RawFindingRow } from "./mapFindings";

export type CoachingThemeId =
  | "comment_narrative"
  | "photo_proof"
  | "evidence_coherence"
  | "checklist_completeness"
  | "other";

export interface CoachingThemeDefinition {
  id: CoachingThemeId;
  title: string;
  /** Short coach-facing definition of the behaviour. */
  definition: string;
  /** What “good” looks like in the next period. */
  goodLooksLike: string;
}

export const COACHING_THEME_DEFS: Record<
  CoachingThemeId,
  CoachingThemeDefinition
> = {
  comment_narrative: {
    id: "comment_narrative",
    title: "Clinical comment narrative",
    definition:
      "Failure-path and completion comments that do not clearly state what failed, what was done, and the actionable next step.",
    goodLooksLike:
      "Every Fail / Parts Still Required / incomplete outcome has a coherent comment covering what, why, and next action.",
  },
  photo_proof: {
    id: "photo_proof",
    title: "Before/after photo proof",
    definition:
      "Missing, unpaired, or insufficient before/after evidence when the job outcome requires visual proof of work done.",
    goodLooksLike:
      "Matched before/after pairs that clearly show the work axis (e.g. repaired properly) when the card claims completion.",
  },
  evidence_coherence: {
    id: "evidence_coherence",
    title: "Comment ↔ photo coherence",
    definition:
      "Narrative and photo evidence pull in different directions (e.g. comment says complete; photos show parts still required).",
    goodLooksLike:
      "Comments and photos tell the same story so a reviewer can trust the card without a second site visit.",
  },
  checklist_completeness: {
    id: "checklist_completeness",
    title: "Checklist & required fields",
    definition:
      "Incomplete checklists, missing required fields, or Fail marks without supporting documentation.",
    goodLooksLike:
      "Required fields and checklist items completed or explicitly justified when not applicable.",
  },
  other: {
    id: "other",
    title: "Other documentation issues",
    definition:
      "Format, policy, signature, or other documentation findings outside the primary evidence themes.",
    goodLooksLike:
      "Policy and format requirements met consistently across the period’s cards.",
  },
};

function isMajor(severity: string): boolean {
  return severity === "S0" || severity === "S1";
}

/**
 * Classify a finding into a coaching theme using ruleId when present.
 */
export function classifyFindingTheme(row: {
  ruleId?: string | null;
  reasonCode?: string;
  fieldName?: string;
}): CoachingThemeId {
  const ruleId = (row.ruleId ?? "").trim();
  if (ruleId.startsWith("COMMENT-C")) return "comment_narrative";
  if (ruleId.startsWith("PHOTO-C")) return "photo_proof";
  if (ruleId.startsWith("EVIDENCE-C")) return "evidence_coherence";

  const field = (row.fieldName ?? "").toLowerCase();
  if (field.includes("photo") || field.includes("image")) return "photo_proof";
  if (
    field.includes("comment") ||
    field.includes("engineer") ||
    field.includes("narrative")
  ) {
    return "comment_narrative";
  }

  const reason = row.reasonCode ?? "";
  if (reason === "INCOMPLETE_EVIDENCE") return "checklist_completeness";
  if (reason === "MISSING_FIELD") return "checklist_completeness";
  if (reason === "OUT_OF_POLICY" || reason === "SECURITY_RISK") return "other";

  return "other";
}

export interface ThemeAggregate {
  themeId: CoachingThemeId;
  title: string;
  definition: string;
  goodLooksLike: string;
  findingCount: number;
  majorCount: number;
  sheetCount: number;
  percentageOfIssues: number;
  priorFindingCount: number;
  trend: "increasing" | "stable" | "decreasing";
  exampleJobSheetIds: number[];
  exampleRuleIds: string[];
}

/**
 * Aggregate findings into coaching themes with prior-period trend.
 */
export function aggregateCoachingThemes(input: {
  currentFindings: RawFindingRow[];
  priorFindings: RawFindingRow[];
  limit?: number;
}): ThemeAggregate[] {
  const limit = input.limit ?? 4;
  const totalCurrent = Math.max(input.currentFindings.length, 1);

  const buildMap = (rows: RawFindingRow[]) => {
    const map = new Map<
      CoachingThemeId,
      {
        findings: RawFindingRow[];
        sheets: Set<number>;
        rules: Set<string>;
      }
    >();
    for (const row of rows) {
      const themeId = classifyFindingTheme(row);
      let entry = map.get(themeId);
      if (!entry) {
        entry = { findings: [], sheets: new Set(), rules: new Set() };
        map.set(themeId, entry);
      }
      entry.findings.push(row);
      entry.sheets.add(row.jobSheetId);
      if (row.ruleId) entry.rules.add(row.ruleId);
    }
    return map;
  };

  const current = buildMap(input.currentFindings);
  const prior = buildMap(input.priorFindings);

  const themes: ThemeAggregate[] = [];
  for (const themeId of Object.keys(COACHING_THEME_DEFS) as CoachingThemeId[]) {
    const cur = current.get(themeId);
    if (!cur || cur.findings.length === 0) continue;
    const def = COACHING_THEME_DEFS[themeId];
    const priorCount = prior.get(themeId)?.findings.length ?? 0;
    const findingCount = cur.findings.length;
    const delta = findingCount - priorCount;
    const trend: ThemeAggregate["trend"] =
      delta >= 2 ? "increasing" : delta <= -2 ? "decreasing" : "stable";

    const exampleJobSheetIds = Array.from(cur.sheets).slice(0, 3);
    const majorCount = cur.findings.filter(f => isMajor(f.severity)).length;

    themes.push({
      themeId,
      title: def.title,
      definition: def.definition,
      goodLooksLike: def.goodLooksLike,
      findingCount,
      majorCount,
      sheetCount: cur.sheets.size,
      percentageOfIssues: Math.round((findingCount / totalCurrent) * 100),
      priorFindingCount: priorCount,
      trend,
      exampleJobSheetIds,
      exampleRuleIds: Array.from(cur.rules).slice(0, 5),
    });
  }

  return themes
    .sort((a, b) => {
      if (b.majorCount !== a.majorCount) return b.majorCount - a.majorCount;
      return b.findingCount - a.findingCount;
    })
    .slice(0, limit);
}
