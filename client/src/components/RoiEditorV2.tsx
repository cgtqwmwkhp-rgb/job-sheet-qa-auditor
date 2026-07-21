/**
 * ROI Editor V2 Component
 *
 * PR-L/N: Enhanced ROI editor with PDF preview and usability improvements.
 * - PDF.js integration for document preview (PR-N)
 * - PDF file upload with drag-and-drop
 * - Zoom/pan controls (50-200%)
 * - Copy ROIs from previous version
 * - Pre-fill standard templates
 * - Snap-to-grid option
 * - Region enable/disable toggles
 * - ROI resize handles
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from "react";
import { PdfPreview } from "./PdfPreview";
import { ThresholdRulesPanel } from "./ThresholdRulesPanel";
import { getRoiDrawGuidance } from "./roiDrawGuidance";
import {
  ensureSpecField,
  loadRememberedRoiLabels,
  rememberRoiLabel,
} from "./roiLabelMemory";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * ROI Region type
 */
interface RoiRegion {
  name: string;
  page: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fields?: string[];
  enabled?: boolean;
}

/**
 * ROI Config type
 */
interface RoiConfig {
  regions: RoiRegion[];
}

/**
 * Built-in Draw labels — common Job Summary / job-sheet regions.
 * Spec fields and remembered custom labels append after these.
 */
const STANDARD_ROI_TYPES = [
  { id: "header", label: "Header", color: "#3b82f6", critical: false },
  {
    id: "jobReference",
    label: "Job Reference",
    color: "#10b981",
    critical: true,
  },
  { id: "assetId", label: "Asset ID", color: "#f59e0b", critical: true },
  {
    id: "serialNumber",
    label: "Serial Number",
    color: "#d97706",
    critical: false,
  },
  { id: "makeModel", label: "Make / Model", color: "#ca8a04", critical: false },
  { id: "date", label: "Date", color: "#8b5cf6", critical: true },
  { id: "expiryDate", label: "Expiry Date", color: "#ec4899", critical: true },
  {
    id: "nextServiceDate",
    label: "Next Service Date",
    color: "#d946ef",
    critical: false,
  },
  {
    id: "customerName",
    label: "Customer Name",
    color: "#db2777",
    critical: false,
  },
  {
    id: "siteAddress",
    label: "Site Address",
    color: "#be185d",
    critical: false,
  },
  {
    id: "siteContact",
    label: "Site Contact",
    color: "#9d174d",
    critical: false,
  },
  {
    id: "siteAddressContact",
    label: "Site Address / Contact",
    color: "#831843",
    critical: false,
  },
  {
    id: "engineerName",
    label: "Engineer Name",
    color: "#ea580c",
    critical: false,
  },
  {
    id: "mileageHours",
    label: "Mileage / Hours",
    color: "#c2410c",
    critical: false,
  },
  {
    id: "status",
    label: "Status / Outcome",
    color: "#b45309",
    critical: false,
  },
  // Completion Details (JSR panel)
  {
    id: "completionDetails",
    label: "Completion Details (panel)",
    color: "#7c3aed",
    critical: false,
  },
  {
    id: "complianceType",
    label: "Compliance Type",
    color: "#6d28d9",
    critical: false,
  },
  {
    id: "complianceTitle",
    label: "Compliance Title",
    color: "#5b21b6",
    critical: false,
  },
  {
    id: "serviceCompleted",
    label: "Service Completed?",
    color: "#8b5cf6",
    critical: false,
  },
  {
    id: "allWorksCompleted",
    label: "All Works Completed?",
    color: "#7c3aed",
    critical: false,
  },
  {
    id: "consumablesUsed",
    label: "Consumables Used?",
    color: "#6d28d9",
    critical: false,
  },
  {
    id: "additionalTasksComplete",
    label: "Additional Tasks Complete?",
    color: "#5b21b6",
    critical: false,
  },
  {
    id: "returnVisitNeeded",
    label: "Return Visit Needed?",
    color: "#4c1d95",
    critical: false,
  },
  {
    id: "assetSafeToUse",
    label: "Asset Safe To Use?",
    color: "#a21caf",
    critical: false,
  },
  {
    id: "jobDuration",
    label: "Job Duration",
    color: "#c026d3",
    critical: false,
  },
  { id: "overtime", label: "Overtime", color: "#d946ef", critical: false },
  { id: "travel", label: "Travel", color: "#e879f9", critical: false },
  // Measurements
  {
    id: "tyreTreadDepth",
    label: "Tyre Tread Depth",
    color: "#0d9488",
    critical: false,
  },
  {
    id: "wheelPressures",
    label: "Wheel Pressures (PSI)",
    color: "#0f766e",
    critical: false,
  },
  {
    id: "wheelNutTorque",
    label: "Wheel Nut Torque",
    color: "#115e59",
    critical: false,
  },
  {
    id: "hubNutTorque",
    label: "Hub Nut Torque",
    color: "#134e4a",
    critical: false,
  },
  // Checklist: ONE ROI for Task Description + Ok / Adv / Fail / N/A columns
  {
    id: "tickboxBlock",
    label: "Checklist grid (Ok/Adv/Fail/N/A)",
    color: "#06b6d4",
    critical: true,
  },
  {
    id: "complianceTickboxes",
    label: "Compliance checklist (alias)",
    color: "#0891b2",
    critical: false,
  },
  {
    id: "workDescription",
    label: "Work Description",
    color: "#6366f1",
    critical: false,
  },
  { id: "partsUsed", label: "Parts Used", color: "#4f46e5", critical: false },
  {
    id: "partsRequired",
    label: "Parts Required",
    color: "#4338ca",
    critical: false,
  },
  {
    id: "recommendations",
    label: "Recommendations",
    color: "#3730a3",
    critical: false,
  },
  { id: "notes", label: "Notes / Comments", color: "#312e81", critical: false },
  {
    id: "signatureBlock",
    label: "Signature Block",
    color: "#ef4444",
    critical: true,
  },
  {
    id: "engineerSignature",
    label: "Engineer Signature",
    color: "#f97316",
    critical: false,
  },
  {
    id: "customerSignature",
    label: "Customer Signature",
    color: "#84cc16",
    critical: false,
  },
] as const;

/**
 * Pre-defined ROI templates by document type
 */
