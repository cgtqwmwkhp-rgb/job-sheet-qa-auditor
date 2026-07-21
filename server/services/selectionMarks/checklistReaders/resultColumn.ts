/**
 * Ford-style Result-column checklist reader (PX-104).
 *
 * Many Job Summaries use a single typed Result cell (Pass/Fail/OK/N/A)
 * instead of Ok|Adv|Fail|N/A radio circles. Azure selectionMarks miss these.
 * Read Result values from layout lines or text-layer word boxes.
 */

import type { AzureTextLine } from "../../ocrAdapter/parseAzureDiResponse";
import type { EmbeddedPdfPageLayout } from "../../embeddedPdfText";
import {
  type ChecklistTextToken,
  type ColumnBand,
  type TextChecklistRow,
  linesToTokens,
  normalizeResultChoice,
} from "./types";
import { pageLayoutsToTokens, tokensToLines } from "./textLayerTokens";

const RESULT_HEADER_RE = /\bresults?\b/i;
const RADIO_HEADER_RE =
  /\b(?:ok|pass)\b[\s|/.-]*\badv\.?\b|\badv\.?\b[\s|/.-]*\bfail\b/i;
const RESULT_VALUE_RE =
  /\b(pass|fail|ok|adv\.?|n\/?a|satisfactory|unsatisfactory|sat|unsat)\b/i;
const SKIP_LABEL_RE =
  /^(result|results|item|description|check|task|obs\.?|observation|page\s*\d+)/i;

/**
 * Detect a Result column header band on each page.
 * Prefer headers that are NOT part of an Ok|Adv|Fail radio title row.
 */
export function detectResultColumnBands(lines: AzureTextLine[]): ColumnBand[] {
  const bands: ColumnBand[] = [];
  for (const line of lines) {
    const content = line.content.trim();
    if (!RESULT_HEADER_RE.test(content)) continue;
    // Skip radio-grid headers that happen to mention "result"
    if (RADIO_HEADER_RE.test(content) && /\bfail\b/i.test(content)) continue;

    const match = RESULT_HEADER_RE.exec(content);
    const idx = match?.index ?? 0;
    const width = line.widthPercent ?? 20;
    // Estimate Result token position within the line
    const frac = content.length > 0 ? idx / content.length : 0.7;
    const left = line.xPercent + frac * width;
    const tokenW = Math.max(8, Math.min(22, width * 0.35));
    bands.push({
      pageNumber: line.pageNumber,
      xMin: Math.max(0, left - 2),
      xMax: Math.min(100, left + tokenW + 4),
      yPercent: line.yPercent,
      header: content.slice(0, 80),
    });
  }
  return bands;
}

function pickBandForPage(
  bands: ColumnBand[],
  pageNumber: number
): ColumnBand | undefined {
  const onPage = bands.filter(b => b.pageNumber === pageNumber);
  if (onPage.length === 0) return undefined;
  // Prefer the rightmost Result header (status column sits on the right)
  return [...onPage].sort((a, b) => b.xMin - a.xMin)[0];
}

function tokenInBand(tok: ChecklistTextToken, band: ColumnBand): boolean {
  return tok.xPercent >= band.xMin - 1 && tok.xPercent <= band.xMax + 1;
}

