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

/** A date-shaped run anywhere inside the candidate value (not anchored). */
const DATE_SHAPED_ANYWHERE_RE = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/;
/** Spaced date run (Winch residual): "14 07 2026 Asset n". */
const SPACED_DATE_SHAPED_RE = /\d{1,2}\s+\d{1,2}\s+\d{2,4}/;
/**
 * Another header's label text glued onto the value (no-space OCR bleed).
 * PX-112: widened to cover Make/Model and Site Address bleed on top of the
 * original Asset/Job/Serial/Customer/Technician set.
 */
const ADJACENT_LABEL_TOKEN_RE =
  /assetno|assetnumber|assetid|serialno|serialnumber|jobno|jobid|jobnumber|jobreference|customer|technician|engineer|makemodel|make|model|siteaddress|site/i;

/**
 * LOLER-style jobRef hygiene (PX-106 / Wave B PX-112): reject values where a
 * date run (slashed or spaced) sits next to an unrelated header label — e.g.
 * "12072026AssetNo", "21/07/2026Make", "14 07 2026 Asset n". Leave unread
 * rather than persist wrong adjacent text.
 */
export function isDateLabelBleedValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/\s+/g, "");
  const hasDate =
    DATE_SHAPED_ANYWHERE_RE.test(trimmed) ||
    SPACED_DATE_SHAPED_RE.test(trimmed);
  if (!hasDate) return false;
  return (
    ADJACENT_LABEL_TOKEN_RE.test(compact) ||
    /\b(asset|make|model|site|serial|customer|job)\b/i.test(trimmed)
  );
}

export interface LabelExtractOptions {
  /** Field ids text-layer examined and rejected (bleed) — FieldAuthority abstain. */
  abstainFieldIds?: Set<string>;
}

function noteAbstain(
  abstain: Set<string> | undefined,
  fieldId: string,
  aliases?: string[]
): void {
  if (!abstain) return;
  abstain.add(fieldId);
  for (const alias of aliases ?? []) abstain.add(alias);
}

/**
 * Next-field label tokens that can bleed onto the END of a value when a PDF
 * glues runs with no whitespace (or only `_`/`-`) between the value and the
 * following header label — e.g. "3031532_MAKE", "3031532MAKE" (PX-112).
 */
const NEXT_FIELD_LABEL_TOKENS = [
  "makemodel",
  "make",
  "model",
  "assetno",
  "assetnumber",
  "assetid",
  "serialno",
  "serialnumber",
  "jobno",
  "jobid",
  "jobnumber",
  "jobreference",
  "customer",
  "technician",
  "engineer",
  "siteaddress",
  "site",
  "address",
  "date",
];

/**
 * Matches a numeric/alphanumeric id with a next-field label glued onto the
 * end, optionally separated by `_`/`-`/`/`/whitespace. Requiring the head to
 * start with a digit keeps this scoped to ID-shaped values (assetId,
 * jobNumber, …) and away from ordinary words that happen to end the same way
 * (e.g. "Candidate").
 */
const NEXT_LABEL_SUFFIX_RE = new RegExp(
  `^([0-9][0-9A-Za-z]*?)[\\s_/-]*(${NEXT_FIELD_LABEL_TOKENS.join("|")})$`,
  "i"
);

/**
 * Strip a next-field label glued onto the end of an ID-shaped value with no
 * (or minimal) separator — e.g. "3031532_MAKE" → "3031532" (PX-112). Never
 * returns an empty string; falls back to the trimmed input when the whole
 * value would otherwise be consumed.
 */
export function stripLabelBleedSuffix(value: string): string {
  const trimmed = value.trim();
  const m = trimmed.match(NEXT_LABEL_SUFFIX_RE);
  if (m?.[1] && m[1].trim().length > 0) {
    return m[1].trim();
  }
  return trimmed;
}

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
    accept: v =>
      /^[A-Z0-9][A-Z0-9/_-]{1,24}$/i.test(v) && !isDateLabelBleedValue(v),
  },
  {
    fieldId: "date",
    aliases: ["dateOfService"],
    // Prefer exact "Date" / "Date:" — not "Next Service Date"
    labels: ["date:", "date", "date of examination", "inspection date"],
    accept: v => DATE_RE.test(v) || ISO_DATE_RE.test(v),
  },
  {
    fieldId: "makeModel",
    labels: [
      "make/model",
      "make / model",
      "make model",
      "make and model",
      "model",
    ],
    accept: v => v.length >= 2 && v.length <= 80,
  },
  {
    fieldId: "customerName",
    labels: ["customer:", "customer"],
    accept: v => v.length >= 2 && v.length <= 120,
  },
  {
    fieldId: "technicianName",
    labels: [
      "technician name",
      "engineer name",
      "print name",
      "technician:",
      "engineer:",
    ],
    accept: v => v.length >= 2 && v.length <= 80 && !/signature/i.test(v),
  },
];

