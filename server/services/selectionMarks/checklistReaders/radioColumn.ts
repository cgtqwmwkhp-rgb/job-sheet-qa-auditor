/**
 * Ok/Adv/Fail/N/A radio-column text reader (PX-106 Sprint1.5 PR-B).
 *
 * Some born-digital Job Summaries render the classic 4-column radio grid
 * header (Ok | Adv | Fail | N/A) but the "selected" mark is a text glyph
 * (X / ✓ / •) placed inside that column's word-box space rather than an
 * Azure DI selectionMark circle. Azure selectionMarks then come back empty
 * and the whole checklist grades 0/0. Read the mark from the text layer
 * instead — mirrors the Result-column / Obs. glyph readers (PX-104).
 */

import type { AzureTextLine } from "../../ocrAdapter/parseAzureDiResponse";
import type { EmbeddedPdfPageLayout } from "../../embeddedPdfText";
import {
  type ChecklistChoice,
  type ChecklistTextToken,
  type TextChecklistRow,
} from "./types";
import { pageLayoutsToTokens } from "./textLayerTokens";

type RadioChoice = Exclude<ChecklistChoice, "UNREADABLE">;

const HEADER_TOKEN_RE =
  /^(ok|pass|adv\.?|advisory|fail|n\/?a|not\s*applicable)$/i;
const GLYPH_MARK_RE = /^[xX✓✔√•●*]+$/;
const SKIP_LABEL_RE = /^(result|results|item|description|check|task|page\s*\d+)/i;

function choiceForHeaderToken(text: string): RadioChoice | null {
  const t = text.trim().toLowerCase().replace(/\.$/, "");
  if (t === "ok" || t === "pass") return "Ok";
  if (t === "adv" || t === "advisory") return "Adv";
  if (t === "fail") return "Fail";
  if (t === "n/a" || t === "na" || t === "not applicable") return "N/A";
  return null;
}

/** Split an Azure DI line into rough per-word tokens (proportional x estimate). */
function linesToWordTokens(lines: AzureTextLine[]): ChecklistTextToken[] {
  const tokens: ChecklistTextToken[] = [];
  for (const line of lines) {
    const words = line.content.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
    const width = line.widthPercent ?? 40;
    let cursorChars = 0;
    for (const w of words) {
      const frac = cursorChars / totalChars;
      const wFrac = w.length / totalChars;
      tokens.push({
        pageNumber: line.pageNumber,
        content: w,
        xPercent: line.xPercent + (frac + wFrac / 2) * width,
        yPercent: line.yPercent,
        widthPercent: Math.max(1, wFrac * width),
        heightPercent: line.heightPercent ?? 1.2,
      });
      cursorChars += w.length + 1;
    }
  }
  return tokens;
}

export interface RadioColumnBand {
  choice: RadioChoice;
  pageNumber: number;
  xMin: number;
  xMax: number;
  yPercent: number;
}

/**
 * Detect an Ok|Adv|Fail|N/A (or 3-column Pass|Fail|N/A) header row and
 * derive per-column x-bands from the header token positions.
 */
export function detectRadioColumnBands(
  tokens: ChecklistTextToken[]
): RadioColumnBand[] {
  const byPage = new Map<number, ChecklistTextToken[]>();
  for (const tok of tokens) {
    const list = byPage.get(tok.pageNumber) ?? [];
    list.push(tok);
    byPage.set(tok.pageNumber, list);
  }

  const bands: RadioColumnBand[] = [];
  for (const [pageNumber, pageTokens] of Array.from(byPage.entries())) {
    const sorted = [...pageTokens].sort((a, b) => a.yPercent - b.yPercent);
    const lines: ChecklistTextToken[][] = [];
    for (const tok of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0].yPercent - tok.yPercent) <= 0.9) {
        last.push(tok);
      } else {
        lines.push([tok]);
      }
    }

    for (const line of lines) {
      const byChoice = new Map<RadioChoice, ChecklistTextToken>();
      for (const tok of line) {
        if (!HEADER_TOKEN_RE.test(tok.content.trim())) continue;
        const choice = choiceForHeaderToken(tok.content);
        if (!choice) continue;
        const existing = byChoice.get(choice);
        if (!existing || tok.xPercent < existing.xPercent) {
          byChoice.set(choice, tok);
        }
      }
      // Need ≥2 distinct columns to call this a radio-grid header row
      if (byChoice.size < 2) continue;

      const yPercent =
        line.reduce((s, t) => s + t.yPercent, 0) / Math.max(line.length, 1);
      const ordered = Array.from(byChoice.entries()).sort(
        (a, b) => a[1].xPercent - b[1].xPercent
      );
      for (let i = 0; i < ordered.length; i++) {
        const [choice, tok] = ordered[i];
        const prevX = i > 0 ? ordered[i - 1][1].xPercent : undefined;
        const nextX =
          i < ordered.length - 1 ? ordered[i + 1][1].xPercent : undefined;
        const xMin =
          prevX !== undefined ? (prevX + tok.xPercent) / 2 : tok.xPercent - 6;
        const xMax =
          nextX !== undefined ? (tok.xPercent + nextX) / 2 : tok.xPercent + 6;
        bands.push({ choice, pageNumber, xMin, xMax, yPercent });
      }
    }
  }
  return bands;
}

