/**
 * Selection mark detection (Azure DI prebuilt-layout).
 *
 * Maps radio/checkbox circles (Ok / Adv / Fail / N/A) from visual
 * selectionMarks into structured row choices for Gemini hints + reportJson.
 *
 * Feature flag: FEATURE_SELECTION_MARKS
 * - unset → enabled when AZURE_DI_ENDPOINT + AZURE_DI_KEY are set
 * - "true" / "1" → force on
 * - "false" / "0" → force off
 *
 * Custom neural voter (PR-AI-06): when FEATURE_AZURE_DI_CUSTOM_JSR +
 * AZURE_DI_CUSTOM_JSR_MODEL_ID are set, a PlantExpand JSR custom model pass
 * votes checklist rows + structured fields alongside prebuilt-layout geometry.
 */

import type {
  AzureSelectionMark,
  AzureTextLine,
} from "../ocrAdapter/parseAzureDiResponse";
import { extractLayoutSelectionMarks } from "../ocrAdapter/azureDocumentIntelligenceAdapter";
import {
  extractCustomJsrForm,
  isAzureCustomJsrEnabled,
  type AzureCustomFormExtractResult,
} from "../ocrAdapter/azureCustomFormAdapter";
import { getOCRConfig } from "../ocrAdapter/types";
import type { Finding } from "../analyzer";
import type { EmbeddedPdfPageLayout } from "../embeddedPdfText";
import {
  readResultColumnRows,
  readObsMarkRows,
  readRadioColumnRows,
  mergeChecklistRowSources,
} from "./checklistReaders";

export const FEATURE_FLAG = "FEATURE_SELECTION_MARKS";
export const ENGINE_VERSION = "selection-marks-v1";
/** Engine stamp when custom JSR voter contributes checklist rows. */
export const ENGINE_VERSION_WITH_CUSTOM_VOTER = "selection-marks-v1+custom-jsr";
/** Engine stamp when Result-column / Obs. text readers contribute rows. */
export const ENGINE_VERSION_WITH_TEXT_CHECKLIST =
  "selection-marks-v1+text-checklist";

export {
  readResultColumnRows,
  readObsMarkRows,
  readRadioColumnRows,
  mergeChecklistRowSources,
  detectResultColumnBands,
  detectObsColumnBands,
  detectRadioColumnBands,
  normalizeResultChoice,
  normalizeObsGlyph,
  pageLayoutsToTokens,
  tokensToLines,
} from "./checklistReaders";
export {
  demoteSignOffMissingWhenInkUnverified,
  demoteSignatureSystemWhenImageQaUnavailable,
  wasVlmInkUsed,
} from "./signOffHonesty";
export type {
  SignOffHonestyOptions,
  ImageQaUnavailableDemoteOptions,
} from "./signOffHonesty";
export type { TextChecklistRow, ChecklistRowSource } from "./checklistReaders";

/** Minimum confidence for a Fail mark to drive S1 findings / block auto-PASS. */
export const FAIL_CONFIDENCE_THRESHOLD = 80;

export type ChecklistChoice = "Ok" | "Adv" | "Fail" | "N/A" | "UNREADABLE";

export const CHECKLIST_COLUMNS: Exclude<ChecklistChoice, "UNREADABLE">[] = [
  "Ok",
  "Adv",
  "Fail",
  "N/A",
];

