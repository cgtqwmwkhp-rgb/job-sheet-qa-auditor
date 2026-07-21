/**
 * LOLER Obs. ✓/✗ column reader (PX-104).
 *
 * Observation columns use tick/cross glyphs that Azure selectionMarks often
 * miss (they are text, not radio circles). Read from layout lines / text layer.
 */

import type { AzureTextLine } from "../../ocrAdapter/parseAzureDiResponse";
import type { EmbeddedPdfPageLayout } from "../../embeddedPdfText";
import {
  type ChecklistTextToken,
  type ColumnBand,
  type TextChecklistRow,
  linesToTokens,
  normalizeObsGlyph,
} from "./types";
import { pageLayoutsToTokens, tokensToLines } from "./textLayerTokens";

const OBS_HEADER_RE = /\bobs\.?\b|\bobservations?\b/i;
const GLYPH_RE = /[✓✔√✗✘×✖]/;
const SKIP_LABEL_RE =
  /^(result|results|item|description|check|task|obs\.?|observation|ok|adv\.?|fail|n\/?a)/i;

export function detectObsColumnBands(lines: AzureTextLine[]): ColumnBand[] {
  const bands: ColumnBand[] = [];
  for (const line of lines) {
    const content = line.content.trim();
    if (!OBS_HEADER_RE.test(content)) continue;
    const match = OBS_HEADER_RE.exec(content);
    const idx = match?.index ?? 0;
    const width = line.widthPercent ?? 18;
    const frac = content.length > 0 ? idx / content.length : 0.85;
    const left = line.xPercent + frac * width;
    const tokenW = Math.max(6, Math.min(16, width * 0.4));
    bands.push({
      pageNumber: line.pageNumber,
      xMin: Math.max(0, left - 2),
      xMax: Math.min(100, left + tokenW + 6),
      yPercent: line.yPercent,
      header: content.slice(0, 80),
    });
  }
  return bands;
}

function pickBand(
  bands: ColumnBand[],
  pageNumber: number
): ColumnBand | undefined {
  const onPage = bands.filter(b => b.pageNumber === pageNumber);
  if (onPage.length === 0) return undefined;
  return [...onPage].sort((a, b) => b.xMin - a.xMin)[0];
}

function extractLabel(
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
      !GLYPH_RE.test(l.content)
  );
  if (candidates.length === 0) return undefined;
  candidates.sort(
    (a, b) => Math.abs(a.yPercent - yPercent) - Math.abs(b.yPercent - yPercent)
  );
  return candidates[0].content.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Read Obs. ✓/✗ rows. Also accepts ASCII tick/cross words in the Obs band.
 */
export function readObsMarkRows(options: {
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
  const lines =
    textLines.length > layoutLines.length
      ? textLines
      : layoutLines.length > 0
        ? layoutLines
        : textLines;
  if (lines.length === 0) return [];

  const bands = detectObsColumnBands(lines);
  // Without an Obs header, still try glyph-only tokens on the right half
  const tokens: ChecklistTextToken[] = [
    ...linesToTokens(layoutLines),
    ...textTokens,
  ];

  const rows: TextChecklistRow[] = [];
  const seen = new Set<string>();

  for (const tok of tokens) {
    const glyphMatch = GLYPH_RE.exec(tok.content);
    const asciiObs =
      !glyphMatch &&
      bands.length > 0 &&
      /^(tick|cross|yes|no|y|n|ok|x)$/i.test(tok.content.trim());
    if (!glyphMatch && !asciiObs) continue;

    const band = pickBand(bands, tok.pageNumber);
    if (band) {
      if (tok.yPercent < band.yPercent - 0.5) continue;
      if (tok.xPercent < band.xMin - 6 || tok.xPercent > band.xMax + 10) {
        continue;
      }
    } else {
      // No header: only accept clear Unicode glyphs on the right side of the page
      if (!glyphMatch) continue;
      if (tok.xPercent < 55) continue;
    }

    const raw = glyphMatch ? glyphMatch[0] : tok.content.trim();
    const choice = normalizeObsGlyph(raw);
    if (choice === "UNREADABLE") continue;

    const xMax = band?.xMin ?? tok.xPercent;
    const label =
      extractLabel(lines, tok.pageNumber, tok.yPercent, xMax, yTol) ||
      `Obs row @ ${tok.yPercent.toFixed(1)}%`;

    const key = `${tok.pageNumber}|${label.toLowerCase()}|${choice}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const w = Math.max(tok.widthPercent, 3);
    const h = Math.max(tok.heightPercent, 1);
    rows.push({
      pageNumber: tok.pageNumber,
      label,
      choice,
      confidence: glyphMatch ? 90 : 80,
      yPercent: tok.yPercent,
      bbox: {
        x: Math.max(0, tok.xPercent - w / 2),
        y: Math.max(0, tok.yPercent - h / 2),
        width: w,
        height: h,
        coordinateSpace: "percent",
      },
      source: "obs_marks",
    });
  }

  rows.sort((a, b) =>
    a.pageNumber !== b.pageNumber
      ? a.pageNumber - b.pageNumber
      : a.yPercent - b.yPercent
  );
  return rows;
}