/** Header row nearest the top of the page (grids may repeat across pages). */
function bandsForPage(
  bands: RadioColumnBand[],
  pageNumber: number
): RadioColumnBand[] {
  const onPage = bands.filter(b => b.pageNumber === pageNumber);
  if (onPage.length === 0) return [];
  const topY = Math.min(...onPage.map(b => b.yPercent));
  return onPage.filter(b => Math.abs(b.yPercent - topY) <= 0.9);
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
      !HEADER_TOKEN_RE.test(l.content.trim())
  );
  if (candidates.length === 0) return undefined;
  candidates.sort(
    (a, b) => Math.abs(a.yPercent - yPercent) - Math.abs(b.yPercent - yPercent)
  );
  return candidates[0].content.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Read Ok|Adv|Fail|N/A rows from a text-glyph radio-style grid (no Azure DI
 * selectionMarks). A row is "selected" when exactly one column band contains
 * a mark glyph (X / ✓ / • / *) in that row's Y band — ambiguous rows (0 or
 * >1 marked columns) are skipped rather than guessed.
 */
export function readRadioColumnRows(options: {
  lines?: AzureTextLine[];
  pageLayouts?: EmbeddedPdfPageLayout[];
  yTolerancePercent?: number;
}): TextChecklistRow[] {
  const yTol = options.yTolerancePercent ?? 1.4;
  const layoutLines = options.lines ?? [];
  const lineWordTokens = linesToWordTokens(layoutLines);
  const textTokens = options.pageLayouts?.length
    ? pageLayoutsToTokens(options.pageLayouts)
    : [];
  const tokens: ChecklistTextToken[] = [...lineWordTokens, ...textTokens];
  if (tokens.length === 0) return [];

  const bands = detectRadioColumnBands(tokens);
  if (bands.length === 0) return [];

  const byPage = new Map<number, ChecklistTextToken[]>();
  for (const tok of tokens) {
    const list = byPage.get(tok.pageNumber) ?? [];
    list.push(tok);
    byPage.set(tok.pageNumber, list);
  }

  const rows: TextChecklistRow[] = [];
  const seen = new Set<string>();

  for (const [pageNumber, pageTokens] of Array.from(byPage.entries())) {
    const pageBands = bandsForPage(bands, pageNumber);
    if (pageBands.length < 2) continue;
    const headerY = pageBands[0].yPercent;

    const glyphTokens = pageTokens
      .filter(t => t.yPercent > headerY + 0.5)
      .filter(t => GLYPH_MARK_RE.test(t.content.trim()))
      .sort((a, b) => a.yPercent - b.yPercent);

    const rowClusters: ChecklistTextToken[][] = [];
    for (const tok of glyphTokens) {
      const last = rowClusters[rowClusters.length - 1];
      if (last && Math.abs(last[0].yPercent - tok.yPercent) <= yTol) {
        last.push(tok);
      } else {
        rowClusters.push([tok]);
      }
    }

    for (const cluster of rowClusters) {
      const rowY =
        cluster.reduce((s, t) => s + t.yPercent, 0) / cluster.length;
      const hitBands = pageBands.filter(b =>
        cluster.some(t => t.xPercent >= b.xMin && t.xPercent <= b.xMax)
      );
      // Exactly one marked column → readable; 0 or >1 → skip (no guessing)
      if (hitBands.length !== 1) continue;
      const band = hitBands[0];
      const mark = cluster.find(
        t => t.xPercent >= band.xMin && t.xPercent <= band.xMax
      );
      if (!mark) continue;

      const label =
        extractLabelLeftOf(layoutLines, pageNumber, rowY, band.xMin, yTol) ||
        `Radio row @ ${rowY.toFixed(1)}%`;
      const key = `${pageNumber}|${label.toLowerCase()}|${band.choice}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        pageNumber,
        label,
        choice: band.choice,
        confidence: 86,
        yPercent: rowY,
        bbox: {
          x: Math.max(0, mark.xPercent - mark.widthPercent / 2),
          y: Math.max(0, rowY - mark.heightPercent / 2),
          width: Math.max(mark.widthPercent, 3),
          height: Math.max(mark.heightPercent, 1),
          coordinateSpace: "percent",
        },
        source: "radio_column",
      });
    }
  }

  rows.sort((a, b) =>
    a.pageNumber !== b.pageNumber
      ? a.pageNumber - b.pageNumber
      : a.yPercent - b.yPercent
  );
  return rows;
}
