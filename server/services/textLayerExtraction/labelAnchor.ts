/**
 * Label-anchor field extraction from text-layer words + bboxes.
 *
 * Finds a label (Asset No, Job ID, Date, …) then takes the value tokens to the
 * right on the same line (or immediately following in reading order). Emits
 * grounded { value, page, bbox, source: "text_layer", confidence }.
 */

import type { EmbeddedPdfPageLayout, PdfTextWord } from "../embeddedPdfText";
import type { GroundedTextLayerField, TextLayerBBox } from "./types";

export interface LabelFieldSpec {
  fieldId: string;
  /** Alias field ids to also populate (e.g. date → dateOfService). */
  aliases?: string[];
  /** Label phrases matched case-insensitively against joined word runs. */
  labels: string[];
  /** Max horizontal gap (PDF units) from label end to value start. */
  maxGapX?: number;
  /** Relative line tolerance vs label height. */
  lineTolFactor?: number;
  /** Value validator — reject junk. */
  accept?: (value: string) => boolean;
}

const DATE_RE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const ISO_DATE_RE = /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/;

export const JOB_SUMMARY_LABEL_SPECS: LabelFieldSpec[] = [
  {
    fieldId: "assetId",
    aliases: ["serialNumber"],
    labels: ["asset no", "asset no.", "asset number", "asset id", "asset #"],
    accept: v => /^[A-Z0-9][A-Z0-9/_-]{1,24}$/i.test(v),
  },
  {
    fieldId: "jobReference",
    aliases: ["jobNumber"],
    labels: [
      "job id",
      "job id:",
      "job no",
      "job no.",
      "job number",
      "job ref",
      "job reference",
    ],
    accept: v => /^[A-Z0-9][A-Z0-9/_-]{1,24}$/i.test(v),
  },
  {
    fieldId: "date",
    aliases: ["dateOfService"],
    // Prefer exact "Date" / "Date:" — not "Next Service Date"
    labels: ["date:", "date"],
    accept: v => DATE_RE.test(v) || ISO_DATE_RE.test(v),
  },
  {
    fieldId: "makeModel",
    labels: ["make/model", "make / model", "make model"],
    accept: v => v.length >= 2 && v.length <= 80,
  },
  {
    fieldId: "customerName",
    labels: ["customer:", "customer"],
    accept: v => v.length >= 2 && v.length <= 120,
  },
  {
    fieldId: "technicianName",
    labels: ["technician name", "engineer name", "technician:", "engineer:"],
    accept: v => v.length >= 2 && v.length <= 80 && !/signature/i.test(v),
  },
];

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function unionBox(words: PdfTextWord[]): TextLayerBBox {
  const page = words[0]?.page ?? 1;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of words) {
    minX = Math.min(minX, w.x);
    minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.width);
    maxY = Math.max(maxY, w.y + w.height);
  }
  return {
    page,
    x: Number.isFinite(minX) ? minX : 0,
    y: Number.isFinite(minY) ? minY : 0,
    width: Number.isFinite(maxX - minX) ? Math.max(maxX - minX, 1) : 1,
    height: Number.isFinite(maxY - minY) ? Math.max(maxY - minY, 1) : 1,
  };
}

/**
 * Find a contiguous word run whose joined text equals / starts with the label.
 * Prefers longer labels; rejects "Next Service Date" when looking for "Date".
 */
function findLabelRun(
  words: PdfTextWord[],
  label: string
): { start: number; end: number } | null {
  const target = normalizeLabel(label);
  if (!target) return null;
  const n = words.length;

  for (let i = 0; i < n; i++) {
    let joined = "";
    for (let j = i; j < Math.min(i + 6, n); j++) {
      joined = normalizeLabel(`${joined}${joined ? " " : ""}${words[j].text}`);
      // Strip trailing colon for comparison flexibility
      const joinedBare = joined.replace(/:$/, "");
      const targetBare = target.replace(/:$/, "");

      if (joinedBare === targetBare || joined === target) {
        // Reject when a longer left-context makes this a different label
        // e.g. "... Next Service Date" should not match bare "Date"
        if (targetBare === "date" || targetBare === "date:") {
          const prev = i > 0 ? normalizeLabel(words[i - 1].text) : "";
          if (
            prev === "service" ||
            prev === "next" ||
            prev === "expiry" ||
            prev === "due"
          ) {
            break;
          }
          // Also check two-token "next service"
          if (i >= 2) {
            const prev2 = normalizeLabel(
              `${words[i - 2].text} ${words[i - 1].text}`
            );
            if (prev2.includes("next service") || prev2.includes("service")) {
              // "Service Date" in "Next Service Date"
              if (prev === "service") break;
            }
          }
        }
        return { start: i, end: j };
      }
      if (!target.startsWith(joinedBare) && !target.startsWith(joined)) {
        break;
      }
    }
  }
  return null;
}

function sameLine(a: PdfTextWord, b: PdfTextWord, tol: number): boolean {
  return Math.abs(a.y - b.y) <= tol;
}