const ROI_TEMPLATES: Record<string, RoiConfig> = {
  maintenance: {
    regions: [
      {
        name: "header",
        page: 1,
        bounds: { x: 0, y: 0, width: 1, height: 0.1 },
        enabled: true,
      },
      {
        name: "jobReference",
        page: 1,
        bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 },
        enabled: true,
      },
      {
        name: "assetId",
        page: 1,
        bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 },
        enabled: true,
      },
      {
        name: "date",
        page: 1,
        bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 },
        enabled: true,
      },
      {
        name: "workDescription",
        page: 1,
        bounds: { x: 0.05, y: 0.2, width: 0.9, height: 0.4 },
        enabled: true,
      },
      {
        name: "signatureBlock",
        page: 1,
        bounds: { x: 0, y: 0.85, width: 1, height: 0.15 },
        enabled: true,
      },
    ],
  },
  inspection: {
    regions: [
      {
        name: "header",
        page: 1,
        bounds: { x: 0, y: 0, width: 1, height: 0.1 },
        enabled: true,
      },
      {
        name: "jobReference",
        page: 1,
        bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 },
        enabled: true,
      },
      {
        name: "assetId",
        page: 1,
        bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 },
        enabled: true,
      },
      {
        name: "date",
        page: 1,
        bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 },
        enabled: true,
      },
      {
        name: "expiryDate",
        page: 1,
        bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 },
        enabled: true,
      },
      {
        name: "tickboxBlock",
        page: 1,
        bounds: { x: 0.05, y: 0.25, width: 0.9, height: 0.4 },
        enabled: true,
      },
      {
        name: "signatureBlock",
        page: 1,
        bounds: { x: 0, y: 0.85, width: 1, height: 0.15 },
        enabled: true,
      },
    ],
  },
  installation: {
    regions: [
      {
        name: "header",
        page: 1,
        bounds: { x: 0, y: 0, width: 1, height: 0.12 },
        enabled: true,
      },
      {
        name: "jobReference",
        page: 1,
        bounds: { x: 0.05, y: 0.12, width: 0.4, height: 0.05 },
        enabled: true,
      },
      {
        name: "assetId",
        page: 1,
        bounds: { x: 0.5, y: 0.12, width: 0.45, height: 0.05 },
        enabled: true,
      },
      {
        name: "date",
        page: 1,
        bounds: { x: 0.05, y: 0.2, width: 0.3, height: 0.04 },
        enabled: true,
      },
      {
        name: "engineerSignature",
        page: 1,
        bounds: { x: 0, y: 0.75, width: 0.5, height: 0.12 },
        enabled: true,
      },
      {
        name: "customerSignature",
        page: 1,
        bounds: { x: 0.5, y: 0.75, width: 0.5, height: 0.12 },
        enabled: true,
      },
    ],
  },
};

interface RoiEditorV2Props {
  /** Initial ROI configuration */
  initialRoi?: RoiConfig;
  /** Previous version ROI to copy from */
  previousVersionRoi?: RoiConfig;
  /** PDF URL for preview (if available) */
  pdfUrl?: string;
  /** PDF data for preview (ArrayBuffer) */
  pdfData?: ArrayBuffer;
  /** Callback when ROI changes */
  onChange?: (roi: RoiConfig) => void;
  /** Callback when save is requested */
  onSave?: (roi: RoiConfig) => void;
  /** Callback when PDF is uploaded */
  onPdfUpload?: (file: File) => void;
  /** Whether editor is read-only */
  readOnly?: boolean;
  /** Document type for template suggestions */
  documentType?: "maintenance" | "inspection" | "installation";
  /** Show PDF preview panel */
  showPdfPreview?: boolean;
  /** Live specJson text — used to attach threshold rules to regions */
  specJsonText?: string;
  /** Persist threshold / field updates into Studio draft */
  onSpecJsonChange?: (next: string) => void;
  /** Canonical spec fields — draw palette binds ROI names to these ids */
  specFields?: Array<{ field: string; label: string; type?: string }>;
  /** How current regions were produced — drives accuracy banners */
  roiProvenance?: {
    mode:
      | "text-layer"
      | "ocr-layout"
      | "starter-fallback"
      | "manual"
      | "unknown";
    ocrPlacedCount?: number;
    fallbackCount?: number;
  };
}

const CUSTOM_COLOR_PALETTE = [
  "#0ea5e9",
  "#14b8a6",
  "#a855f7",
  "#f43f5e",
  "#eab308",
  "#22c55e",
  "#64748b",
];

const CRITICAL_FIELD_IDS = new Set([
  "jobReference",
  "assetId",
  "date",
  "expiryDate",
  "engineerSignOff",
  "tickboxBlock",
  "complianceTickboxes",
]);

function slugifyLabel(label: string): string {
  const slug = label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/_+/g, "_");
  return slug || "customField";
}

