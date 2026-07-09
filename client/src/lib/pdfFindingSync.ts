/**
 * PDF ↔ finding sync helpers (PR-12).
 *
 * Maps audit_findings.boundingBox (PR-2 percent coordinate space) onto
 * DocumentViewer overlay boxes, and resolves page jumps for bidirectional sync.
 *
 * Viewer box shape mirrors DocumentViewer.BoundingBox (kept local so unit tests
 * do not pull react-pdf into the Node vitest environment).
 */

/** Overlay box consumed by DocumentViewer (percent 0–100). */
export interface ViewerBoundingBox {
  id: string | number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

/** Persisted / API bounding box shape from PR-2 OCR enrichment. */
export interface PercentBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace?: "percent" | string;
  page?: number;
  source?: string;
  blockType?: string;
  pageWidthPx?: number;
  pageHeightPx?: number;
}

export interface FindingSyncInput {
  id: string | number;
  pageNumber?: number | null;
  boundingBox?: unknown;
  /** Pre-normalized box from AuditResults mapping (optional). */
  box?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    label?: string;
  } | null;
  field?: string;
  fieldName?: string;
  severity?: string | null;
  status?: string | null;
  label?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  major: "#f97316",
  minor: "#eab308",
  info: "#3b82f6",
  S0: "#ef4444",
  S1: "#ef4444",
  S2: "#f97316",
  S3: "#eab308",
  missing: "#ef4444",
  warning: "#f97316",
  passed: "#22c55e",
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * True when value looks like a usable percent bbox (0–100 extents).
 * Accepts PR-2 `coordinateSpace: "percent"` and legacy x/y/width/height-only shapes.
 */
export function isValidPercentBBox(
  value: unknown
): value is PercentBoundingBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Record<string, unknown>;
  if (
    !isFiniteNumber(box.x) ||
    !isFiniteNumber(box.y) ||
    !isFiniteNumber(box.width) ||
    !isFiniteNumber(box.height)
  ) {
    return false;
  }
  if (box.width <= 0 || box.height <= 0) return false;
  if (box.coordinateSpace != null && box.coordinateSpace !== "percent") {
    return false;
  }
  return true;
}

/** Clamp a percent coordinate into a sensible overlay range. */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function severityToBoxColor(
  severity?: string | null,
  status?: string | null
): string {
  if (severity && SEVERITY_COLORS[severity]) return SEVERITY_COLORS[severity];
  if (status && SEVERITY_COLORS[status]) return SEVERITY_COLORS[status];
  return "#ef4444";
}

/**
 * Resolve the PDF page for a finding (1-based).
 * Prefers explicit pageNumber, then box.page / boundingBox.page, else null.
 */
export function resolveFindingPage(finding: FindingSyncInput): number | null {
  if (
    finding.pageNumber != null &&
    Number.isFinite(finding.pageNumber) &&
    finding.pageNumber >= 1
  ) {
    return Math.floor(finding.pageNumber);
  }
  if (finding.box?.page != null && finding.box.page >= 1) {
    return Math.floor(finding.box.page);
  }
  if (isValidPercentBBox(finding.boundingBox)) {
    const page = finding.boundingBox.page;
    if (page != null && Number.isFinite(page) && page >= 1) {
      return Math.floor(page);
    }
  }
  return null;
}

/**
 * Map a finding (+ PR-2 percent bbox) to a DocumentViewer overlay box.
 * Returns null when no usable bbox is present.
 */
export function findingToViewerBox(
  finding: FindingSyncInput
): ViewerBoundingBox | null {
  const fromNormalized = finding.box;
  const fromApi = isValidPercentBBox(finding.boundingBox)
    ? finding.boundingBox
    : null;

  const source = fromNormalized ?? fromApi;
  if (!source) return null;

  const page =
    resolveFindingPage(finding) ??
    ("page" in source && typeof source.page === "number" ? source.page : 1);

  if (!Number.isFinite(page) || page < 1) return null;

  const label =
    finding.label ||
    finding.field ||
    finding.fieldName ||
    fromNormalized?.label ||
    undefined;

  return {
    id: finding.id,
    page: Math.floor(page),
    x: clampPercent(source.x),
    y: clampPercent(source.y),
    width: clampPercent(source.width),
    height: clampPercent(source.height),
    color:
      fromNormalized?.color ||
      severityToBoxColor(finding.severity, finding.status),
    label,
  };
}

/** Build viewer boxes for all findings that have percent bboxes. */
export function findingsToViewerBoxes(
  findings: FindingSyncInput[]
): ViewerBoundingBox[] {
  const boxes: ViewerBoundingBox[] = [];
  for (const finding of findings) {
    const box = findingToViewerBox(finding);
    if (box) boxes.push(box);
  }
  return boxes;
}

/**
 * Result of selecting a finding for PDF sync:
 * - activeBoxId always set
 * - focusPage set when a page can be resolved (for DocumentViewer jump)
 * - hasBox indicates whether an overlay exists
 */
export function syncSelectionFromFinding(finding: FindingSyncInput | null): {
  activeBoxId: string | number | null;
  focusPage: number | null;
  hasBox: boolean;
} {
  if (!finding) {
    return { activeBoxId: null, focusPage: null, hasBox: false };
  }
  const box = findingToViewerBox(finding);
  return {
    activeBoxId: finding.id,
    focusPage: box?.page ?? resolveFindingPage(finding),
    hasBox: box != null,
  };
}

/**
 * Result of clicking a PDF overlay box: select the matching finding id
 * (caller scrolls the findings list via `finding-${id}`).
 */
export function syncSelectionFromBox(boxId: string | number): {
  activeBoxId: string | number;
} {
  return { activeBoxId: boxId };
}
