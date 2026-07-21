/**
 * Merge radio selection-mark rows with Result-column / Obs. text rows.
 *
 * Prefer high-confidence radio choices; fill gaps from text readers so
 * long checklists and non-radio formats are not dropped (PX-104).
 */

import type { ChecklistChoice, TextChecklistRow } from "./types";
import { textRowToSelectionMarkRow } from "./types";

/** Subset of SelectionMarkRow — avoid circular import with parent index. */
export interface MergeableChecklistRow {
  rowIndex: number;
  pageNumber: number;
  label?: string;
  choice: ChecklistChoice;
  confidence: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: "percent";
  };
  selectedCount: number;
  markCount: number;
}

function labelKey(label: string | undefined, page: number, y?: number): string {
  const norm = (label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 60);
  if (norm.length >= 6) return `${page}|${norm}`;
  return `${page}|y:${(y ?? 0).toFixed(1)}`;
}

function yFromRow(row: MergeableChecklistRow): number {
  if (row.bbox) return row.bbox.y + row.bbox.height / 2;
  return 0;
}

/**
 * Merge layout radio rows with Result/Obs text rows.
 * - Readable radio wins on the same label
 * - Text rows fill missing labels (long-list recall)
 * - When radio produced zero readable rows, text becomes authoritative
 */
export function mergeChecklistRowSources(options: {
  radioRows: MergeableChecklistRow[];
  resultRows?: TextChecklistRow[];
  obsRows?: TextChecklistRow[];
}): {
  rows: MergeableChecklistRow[];
  preferredSource: "layout" | "result_column" | "obs_marks" | "merged";
  textRowsAdded: number;
} {
  const radio = options.radioRows ?? [];
  const result = options.resultRows ?? [];
  const obs = options.obsRows ?? [];

  const radioReadable = radio.filter(r => r.choice !== "UNREADABLE");
  const textAll = [...result, ...obs];

  if (textAll.length === 0) {
    return {
      rows: radio,
      preferredSource: "layout",
      textRowsAdded: 0,
    };
  }

  if (radioReadable.length === 0 && textAll.length > 0) {
    const source = result.length >= obs.length ? "result_column" : "obs_marks";
    const rows = textAll.map((r, i) => textRowToSelectionMarkRow(r, i));
    return { rows, preferredSource: source, textRowsAdded: rows.length };
  }

  const covered = new Set(
    radio.map(r => labelKey(r.label, r.pageNumber, yFromRow(r)))
  );

  const merged: MergeableChecklistRow[] = [...radio];
  let added = 0;

  // Prefer Result over Obs when both claim the same label
  const byLabel = new Map<string, TextChecklistRow>();
  for (const r of obs) {
    byLabel.set(labelKey(r.label, r.pageNumber, r.yPercent), r);
  }
  for (const r of result) {
    byLabel.set(labelKey(r.label, r.pageNumber, r.yPercent), r);
  }

  for (const [key, textRow] of Array.from(byLabel.entries())) {
    if (covered.has(key)) continue;
    // Also skip if a radio row is within 1.2% Y on same page (label-less radio)
    const nearRadio = radio.some(
      r =>
        r.pageNumber === textRow.pageNumber &&
        Math.abs(yFromRow(r) - textRow.yPercent) <= 1.2 &&
        r.choice !== "UNREADABLE"
    );
    if (nearRadio) continue;

    merged.push(textRowToSelectionMarkRow(textRow, merged.length));
    covered.add(key);
    added++;
  }

  // Re-index
  const rows = merged
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return yFromRow(a) - yFromRow(b);
    })
    .map((r, i) => ({ ...r, rowIndex: i }));

  return {
    rows,
    preferredSource: added > 0 ? "merged" : "layout",
    textRowsAdded: added,
  };
}
