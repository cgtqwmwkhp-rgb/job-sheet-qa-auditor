/**
 * Diff two template versions (spec / ROI / selection tokens).
 */

import type {
  SpecJson,
  SelectionConfig,
  RoiConfig,
} from "../templateRegistry/types";
import type { VersionRecord } from "../templateRegistry/registryService";

export interface VersionDiffEntry {
  path: string;
  change: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}

export interface VersionDiffReport {
  fromVersionId: number;
  toVersionId: number;
  fromVersion: string;
  toVersion: string;
  entries: VersionDiffEntry[];
  summary: {
    fieldChanges: number;
    ruleChanges: number;
    tokenChanges: number;
    roiChanges: number;
  };
}

function fieldKey(f: { field: string }): string {
  return f.field;
}

function ruleKey(r: { ruleId: string }): string {
  return r.ruleId;
}

function regionKey(r: { name: string; page: number }): string {
  return `${r.page}:${r.name}`;
}

function pushChanged(
  entries: VersionDiffEntry[],
  path: string,
  before: unknown,
  after: unknown
) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  entries.push({ path, change: "changed", before, after });
}

export function diffVersions(
  from: VersionRecord,
  to: VersionRecord
): VersionDiffReport {
  const entries: VersionDiffEntry[] = [];

  diffSpec(from.specJson, to.specJson, entries);
  diffSelection(from.selectionConfigJson, to.selectionConfigJson, entries);
  diffRoi(from.roiJson, to.roiJson, entries);

  const fieldChanges = entries.filter(e => e.path.startsWith("fields.")).length;
  const ruleChanges = entries.filter(e => e.path.startsWith("rules.")).length;
  const tokenChanges = entries.filter(e =>
    e.path.startsWith("selection.")
  ).length;
  const roiChanges = entries.filter(e => e.path.startsWith("roi.")).length;

  return {
    fromVersionId: from.id,
    toVersionId: to.id,
    fromVersion: from.version,
    toVersion: to.version,
    entries,
    summary: { fieldChanges, ruleChanges, tokenChanges, roiChanges },
  };
}

function diffSpec(a: SpecJson, b: SpecJson, entries: VersionDiffEntry[]) {
  pushChanged(entries, "spec.name", a.name, b.name);
  pushChanged(entries, "spec.version", a.version, b.version);

  const aFields = new Map(a.fields.map(f => [fieldKey(f), f]));
  const bFields = new Map(b.fields.map(f => [fieldKey(f), f]));
  for (const [k, f] of Array.from(aFields.entries())) {
    if (!bFields.has(k)) {
      entries.push({ path: `fields.${k}`, change: "removed", before: f });
    }
  }
  for (const [k, f] of Array.from(bFields.entries())) {
    const prev = aFields.get(k);
    if (!prev) {
      entries.push({ path: `fields.${k}`, change: "added", after: f });
    } else {
      pushChanged(entries, `fields.${k}`, prev, f);
    }
  }

  const aRules = new Map(a.rules.map(r => [ruleKey(r), r]));
  const bRules = new Map(b.rules.map(r => [ruleKey(r), r]));
  for (const [k, r] of Array.from(aRules.entries())) {
    if (!bRules.has(k)) {
      entries.push({ path: `rules.${k}`, change: "removed", before: r });
    }
  }
  for (const [k, r] of Array.from(bRules.entries())) {
    const prev = aRules.get(k);
    if (!prev) {
      entries.push({ path: `rules.${k}`, change: "added", after: r });
    } else {
      pushChanged(entries, `rules.${k}`, prev, r);
    }
  }
}

function diffSelection(
  a: SelectionConfig,
  b: SelectionConfig,
  entries: VersionDiffEntry[]
) {
  pushChanged(
    entries,
    "selection.requiredTokensAll",
    a.requiredTokensAll,
    b.requiredTokensAll
  );
  pushChanged(
    entries,
    "selection.requiredTokensAny",
    a.requiredTokensAny,
    b.requiredTokensAny
  );
  pushChanged(
    entries,
    "selection.optionalTokens",
    a.optionalTokens,
    b.optionalTokens
  );
  pushChanged(
    entries,
    "selection.formCodeRegex",
    a.formCodeRegex,
    b.formCodeRegex
  );
  pushChanged(
    entries,
    "selection.tokenWeights",
    a.tokenWeights,
    b.tokenWeights
  );
}

function diffRoi(
  a: RoiConfig | null,
  b: RoiConfig | null,
  entries: VersionDiffEntry[]
) {
  const aRegions = a?.regions ?? [];
  const bRegions = b?.regions ?? [];
  const aMap = new Map(aRegions.map(r => [regionKey(r), r]));
  const bMap = new Map(bRegions.map(r => [regionKey(r), r]));
  for (const [k, r] of Array.from(aMap.entries())) {
    if (!bMap.has(k)) {
      entries.push({ path: `roi.${k}`, change: "removed", before: r });
    }
  }
  for (const [k, r] of Array.from(bMap.entries())) {
    const prev = aMap.get(k);
    if (!prev) {
      entries.push({ path: `roi.${k}`, change: "added", after: r });
    } else {
      pushChanged(entries, `roi.${k}`, prev, r);
    }
  }
}
