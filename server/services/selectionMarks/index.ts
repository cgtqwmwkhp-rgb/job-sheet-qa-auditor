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
 */

import type {
  AzureSelectionMark,
  AzureTextLine,
} from "../ocrAdapter/parseAzureDiResponse";
import { extractLayoutSelectionMarks } from "../ocrAdapter/azureDocumentIntelligenceAdapter";
import { getOCRConfig } from "../ocrAdapter/types";
import type { Finding } from "../analyzer";

export const FEATURE_FLAG = "FEATURE_SELECTION_MARKS";
export const ENGINE_VERSION = "selection-marks-v1";

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
  /**
   * Full page text from the Azure DI layout pass (line-concatenated markdown).
   * Richer than Mistral-flattened text for completion-grid fields.
   * Undefined when layout returned no usable text.
   */
  layoutText?: string;
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
  { choice: "Ok", re: /\bok\b/i },
  { choice: "Adv", re: /\badv\.?\b|advisor/i },
  { choice: "Fail", re: /\bfail\b/i },
  { choice: "N/A", re: /\bn\/?a\b|not\s*applicable/i },
];

/**
 * Infer column order from header line text near the top of the mark cluster.
 * Falls back to Ok|Adv|Fail|N/A left-to-right.
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
  // Ensure all four columns present
  for (const col of CHECKLIST_COLUMNS) {
    if (!ordered.includes(col)) ordered.push(col);
  }
  return ordered.slice(0, 4);
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
  } = {}
): SelectionMarkRow[] {
  if (marks.length === 0) return [];

  const yTol = options.yTolerancePercent ?? 1.5;
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

    let choice: ChecklistChoice = "UNREADABLE";
    let bbox = unionBBox(colMarks);

    if (selected.length === 1 && colMarks.length >= 2) {
      const selIdx = colMarks.indexOf(selected[0]);
      if (colMarks.length === 4 || colMarks.length === 3) {
        choice = columns[selIdx] ?? "UNREADABLE";
      } else {
        choice =
          selIdx === 0
            ? columns[0]
            : (columns[columns.length - 1] ?? "UNREADABLE");
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
        choice = columns[selIdx] ?? "UNREADABLE";
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
  return `## Selection Marks (Azure DI prebuilt-layout — visual ground truth)
These are radio/checkbox states detected from the page image, not OCR text.
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
  }
): SelectionMarksArtifact {
  const rows = mapSelectionMarksToRows(marks, {
    headerText: meta.headerText,
    lines: meta.lines,
  });
  const readableRows = rows.filter(r => r.choice !== "UNREADABLE").length;
  return {
    engineVersion: ENGINE_VERSION,
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
  };
}

export function artifactToResult(
  artifact: SelectionMarksArtifact,
  options?: { layoutText?: string }
): SelectionMarksResult {
  const hintsBlock = formatSelectionMarksHints(artifact.rows);
  const preExtractedFields: SelectionMarksResult["preExtractedFields"] = {};

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
    ...(options?.layoutText ? { layoutText: options.layoutText } : {}),
  };
}

/**
 * Convert visual checklist rows into first-class audit findings.
 * Fail → S1 OUT_OF_POLICY; UNREADABLE → S2 LOW_CONFIDENCE; Ok/Adv/N/A → S3 passed.
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

    findings.push({
      ruleId: "SELECTION_MARKS",
      fieldName,
      severity: "S3",
      reasonCode: "LOW_CONFIDENCE",
      rawSnippet: label,
      normalisedSnippet: row.choice,
      confidence: row.confidence,
      pageNumber: row.pageNumber,
      boundingBox: bbox,
      whyItMatters: `Visual checklist marked ${row.choice} for "${label}" (Azure DI selectionMarks).`,
      suggestedFix:
        "No action required unless the mark looks incorrect on the PDF.",
    });
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
 * Run layout selection-mark detection for a document URL (fail-soft).
 * Returns null when disabled, not configured, or timed out; never throws.
 */
export async function runSelectionMarkDetection(
  documentUrl: string,
  options: { headerText?: string } = {}
): Promise<SelectionMarksResult | null> {
  if (!isSelectionMarksEnabled()) return null;

  try {
    const layout = await extractLayoutSelectionMarks(documentUrl);
    if (
      !layout.success &&
      (layout.errorCode === "AZURE_DI_NOT_CONFIGURED" ||
        layout.errorCode === "AZURE_DI_TIMEOUT")
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
    const artifact = buildSelectionMarksArtifact(layout.selectionMarks, {
      model: layout.model,
      processingTimeMs: layout.processingTimeMs,
      headerText,
      lines: layout.lines,
      error: layout.success ? undefined : layout.error,
    });
    return artifactToResult(artifact, { layoutText: layout.layoutText });
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
