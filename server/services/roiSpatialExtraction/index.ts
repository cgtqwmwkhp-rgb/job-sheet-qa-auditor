/**
 * Spatial ROI extraction — filter OCR lines / selection marks into template ROI boxes.
 * Evidence-based (no mock OCR). Coordinates: ROI bounds are 0–1; Azure lines/marks use 0–100%.
 */

import type {
  AzureSelectionMark,
  AzureTextLine,
} from "../ocrAdapter/parseAzureDiResponse";
import type { FieldSpec, RoiConfig, RoiRegion } from "../templateRegistry/types";
import {
  artifactToResult,
  buildSelectionMarksArtifact,
} from "../selectionMarks";
import { parseNumericFieldValue } from "../rangeRules";

export type PreExtractedFieldMap = Record<
  string,
  { value: string; confidence: number; pageNumber: number }
>;

export interface RoiSpatialExtractionInput {
  roiConfig: RoiConfig | null | undefined;
  lines?: AzureTextLine[];
  selectionMarks?: AzureSelectionMark[];
  fieldSpecs?: FieldSpec[];
  /** Optional header text for checklist column inference */
  headerText?: string;
}

export interface RoiSpatialExtractionResult {
  fields: PreExtractedFieldMap;
  warnings: string[];
  regionsProcessed: number;
  linesMatched: number;
}

/** ROI 0–1 bounds → percent bbox for comparison with Azure geometry. */
export function roiBoundsToPercent(bounds: RoiRegion["bounds"]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: bounds.x * 100,
    y: bounds.y * 100,
    width: bounds.width * 100,
    height: bounds.height * 100,
  };
}

