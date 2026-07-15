/**
 * Lightweight critical-field scrape from OCR markdown for multi-engine vote.
 * Deterministic regex only — no LLM, no fake confidence.
 */

export interface ScrapedField {
  fieldId: string;
  value: string;
  /** 0–1 — capped; label-only signatures stay weak. */
  confidence: number;
  evidence: string;
}

const JOB_PATTERNS = [
  /(?:job\s*(?:number|no\.?|#|ref(?:erence)?))\s*[:.\-]?\s*([A-Z0-9][\w\-/]{2,})/i,
  /\b(?:JS|JOB)[- ]?(\d{4,})\b/i,
];

const ASSET_PATTERNS = [
  /(?:asset\s*(?:number|no\.?|id)|serial\s*(?:number|no\.?))\s*[:.\-]?\s*([A-Z0-9][\w\-/]{2,})/i,
];

const DATE_PATTERNS = [
  /(?:date\s*(?:of\s*service)?|service\s*date)\s*[:.\-]?\s*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i,
];

/**
 * Scrape critical fields from a single OCR markdown blob.
 */
export function scrapeCriticalFieldsFromText(text: string): ScrapedField[] {
  const out: ScrapedField[] = [];
  const seen = new Set<string>();

  const push = (fieldId: string, value: string, confidence: number, evidence: string) => {
    if (seen.has(fieldId)) return;
    seen.add(fieldId);
    out.push({ fieldId, value: value.trim(), confidence, evidence });
  };

  for (const p of JOB_PATTERNS) {
    const m = text.match(p);
    if (m?.[1]) {
      push("jobReference", m[1], 0.75, "ocr_regex_job");
      push("jobNumber", m[1], 0.75, "ocr_regex_job");
      break;
    }
  }

  for (const p of ASSET_PATTERNS) {
    const m = text.match(p);
    if (m?.[1]) {
      push("assetId", m[1], 0.72, "ocr_regex_asset");
      push("serialNumber", m[1], 0.72, "ocr_regex_asset");
      break;
    }
  }

  for (const p of DATE_PATTERNS) {
    const m = text.match(p);
    if (m?.[1]) {
      push("date", m[1], 0.7, "ocr_regex_date");
      push("dateOfService", m[1], 0.7, "ocr_regex_date");
      break;
    }
  }

  // Signature: label alone is label_only theater — low confidence, caller must vote with VLM
  if (
    /technician\s+signature|engineer\s+signature/i.test(text) &&
    !/not\s+signed|unsigned|no\s+signature/i.test(text)
  ) {
    push(
      "engineerSignOff",
      "Present",
      0.4,
      "Signature label found (label_only — no ink proof)"
    );
  }
  if (
    /customer\s+signature/i.test(text) &&
    !/not\s+signed|unsigned|no\s+signature/i.test(text)
  ) {
    push(
      "customerSignature",
      "Present",
      0.4,
      "Signature label found (label_only — no ink proof)"
    );
  }

  // Deep OCR signature blocks (if present as markdown markers)
  if (/type["']?\s*:\s*["']?signature/i.test(text) || /\[signature\]/i.test(text)) {
    const existing = out.find(f => f.fieldId === "engineerSignOff");
    if (existing) {
      existing.confidence = Math.max(existing.confidence, 0.7);
      existing.evidence = "ocr_signature_block";
    } else {
      push("engineerSignOff", "Present", 0.7, "ocr_signature_block");
    }
  }

  return out;
}

/**
 * Pages → joined markdown scrape.
 */
export function scrapeCriticalFieldsFromPages(
  pages: Array<{ markdown?: string }>
): ScrapedField[] {
  const text = pages.map(p => p.markdown ?? "").join("\n");
  return scrapeCriticalFieldsFromText(text);
}