export interface SelectionMarkRow {
  rowIndex: number;
  pageNumber: number;
  label?: string;
  choice: ChecklistChoice;
  confidence: number;
  /** Percent bbox covering the selected mark (or row span if unreadable). */
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

export interface SelectionMarksArtifact {
  engineVersion: string;
  model: string;
  processingTimeMs: number;
  rows: SelectionMarkRow[];
  summary: {
    rowsDetected: number;
    readableRows: number;
    unreadableRows: number;
    marksDetected: number;
  };
  error?: string;
  /** Present when custom neural JSR voter contributed rows or fields. */
  customVoter?: {
    enabled: boolean;
    model?: string;
    docType?: string;
    fieldsExtracted?: number;
    checklistRowsFromCustom?: number;
    preferredSource: "layout" | "custom" | "merged";
  };
}

export interface SelectionMarksResult {
  artifact: SelectionMarksArtifact;
  /** Compact hint block for Gemini preExtractedHintsBlock. */
  hintsBlock: string;
  /** Field-shaped hints for preExtractedFields merge. */
  preExtractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  /** Structured fields emitted only by the provisioned Azure DI custom model. */
  customPreExtractedFields?: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  /**
   * Full page text from the Azure DI layout pass (line-concatenated markdown).
   * Richer than Mistral-flattened text for completion-grid fields.
   * Undefined when layout returned no usable text.
   */
  layoutText?: string;
  /** Layout lines with percent geometry — for ROI spatial extraction. */
  lines?: AzureTextLine[];
  /** Raw selection marks — for ROI spatial filtering. */
  selectionMarks?: AzureSelectionMark[];
}

/** Default on when Azure DI is configured; explicit false/0 disables. */
export function isSelectionMarksEnabled(): boolean {
  const raw = process.env[FEATURE_FLAG];
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  const cfg = getOCRConfig();
  return Boolean(cfg.azureEndpoint && cfg.azureKey);
}

const HEADER_PATTERNS: Array<{
  choice: Exclude<ChecklistChoice, "UNREADABLE">;
  re: RegExp;
}> = [
  // Pass is PlantExpand synonym for Ok on older compliance grids
  { choice: "Ok", re: /\b(?:ok|pass)\b/i },
  { choice: "Adv", re: /\badv\.?\b|advisor/i },
  { choice: "Fail", re: /\bfail\b/i },
  { choice: "N/A", re: /\bn\/?a\b|not\s*applicable/i },
];

/**
 * Infer column order from header line text near the top of the mark cluster.
 * Falls back to Ok|Adv|Fail|N/A left-to-right.
 *
 * Supports 3-column headers (Pass|Fail|N/A or Ok|Fail|N/A) without stuffing
 * a phantom Adv column — that mis-maps Fail↔Adv and N/A↔Fail.
 */
export function inferColumnOrder(
  headerText?: string
): Exclude<ChecklistChoice, "UNREADABLE">[] {
  if (!headerText?.trim()) return [...CHECKLIST_COLUMNS];

  const found: Array<{
    choice: Exclude<ChecklistChoice, "UNREADABLE">;
    index: number;
  }> = [];
  for (const { choice, re } of HEADER_PATTERNS) {
    const m = re.exec(headerText);
    if (m && m.index !== undefined) {
      found.push({ choice, index: m.index });
    }
  }
  if (found.length < 2) return [...CHECKLIST_COLUMNS];
  found.sort((a, b) => a.index - b.index);
  const ordered = found.map(f => f.choice);
  // Deduplicate while preserving left-to-right order (Pass+Ok both → Ok)
  const deduped: Exclude<ChecklistChoice, "UNREADABLE">[] = [];
  for (const col of ordered) {
    if (!deduped.includes(col)) deduped.push(col);
  }
  // Only pad to four when the header clearly names an Adv column.
  // Pass|Fail|N/A and Ok|Fail|N/A stay 3-wide.
  const headerHasAdv = /\badv\.?\b|advisor/i.test(headerText);
  if (headerHasAdv) {
    for (const col of CHECKLIST_COLUMNS) {
      if (!deduped.includes(col)) deduped.push(col);
    }
    return deduped.slice(0, 4);
  }
  return deduped.slice(0, 4);
}

/**
 * When Azure DI misses an empty Adv circle we often see 3 marks on a 4-column
 * Ok|Adv|Fail|N/A header. Indexing into the 4-name list then maps N/A → Fail.
 * Drop Adv when the physical mark count is 3 and the header includes N/A.
 */
export function alignColumnsToMarkCount(
  columns: Exclude<ChecklistChoice, "UNREADABLE">[],
  markCount: number
): Exclude<ChecklistChoice, "UNREADABLE">[] {
  if (markCount <= 0) return columns;
  if (markCount === columns.length) return columns;
  if (
    markCount === 3 &&
    columns.length === 4 &&
    columns[0] === "Ok" &&
    columns.includes("Adv") &&
    columns.includes("Fail") &&
    columns.includes("N/A")
  ) {
    return ["Ok", "Fail", "N/A"];
  }
  if (markCount < columns.length) {
    return columns.slice(0, markCount);
  }
  return columns;
}

/**
 * Adaptive Y clustering for dense / long checklists (PX-104 long-list recall).
 * Fixed 1.5% tolerance merges neighbouring rows on tall grids; shrink toward
 * the median inter-row gap when marks are dense.
 */
export function computeAdaptiveYTolerance(
  marks: AzureSelectionMark[],
  fallback = 1.5
): number {
  if (marks.length < 12) return fallback;

  const byPage = new Map<number, number[]>();
  for (const m of marks) {
    const ys = byPage.get(m.pageNumber) ?? [];
    ys.push(m.bbox.y + m.bbox.height / 2);
    byPage.set(m.pageNumber, ys);
  }

  const rowGaps: number[] = [];
  for (const ys of Array.from(byPage.values())) {
    const uniq = Array.from(new Set(ys.map(y => Math.round(y * 10) / 10))).sort(
      (a, b) => a - b
    );
    for (let i = 1; i < uniq.length; i++) {
      const gap = uniq[i] - uniq[i - 1];
      // Same-row duplicates are <0.4%; real row gaps are larger
      if (gap >= 0.45 && gap <= 8) rowGaps.push(gap);
    }
  }
  if (rowGaps.length < 4) return fallback;

  const sorted = [...rowGaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Cluster tighter than the median gap so adjacent rows do not merge
  const adaptive = Math.min(fallback, Math.max(0.55, median * 0.42));
  return adaptive;
}

/**
 * Cluster marks by Y into rows, then map X-order to Ok/Adv/Fail/N/A.
 *
 * Azure DI often emits *two* marks per radio (outline + fill) at nearly the
 * same X. We collapse those into one column before choosing Ok/Adv/Fail/N/A —
 * otherwise taking the raw rightmost-4 frequently drops the filled Ok circle
 * and every row becomes UNREADABLE.
 */
export function mapSelectionMarksToRows(
  marks: AzureSelectionMark[],
  options: {
    headerText?: string;
    yTolerancePercent?: number;
    xTolerancePercent?: number;
    lines?: AzureTextLine[];
    /** When true (default), tighten Y clustering on dense long lists. */
    adaptiveYTolerance?: boolean;
  } = {}
): SelectionMarkRow[] {
  if (marks.length === 0) return [];

  const yTol =
    options.yTolerancePercent ??
    (options.adaptiveYTolerance === false
      ? 1.5
      : computeAdaptiveYTolerance(marks, 1.5));
  const xTol = options.xTolerancePercent ?? 1.5;
  const columns = inferColumnOrder(options.headerText);
  const lines = options.lines ?? [];

  // Sort by page, then Y, then X
  const sorted = [...marks].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (Math.abs(a.bbox.y - b.bbox.y) > yTol) return a.bbox.y - b.bbox.y;
    return a.bbox.x - b.bbox.x;
  });