function fieldsForTool(tool: string): string[] {
  if (tool === "tickboxBlock" || tool === "complianceTickboxes") {
    return ["complianceTickboxes"];
  }
  if (tool === "engineerSignature") return ["engineerSignOff"];
  if (tool === "customerSignature") return ["customerSignature"];
  if (tool === "signatureBlock") {
    return ["engineerSignOff", "customerSignature"];
  }
  if (tool === "nextServiceDate") return ["nextServiceDate", "expiryDate"];
  if (tool === "expiryDate") return ["expiryDate", "nextServiceDate"];
  if (tool === "header" || tool === "completionDetails") return [];
  return [tool];
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface NormBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Accept 0–1 or legacy 0–100 percent coords. */
function normalizeBoundValue(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function clampBounds(b: NormBounds): NormBounds {
  const x = Math.max(0, Math.min(1, b.x));
  const y = Math.max(0, Math.min(1, b.y));
  let width = Math.max(0.008, Math.min(1, b.width));
  let height = Math.max(0.008, Math.min(1, b.height));
  if (x + width > 1) width = 1 - x;
  if (y + height > 1) height = 1 - y;
  return {
    x,
    y,
    width: Math.max(0.008, width),
    height: Math.max(0.008, height),
  };
}

function normalizeRegionBounds(bounds: NormBounds): NormBounds {
  return clampBounds({
    x: normalizeBoundValue(bounds.x),
    y: normalizeBoundValue(bounds.y),
    width: normalizeBoundValue(bounds.width),
    height: normalizeBoundValue(bounds.height),
  });
}

function applyResize(
  start: NormBounds,
  handle: ResizeHandle,
  dx: number,
  dy: number
): NormBounds {
  let { x, y, width, height } = start;
  if (handle.includes("e")) width = width + dx;
  if (handle.includes("w")) {
    x = x + dx;
    width = width - dx;
  }
  if (handle.includes("s")) height = height + dy;
  if (handle.includes("n")) {
    y = y + dy;
    height = height - dy;
  }
  // Prevent inverted boxes while dragging
  if (width < 0.008) {
    if (handle.includes("w")) x = start.x + start.width - 0.008;
    width = 0.008;
  }
  if (height < 0.008) {
    if (handle.includes("n")) y = start.y + start.height - 0.008;
    height = 0.008;
  }
  return clampBounds({ x, y, width, height });
}

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

const ALL_HANDLES: ResizeHandle[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

function handleStyle(handle: ResizeHandle): CSSProperties {
  const edge = 8;
  const half = edge / 2;
  const base: CSSProperties = {
    position: "absolute",
    width: edge,
    height: edge,
    backgroundColor: "#fff",
    border: "2px solid #1e293b",
    borderRadius: 2,
    zIndex: 8,
    boxSizing: "border-box",
    pointerEvents: "auto",
    cursor: HANDLE_CURSOR[handle],
  };
  switch (handle) {
    case "n":
      return {
        ...base,
        left: `calc(50% - ${half}px)`,
        top: -half,
        width: 14,
        marginLeft: -3,
      };
    case "s":
      return {
        ...base,
        left: `calc(50% - ${half}px)`,
        bottom: -half,
        width: 14,
        marginLeft: -3,
      };
    case "e":
      return {
        ...base,
        right: -half,
        top: `calc(50% - ${half}px)`,
        height: 14,
        marginTop: -3,
      };
    case "w":
      return {
        ...base,
        left: -half,
        top: `calc(50% - ${half}px)`,
        height: 14,
        marginTop: -3,
      };
    case "ne":
      return { ...base, right: -half, top: -half };
    case "nw":
      return { ...base, left: -half, top: -half };
    case "se":
      return { ...base, right: -half, bottom: -half };
    case "sw":
      return { ...base, left: -half, bottom: -half };
  }
}

/**
 * ROI Editor V2 Component
 */
export function RoiEditorV2({
  initialRoi,
  previousVersionRoi,
  pdfUrl,
  pdfData,
  onChange,
  onSave,
  onPdfUpload,
  readOnly = false,
  documentType,
  showPdfPreview = true,
  specJsonText,
  onSpecJsonChange,
  specFields = [],
  roiProvenance,
}: RoiEditorV2Props) {
  const [regions, setRegions] = useState<RoiRegion[]>(() =>
    (initialRoi?.regions ?? []).map(r => ({
      ...r,
      bounds: normalizeRegionBounds(r.bounds),
      enabled: r.enabled ?? true,
    }))
  );
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [drawCurrent, setDrawCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [currentTool, setCurrentTool] = useState<string>("jobReference");
  const [zoom, setZoom] = useState(150);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize] = useState(0.05); // 5% grid
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentToolRef = useRef(currentTool);
  currentToolRef.current = currentTool;
  /** Move / resize in progress (mutually exclusive with draw) */
  const interactRef = useRef<null | {
    kind: "move" | "resize";
    name: string;
    handle?: ResizeHandle;
    origin: { x: number; y: number };
    startBounds: NormBounds;
  }>(null);
  const [localPdfData, setLocalPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);
  const [customTypes, setCustomTypes] = useState<
    Array<{ id: string; label: string; color: string; critical: boolean }>
  >(() =>
    loadRememberedRoiLabels().map(l => ({
      id: l.id,
      label: l.label,
      color: l.color,
      critical: l.critical,
    }))
  );
  const [customLabelDraft, setCustomLabelDraft] = useState("");
  const [customLabelCritical, setCustomLabelCritical] = useState(false);
  /** Natural PDF page size at current zoom — drives overlay coordinate space */
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  /** Floating draw palette — stays visible while scrolling the PDF */
  const [drawPaletteOpen, setDrawPaletteOpen] = useState(true);

  const allRoiTypes = useMemo(() => {
    const standard = STANDARD_ROI_TYPES.map(t => ({ ...t }));
    const known = new Set<string>(standard.map(t => t.id));
    // Alias: engineerSignOff appears as engineerSignature in draw tools
    known.add("engineerSignOff");
    known.add("complianceTickboxes");

    const fromSpec = specFields
      .filter(f => !known.has(f.field) && f.field !== "header")
      .map((f, i) => ({
        id: f.field,
        label: f.label || f.field,
        color: CUSTOM_COLOR_PALETTE[i % CUSTOM_COLOR_PALETTE.length],
        critical: CRITICAL_FIELD_IDS.has(f.field),
      }));

    for (const t of fromSpec) known.add(t.id);

    const fromCustom = customTypes.filter(t => !known.has(t.id));
    return [...standard, ...fromSpec, ...fromCustom];
  }, [specFields, customTypes]);

  const specFieldIdSet = useMemo(
    () => new Set(specFields.map(f => f.field)),
    [specFields]
  );

  // Seed custom types from existing regions that aren't in the standard menu
  // (merge with cross-template memory — do not wipe remembered labels)
  useEffect(() => {
    const known = new Set(STANDARD_ROI_TYPES.map(t => t.id));
    const extras = (initialRoi?.regions ?? [])
      .map(r => r.name)
      .filter(
        name => !known.has(name as (typeof STANDARD_ROI_TYPES)[number]["id"])
      );
    if (extras.length === 0) return;
    setCustomTypes(prev => {
      const have = new Set(prev.map(t => t.id));
      const next = [...prev];
      extras.forEach((id, i) => {
        if (have.has(id)) return;
        const remembered = loadRememberedRoiLabels().find(l => l.id === id);
        next.push({
          id,
          label:
            remembered?.label ??
            id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          color:
            remembered?.color ??
            CUSTOM_COLOR_PALETTE[i % CUSTOM_COLOR_PALETTE.length],
          critical: remembered?.critical ?? false,
        });
        have.add(id);
      });
      return next;
    });
    // only on mount / initialRoi identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Bind a Draw label into the live template Fields list.
   * Standard and custom labels both need this — otherwise activation reports
   * ORPHAN_ROI even when the box was drawn with the correct tool id.
   */
  const bindLabelToTemplate = useCallback(
    (entry: {
      id: string;
      label: string;
      color: string;
      critical: boolean;
      type?: string;
      /** Persist to cross-template memory (custom labels) */
      remember?: boolean;
    }) => {
      if (
        entry.remember !== false &&
        !STANDARD_ROI_TYPES.some(t => t.id === entry.id)
      ) {
        rememberRoiLabel(entry);
      }
      if (!onSpecJsonChange) return;
      let text = specJsonText;
      const fieldIds = fieldsForTool(entry.id);
      let changed: string | null = null;
      for (const fieldId of fieldIds) {
        const meta =
          allRoiTypes.find(t => t.id === fieldId) ??
          (fieldId === entry.id ? entry : null);
        const next = ensureSpecField(text, {
          field: fieldId,
          label: meta?.label ?? fieldId,
          type: entry.type ?? "string",
          required:
            "critical" in (meta ?? {})
              ? Boolean((meta as { critical?: boolean }).critical)
              : entry.critical,
        });
        if (next) {
          text = next;
          changed = next;
        }
      }
      // Also ensure the tool id itself when it is a real field (not structural)
      if (
        entry.id !== "header" &&
        entry.id !== "signatureBlock" &&
        entry.id !== "tickboxBlock" &&
        entry.id !== "completionDetails" &&
        !fieldIds.includes(entry.id)
      ) {
        const next = ensureSpecField(text, {
          field: entry.id,
          label: entry.label,
          type: entry.type ?? "string",
          required: entry.critical,
        });
        if (next) changed = next;
      }
      if (changed) onSpecJsonChange(changed);
    },
    [onSpecJsonChange, specJsonText, allRoiTypes]
  );

  /** @deprecated name kept for call sites — always binds into spec fields */
  const integrateCustomLabel = bindLabelToTemplate;
  // Use provided PDF data or local upload
  const effectivePdfSource = pdfData ?? localPdfData ?? pdfUrl ?? undefined;

  /**
   * Handle PDF file upload
   */
  const handlePdfUpload = useCallback(
    (file: File) => {
      if (!file.type.includes("pdf")) {
        return;
      }

      setPdfFileName(file.name);

      const reader = new FileReader();
      reader.onload = e => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        setLocalPdfData(arrayBuffer);
      };
      reader.readAsArrayBuffer(file);

      onPdfUpload?.(file);
    },
    [onPdfUpload]
  );

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handlePdfUpload(file);
      }
    },
    [handlePdfUpload]
  );

  /**
   * Handle drag and drop
   */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handlePdfUpload(file);
      }
    },
    [handlePdfUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // Notify parent when regions change only.
  // Keep onChange in a ref — inline parent callbacks (e.g. Template Studio
  // `onChange={roi => setRoiDraft(roi)}`) get a new identity every render and
  // would otherwise re-fire this effect → setState → max update depth (#185).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.({ regions });
  }, [regions]);

  /**
   * Get color for region type
   */
  const getRegionColor = (name: string): string => {
    const type = allRoiTypes.find(t => t.id === name);
    return type?.color ?? "#6b7280";
  };

  const regionLabel = (name: string): string => {
    const type = allRoiTypes.find(t => t.id === name);
    return type?.label ?? name;
  };

  /**
   * Check if region type is critical
   */
  const isCritical = (name: string): boolean => {
    const type = allRoiTypes.find(t => t.id === name);
    return type?.critical ?? false;
  };

  const addCustomLabel = () => {
    const label = customLabelDraft.trim();
    if (!label || readOnly) return;

    // Bind to an existing spec field id when label matches (prevents duplicates)
    const matchedSpec = specFields.find(
      f =>
        f.field.toLowerCase() === label.toLowerCase() ||
        f.field.toLowerCase() === slugifyLabel(label).toLowerCase() ||
        (f.label && f.label.toLowerCase() === label.toLowerCase())
    );
    if (matchedSpec) {
      setCurrentTool(matchedSpec.field);
      setCustomLabelDraft("");
      setCustomLabelCritical(false);
      setDrawPaletteOpen(true);
      return;
    }

    // Also bind if slug matches an existing palette id
    const slug = slugifyLabel(label);
    const existingTool = allRoiTypes.find(
      t =>
        t.id.toLowerCase() === slug.toLowerCase() ||
        t.label.toLowerCase() === label.toLowerCase()
    );
    if (existingTool) {
      setCurrentTool(existingTool.id);
      setCustomLabelDraft("");
      setCustomLabelCritical(false);
      return;
    }

    let id = slug;
    const existingIds = new Set(allRoiTypes.map(t => t.id));
    if (existingIds.has(id)) {
      let n = 2;
      while (existingIds.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }
    const color =
      CUSTOM_COLOR_PALETTE[customTypes.length % CUSTOM_COLOR_PALETTE.length];
    const entry = {
      id,
      label,
      color,
      critical: customLabelCritical,
      type: "string" as const,
    };
    setCustomTypes(prev => [...prev, entry]);
    integrateCustomLabel(entry);
    setCurrentTool(id);
    setCustomLabelDraft("");
    setCustomLabelCritical(false);
  };

  /**
   * Snap value to grid
   */
  const snapValue = useCallback(
    (value: number): number => {
      if (!snapToGrid) return value;
      return Math.round(value / gridSize) * gridSize;
    },
    [snapToGrid, gridSize]
  );

  const clientToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = snapValue((clientX - rect.left) / rect.width);
      const y = snapValue((clientY - rect.top) / rect.height);
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    [snapValue]
  );

  const finishDraw = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawingRef.current || !drawStartRef.current) return;
      const end = clientToNorm(clientX, clientY);
      const start = drawStartRef.current;
      isDrawingRef.current = false;
      drawStartRef.current = null;
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
      if (!end) return;

      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);

      // Allow slightly smaller boxes — old 0.01 threshold rejected many attempts
      if (width < 0.005 || height < 0.005) return;

      const tool = currentToolRef.current;
      const newRegion: RoiRegion = {
        name: tool,
        page: currentPage,
        bounds: {
          x,
          y,
          width: Math.max(0.005, Math.min(1 - x, width)),
          height: Math.max(0.005, Math.min(1 - y, height)),
        },
        fields: fieldsForTool(tool),
        enabled: true,
      };

      setRegions(prev => {
        const filtered = prev.filter(r => r.name !== tool);
        return [...filtered, newRegion];
      });
      setSelectedRegion(tool);
      // Keep labels panel open after first successful draw so next labels are obvious
      setDrawPaletteOpen(true);

      // Any successful draw must add matching Fields entries (standard + custom)
      const toolMeta = allRoiTypes.find(t => t.id === tool);
      if (toolMeta) {
        bindLabelToTemplate({
          id: toolMeta.id,
          label: toolMeta.label,
          color: toolMeta.color,
          critical: toolMeta.critical,
          remember: !STANDARD_ROI_TYPES.some(t => t.id === tool),
        });
      }
    },
    [clientToNorm, currentPage, allRoiTypes, bindLabelToTemplate]
  );

  /**
   * Handle mouse down on canvas — start ROI drag
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly || !canvasRef.current) return;
      // Ignore right-click / middle-click
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const start = clientToNorm(e.clientX, e.clientY);
      if (!start) return;

      isDrawingRef.current = true;
      drawStartRef.current = start;
      setIsDrawing(true);
      setDrawStart(start);
      setDrawCurrent(start);
    },
    [readOnly, clientToNorm]
  );

  // Document-level move/up for draw + move/resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const interact = interactRef.current;
      if (interact) {
        const pt = clientToNorm(e.clientX, e.clientY);
        if (!pt) return;
        const dx = pt.x - interact.origin.x;
        const dy = pt.y - interact.origin.y;
        const next =
          interact.kind === "move"
            ? clampBounds({
                x: interact.startBounds.x + dx,
                y: interact.startBounds.y + dy,
                width: interact.startBounds.width,
                height: interact.startBounds.height,
              })
            : applyResize(
                interact.startBounds,
                interact.handle ?? "se",
                dx,
                dy
              );
        setRegions(prev =>
          prev.map(r => (r.name === interact.name ? { ...r, bounds: next } : r))
        );
        return;
      }
      if (!isDrawingRef.current) return;
      const drawPt = clientToNorm(e.clientX, e.clientY);
      if (drawPt) setDrawCurrent(drawPt);
    };
    const onUp = (e: MouseEvent) => {
      if (interactRef.current) {
        interactRef.current = null;
        return;
      }
      if (!isDrawingRef.current) return;
      finishDraw(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [clientToNorm, finishDraw]);

  const beginMoveRegion = (
    name: string,
    bounds: NormBounds,
    clientX: number,
    clientY: number
  ) => {
    if (readOnly) return;
    const origin = clientToNorm(clientX, clientY);
    if (!origin) return;
    interactRef.current = {
      kind: "move",
      name,
      origin,
      startBounds: { ...bounds },
    };
    setSelectedRegion(name);
  };

  const beginResizeRegion = (
    name: string,
    bounds: NormBounds,
    handle: ResizeHandle,
    clientX: number,
    clientY: number
  ) => {
    if (readOnly) return;
    const origin = clientToNorm(clientX, clientY);
    if (!origin) return;
    interactRef.current = {
      kind: "resize",
      name,
      handle,
      origin,
      startBounds: { ...bounds },
    };
    setSelectedRegion(name);
  };

  /**
   * Delete a region
   */
  const deleteRegion = (name: string) => {
    setRegions(prev => prev.filter(r => r.name !== name));
    if (selectedRegion === name) {
      setSelectedRegion(null);
    }
  };

  /**
   * Toggle region enabled state
   */
  const toggleRegion = (name: string) => {
    setRegions(prev =>
      prev.map(r => (r.name === name ? { ...r, enabled: !r.enabled } : r))
    );
  };

  /**
   * Rough starters intentionally disabled as a default path.
   * They produce inaccurate boxes and train authors to trust garbage.
   * Use Suggest fields (OCR) or draw manually.
   */
  const applyTemplate = (templateType: string) => {
    const template = ROI_TEMPLATES[templateType];
    if (!template) return;
    const ok = window.confirm(
      `WARNING: “${templateType}” is a GENERIC scaffold — it is NOT based on this PDF’s OCR.\n\n` +
        `These boxes will be WRONG on almost every form (Date on logos, Job Reference in the wrong table, etc.).\n\n` +
        `Prefer: Suggest fields (with sample attached) for OCR-placed boxes, or draw each field yourself.\n\n` +
        `Only continue if you will immediately move/resize every box onto the real printed field.`
    );
    if (!ok) return;
    setRegions(
      template.regions.map(r => ({
        ...r,
        bounds: normalizeRegionBounds(r.bounds),
        enabled: true,
        fields: r.fields ?? fieldsForTool(r.name),
      }))
    );
  };

  /**
   * Copy from previous version
   */
  const copyFromPrevious = () => {
    if (previousVersionRoi) {
      setRegions(
        previousVersionRoi.regions.map(r => ({
          ...r,
          enabled: r.enabled ?? true,
        }))
      );
    }
  };

  /**
   * Handle save
   */
  const handleSave = () => {
    // Only save enabled regions
    const enabledRegions = regions.filter(r => r.enabled !== false);
    onSave?.({ regions: enabledRegions });
  };

  /**
   * Clear all regions
   */
  const clearAll = () => {
    setRegions([]);
    setSelectedRegion(null);
  };

  /**
   * Get missing critical ROIs
   */
  const getMissingCritical = (): string[] => {
    const presentNames = new Set(
      regions.filter(r => r.enabled !== false).map(r => r.name)
    );
    return allRoiTypes
      .filter(t => t.critical && !presentNames.has(t.id))
      .map(t => t.label);
  };

  const missingCritical = getMissingCritical();
  const filteredTypes = showCriticalOnly
    ? allRoiTypes.filter(t => t.critical)
    : allRoiTypes;

  return (
    <div
      className="roi-editor-v2"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* Header with controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          padding: "12px 16px",
          backgroundColor: "#1e293b",
          borderRadius: "8px",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            ROI Editor
          </h2>
          {missingCritical.length > 0 && (
            <span
              style={{
                padding: "4px 10px",
                backgroundColor: "#fbbf24",
                color: "#1e293b",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {missingCritical.length} critical ROI
              {missingCritical.length > 1 ? "s" : ""} missing
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Zoom controls — higher range for precise ROI placement */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(75, z - 25))}
              style={{
                padding: "4px 8px",
                backgroundColor: "#334155",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              −
            </button>
            <span
              style={{
                fontSize: "13px",
                minWidth: "50px",
                textAlign: "center",
              }}
            >
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(300, z + 25))}
              style={{
                padding: "4px 8px",
                backgroundColor: "#334155",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(150)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#475569",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "11px",
              }}
              title="Reset to 150%"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setZoom(200)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#BEDA41",
                color: "#1a1f0a",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600,
              }}
              title="Large view for accurate labelling"
            >
              Large
            </button>
          </div>

          {/* Snap to grid toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
            }}
          >
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={e => setSnapToGrid(e.target.checked)}
            />
            Snap to grid
          </label>
        </div>
      </div>

      {/* Compact templates row (not the draw palette) */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "12px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "12px", color: "#6b7280" }}>
          Rough starters (not form-accurate):
        </span>
        {Object.keys(ROI_TEMPLATES).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => applyTemplate(type)}
            disabled={readOnly}
            title="Places approximate boxes only — you must move each onto the real printed field"
            style={{
              padding: "4px 10px",
              backgroundColor: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: readOnly ? "not-allowed" : "pointer",
              textTransform: "capitalize",
            }}
          >
            {type}
          </button>
        ))}
        {previousVersionRoi && (
          <button
            type="button"
            onClick={copyFromPrevious}
            disabled={readOnly}
            style={{
              padding: "4px 10px",
              backgroundColor: "#dbeafe",
              color: "#1d4ed8",
              border: "1px solid #93c5fd",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: readOnly ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
          >
            Copy previous
          </button>
        )}
        <button
          type="button"
          onClick={() => setDrawPaletteOpen(o => !o)}
          style={{
            marginLeft: "auto",
            padding: "4px 12px",
            backgroundColor: drawPaletteOpen ? "#1e293b" : "#BEDA41",
            color: drawPaletteOpen ? "#fff" : "#1a1f0a",
            border: "none",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          title={
            drawPaletteOpen
              ? "Hide floating draw labels"
              : "Show floating draw labels"
          }
        >
          {drawPaletteOpen ? "Hide labels panel" : "Show labels panel"}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Labels dock | PDF | Regions — labels never cover the page */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "stretch",
          minHeight: "calc(100vh - 260px)",
        }}
      >
        {/* Draw labels dock — beside PDF, never overlays the page */}
        {drawPaletteOpen ? (
          <div
            data-testid="roi-draw-palette"
            style={{
              flex: "0 0 240px",
              width: 240,
              maxWidth: 240,
              alignSelf: "flex-start",
              position: "sticky",
              top: 0,
              zIndex: 5,
              maxHeight: "calc(100vh - 200px)",
              overflow: "auto",
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
              padding: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                gap: 8,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}
                >
                  Draw labels
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  {filteredTypes.length} tools · hover for how to draw · custom
                  labels remembered next template
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawPaletteOpen(false)}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                  color: "#475569",
                }}
                title="Hide panel"
              >
                Hide
              </button>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "#64748b",
                marginBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={showCriticalOnly}
                onChange={e => setShowCriticalOnly(e.target.checked)}
              />
              Critical only
            </label>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 8,
              }}
            >
              {filteredTypes.map(type => {
                const active = currentTool === type.id;
                const specMeta = specFields.find(f => f.field === type.id);
                const guidance = getRoiDrawGuidance(type.id, {
                  label: type.label,
                  fieldType: specMeta?.type,
                });
                const isRemembered =
                  !STANDARD_ROI_TYPES.some(t => t.id === type.id) &&
                  !specFields.some(f => f.field === type.id);
                return (
                  <Tooltip key={type.id} delayDuration={200}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentTool(type.id);
                          // Selecting any label (standard or custom) binds Fields
                          bindLabelToTemplate({
                            id: type.id,
                            label: type.label,
                            color: type.color,
                            critical: type.critical,
                            type: specMeta?.type ?? "string",
                            remember: !STANDARD_ROI_TYPES.some(
                              t => t.id === type.id
                            ),
                          });
                        }}
                        disabled={readOnly}
                        aria-label={`${type.label}. ${guidance.summary} How to draw: ${guidance.howToDraw}`}
                        data-testid={`roi-draw-tool-${type.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: active
                            ? `2px solid ${type.color}`
                            : "1px solid #e2e8f0",
                          backgroundColor: active ? `${type.color}18` : "#fff",
                          color: active ? type.color : "#334155",
                          cursor: readOnly ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: active ? 700 : 500,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            backgroundColor: type.color,
                            flexShrink: 0,
                          }}
                        />
                        {type.critical && (
                          <span style={{ color: "#dc2626", fontSize: 9 }}>
                            ●
                          </span>
                        )}
                        <span style={{ flex: 1 }}>{type.label}</span>
                        {isRemembered && (
                          <span
                            title="Saved from a previous template"
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: "#64748b",
                              textTransform: "uppercase",
                              letterSpacing: "0.02em",
                            }}
                          >
                            saved
                          </span>
                        )}
                        <span
                          aria-hidden
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#94a3b8",
                            lineHeight: 1,
                          }}
                        >
                          ?
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={8}
                      className="z-[80] max-w-[280px] space-y-1.5 border border-slate-700 bg-slate-900 p-3 text-left text-xs text-slate-50 shadow-lg"
                    >
                      <div className="font-semibold text-white">
                        {type.label}
                      </div>
                      <p className="text-slate-200 leading-snug">
                        {guidance.summary}
                      </p>
                      <p className="leading-snug">
                        <span className="font-semibold text-[#BEDA41]">
                          Look for:
                        </span>{" "}
                        {guidance.lookFor}
                      </p>
                      <p className="leading-snug">
                        <span className="font-semibold text-[#BEDA41]">
                          How to draw:
                        </span>{" "}
                        {guidance.howToDraw}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {!readOnly && (
              <div
                style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <input
                  type="text"
                  value={customLabelDraft}
                  onChange={e => setCustomLabelDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomLabel();
                    }
                  }}
                  placeholder="Custom label… (saved for next template)"
                  style={{
                    padding: "6px 8px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.35 }}
                >
                  New labels are stored in browser memory and added to this
                  template&apos;s fields so ids stay consistent next time.
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: "#64748b",
                      flex: 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={customLabelCritical}
                      onChange={e => setCustomLabelCritical(e.target.checked)}
                    />
                    Critical
                  </label>
                  <button
                    type="button"
                    onClick={addCustomLabel}
                    disabled={!customLabelDraft.trim()}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: "1px solid #BEDA41",
                      backgroundColor: "#BEDA41",
                      color: "#1a1f0a",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: customLabelDraft.trim()
                        ? "pointer"
                        : "not-allowed",
                      opacity: customLabelDraft.trim() ? 1 : 0.5,
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            data-testid="roi-draw-palette-show"
            onClick={() => setDrawPaletteOpen(true)}
            style={{
              flex: "0 0 44px",
              width: 44,
              alignSelf: "flex-start",
              position: "sticky",
              top: 0,
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              padding: "12px 8px",
              borderRadius: 8,
              border: "1px solid #BEDA41",
              backgroundColor: "#BEDA41",
              color: "#1a1f0a",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
              letterSpacing: "0.04em",
            }}
          >
            Show labels
          </button>
        )}

        {/* Canvas with PDF preview */}
        <div style={{ flex: "1 1 auto", minWidth: 0, position: "relative" }}>
          <div
            style={{
              marginBottom: "8px",
              fontSize: "14px",
              color: "#6b7280",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {readOnly
                ? "Preview Mode"
                : `Click and drag on the PDF to place “${regionLabel(currentTool)}”. Open the labels panel to switch fields.`}
              {pdfFileName && (
                <span style={{ marginLeft: "12px", color: "#3b82f6" }}>
                  ({pdfFileName})
                </span>
              )}
            </span>
            {totalPages > 1 && (
              <span>
                Page {currentPage} of {totalPages}
              </span>
            )}
          </div>
          {(currentTool === "tickboxBlock" ||
            currentTool === "complianceTickboxes") &&
            !readOnly && (
              <div
                style={{
                  marginBottom: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  backgroundColor: "#FEF9C3",
                  border: "1px solid #FDE68A",
                  fontSize: 12,
                  color: "#854D0E",
                  lineHeight: 1.35,
                }}
                data-testid="tickbox-draw-coach"
              >
                Tickbox tip: cover the full checklist grid — row requirement
                text + all four columns (Ok / Adv / Fail / N/A) and the column
                headers. One block, not one ROI per column.
              </div>
            )}

          {/* Accuracy coaching — announce OCR vs generic repeatedly */}
          {regions.length > 0 && (
            <div
              data-testid="roi-accuracy-banner"
              style={{
                marginBottom: 8,
                padding: "10px 12px",
                backgroundColor:
                  roiProvenance?.mode === "text-layer" ||
                  roiProvenance?.mode === "ocr-layout"
                    ? "#ECFDF5"
                    : "#FEF3C7",
                border:
                  roiProvenance?.mode === "text-layer" ||
                  roiProvenance?.mode === "ocr-layout"
                    ? "2px solid #10B981"
                    : "2px solid #F59E0B",
                borderRadius: 8,
                fontSize: 12,
                color:
                  roiProvenance?.mode === "text-layer" ||
                  roiProvenance?.mode === "ocr-layout"
                    ? "#064E3B"
                    : "#78350F",
                lineHeight: 1.45,
                fontWeight: 500,
              }}
            >
              {roiProvenance?.mode === "text-layer" ? (
                <>
                  <strong>Text-layer word boxes (PX-105).</strong> Each box is
                  anchored to an embedded PDF label + value — not a page-tall
                  blob. Oversized auto-map boxes are rejected so Promote-to-live
                  stays gated until field ROIs are tight. Adjust with edge
                  resize if a value sits further right than expected.
                </>
              ) : roiProvenance?.mode === "ocr-layout" ? (
                <>
                  <strong>OCR-placed (tight row boxes).</strong> Each box should
                  cover one printed label + its value on the same row — not a
                  section header, not half the page. If any box is off, select
                  it → drag / edge-resize until it hugs the field. Re-run
                  Suggest fields after this update if boxes still look like the
                  old oversized blobs.
                </>
              ) : roiProvenance?.mode === "starter-fallback" ? (
                <>
                  <strong>
                    No OCR-placed boxes — do not trust anything on this page.
                  </strong>{" "}
                  Azure DI layout did not return usable field geometry (or
                  Suggest fields was not applied). Clear these boxes and either
                  re-run <em>Suggest fields</em> with the sample attached, or
                  draw each field yourself using Draw labels + edge resize.
                  Generic Maintenance/Inspection scaffolds will always look like
                  this mess.
                </>
              ) : (
                <>
                  <strong>Placement must match the printed field.</strong>{" "}
                  Prefer OCR propose (Suggest fields) over rough starters.
                  Select a box, drag to move, hover an edge/corner to resize.
                  Job Reference must sit on Job ID (label + value) — not
                  Completion Details. Rough starters are guesses only.
                </>
              )}
            </div>
          )}
          {(roiProvenance?.mode === "starter-fallback" ||
            !roiProvenance ||
            roiProvenance.mode === "unknown") && (
            <div
              data-testid="roi-accuracy-banner-repeat"
              style={{
                marginBottom: 8,
                padding: "8px 10px",
                backgroundColor: "#FEE2E2",
                border: "1px solid #EF4444",
                borderRadius: 8,
                fontSize: 11,
                color: "#7F1D1D",
                lineHeight: 1.4,
              }}
            >
              Reminder: generic Maintenance / Inspection / Installation layouts
              are <strong>not</strong> a detailed review of this PDF. Only
              OCR-informed propose (or careful manual draw) produces a usable
              template.
            </div>
          )}

          {/* Shared scrollport: PDF + ROI labels must move together */}
          <div
            style={{
              overflow: "auto",
              height: "calc(100vh - 280px)",
              minHeight: "640px",
              maxHeight: "calc(100vh - 180px)",
              border: isDragOver ? "3px dashed #3b82f6" : "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#64748b",
              padding: "16px",
            }}
          >
            <div
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              data-testid="roi-draw-surface"
              style={{
                // Size from real PDF bitmap — never maxWidth+aspectRatio squash
                width: pageSize.width,
                height: pageSize.height,
                backgroundColor: "#ffffff",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                position: "relative",
                cursor: readOnly
                  ? "default"
                  : isDrawing
                    ? "crosshair"
                    : "crosshair",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                overflow: "visible",
                margin: "0 auto",
                flexShrink: 0,
                transition: "border-color 0.2s",
                userSelect: "none",
                touchAction: "none",
              }}
            >
              {/* Grid overlay when snap enabled */}
              {snapToGrid && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `
                  linear-gradient(to right, #e2e8f020 1px, transparent 1px),
                  linear-gradient(to bottom, #e2e8f020 1px, transparent 1px)
                `,
                    backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
              )}

              {/* PDF Preview using PDF.js — natural aspect; pointer-events none so drag-draw works */}
              {showPdfPreview && effectivePdfSource && (
                <PdfPreview
                  pdfSource={effectivePdfSource}
                  page={currentPage}
                  zoom={zoom}
                  onPageChange={setCurrentPage}
                  onPagesLoaded={setTotalPages}
                  onDimensionsChange={(width, height) => {
                    if (width <= 0 || height <= 0) return;
                    setPageSize(prev =>
                      prev.width === width && prev.height === height
                        ? prev
                        : { width, height }
                    );
                  }}
                  showPageControls={false}
                  embedInParent
                />
              )}

              {/* Page placeholder if no PDF - with upload button */}
              {!effectivePdfSource && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: isDragOver ? "#3b82f6" : "#6b7280",
                    fontSize: "18px",
                    fontWeight: 600,
                    pointerEvents: "auto",
                    textAlign: "center",
                    padding: "40px",
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    style={{ margin: "0 auto 16px" }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <polyline points="9,15 12,12 15,15" />
                  </svg>
                  <div>
                    {isDragOver
                      ? "Drop PDF here"
                      : "Drop PDF or click to upload"}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      marginTop: "16px",
                      padding: "10px 20px",
                      backgroundColor: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: "14px",
                    }}
                  >
                    Select PDF File
                  </button>
                  <div
                    style={{
                      fontSize: "12px",
                      marginTop: "12px",
                      color: "#9ca3af",
                    }}
                  >
                    or drag and drop a PDF file
                  </div>
                </div>
              )}

              {/* Live rubber-band while dragging a new ROI */}
              {isDrawing && drawStart && drawCurrent && (
                <div
                  data-testid="roi-draw-preview"
                  style={{
                    position: "absolute",
                    left: `${Math.min(drawStart.x, drawCurrent.x) * 100}%`,
                    top: `${Math.min(drawStart.y, drawCurrent.y) * 100}%`,
                    width: `${Math.abs(drawCurrent.x - drawStart.x) * 100}%`,
                    height: `${Math.abs(drawCurrent.y - drawStart.y) * 100}%`,
                    border: `2px dashed ${getRegionColor(currentTool)}`,
                    backgroundColor: `${getRegionColor(currentTool)}25`,
                    borderRadius: 4,
                    pointerEvents: "none",
                    zIndex: 6,
                    boxSizing: "border-box",
                  }}
                />
              )}

              {/* Rendered regions — click to select, drag to move, edges to resize */}
              {regions
                .filter(r => r.enabled !== false)
                .map(region => {
                  const selected = selectedRegion === region.name;
                  const color = getRegionColor(region.name);
                  return (
                    <div
                      key={region.name}
                      data-testid={`roi-region-${region.name}`}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedRegion(region.name);
                        setCurrentTool(region.name);
                      }}
                      onMouseDown={e => {
                        // Don't start a new draw when clicking an existing region
                        e.stopPropagation();
                        if (e.button !== 0 || readOnly) return;
                        e.preventDefault();
                        beginMoveRegion(
                          region.name,
                          region.bounds,
                          e.clientX,
                          e.clientY
                        );
                      }}
                      style={{
                        position: "absolute",
                        left: `${region.bounds.x * 100}%`,
                        top: `${region.bounds.y * 100}%`,
                        width: `${region.bounds.width * 100}%`,
                        height: `${region.bounds.height * 100}%`,
                        backgroundColor: `${color}30`,
                        border: `2px solid ${color}`,
                        borderRadius: "4px",
                        cursor: readOnly ? "default" : "move",
                        boxSizing: "border-box",
                        outline: selected ? `3px solid ${color}` : "none",
                        outlineOffset: "2px",
                        zIndex: selected ? 5 : 4,
                      }}
                      title={
                        readOnly
                          ? regionLabel(region.name)
                          : "Drag to move · hover edges/corners to resize"
                      }
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "2px",
                          left: "2px",
                          fontSize: "10px",
                          fontWeight: 600,
                          color,
                          backgroundColor: "white",
                          padding: "1px 4px",
                          borderRadius: "3px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                          display: "flex",
                          alignItems: "center",
                          gap: "2px",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                          zIndex: 1,
                        }}
                      >
                        {isCritical(region.name) && (
                          <span style={{ color: "#dc2626" }}>●</span>
                        )}
                        {regionLabel(region.name)}
                      </span>
                      {selected &&
                        !readOnly &&
                        ALL_HANDLES.map(handle => (
                          <div
                            key={handle}
                            data-testid={`roi-resize-${region.name}-${handle}`}
                            style={handleStyle(handle)}
                            onMouseDown={e => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (e.button !== 0) return;
                              beginResizeRegion(
                                region.name,
                                region.bounds,
                                handle,
                                e.clientX,
                                e.clientY
                              );
                            }}
                          />
                        ))}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Region List Sidebar — compact so PDF stays large */}
        <div
          style={{
            flex: "0 0 320px",
            width: 320,
            maxWidth: 320,
            alignSelf: "flex-start",
            position: "sticky",
            top: 0,
            maxHeight: "calc(100vh - 200px)",
            overflow: "auto",
          }}
        >
          <div
            style={{
              padding: "12px",
              backgroundColor: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px 0",
                fontSize: "15px",
                fontWeight: 600,
              }}
            >
              Regions ({regions.length})
            </h3>

            {/* Missing critical warning */}
            {missingCritical.length > 0 && (
              <div
                style={{
                  padding: "8px 10px",
                  backgroundColor: "#fef3c7",
                  border: "1px solid #fbbf24",
                  borderRadius: "6px",
                  marginBottom: "12px",
                  fontSize: "12px",
                  lineHeight: 1.35,
                }}
              >
                <strong>Missing critical:</strong> {missingCritical.join(", ")}
              </div>
            )}

            {regions.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: "14px" }}>
                No regions defined. Select a type and draw on the canvas, or
                apply a template.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {regions.map(region => (
                  <li
                    key={region.name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      marginBottom: "8px",
                      backgroundColor:
                        selectedRegion === region.name
                          ? `${getRegionColor(region.name)}15`
                          : "white",
                      border: `1px solid ${selectedRegion === region.name ? getRegionColor(region.name) : "#e2e8f0"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      opacity: region.enabled === false ? 0.5 : 1,
                    }}
                    onClick={() => setSelectedRegion(region.name)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {/* Enable/disable toggle */}
                      {!readOnly && (
                        <input
                          type="checkbox"
                          checked={region.enabled !== false}
                          onChange={e => {
                            e.stopPropagation();
                            toggleRegion(region.name);
                          }}
                        />
                      )}
                      <span
                        style={{
                          display: "inline-block",
                          width: "12px",
                          height: "12px",
                          backgroundColor: getRegionColor(region.name),
                          borderRadius: "3px",
                        }}
                      />
                      <span style={{ fontWeight: 500, fontSize: "13px" }}>
                        {isCritical(region.name) && (
                          <span
                            style={{ color: "#dc2626", marginRight: "4px" }}
                          >
                            ●
                          </span>
                        )}
                        {regionLabel(region.name)}
                      </span>
                      {specFields.length > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            color:
                              specFieldIdSet.has(region.name) ||
                              (region.fields ?? []).some(f =>
                                specFieldIdSet.has(f)
                              ) ||
                              region.name === "tickboxBlock" ||
                              region.name === "signatureBlock" ||
                              region.name === "engineerSignature" ||
                              region.name === "customerSignature" ||
                              region.name === "header" ||
                              region.name === "workDescription"
                                ? "#64748b"
                                : "#b45309",
                          }}
                        >
                          {specFieldIdSet.has(region.name) ||
                          (region.fields ?? []).some(f =>
                            specFieldIdSet.has(f)
                          ) ||
                          region.name === "tickboxBlock" ||
                          region.name === "signatureBlock" ||
                          region.name === "engineerSignature" ||
                          region.name === "customerSignature" ||
                          region.name === "header" ||
                          region.name === "workDescription"
                            ? "linked"
                            : "orphan — rename to a field id"}
                        </span>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          deleteRegion(region.name);
                        }}
                        style={{
                          padding: "4px 8px",
                          backgroundColor: "#fef2f2",
                          color: "#dc2626",
                          border: "1px solid #fecaca",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "11px",
                        }}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Threshold rules for selected ROI — compact collapsible */}
            {!readOnly &&
              selectedRegion &&
              specJsonText != null &&
              onSpecJsonChange && (
                <div
                  style={{ marginTop: 12 }}
                  data-testid="roi-region-threshold"
                >
                  <ThresholdRulesPanel
                    compact
                    specJsonText={specJsonText}
                    onSpecJsonChange={onSpecJsonChange}
                    defaultField={selectedRegion}
                    extraFields={regions.map(r => r.name)}
                  />
                </div>
              )}

            {/* Actions — allow saving progress even if some critical ROIs are still missing */}
            {!readOnly && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {missingCritical.length > 0 && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: "#92400e",
                      lineHeight: 1.35,
                    }}
                  >
                    You can save progress now. Still missing critical labels:{" "}
                    {missingCritical.join(", ")}.
                  </p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={clearAll}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      backgroundColor: "#f8fafc",
                      color: "#374151",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: "13px",
                    }}
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={
                      regions.filter(r => r.enabled !== false).length === 0
                    }
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      backgroundColor:
                        regions.filter(r => r.enabled !== false).length === 0
                          ? "#94a3b8"
                          : "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor:
                        regions.filter(r => r.enabled !== false).length === 0
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 500,
                      fontSize: "13px",
                    }}
                    title={
                      regions.filter(r => r.enabled !== false).length === 0
                        ? "Draw at least one region first"
                        : missingCritical.length > 0
                          ? "Saves current regions (critical labels still missing)"
                          : "Save ROI regions"
                    }
                  >
                    Save ROI
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* JSON Preview */}
          <details style={{ marginTop: 12 }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "6px 10px",
                backgroundColor: "#f1f5f9",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              View JSON
            </summary>
            <pre
              style={{
                marginTop: "8px",
                padding: "12px",
                backgroundColor: "#1e293b",
                color: "#e2e8f0",
                borderRadius: "6px",
                fontSize: "11px",
                overflow: "auto",
                maxHeight: "200px",
              }}
            >
              {JSON.stringify(
                { regions: regions.filter(r => r.enabled !== false) },
                null,
                2
              )}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export default RoiEditorV2;
