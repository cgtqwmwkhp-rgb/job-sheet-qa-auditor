/**
 * ROI quality gates (PX-105).
 *
 * Blocks activate / promote-to-live when auto-map produced oversized blobs
 * instead of tight per-field boxes.
 */

import type { RoiConfig, RoiRegion } from "../templateRegistry/types";
import type { ProposedRoiRegion } from "./roiProposeFromLayout";

/** Field-row ROIs must stay within a single printed row band. */
export const MAX_FIELD_ROI_HEIGHT = 0.08;
export const MAX_FIELD_ROI_WIDTH = 0.55;
export const MAX_FIELD_ROI_AREA = 0.12;

/** Structural bands (header / checklist / signature) have higher ceilings. */
export const MAX_STRUCTURAL_ROI_HEIGHT: Record<string, number> = {
  header: 0.14,
  /** Tall PTO/OVP compliance grids legitimately span most of a long page. */
  tickboxBlock: 0.75,
  signatureBlock: 0.2,
  engineerSignature: 0.12,
  customerSignature: 0.12,
  workDescription: 0.14,
};

/** A lone region covering this fraction of the page is a page-blob. */
export const MAX_SINGLE_BLOB_AREA = 0.25;

/** Promote/activate requires at least this many non-header field ROIs. */
export const MIN_FIELD_ROI_COUNT = 3;

export interface RoiQualityIssue {
  code:
    | "OVERSIZED_FIELD_ROI"
    | "OVERSIZED_STRUCTURAL_ROI"
    | "SINGLE_PAGE_BLOB"
    | "TOO_FEW_FIELD_ROIS";
  message: string;
  field?: string;
}

function regionArea(r: { bounds: RoiRegion["bounds"] }): number {
  return Math.max(0, r.bounds.width) * Math.max(0, r.bounds.height);
}

function isStructural(name: string): boolean {
  return name in MAX_STRUCTURAL_ROI_HEIGHT || name === "header";
}

/**
 * Pure quality check against stored / proposed ROI regions.
 */
export function assessRoiQuality(
  regions: Array<{ name: string; bounds: RoiRegion["bounds"] }>
): RoiQualityIssue[] {
  const issues: RoiQualityIssue[] = [];
  if (regions.length === 0) return issues;

  const fieldRegions = regions.filter(r => !isStructural(r.name));

  for (const r of regions) {
    const area = regionArea(r);
    const maxH = MAX_STRUCTURAL_ROI_HEIGHT[r.name];
    if (maxH != null) {
      const maxArea = r.name === "tickboxBlock" ? 0.72 : 0.5;
      if (r.bounds.height > maxH + 1e-6 || area > maxArea) {
        issues.push({
          code: "OVERSIZED_STRUCTURAL_ROI",
          message: `ROI '${r.name}' is oversized (h=${r.bounds.height.toFixed(3)}, area=${area.toFixed(3)}) — redraw tighter or re-run Suggest fields`,
          field: r.name,
        });
      }
      continue;
    }
    if (
      r.bounds.height > MAX_FIELD_ROI_HEIGHT + 1e-6 ||
      r.bounds.width > MAX_FIELD_ROI_WIDTH + 1e-6 ||
      area > MAX_FIELD_ROI_AREA + 1e-6
    ) {
      issues.push({
        code: "OVERSIZED_FIELD_ROI",
        message: `Field ROI '${r.name}' is oversized (w=${r.bounds.width.toFixed(3)}, h=${r.bounds.height.toFixed(3)}) — PX-105 expects label+value row boxes`,
        field: r.name,
      });
    }
  }

  if (regions.length <= 2) {
    const blob = regions.find(r => regionArea(r) >= MAX_SINGLE_BLOB_AREA);
    if (blob) {
      issues.push({
        code: "SINGLE_PAGE_BLOB",
        message: `Only ${regions.length} ROI(s) and '${blob.name}' covers ${(regionArea(blob) * 100).toFixed(0)}% of the page — re-run Suggest fields with text-layer geometry`,
        field: blob.name,
      });
    }
  }

  if (fieldRegions.length < MIN_FIELD_ROI_COUNT && regions.length > 0) {
    issues.push({
      code: "TOO_FEW_FIELD_ROIS",
      message: `Need at least ${MIN_FIELD_ROI_COUNT} field ROIs for promote-to-live (found ${fieldRegions.length}). Auto-map likely failed — use text-layer Suggest fields or draw manually.`,
    });
  }

  return issues;
}

export function assessRoiConfigQuality(
  roiJson?: RoiConfig | null
): RoiQualityIssue[] {
  return assessRoiQuality(roiJson?.regions ?? []);
}

/**
 * Drop oversized proposed regions before they reach the authoring canvas.
 * Prefer empty (manual draw) over a page-tall blob.
 */
export function filterOversizedProposedRegions(
  regions: ProposedRoiRegion[]
): ProposedRoiRegion[] {
  return regions.filter(r => {
    const area = regionArea(r);
    const maxH = MAX_STRUCTURAL_ROI_HEIGHT[r.name];
    if (maxH != null) {
      const maxArea = r.name === "tickboxBlock" ? 0.72 : 0.5;
      return r.bounds.height <= maxH + 1e-6 && area <= maxArea;
    }
    return (
      r.bounds.height <= MAX_FIELD_ROI_HEIGHT + 1e-6 &&
      r.bounds.width <= MAX_FIELD_ROI_WIDTH + 1e-6 &&
      area <= MAX_FIELD_ROI_AREA + 1e-6
    );
  });
}