  const clusters: AzureSelectionMark[][] = [];
  for (const mark of sorted) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      last[0].pageNumber === mark.pageNumber &&
      Math.abs(last[0].bbox.y - mark.bbox.y) <= yTol
    ) {
      last.push(mark);
    } else {
      clusters.push([mark]);
    }
  }

  const rows: SelectionMarkRow[] = [];
  let rowIndex = 0;

  for (const cluster of clusters) {
    // Skip sparse clusters that aren't checklist radio rows (need ≥2 marks)
    if (cluster.length < 2) continue;

    const marksForCols = collapseMarksToColumns(cluster, xTol);
    // Need at least 2 columns to be a radio row
    if (marksForCols.length < 2) continue;
    // Prefer the rightmost 4 columns when extras exist (status cols on right)
    const colMarks =
      marksForCols.length > 4
        ? marksForCols.slice(marksForCols.length - 4)
        : marksForCols;

    const selected = colMarks.filter(m => m.state === "selected");
    const pageNumber = colMarks[0].pageNumber;
    const avgConf =
      colMarks.reduce((s, m) => s + m.confidence, 0) / colMarks.length;
    const rowColumns = alignColumnsToMarkCount(columns, colMarks.length);

    let choice: ChecklistChoice = "UNREADABLE";
    let bbox = unionBBox(colMarks);

    if (selected.length === 1 && colMarks.length >= 2) {
      const selIdx = colMarks.indexOf(selected[0]);
      if (colMarks.length === 4 || colMarks.length === 3) {
        choice = rowColumns[selIdx] ?? "UNREADABLE";
      } else {
        choice =
          selIdx === 0
            ? rowColumns[0]
            : (rowColumns[rowColumns.length - 1] ?? "UNREADABLE");
      }
      bbox = selected[0].bbox;
    } else if (selected.length > 1) {
      // Prefer a clearly dominant selected mark (ink bleed / duplicate)
      const byConf = [...selected].sort((a, b) => b.confidence - a.confidence);
      if (
        byConf.length >= 2 &&
        byConf[0].confidence >= byConf[1].confidence + 15
      ) {
        const selIdx = colMarks.indexOf(byConf[0]);
        choice = rowColumns[selIdx] ?? "UNREADABLE";
        bbox = byConf[0].bbox;
      } else {
        choice = "UNREADABLE";
      }
    } else {
      choice = "UNREADABLE";
    }

    const rowY =
      colMarks.reduce((s, m) => s + m.bbox.y + m.bbox.height / 2, 0) /
      colMarks.length;
    const minMarkX = Math.min(...colMarks.map(m => m.bbox.x));
    const label = findRowLabel(lines, pageNumber, rowY, minMarkX, yTol);

    rows.push({
      rowIndex: rowIndex++,
      pageNumber,
      label,
      choice,
      confidence: Math.round(avgConf),
      bbox,
      selectedCount: selected.length,
      markCount: colMarks.length,
    });
  }

  return rows;
}