function extractLabelLeftOf(
  lines: AzureTextLine[],
  pageNumber: number,
  yPercent: number,
  xMax: number,
  yTol: number
): string | undefined {
  const candidates = lines.filter(
    l =>
      l.pageNumber === pageNumber &&
      Math.abs(l.yPercent - yPercent) <= yTol &&
      l.xPercent < xMax - 2 &&
      l.content.trim().length >= 4 &&
      !SKIP_LABEL_RE.test(l.content.trim()) &&
      !RESULT_VALUE_RE.test(l.content.trim())
  );
  if (candidates.length === 0) return undefined;
  candidates.sort(
    (a, b) => Math.abs(a.yPercent - yPercent) - Math.abs(b.yPercent - yPercent)
  );
  return candidates[0].content.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Read Result-column rows from Azure DI lines and/or text-layer page layouts.
 */
export function readResultColumnRows(options: {
  lines?: AzureTextLine[];
  pageLayouts?: EmbeddedPdfPageLayout[];
  yTolerancePercent?: number;
}): TextChecklistRow[] {
  const yTol = options.yTolerancePercent ?? 1.4;
  const layoutLines = options.lines ?? [];
  const textTokens = options.pageLayouts?.length
    ? pageLayoutsToTokens(options.pageLayouts)
    : [];
  const textLines = textTokens.length > 0 ? tokensToLines(textTokens) : [];

  // Prefer the richer line set for headers/labels
  const lines =
    textLines.length > layoutLines.length
      ? textLines
      : layoutLines.length > 0
        ? layoutLines
        : textLines;
  if (lines.length === 0) return [];

  const bands = detectResultColumnBands(lines);
  if (bands.length === 0) {
    // Fallback: line-level "label … Pass/Fail" without a Result header
    return readResultFromInlineLines(lines);
  }

  const tokens: ChecklistTextToken[] = [
    ...linesToTokens(layoutLines),
    ...textTokens,
  ];

  const rows: TextChecklistRow[] = [];
  const seen = new Set<string>();

  for (const tok of tokens) {
    const valueMatch = RESULT_VALUE_RE.exec(tok.content.trim());
    if (!valueMatch) continue;
    // Whole-token or short token preferred (avoid labels containing "pass")
    const raw = valueMatch[1];
    if (
      tok.content.trim().length > 24 &&
      !/^(pass|fail|ok|n\/?a)$/i.test(tok.content.trim())
    ) {
      // Allow "Pass" alone or short cells; skip long prose
      if (!/^\s*(pass|fail|ok|adv\.?|n\/?a)\s*$/i.test(tok.content)) continue;
    }

    const band = pickBandForPage(bands, tok.pageNumber);
    if (!band) continue;
    // Value must sit in/near Result band and below the header
    if (!tokenInBand(tok, band) && tok.xPercent < band.xMin - 5) continue;
    if (tok.yPercent < band.yPercent - 0.5) continue;
    // Prefer tokens inside/near band
    if (tok.xPercent < band.xMin - 8 || tok.xPercent > band.xMax + 12) continue;

    const choice = normalizeResultChoice(raw);
    if (choice === "UNREADABLE") continue;

    const label =
      extractLabelLeftOf(
        lines,
        tok.pageNumber,
        tok.yPercent,
        band.xMin,
        yTol
      ) || `Result row @ ${tok.yPercent.toFixed(1)}%`;

    const key = `${tok.pageNumber}|${label.toLowerCase()}|${choice}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const w = Math.max(tok.widthPercent, 4);
    const h = Math.max(tok.heightPercent, 1);
    rows.push({
      pageNumber: tok.pageNumber,
      label,
      choice,
      confidence: 88,
      yPercent: tok.yPercent,
      bbox: {
        x: Math.max(0, tok.xPercent - w / 2),
        y: Math.max(0, tok.yPercent - h / 2),
        width: w,
        height: h,
        coordinateSpace: "percent",
      },
      source: "result_column",
    });
  }

  rows.sort((a, b) =>
    a.pageNumber !== b.pageNumber
      ? a.pageNumber - b.pageNumber
      : a.yPercent - b.yPercent
  );
  return rows;
}

/** Fallback when no Result header: trailing Pass/Fail on checklist-like lines. */
function readResultFromInlineLines(lines: AzureTextLine[]): TextChecklistRow[] {
  const rows: TextChecklistRow[] = [];
  const seen = new Set<string>();
  const inlineRe =
    /^(.{6,100}?)\s+[-–:]?\s*(pass|fail|ok|n\/?a|satisfactory|unsatisfactory)\s*$/i;

  for (const line of lines) {
    const m = inlineRe.exec(line.content.trim());
    if (!m) continue;
    const label = m[1].trim();
    if (SKIP_LABEL_RE.test(label) || RADIO_HEADER_RE.test(label)) continue;
    const choice = normalizeResultChoice(m[2]);
    if (choice === "UNREADABLE") continue;
    const key = `${line.pageNumber}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      pageNumber: line.pageNumber,
      label: label.slice(0, 120),
      choice,
      confidence: 82,
      yPercent: line.yPercent,
      bbox: {
        x: line.xPercent,
        y: Math.max(0, line.yPercent - 0.6),
        width: line.widthPercent ?? 40,
        height: line.heightPercent ?? 1.2,
        coordinateSpace: "percent",
      },
      source: "result_column",
    });
  }
  return rows;
}