/** Point-in-rect using percent coords (inclusive). */
export function pointInPercentRect(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

/** Mark center inside ROI (percent). */
export function markCenterInRoi(
  mark: AzureSelectionMark,
  region: RoiRegion
): boolean {
  if (mark.pageNumber !== region.page) return false;
  const rect = roiBoundsToPercent(region.bounds);
  const cx = mark.bbox.x + mark.bbox.width / 2;
  const cy = mark.bbox.y + mark.bbox.height / 2;
  return pointInPercentRect(cx, cy, rect);
}

export function lineInRoi(line: AzureTextLine, region: RoiRegion): boolean {
  if (line.pageNumber !== region.page) return false;
  const rect = roiBoundsToPercent(region.bounds);
  return pointInPercentRect(line.xPercent, line.yPercent, rect);
}

function humanizeFieldKey(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prefer labeled value inside region text; else first useful token. */
export function parseValueFromRegionText(
  text: string,
  fieldId: string,
  fieldSpecs?: FieldSpec[]
): string | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  const spec = fieldSpecs?.find(f => f.field === fieldId);
  const labels = Array.from(
    new Set(
      [
        fieldId,
        humanizeFieldKey(fieldId),
        spec?.label,
        ...(spec?.aliases ?? []),
        ...(spec?.extractionHints ?? []),
      ]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(s => s.length >= 2)
    )
  );

  for (const label of labels) {
    const esc = escapeRegExp(label);
    const re = new RegExp(
      `${esc}\\s*(?:\\([^)]{0,16}\\))?\\s*[:\\-]?\\s*(.+)$`,
      "i"
    );
    const m = trimmed.match(re);
    if (m?.[1]?.trim()) {
      const candidate = m[1].trim().slice(0, 200);
      if (spec?.type === "number") {
        const n = parseNumericFieldValue(candidate);
        return n != null ? String(n) : candidate;
      }
      return candidate;
    }
  }

  if (spec?.type === "number") {
    const n = parseNumericFieldValue(trimmed);
    if (n != null) return String(n);
  }

  // Fallback: whole region text, capped
  return trimmed.slice(0, 200);
}

/**
 * Map ROI region name → canonical field ids to emit.
 */
export function fieldIdsForRegion(
  region: RoiRegion,
  fieldSpecs?: FieldSpec[]
): string[] {
  if (region.fields?.length) return [...region.fields];

  if (region.name === "tickboxBlock") return ["complianceTickboxes"];
  if (region.name === "signatureBlock") {
    return ["engineerSignOff", "customerSignature"];
  }
  if (region.name === "engineerSignature") return ["engineerSignOff"];
  if (region.name === "customerSignature") return ["customerSignature"];

  const specHit = fieldSpecs?.find(
    f =>
      f.field === region.name ||
      f.label?.toLowerCase() === region.name.toLowerCase() ||
      f.aliases?.some(a => a.toLowerCase() === region.name.toLowerCase())
  );
  if (specHit) return [specHit.field];

  return [region.name];
}

/**
 * Extract pre-extracted fields by filtering layout geometry into ROI boxes.
 */
export function extractFieldsFromRoiSpatial(
  input: RoiSpatialExtractionInput
): RoiSpatialExtractionResult {
  const warnings: string[] = [];
  const fields: PreExtractedFieldMap = {};
  const regions = (input.roiConfig?.regions ?? []).filter(
    r => (r as { enabled?: boolean }).enabled !== false
  );

  if (!regions.length) {
    return { fields, warnings, regionsProcessed: 0, linesMatched: 0 };
  }

  const lines = input.lines ?? [];
  const marks = input.selectionMarks ?? [];
  let linesMatched = 0;

  if (!lines.length && !marks.length) {
    warnings.push(
      "No layout lines or selection marks available for ROI spatial extraction"
    );
    return { fields, warnings, regionsProcessed: 0, linesMatched: 0 };
  }

  for (const region of regions) {
    const targetIds = fieldIdsForRegion(region, input.fieldSpecs);
    const isTickbox =
      region.name === "tickboxBlock" ||
      targetIds.includes("complianceTickboxes");

    if (isTickbox && marks.length) {
      const filtered = marks.filter(m => markCenterInRoi(m, region));
      if (filtered.length === 0) {
        warnings.push(
          `tickboxBlock ROI matched 0 selection marks (page ${region.page})`
        );
        continue;
      }
      const artifact = buildSelectionMarksArtifact(filtered, {
        model: "roi-spatial",
        processingTimeMs: 0,
        headerText: input.headerText,
        lines: lines.filter(l => lineInRoi(l, region)),
      });
      const result = artifactToResult(artifact);
      Object.assign(fields, result.preExtractedFields);
      continue;
    }

    const matchedLines = lines.filter(l => lineInRoi(l, region));
    linesMatched += matchedLines.length;
    if (!matchedLines.length) {
      warnings.push(
        `ROI '${region.name}' matched 0 OCR lines (page ${region.page})`
      );
      continue;
    }

    const regionText = matchedLines.map(l => l.content).join("\n");
    const confidence = Math.min(
      95,
      55 + Math.min(40, matchedLines.length * 8)
    );

    for (const fieldId of targetIds) {
      if (fieldId === "complianceTickboxes") continue;
      const value = parseValueFromRegionText(
        regionText,
        fieldId,
        input.fieldSpecs
      );
      if (!value) continue;
      const existing = fields[fieldId];
      if (!existing || confidence >= existing.confidence) {
        fields[fieldId] = {
          value,
          confidence,
          pageNumber: region.page,
        };
      }
    }
  }

  return {
    fields,
    warnings,
    regionsProcessed: regions.length,
    linesMatched,
  };
}

/**
 * Merge ROI spatial fields into an existing pre-extracted map.
 * Fill gaps always; override when ROI confidence >= existing.
 */
export function mergeRoiSpatialFields(
  base: PreExtractedFieldMap,
  roiFields: PreExtractedFieldMap,
  options?: { preferRoiFor?: Set<string> }
): PreExtractedFieldMap {
  const out: PreExtractedFieldMap = { ...base };
  for (const [key, entry] of Object.entries(roiFields)) {
    const cur = out[key];
    if (!cur) {
      out[key] = entry;
      continue;
    }
    if (options?.preferRoiFor?.has(key) || entry.confidence >= cur.confidence) {
      out[key] = entry;
    }
  }
  return out;
}
