/**
 * Shared types for text/table checklist readers (Result column, Obs. marks).
 * Complements Azure DI radio selectionMarks for PX-104 multi-format grids.
 */

import type { AzureTextLine } from "../../ocrAdapter/parseAzureDiResponse";

export type ChecklistChoice = "Ok" | "Adv" | "Fail" | "N/A" | "UNREADABLE";

export type ChecklistRowSource =
  | "radio"
  | "result_column"
  | "obs_marks"
  | "merged";

export interface ChecklistTextToken {
  pageNumber: number;
  content: string;
  /** Horizontal center as % of page width (0–100). */
  xPercent: number;
  /** Vertical center as % of page height (0–100). */
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface ColumnBand {
  pageNumber: number;
  /** Inclusive left edge (%). */
  xMin: number;
  /** Exclusive-ish right edge (%). */
  xMax: number;
  /** Header Y center (%). */
  yPercent: number;
  header: string;
}

export interface TextChecklistRow {
  pageNumber: number;
  label: string;
  choice: ChecklistChoice;
  confidence: number;
  yPercent: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: "percent";
  };
  source: ChecklistRowSource;
}

/** Normalize Pass/Satisfactory/etc. into checklist choices. */
export function normalizeResultChoice(raw: string): ChecklistChoice {
  const t = raw.trim().toLowerCase().replace(/\./g, "");
  if (/^(pass|ok|satisfactory|sat|good|yes)$/.test(t)) return "Ok";
  if (/^(adv|advisory|advise)$/.test(t)) return "Adv";
  if (/^(fail|failed|unsatisfactory|unsat|bad|no)$/.test(t)) return "Fail";
  if (/^(n\/?a|na|not\s*applicable)$/.test(t)) return "N/A";
  return "UNREADABLE";
}

/** Obs. glyph → Ok/Fail. */
export function normalizeObsGlyph(raw: string): ChecklistChoice {
  const t = raw.trim();
  if (/[✓✔√]/.test(t) || /^(tick|yes|y|ok|pass)$/i.test(t)) return "Ok";
  if (/[✗✘×✖]/.test(t) || /^(cross|no|n|fail|x)$/i.test(t)) return "Fail";
  return "UNREADABLE";
}

export function linesToTokens(lines: AzureTextLine[]): ChecklistTextToken[] {
  return lines.map(l => ({
    pageNumber: l.pageNumber,
    content: l.content,
    xPercent: l.xPercent + (l.widthPercent ?? 8) / 2,
    yPercent: l.yPercent,
    widthPercent: l.widthPercent ?? Math.min(40, Math.max(4, l.content.length)),
    heightPercent: l.heightPercent ?? 1.2,
  }));
}

export function textRowToSelectionMarkRow(
  row: TextChecklistRow,
  rowIndex: number
): {
  rowIndex: number;
  pageNumber: number;
  label?: string;
  choice: ChecklistChoice;
  confidence: number;
  bbox?: TextChecklistRow["bbox"];
  selectedCount: number;
  markCount: number;
} {
  return {
    rowIndex,
    pageNumber: row.pageNumber,
    label: row.label.slice(0, 120),
    choice: row.choice,
    confidence: row.confidence,
    bbox: row.bbox,
    selectedCount: row.choice === "UNREADABLE" ? 0 : 1,
    markCount: 1,
  };
}
