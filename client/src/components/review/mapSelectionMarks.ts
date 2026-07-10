/**
 * Map reportJson.selectionMarks → review UI model.
 */

export type ChecklistChoice = "Ok" | "Adv" | "Fail" | "N/A" | "UNREADABLE";

export interface SelectionMarkRowView {
  rowIndex: number;
  pageNumber: number;
  label?: string;
  choice: ChecklistChoice;
  confidence: number;
  selectedCount: number;
  markCount: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SelectionMarksView {
  engineVersion: string;
  model: string;
  rows: SelectionMarkRowView[];
  summary: {
    rowsDetected: number;
    readableRows: number;
    unreadableRows: number;
    marksDetected: number;
  };
  error?: string;
}

export function mapSelectionMarksFromReport(
  reportJson: unknown
): SelectionMarksView | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const marks = (reportJson as Record<string, unknown>).selectionMarks;
  if (!marks || typeof marks !== "object") return null;
  const m = marks as Record<string, unknown>;
  const rowsRaw = Array.isArray(m.rows) ? m.rows : [];
  const rows: SelectionMarkRowView[] = [];
  for (const raw of rowsRaw) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const choice = String(r.choice || "UNREADABLE") as ChecklistChoice;
    rows.push({
      rowIndex: typeof r.rowIndex === "number" ? r.rowIndex : rows.length,
      pageNumber: typeof r.pageNumber === "number" ? r.pageNumber : 1,
      label: typeof r.label === "string" ? r.label : undefined,
      choice,
      confidence: typeof r.confidence === "number" ? r.confidence : 0,
      selectedCount: typeof r.selectedCount === "number" ? r.selectedCount : 0,
      markCount: typeof r.markCount === "number" ? r.markCount : 0,
      bbox:
        r.bbox && typeof r.bbox === "object"
          ? (r.bbox as SelectionMarkRowView["bbox"])
          : undefined,
    });
  }
  const summary =
    m.summary && typeof m.summary === "object"
      ? (m.summary as SelectionMarksView["summary"])
      : {
          rowsDetected: rows.length,
          readableRows: rows.filter(r => r.choice !== "UNREADABLE").length,
          unreadableRows: rows.filter(r => r.choice === "UNREADABLE").length,
          marksDetected: 0,
        };

  return {
    engineVersion: String(m.engineVersion || "selection-marks"),
    model: String(m.model || "prebuilt-layout"),
    rows,
    summary,
    error: typeof m.error === "string" ? m.error : undefined,
  };
}