/** Shared label-alternation source for LOLER-style date phrasing (PX-106). */
const DATE_LABEL_SRC = "(?:Date(?:\\s+of\\s+Examination)?|Inspection\\s*Date)";

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
      // Strip trailing (whitespace +) colon for comparison flexibility —
      // handles tokens like "ID :" where a space precedes the colon.
      const joinedBare = joined.replace(/\s*:\s*$/, "").trim();
      const targetBare = target.replace(/\s*:\s*$/, "").trim();

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

function isHeaderStopToken(text: string, stopLabels: string[]): boolean {
  const bare = text.replace(/\s*:\s*$/, "");
  const token = normalizeLabel(bare);
  if (stopLabels.some(l => token === l || token.startsWith(`${l} `))) {
    return true;
  }
  // Bare next-field header words (Make / Customer / …) — not mid-value text.
  return /^(asset|job|make|model|customer|technician|engineer|compliance|location|serial|site|miles|hours|signature)$/i.test(
    bare
  );
}

/**
 * Collect value tokens to the right of the label on the same line.
 */
function collectSameLineValueWords(
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

    if (isHeaderStopToken(w.text, opts.stopLabels)) {
      break;
    }

    out.push(w);
    prevRight = w.x + w.width;
    // Single-token IDs / dates are usually one word
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Wave B PX-115: when the same-line cell is empty because the next header
 * (e.g. Make) sits on the label row, collect a value from the line below
 * aligned to the label column — without discarding a real Asset No.
 */
function collectBelowLabelValueWords(
  words: PdfTextWord[],
  labelStart: number,
  labelEnd: number,
  opts: { maxGapX: number; lineTol: number; stopLabels: string[] }
): PdfTextWord[] {
  const labelWord = words[labelEnd];
  const startWord = words[labelStart] ?? labelWord;
  if (!labelWord || !startWord) return [];

  const colLeft = startWord.x;
  const colRight = labelWord.x + labelWord.width + opts.maxGapX * 0.4;
  const candidates: PdfTextWord[] = [];

  for (let i = 0; i < words.length; i++) {
    if (i >= labelStart && i <= labelEnd) continue;
    const w = words[i];
    // PDF y increases upward; visually-below ⇒ smaller y than the label line.
    const belowGap = labelWord.y - w.y;
    if (belowGap < opts.lineTol * 0.5) continue;
    if (belowGap > opts.lineTol * 8) continue;
    if (w.x + w.width < colLeft - 8) continue;
    if (w.x > colRight) continue;
    if (isHeaderStopToken(w.text, opts.stopLabels)) continue;
    candidates.push(w);
  }

  candidates.sort((a, b) => {
    const lineDelta = b.y - a.y;
    if (Math.abs(lineDelta) > Math.max(a.height, b.height) * 0.5) {
      return lineDelta;
    }
    return a.x - b.x;
  });

  const out: PdfTextWord[] = [];
  let prevRight = colLeft;
  for (const w of candidates) {
    const prev = out[out.length - 1];
    if (prev && !sameLine(prev, w, opts.lineTol)) break;
    if (out.length > 0 && w.x - prevRight > opts.maxGapX * 1.5) break;
    if (isHeaderStopToken(w.text, opts.stopLabels)) break;
    out.push(w);
    prevRight = w.x + w.width;
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Same-line first; if empty (next-label on the row), bounded below-label wrap.
 */
function collectValueWords(
  words: PdfTextWord[],
  labelStart: number,
  labelEnd: number,
  opts: { maxGapX: number; lineTol: number; stopLabels: string[] }
): PdfTextWord[] {
  const sameLineWords = collectSameLineValueWords(words, labelEnd, opts);
  if (sameLineWords.length > 0) return sameLineWords;
  return collectBelowLabelValueWords(words, labelStart, labelEnd, opts);
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
  specs: LabelFieldSpec[] = JOB_SUMMARY_LABEL_SPECS,
  options: LabelExtractOptions = {}
): GroundedTextLayerField[] {
  const words = sortReadingOrder(layout.words);
  if (words.length === 0) {
    // Fallback: regex on page text when boxes missing
    return extractFieldsFromPlainText(
      layout.text,
      layout.pageNumber,
      specs,
      options
    );
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
      const valueWords = collectValueWords(words, run.start, run.end, {
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
      value = value.replace(/^[:.-]\s*/, "").trim();
      const rawBeforeStrip = value;
      // PX-112: strip a next-field label glued onto the end (no-space bleed)
      value = stripLabelBleedSuffix(value);
      if (!value) continue;
      if (spec.accept && !spec.accept(value)) {
        if (
          isDateLabelBleedValue(value) ||
          isDateLabelBleedValue(rawBeforeStrip)
        ) {
          noteAbstain(options.abstainFieldIds, spec.fieldId, spec.aliases);
        }
        continue;
      }

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
      specs.filter(s => s.fieldId === "date"),
      options
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
  specs: LabelFieldSpec[] = JOB_SUMMARY_LABEL_SPECS,
  options: LabelExtractOptions = {}
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
      // PX-116: allow value on the next line after the label (empty-words Jetter).
      re: /(?:asset\s*(?:no\.?|number|id|#))\s*[:.-]?\s*(?:\r?\n\s*)?([A-Z0-9][A-Z0-9/_-]{1,24})/i,
      accept: v => /^[A-Z0-9]/i.test(v),
      label: "Asset No",
    },
    {
      fieldId: "jobReference",
      aliases: ["jobNumber"],
      // Capture through end-of-line so spaced date+label bleed is visible
      // to the rejector (Wave B PX-112), not only tidy ID tokens.
      // PX-116: optional newline between label and value (text-only layouts).
      re: /(?:job\s*(?:id|no\.?|number|ref(?:erence)?))\s*[:.-]?\s*(?:\r?\n\s*)?([^\n]{1,48})/i,
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
      re: /(?:make\s*(?:and|\/)?\s*model|model)\s*[:.-]?\s*([^\n]{2,80}?)(?=\s{2,}|\s+Asset\b|\s+Customer\b|\s+Location\b|\n|$)/i,
      label: "Make/Model",
    },
    {
      fieldId: "customerName",
      re: /(?:customer)\s*[:.-]\s*([^\n]{2,120}?)(?=\s{2,}|\s+Site\b|\s+Asset\b|\n|$)/i,
      label: "Customer",
    },
    {
      fieldId: "technicianName",
      re: /(?:technician\s*name|engineer\s*name|print\s*name)\s*[:.-]?\s*([A-Za-z][A-Za-z0-9._' -]{1,60})/i,
      label: "Technician Name",
    },
  ];

  // Safer date pattern without lookbehind (JS engines vary): line-oriented.
  // Also matches LOLER-style "Date of Examination" / "Inspection Date".
  const dateLineRe = new RegExp(
    `(?:^|\\n)\\s*${DATE_LABEL_SRC}\\s*[:.-]\\s*(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`,
    "i"
  );
  // Also allow inline "Date: dd/mm/yyyy" not preceded by Service/Next/Expiry
  const dateInlineRe = new RegExp(
    `(?<![A-Za-z])${DATE_LABEL_SRC}\\s*[:.-]\\s*(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`,
    "i"
  );

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
              new RegExp(
                `${DATE_LABEL_SRC}\\s*[:.-]\\s*(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`,
                "gi"
              )
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
    const raw = match[1].trim().replace(/\s+/g, " ");
    // PX-112: strip a next-field label glued onto the end (no-space bleed)
    const value = stripLabelBleedSuffix(raw);
    const rejected =
      (p.accept && !p.accept(value)) ||
      (spec.accept && !spec.accept(value)) ||
      isDateLabelBleedValue(raw) ||
      isDateLabelBleedValue(value);
    if (rejected) {
      if (isDateLabelBleedValue(raw) || isDateLabelBleedValue(value)) {
        noteAbstain(
          options.abstainFieldIds,
          spec.fieldId,
          spec.aliases ?? p.aliases
        );
      }
      continue;
    }

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
  specs: LabelFieldSpec[] = JOB_SUMMARY_LABEL_SPECS,
  options: LabelExtractOptions = {}
): GroundedTextLayerField[] {
  const out: GroundedTextLayerField[] = [];
  const seen = new Set<string>();
  for (const layout of pageLayouts) {
    for (const field of extractFieldsFromPageLayout(layout, specs, options)) {
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