/**
 * Collapse near-duplicate X positions into one mark per radio column.
 * Prefer a `selected` mark within the column; else highest confidence.
 */
export function collapseMarksToColumns(
  marks: AzureSelectionMark[],
  xTolPercent = 1.5
): AzureSelectionMark[] {
  const byX = [...marks].sort((a, b) => a.bbox.x - b.bbox.x);
  const groups: AzureSelectionMark[][] = [];
  for (const mark of byX) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].bbox.x - mark.bbox.x) <= xTolPercent) {
      last.push(mark);
    } else {
      groups.push([mark]);
    }
  }

  return groups.map(group => {
    const selected = group.filter(m => m.state === "selected");
    if (selected.length > 0) {
      return [...selected].sort((a, b) => b.confidence - a.confidence)[0];
    }
    return [...group].sort((a, b) => b.confidence - a.confidence)[0];
  });
}

/** Nearest text line left of the radio columns, same vertical band. */
function findRowLabel(
  lines: AzureTextLine[],
  pageNumber: number,
  rowY: number,
  minMarkX: number,
  yTol: number
): string | undefined {
  const candidates = lines.filter(
    l =>
      l.pageNumber === pageNumber &&
      l.xPercent < minMarkX - 1 &&
      Math.abs(l.yPercent - rowY) <= yTol * 2 &&
      !/^(ok|adv\.?|fail|n\/?a)$/i.test(l.content.trim()) &&
      l.content.length > 8
  );
  if (candidates.length === 0) return undefined;
  candidates.sort(
    (a, b) => Math.abs(a.yPercent - rowY) - Math.abs(b.yPercent - rowY)
  );
  return candidates[0].content.slice(0, 120);
}