/**
 * Collect value tokens to the right of the label on the same line.
 */
function collectValueWords(
  words: PdfTextWord[],
  labelEnd: number,
  opts: { maxGapX: number; lineTol: number; stopLabels: string[] }
): PdfTextWord[] {
  const labelWord = words[labelEnd];
  if (!labelWord) return [];
  const out: PdfTextWord[] = [];
  let prevRight = labelWord.x + labelWord.width;

  for (let i = labelEnd + 1; i < words.length; i++) {
    const w = words[i];
    if (!sameLine(labelWord, w, opts.lineTol)) break;
    if (w.x < prevRight - 2) break; // not to the right
    const gap = w.x - prevRight;
    if (out.length === 0 && gap > opts.maxGapX) break;
    if (out.length > 0 && gap > opts.maxGapX * 1.5) break;

    const token = normalizeLabel(w.text.replace(/:$/, ""));
    if (opts.stopLabels.some(l => token === l || token.startsWith(l + " "))) {
      break;
    }
    // Stop at another known field label word
    if (
      /^(asset|job|make|customer|technician|engineer|compliance|location|serial|site|miles|hours)$/i.test(
        w.text.replace(/:$/, "")
      )
    ) {
      break;
    }

    out.push(w);
    prevRight = w.x + w.width;
    // Single-token IDs / dates are usually one word
    if (out.length >= 8) break;
  }
  return out;
}

function sortReadingOrder(words: PdfTextWord[]): PdfTextWord[] {
  return [...words].sort((a, b) => {
    const lineDelta = b.y - a.y;
    if (Math.abs(lineDelta) > Math.max(a.height, b.height) * 0.5) {
      return lineDelta;
    }
    return a.x - b.x;
  });
}

/**
 * Extract grounded fields from a single page layout.
 */
export function extractFieldsFromPageLayout(
  layout: EmbeddedPdfPageLayout,
  specs: LabelFieldSpec[] = JOB_SUMMARY_LABEL_SPECS
): GroundedTextLayerField[] {
  const words = sortReadingOrder(layout.words);
  if (words.length === 0) {
    // Fallback: regex on page text when boxes missing
    return extractFieldsFromPlainText(layout.text, layout.pageNumber, specs);
  }

  const stopLabels = specs.flatMap(s =>
    s.labels.map(l => normalizeLabel(l).replace(/:$/, ""))
  );
  const out: GroundedTextLayerField[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    if (seen.has(spec.fieldId)) continue;
    let best: GroundedTextLayerField | null = null;

    // Longer labels first
    const labels = [...spec.labels].sort((a, b) => b.length - a.length);
    for (const label of labels) {
      const run = findLabelRun(words, label);
      if (!run) continue;
      const lineTol =
        (spec.lineTolFactor ?? 0.6) *
        Math.max(words[run.end].height, words[run.start].height, 8);
      const valueWords = collectValueWords(words, run.end, {
        maxGapX: spec.maxGapX ?? 180,
        lineTol,
        stopLabels,
      });
      if (valueWords.length === 0) continue;

      let value = valueWords
        .map(w => w.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      // Strip leading colon leftovers
      value = value.replace(/^[:.\-]\s*/, "").trim();
      if (!value) continue;
      if (spec.accept && !spec.accept(value)) continue;

      best = {
        fieldId: spec.fieldId,
        value,
        page: layout.pageNumber,
        bbox: unionBox(valueWords),
        source: "text_layer",
        confidence: 0.98,
        label,
      };
      break;
    }

    if (best) {
      seen.add(spec.fieldId);
      out.push(best);
      for (const alias of spec.aliases ?? []) {
        if (seen.has(alias)) continue;
        seen.add(alias);
        out.push({ ...best, fieldId: alias });
      }
    }
  }

  // If date still missing, try plain-text label patterns (colon forms)
  if (!seen.has("date")) {
    const fromText = extractFieldsFromPlainText(
      layout.text,
      layout.pageNumber,
      specs.filter(s => s.fieldId === "date")
    );
    for (const f of fromText) {
      if (!seen.has(f.fieldId)) {
        seen.add(f.fieldId);
        out.push(f);
      }
    }
  }

  return out;
}

/**
 * Plain-text label:value fallback (no geometry). Still requires a label —
 * never bare date regex (PX-103).
 */
export function extractFieldsFromPlainText(
  text: string,
  pageNumber: number,
  specs: LabelFieldSpec[] = JOB_SUMMARY_LABEL_SPECS
): GroundedTextLayerField[] {
  const out: GroundedTextLayerField[] = [];
  const seen = new Set<string>();
  const normalized = text.replace(/\r\n/g, "\n");

  const patterns: Array<{
    fieldId: string;
    aliases?: string[];
    re: RegExp;
    accept?: (v: string) => boolean;
    label: string;
  }> = [
    {
      fieldId: "assetId",
      aliases: ["serialNumber"],
      re: /(?:asset\s*(?:no\.?|number|id|#))\s*[:.-]?\s*([A-Z0-9][A-Z0-9/_-]{1,24})/i,
      accept: v => /^[A-Z0-9]/i.test(v),
      label: "Asset No",
    },
    {
      fieldId: "jobReference",
      aliases: ["jobNumber"],
      re: /(?:job\s*(?:id|no\.?|number|ref(?:erence)?))\s*[:.-]?\s*([A-Z0-9][A-Z0-9/_-]{1,24})/i,
      label: "Job ID",
    },
    {
      fieldId: "date",
      aliases: ["dateOfService"],
      // Placeholder — date uses dedicated line/inline scanners below.
      re: /Date\s*[:.-]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
      accept: v => DATE_RE.test(v),
      label: "Date",
    },
    {
      fieldId: "makeModel",
      re: /(?:make\s*\/\s*model|make\s*model)\s*[:.-]?\s*([^\n]{2,80}?)(?=\s{2,}|\s+Asset\b|\s+Customer\b|\s+Location\b|\n|$)/i,
      label: "Make/Model",
    },
    {
      fieldId: "customerName",
      re: /(?:customer)\s*[:.-]\s*([^\n]{2,120}?)(?=\s{2,}|\s+Site\b|\s+Asset\b|\n|$)/i,
      label: "Customer",
    },
    {
      fieldId: "technicianName",
      re: /(?:technician\s*name|engineer\s*name)\s*[:.-]?\s*([A-Za-z][A-Za-z0-9._' -]{1,60})/i,
      label: "Technician Name",
    },
  ];

  // Safer date pattern without lookbehind (JS engines vary): line-oriented
  const dateLineRe =
    /(?:^|\n)\s*Date\s*[:.-]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i;
  // Also allow inline "Date: dd/mm/yyyy" not preceded by Service/Next/Expiry
  const dateInlineRe =
    /(?<![A-Za-z])Date\s*[:.-]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i;

  for (const spec of specs) {
    if (seen.has(spec.fieldId)) continue;
    const p = patterns.find(x => x.fieldId === spec.fieldId);
    if (!p) continue;

    let match: RegExpMatchArray | null = null;
    if (spec.fieldId === "date") {
      match = normalized.match(dateLineRe) ?? normalized.match(dateInlineRe);
      if (match) {
        // Reject Next Service Date / Expiry Date windows
        const idx = match.index ?? 0;
        const window = normalized
          .slice(Math.max(0, idx - 24), idx)
          .toLowerCase();
        if (
          window.includes("next service") ||
          window.includes("service date") ||
          window.includes("expiry") ||
          window.includes("due date")
        ) {
          // Try to find a Completion "Date:" earlier — scan all Date: hits
          const all = Array.from(
            normalized.matchAll(
              /Date\s*[:.-]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi
            )
          );
          match = null;
          for (const m of all) {
            const i = m.index ?? 0;
            const w = normalized.slice(Math.max(0, i - 24), i).toLowerCase();
            if (
              w.includes("next service") ||
              w.includes("expiry") ||
              /service\s*$/i.test(w.trim())
            ) {
              continue;
            }
            match = m;
            break;
          }
        }
      }
    } else {
      match = normalized.match(p.re);
    }

    if (!match?.[1]) continue;
    const value = match[1].trim();
    if (p.accept && !p.accept(value)) continue;
    if (spec.accept && !spec.accept(value)) continue;

    const field: GroundedTextLayerField = {
      fieldId: spec.fieldId,
      value,
      page: pageNumber,
      bbox: { page: pageNumber, x: 0, y: 0, width: 0, height: 0 },
      source: "text_layer",
      confidence: 0.95,
      label: p.label,
    };
    seen.add(spec.fieldId);
    out.push(field);
    for (const alias of spec.aliases ?? p.aliases ?? []) {
      if (seen.has(alias)) continue;
      seen.add(alias);
      out.push({ ...field, fieldId: alias });
    }
  }

  return out;
}

/**
 * Extract grounded fields across all page layouts.
 */
export function extractLabelAnchoredFields(
  pageLayouts: EmbeddedPdfPageLayout[],
  specs: LabelFieldSpec[] = JOB_SUMMARY_LABEL_SPECS
): GroundedTextLayerField[] {
  const out: GroundedTextLayerField[] = [];
  const seen = new Set<string>();
  for (const layout of pageLayouts) {
    for (const field of extractFieldsFromPageLayout(layout, specs)) {
      if (seen.has(field.fieldId)) continue;
      seen.add(field.fieldId);
      out.push(field);
    }
  }
  return out;
}

export function groundedFieldsToPreExtracted(
  fields: GroundedTextLayerField[]
): Record<string, { value: string; confidence: number; pageNumber: number }> {
  const out: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  > = {};
  for (const f of fields) {
    out[f.fieldId] = {
      value: f.value,
      confidence: Math.round(Math.min(f.confidence, 1) * 100),
      pageNumber: f.page,
    };
  }
  return out;
}