function unionBBox(marks: AzureSelectionMark[]): SelectionMarkRow["bbox"] {
  if (marks.length === 0) return undefined;
  const minX = Math.min(...marks.map(m => m.bbox.x));
  const minY = Math.min(...marks.map(m => m.bbox.y));
  const maxX = Math.max(...marks.map(m => m.bbox.x + m.bbox.width));
  const maxY = Math.max(...marks.map(m => m.bbox.y + m.bbox.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    coordinateSpace: "percent",
  };
}

export function formatSelectionMarksHints(rows: SelectionMarkRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map(r => {
    const label = r.label ? ` "${r.label}"` : ` row ${r.rowIndex + 1}`;
    return `- Checklist${label}: ${r.choice} (confidence=${r.confidence}, page=${r.pageNumber}, marks=${r.markCount}, selected=${r.selectedCount})`;
  });
  return `## Selection Marks (Azure DI — visual ground truth)
These are radio/checkbox states detected from the page image / custom form model, not OCR text alone.
Treat high-confidence choices as authoritative for Ok/Adv/Fail/N/A columns.
Do NOT contradict a selected mark using text alone.

${lines.join("\n")}`;
}

export function buildSelectionMarksArtifact(
  marks: AzureSelectionMark[],
  meta: {
    model: string;
    processingTimeMs: number;
    headerText?: string;
    lines?: AzureTextLine[];
    error?: string;
    engineVersion?: string;
    customVoter?: SelectionMarksArtifact["customVoter"];
    /** Prefer these rows over geometry-mapped marks when provided. */
    preferredRows?: SelectionMarkRow[];
  }
): SelectionMarksArtifact {
  const rows =
    meta.preferredRows && meta.preferredRows.length > 0
      ? meta.preferredRows
      : mapSelectionMarksToRows(marks, {
          headerText: meta.headerText,
          lines: meta.lines,
        });
  const readableRows = rows.filter(r => r.choice !== "UNREADABLE").length;
  return {
    engineVersion: meta.engineVersion ?? ENGINE_VERSION,
    model: meta.model,
    processingTimeMs: meta.processingTimeMs,
    rows,
    summary: {
      rowsDetected: rows.length,
      readableRows,
      unreadableRows: rows.length - readableRows,
      marksDetected: marks.length,
    },
    error: meta.error,
    ...(meta.customVoter ? { customVoter: meta.customVoter } : {}),
  };
}

export function artifactToResult(
  artifact: SelectionMarksArtifact,
  options?: {
    layoutText?: string;
    lines?: AzureTextLine[];
    selectionMarks?: AzureSelectionMark[];
    /** Extra GoldSpec fields from custom JSR voter (merged under layout). */
    extraPreExtractedFields?: Record<
      string,
      { value: string; confidence: number; pageNumber: number }
    >;
  }
): SelectionMarksResult {
  const hintsBlock = formatSelectionMarksHints(artifact.rows);
  const preExtractedFields: SelectionMarksResult["preExtractedFields"] = {
    ...(options?.extraPreExtractedFields ?? {}),
  };

  // Aggregate: if any Fail selected → surface; else summarise readable choices
  const readable = artifact.rows.filter(r => r.choice !== "UNREADABLE");
  if (readable.length > 0) {
    const fails = readable.filter(r => r.choice === "Fail");
    const value =
      fails.length > 0
        ? `Fail (${fails.length}/${readable.length} rows)`
        : readable.map(r => r.choice).join(", ");
    const avgConf = Math.round(
      readable.reduce((s, r) => s + r.confidence, 0) / readable.length
    );
    preExtractedFields.complianceTickboxes = {
      value: value.slice(0, 200),
      confidence: avgConf,
      pageNumber: readable[0].pageNumber,
    };
  }

  return {
    artifact,
    hintsBlock,
    preExtractedFields,
    ...(options?.extraPreExtractedFields
      ? { customPreExtractedFields: options.extraPreExtractedFields }
      : {}),
    ...(options?.layoutText ? { layoutText: options.layoutText } : {}),
    ...(options?.lines?.length ? { lines: options.lines } : {}),
    ...(options?.selectionMarks?.length
      ? { selectionMarks: options.selectionMarks }
      : {}),
  };
}

/**
 * Convert custom neural checklist_* choices into SelectionMarkRow shape.
 */
export function customChoicesToSelectionRows(
  choices: AzureCustomFormExtractResult["checklistChoices"]
): SelectionMarkRow[] {
  return choices.map((c, i) => ({
    rowIndex: i,
    pageNumber: c.pageNumber,
    label: c.label,
    choice: c.choice,
    confidence: c.confidence,
    selectedCount: c.choice === "UNREADABLE" ? 0 : 1,
    markCount: 1,
  }));
}

/**
 * Vote between layout geometry rows and custom neural checklist fields.
 * Prefer custom when it yields ≥1 readable row and average confidence ≥ layout
 * (or layout produced no readable rows). Otherwise keep layout geometry.
 */
export function voteChecklistRows(
  layoutRows: SelectionMarkRow[],
  customRows: SelectionMarkRow[]
): {
  rows: SelectionMarkRow[];
  preferredSource: "layout" | "custom" | "merged";
} {
  const layoutReadable = layoutRows.filter(r => r.choice !== "UNREADABLE");
  const customReadable = customRows.filter(r => r.choice !== "UNREADABLE");

  if (customReadable.length === 0) {
    return { rows: layoutRows, preferredSource: "layout" };
  }
  if (layoutReadable.length === 0) {
    return { rows: customRows, preferredSource: "custom" };
  }

  const avg = (rows: SelectionMarkRow[]) =>
    rows.reduce((s, r) => s + r.confidence, 0) / rows.length;

  if (avg(customReadable) >= avg(layoutReadable) - 2) {
    // Prefer form-trained labels; keep layout rows that custom did not cover
    // when custom row count is thinner than layout.
    if (customReadable.length >= layoutReadable.length) {
      return { rows: customRows, preferredSource: "custom" };
    }
    return { rows: customRows, preferredSource: "merged" };
  }

  return { rows: layoutRows, preferredSource: "layout" };
}

/**
 * Convert visual checklist rows into first-class audit findings.
 * Fail → S1 OUT_OF_POLICY; UNREADABLE → S2 LOW_CONFIDENCE.
 * Ok/Adv/N/A are passed/advisory — captured on the artifact only (no finding;
 * reasonCode stays absent so confidence analytics are not polluted).
 */
export function buildSelectionMarkFindings(
  rows: SelectionMarkRow[]
): Finding[] {
  const findings: Finding[] = [];
  for (const row of rows) {
    const label = row.label || `Checklist row ${row.rowIndex + 1}`;
    const fieldName = `checklist:${row.choice}:${row.rowIndex + 1}`;
    const bbox = row.bbox
      ? {
          x: row.bbox.x,
          y: row.bbox.y,
          width: row.bbox.width,
          height: row.bbox.height,
        }
      : undefined;

    if (row.choice === "Fail") {
      if (row.confidence < FAIL_CONFIDENCE_THRESHOLD) continue;
      findings.push({
        ruleId: "SELECTION_MARKS",
        fieldName,
        severity: "S1",
        reasonCode: "OUT_OF_POLICY",
        rawSnippet: label,
        normalisedSnippet: "Fail",
        confidence: row.confidence,
        pageNumber: row.pageNumber,
        boundingBox: bbox,
        whyItMatters: `Visual checklist marked Fail for "${label}". Detected from radio/checkbox marks (not OCR text).`,
        suggestedFix:
          "Confirm the Fail mark on the document and remediate or escalate per policy.",
      });
      continue;
    }

    if (row.choice === "UNREADABLE") {
      findings.push({
        ruleId: "SELECTION_MARKS",
        fieldName,
        severity: "S2",
        reasonCode: "LOW_CONFIDENCE",
        rawSnippet: label,
        normalisedSnippet: "UNREADABLE",
        confidence: row.confidence,
        pageNumber: row.pageNumber,
        boundingBox: bbox,
        whyItMatters: `Visual checklist row "${label}" could not be read (none/multiple marks selected).`,
        suggestedFix:
          "Inspect the Ok/Adv/Fail/N/A circles on the document and confirm the intended selection.",
      });
      continue;
    }

    // Ok / Adv / N/A — healthy marks; omit findings (no defect reason code).
  }
  return findings;
}

/**
 * Ensure Fail/UNREADABLE/Ok visual rows are present even if Gemini omitted them.
 */
export function reconcileSelectionMarksWithJudgment(
  findings: Finding[],
  artifact: SelectionMarksArtifact | undefined | null
): Finding[] {
  if (!artifact?.rows?.length) return findings;
  const markFindings = buildSelectionMarkFindings(artifact.rows);
  const existingKeys = new Set(
    findings.map(f => `${f.ruleId}::${f.fieldName}::${f.normalisedSnippet}`)
  );
  const injected = markFindings.filter(
    f =>
      !existingKeys.has(`${f.ruleId}::${f.fieldName}::${f.normalisedSnippet}`)
  );
  if (injected.length === 0) return findings;
  return [...findings, ...injected];
}

/** True when any high-confidence Fail mark should block auto-PASS. */
export function hasBlockingFailMarks(
  artifact: SelectionMarksArtifact | undefined | null,
  minConfidence = FAIL_CONFIDENCE_THRESHOLD
): boolean {
  return countHighConfidenceFailMarks(artifact, minConfidence) > 0;
}

/**
 * Count Fail marks that are confident enough to drive failure-path QA.
 * Low-confidence empty Fail-column circles (common on Ok/Adv/Fail/N/A grids)
 * must not invent FailMarks=N and force Return Visit / unsafe conflicts.
 */
export function countHighConfidenceFailMarks(
  artifact: SelectionMarksArtifact | undefined | null,
  minConfidence = FAIL_CONFIDENCE_THRESHOLD
): number {
  if (!artifact?.rows) return 0;
  return artifact.rows.filter(
    r => r.choice === "Fail" && r.confidence >= minConfidence
  ).length;
}

/**
 * Enrich radio-mapped rows with Result-column / Obs. text readers (PX-104).
 * Pure helper — also used by contract tests without Azure HTTP.
 */
export function enrichRowsWithTextChecklistReaders(
  radioRows: SelectionMarkRow[],
  options: {
    lines?: AzureTextLine[];
    pageLayouts?: EmbeddedPdfPageLayout[];
  } = {}
): {
  rows: SelectionMarkRow[];
  textRowsAdded: number;
  resultRowCount: number;
  obsRowCount: number;
  radioColumnRowCount: number;
  preferredSource:
    | "layout"
    | "result_column"
    | "obs_marks"
    | "radio_column"
    | "merged";
} {
  const resultRows = readResultColumnRows({
    lines: options.lines,
    pageLayouts: options.pageLayouts,
  });
  const obsRows = readObsMarkRows({
    lines: options.lines,
    pageLayouts: options.pageLayouts,
  });
  // PX-106: Ok/Adv/Fail/N/A radio grid rendered as text glyphs, not Azure DI
  // selectionMarks — only needed when the visual radio pass found nothing.
  const radioColumnRows =
    radioRows.filter(r => r.choice !== "UNREADABLE").length === 0
      ? readRadioColumnRows({
          lines: options.lines,
          pageLayouts: options.pageLayouts,
        })
      : [];
  const merged = mergeChecklistRowSources({
    radioRows,
    resultRows,
    obsRows,
    radioColumnRows,
  });
  return {
    rows: merged.rows,
    textRowsAdded: merged.textRowsAdded,
    resultRowCount: resultRows.length,
    obsRowCount: obsRows.length,
    radioColumnRowCount: radioColumnRows.length,
    preferredSource: merged.preferredSource,
  };
}

/**
 * Run layout selection-mark detection for a document URL (fail-soft).
 * When the Azure DI custom JSR model is gated on, runs it as a parallel voter
 * for checklist rows + structured fields.
 * Also merges Result-column / Obs. ✓✗ text readers (PX-104).
 * Returns null when disabled, not configured, or timed out; never throws.
 */
export async function runSelectionMarkDetection(
  documentUrl: string,
  options: {
    headerText?: string;
    /** Text-layer word boxes from Stage 1 (import/use — do not re-parse). */
    pageLayouts?: EmbeddedPdfPageLayout[];
  } = {}
): Promise<SelectionMarksResult | null> {
  if (!isSelectionMarksEnabled()) return null;

  try {
    const layoutPromise = extractLayoutSelectionMarks(documentUrl);
    const customPromise = isAzureCustomJsrEnabled()
      ? extractCustomJsrForm(documentUrl)
      : Promise.resolve(null);

    const [layout, custom] = await Promise.all([layoutPromise, customPromise]);

    if (
      !layout.success &&
      (layout.errorCode === "AZURE_DI_NOT_CONFIGURED" ||
        layout.errorCode === "AZURE_DI_TIMEOUT") &&
      !(custom && custom.success) &&
      !(options.pageLayouts && options.pageLayouts.length > 0)
    ) {
      console.warn(
        `[SelectionMarks] skipped: ${layout.errorCode} — ${layout.error}`
      );
      return null;
    }

    const headerText =
      options.headerText ||
      layout.pages
        .map(p => p.markdown)
        .join("\n")
        .slice(0, 4000);

    const marks =
      layout.selectionMarks.length > 0
        ? layout.selectionMarks
        : (custom?.selectionMarks ?? []);
    const lines =
      layout.lines.length > 0 ? layout.lines : (custom?.lines ?? []);

    const layoutRows = mapSelectionMarksToRows(marks, {
      headerText,
      lines,
    });

    let preferredRows: SelectionMarkRow[] | undefined = layoutRows;
    let preferredSource: "layout" | "custom" | "merged" = "layout";
    let engineVersion = ENGINE_VERSION;
    let model = layout.model || "prebuilt-layout";
    let customVoter: SelectionMarksArtifact["customVoter"] | undefined;
    let extraPreExtracted:
      | SelectionMarksResult["preExtractedFields"]
      | undefined;

    if (custom && custom.success) {
      const customRows = customChoicesToSelectionRows(custom.checklistChoices);
      const vote = voteChecklistRows(layoutRows, customRows);
      preferredRows = vote.rows;
      preferredSource = vote.preferredSource;
      engineVersion = ENGINE_VERSION_WITH_CUSTOM_VOTER;
      model =
        preferredSource === "layout"
          ? `${layout.model}+${custom.model}`
          : `${custom.model}+${layout.model}`;
      customVoter = {
        enabled: true,
        model: custom.model,
        docType: custom.docType,
        fieldsExtracted: custom.fields.length,
        checklistRowsFromCustom: customRows.length,
        preferredSource,
      };
      extraPreExtracted = custom.preExtractedFields;
    } else if (isAzureCustomJsrEnabled() && custom && !custom.success) {
      customVoter = {
        enabled: true,
        model: custom.model,
        fieldsExtracted: 0,
        checklistRowsFromCustom: 0,
        preferredSource: "layout",
      };
      console.warn(
        `[SelectionMarks] custom JSR voter soft-failed: ${custom.errorCode} — ${custom.error}`
      );
    }

    // PX-104: Result-column + Obs. ✓/✗ text readers (layout lines + text layer)
    const textEnrichment = enrichRowsWithTextChecklistReaders(
      preferredRows ?? layoutRows,
      {
        lines,
        pageLayouts: options.pageLayouts,
      }
    );
    if (
      textEnrichment.textRowsAdded > 0 ||
      textEnrichment.preferredSource !== "layout"
    ) {
      preferredRows = textEnrichment.rows;
      if (textEnrichment.preferredSource !== "layout") {
        preferredSource = "merged";
      }
      engineVersion =
        engineVersion === ENGINE_VERSION_WITH_CUSTOM_VOTER
          ? `${ENGINE_VERSION_WITH_CUSTOM_VOTER}+text-checklist`
          : ENGINE_VERSION_WITH_TEXT_CHECKLIST;
      if (customVoter) {
        customVoter = {
          ...customVoter,
          preferredSource: "merged",
        };
      }
    }

    const processingTimeMs = Math.max(
      layout.processingTimeMs,
      custom?.processingTimeMs ?? 0
    );

    const layoutText = layout.layoutText || custom?.layoutText;

    const artifact = buildSelectionMarksArtifact(marks, {
      model,
      processingTimeMs,
      headerText,
      lines,
      error: layout.success
        ? undefined
        : layout.error ||
          (custom && !custom.success ? custom.error : undefined),
      engineVersion,
      customVoter,
      preferredRows,
    });

    return artifactToResult(artifact, {
      layoutText,
      lines,
      selectionMarks: marks,
      extraPreExtractedFields: extraPreExtracted,
    });
  } catch (error) {
    console.warn("[SelectionMarks] fail-soft:", error);
    return artifactToResult(
      buildSelectionMarksArtifact([], {
        model: "prebuilt-layout",
        processingTimeMs: 0,
        error:
          error instanceof Error ? error.message : "selection marks failed",
      })
    );
  }
}
