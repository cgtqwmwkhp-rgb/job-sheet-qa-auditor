/**
 * ReviewWorkstationPane (PR-13)
 *
 * Extracted from AuditResults: PDF preview + findings list with
 * PR-10 actions, PR-12 PDF↔finding sync, bulk finding approve,
 * and field correction capture.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Flag,
  Keyboard,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  useState,
  useRef,
  useMemo,
  type RefObject,
  type MouseEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DocumentViewer,
  BoundingBox as ViewerBoundingBox,
} from "@/components/DocumentViewer";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  findingsToViewerBoxes,
  syncSelectionFromBox,
  syncSelectionFromFinding,
} from "@/lib/pdfFindingSync";
import { isTerminalJobSheetStatus } from "@shared/processingProgress";
import {
  SelectionTracePanel,
  type SelectionTrace,
} from "@/components/audit/SelectionTracePanel";
import { mapSelectionTraceFromReport } from "@/components/review/mapSelectionTrace";
import { mapHasMajorFailsFromReport } from "@/components/review/mapAuditPolicy";
import { SelectionMarksPanel } from "@/components/review/SelectionMarksPanel";
import {
  DocQualityBreakdown,
  mapDocQualityPenaltiesFromReport,
  type DocQualityPenalty,
} from "@/components/review/DocQualityBreakdown";
import {
  mapSelectionMarksFromReport,
  type SelectionMarksView,
} from "@/components/review/mapSelectionMarks";
import { useReviewFindingKeyboard } from "@/hooks/useReviewFindingKeyboard";
import { usePersistFn } from "@/hooks/usePersistFn";
import {
  RelationshipFindingsGroup,
  isRelationshipFinding,
} from "@/components/review/RelationshipFindingsGroup";
import { ReviewShortcutsLegend } from "@/components/review/ReviewShortcutsLegend";
import {
  FailurePathSignalsPanel,
  mapFailurePathSignalsFromReport,
  type FailurePathSignals,
} from "@/components/review/FailurePathSignalsPanel";

export interface Finding {
  id: number | string;
  field: string;
  status: "passed" | "missing" | "warning";
  severity?: "critical" | "major" | "minor";
  /** Admin Audit Policy class (Major hard-fails; Minor is score-only). */
  failClass?: "major" | "minor" | "informational";
  /** Engine rule identifier, e.g. "JSR-C060". */
  ruleId?: string | null;
  /** Human-readable reason code from Audit Policy, e.g. "MISSING_FIELD". */
  reasonCode?: string | null;
  value?: string;
  message?: string;
  whyItMatters?: string;
  suggestedFix?: string;
  confidence: number;
  pageNumber?: number;
  box?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    label?: string;
  };
}

export interface AuditData {
  id: string;
  status: string;
  score: string;
  date: string;
  technician: string;
  documentUrl: string;
  findings: Finding[];
  /** True when Audit Policy recorded one or more Major fails. */
  hasMajorFails?: boolean;
  /** Template selection explainability (from reportJson when available). */
  selectionTrace?: SelectionTrace | null;
  /** Visual Ok/Adv/Fail/N/A checklist marks from Azure DI. */
  selectionMarks?: SelectionMarksView | null;
  /** Itemised Doc Quality penalty deductions (from reportJson). */
  docQualityPenalties?: DocQualityPenalty[];
  /** Failure-path signals extracted from Job Summary consistency check. */
  failurePathSignals?: FailurePathSignals | null;
  failurePathSignalSummary?: string | null;
}

export function mapFindingsFromApi(
  findingsData: Array<{
    id: number;
    fieldName: string | null;
    severity: string | null;
    rawSnippet: string | null;
    normalisedSnippet: string | null;
    confidence: string | null;
    pageNumber: number | null;
    boundingBox: unknown;
    whyItMatters?: string | null;
    suggestedFix?: string | null;
    ruleId?: string | null;
    reasonCode?: string | null;
  }>
): Finding[] {
  return findingsData.map(f => {
    // Post–Audit Policy: S1 = Major, S2 = Minor, S3 = Passed/informational
    const failClass: Finding["failClass"] =
      f.severity === "S0" || f.severity === "S1"
        ? "major"
        : f.severity === "S2"
          ? "minor"
          : "informational";
    const severity =
      failClass === "major"
        ? "critical"
        : failClass === "minor"
          ? "major"
          : "minor";
    const status =
      failClass === "major"
        ? "missing"
        : failClass === "minor"
          ? "warning"
          : "passed";
    const bb = f.boundingBox as
      | {
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          coordinateSpace?: string;
        }
      | null
      | undefined;
    const hasPercentBox =
      bb &&
      typeof bb.x === "number" &&
      typeof bb.y === "number" &&
      typeof bb.width === "number" &&
      typeof bb.height === "number" &&
      (bb.coordinateSpace == null || bb.coordinateSpace === "percent");

    return {
      id: f.id,
      field: f.fieldName || "Unknown Field",
      status,
      severity,
      failClass,
      ruleId: f.ruleId ?? undefined,
      reasonCode: f.reasonCode ?? undefined,
      value: f.rawSnippet || undefined,
      message: f.normalisedSnippet || undefined,
      whyItMatters: f.whyItMatters || undefined,
      suggestedFix: f.suggestedFix || undefined,
      confidence: parseFloat(f.confidence || "0") / 100,
      pageNumber: f.pageNumber || undefined,
      box: hasPercentBox
        ? {
            page: f.pageNumber || 1,
            x: bb!.x!,
            y: bb!.y!,
            width: bb!.width!,
            height: bb!.height!,
            label: f.fieldName || undefined,
          }
        : undefined,
    };
  });
}

export interface ReviewWorkstationPaneProps {
  jobSheetId: number;
  /** When provided, skip internal fetch (AuditResults already loaded data). */
  auditData?: AuditData;
  documentUrl?: string;
  compact?: boolean;
  showJobSheetActions?: boolean;
  onApproveJobSheet?: () => void;
  onRejectJobSheet?: () => void;
  approvePending?: boolean;
  rejectPending?: boolean;
  /** Ref for keyboard Enter → focus pane */
  paneRef?: RefObject<HTMLDivElement | null>;
}

export function ReviewWorkstationPane({
  jobSheetId,
  auditData: auditDataProp,
  documentUrl: documentUrlProp,
  compact = false,
  showJobSheetActions = false,
  onApproveJobSheet,
  onRejectJobSheet,
  approvePending,
  rejectPending,
  paneRef,
}: ReviewWorkstationPaneProps) {
  const {
    data: jobSheetData,
    isLoading: jobSheetLoading,
    error: jobSheetError,
  } = trpc.jobSheets.get.useQuery(
    { id: jobSheetId },
    { enabled: jobSheetId > 0 && !auditDataProp }
  );

  const { data: auditResult, isLoading: auditLoading } =
    trpc.audits.getByJobSheet.useQuery(
      { jobSheetId },
      {
        enabled:
          jobSheetId > 0 &&
          (auditDataProp
            ? // Parent supplied findings; still fetch reportJson for SelectionTracePanel.
              auditDataProp.selectionTrace === undefined
            : !!jobSheetData && isTerminalJobSheetStatus(jobSheetData.status)),
      }
    );

  const { data: findingsData } = trpc.audits.getFindings.useQuery(
    { auditResultId: auditResult?.id || 0 },
    { enabled: !!auditResult?.id && !auditDataProp }
  );

  const fetchedAuditData: AuditData | null =
    !auditDataProp && jobSheetData
      ? {
          id: jobSheetData.referenceNumber || `JS-${jobSheetData.id}`,
          status:
            auditResult?.result === "pass"
              ? "passed"
              : auditResult?.result === "fail"
                ? "failed"
                : jobSheetData.status === "completed"
                  ? "passed"
                  : "pending",
          score:
            auditResult?.confidenceScore ||
            (jobSheetData.status === "completed" ? "100" : "-"),
          date: new Date(jobSheetData.createdAt).toLocaleDateString(),
          technician: `User ${jobSheetData.uploadedBy}`,
          documentUrl: jobSheetData.fileUrl,
          findings: mapFindingsFromApi(findingsData || []),
          hasMajorFails: mapHasMajorFailsFromReport(auditResult?.reportJson),
          selectionTrace: mapSelectionTraceFromReport(auditResult?.reportJson),
          selectionMarks: mapSelectionMarksFromReport(auditResult?.reportJson),
          docQualityPenalties: mapDocQualityPenaltiesFromReport(
            auditResult?.reportJson
          ),
          ...(() => {
            const fps = mapFailurePathSignalsFromReport(
              auditResult?.reportJson
            );
            return fps.signals
              ? {
                  failurePathSignals: fps.signals,
                  failurePathSignalSummary: fps.signalSummary,
                }
              : {};
          })(),
        }
      : null;

  const selectionTrace =
    auditDataProp?.selectionTrace !== undefined
      ? (auditDataProp.selectionTrace ?? null)
      : mapSelectionTraceFromReport(auditResult?.reportJson);

  const selectionMarks =
    auditDataProp?.selectionMarks !== undefined
      ? (auditDataProp.selectionMarks ?? null)
      : mapSelectionMarksFromReport(auditResult?.reportJson);

  const hasMajorFails =
    auditDataProp?.hasMajorFails !== undefined
      ? auditDataProp.hasMajorFails
      : mapHasMajorFailsFromReport(auditResult?.reportJson);

  const docQualityPenalties =
    auditDataProp?.docQualityPenalties ??
    mapDocQualityPenaltiesFromReport(auditResult?.reportJson);

  const failurePathSignalsDerived = (() => {
    if (auditDataProp?.failurePathSignals !== undefined) {
      return {
        signals: auditDataProp.failurePathSignals ?? null,
        signalSummary: auditDataProp.failurePathSignalSummary ?? null,
      };
    }
    return mapFailurePathSignalsFromReport(auditResult?.reportJson);
  })();

  const auditData = auditDataProp
    ? {
        ...auditDataProp,
        selectionTrace,
        selectionMarks,
        hasMajorFails,
        docQualityPenalties,
        failurePathSignals: failurePathSignalsDerived.signals,
        failurePathSignalSummary: failurePathSignalsDerived.signalSummary,
      }
    : fetchedAuditData
      ? {
          ...fetchedAuditData,
          hasMajorFails,
          failurePathSignals: failurePathSignalsDerived.signals,
          failurePathSignalSummary: failurePathSignalsDerived.signalSummary,
        }
      : null;
  const documentUrl =
    documentUrlProp ??
    (jobSheetId > 0 ? `/api/documents/${jobSheetId}/pdf` : undefined);

  if (!auditDataProp && jobSheetLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!auditDataProp && jobSheetError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive p-6">
        <AlertCircle className="h-12 w-12 mb-3" />
        <p className="font-semibold">Failed to load job sheet</p>
        <p className="text-sm text-muted-foreground">{jobSheetError.message}</p>
      </div>
    );
  }

  if (!auditDataProp && auditLoading && jobSheetData) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        Loading audit results...
      </div>
    );
  }

  if (!auditData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
        <AlertCircle className="h-12 w-12 mb-3 opacity-40" />
        <p className="font-medium">No audit data yet</p>
        <p className="text-sm text-center max-w-xs mt-1">
          This job sheet may still be processing or has no audit result.
        </p>
      </div>
    );
  }

  return (
    <ReviewWorkstationContent
      key={jobSheetId}
      auditData={auditData}
      documentUrl={documentUrl}
      jobSheetId={jobSheetId}
      compact={compact}
      showJobSheetActions={showJobSheetActions}
      onApproveJobSheet={onApproveJobSheet}
      onRejectJobSheet={onRejectJobSheet}
      approvePending={approvePending}
      rejectPending={rejectPending}
      paneRef={paneRef}
    />
  );
}

function ReviewWorkstationContent({
  auditData,
  documentUrl,
  jobSheetId,
  compact,
  showJobSheetActions,
  onApproveJobSheet,
  onRejectJobSheet,
  approvePending,
  rejectPending,
  paneRef,
}: {
  auditData: AuditData;
  documentUrl?: string;
  jobSheetId: number;
  compact: boolean;
  showJobSheetActions: boolean;
  onApproveJobSheet?: () => void;
  onRejectJobSheet?: () => void;
  approvePending?: boolean;
  rejectPending?: boolean;
  paneRef?: RefObject<HTMLDivElement | null>;
}) {
  const [activeBoxId, setActiveBoxId] = useState<string | number | null>(null);
  const [focusPage, setFocusPage] = useState<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [newBox, setNewBox] = useState<ViewerBoundingBox | null>(null);
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [annotationComment, setAnnotationComment] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [feedbackType, setFeedbackType] = useState("incorrect");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [actionDialog, setActionDialog] = useState<{
    finding: Finding;
    action: "override" | "waive";
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [correctionDialog, setCorrectionDialog] = useState<Finding | null>(
    null
  );
  const [correctedValue, setCorrectedValue] = useState("");
  // Default true = auto-load PDF. Remount via key={jobSheetId} on parent resets state.
  const [showPdfViewer, setShowPdfViewer] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const localPaneRef = useRef<HTMLDivElement>(null);
  const resolvedPaneRef = paneRef ?? localPaneRef;

  const createDispute = trpc.disputes.create.useMutation();
  const flagMutation = trpc.auditActions.flag.useMutation();
  const overrideMutation = trpc.auditActions.override.useMutation();
  const waiveMutation = trpc.auditActions.waive.useMutation();
  const undoMutation = trpc.auditActions.undo.useMutation();
  const bulkApproveMutation = trpc.auditActions.bulkApprove.useMutation();
  const captureCorrection =
    trpc.auditActions.captureFieldCorrection.useMutation();
  const undoCorrection = trpc.auditActions.undoFieldCorrection.useMutation();
  const reprocessMutation = trpc.jobSheets.reprocess.useMutation();
  const utils = trpc.useUtils();

  const invalidateFindings = () => {
    utils.audits.getFindings.invalidate();
    utils.audits.getByJobSheet.invalidate();
    utils.jobSheets.list.invalidate();
  };

  const handleReprocess = () => {
    if (!jobSheetId) return;
    reprocessMutation.mutate(
      { id: jobSheetId },
      {
        onSuccess: () => {
          toast.success("Reprocessing started — results will refresh automatically");
          utils.jobSheets.get.invalidate({ id: jobSheetId });
          invalidateFindings();
        },
        onError: err => {
          const msg = err.message || "Reprocess failed";
          if (msg.includes("UNAUTHORIZED") || msg.includes("FORBIDDEN")) {
            toast.error("You don't have permission to reprocess this job sheet");
          } else {
            toast.error(msg);
          }
        },
      }
    );
  };

  const showUndoToast = (findingId: number, label: string) => {
    toast.success(label, {
      action: {
        label: "Undo",
        onClick: () => {
          undoMutation.mutate(
            { findingId },
            {
              onSuccess: () => {
                invalidateFindings();
                toast.success("Action undone");
              },
              onError: err => toast.error(err.message || "Undo failed"),
            }
          );
        },
      },
    });
  };

  const resolveFindingId = (finding: Finding): number | null =>
    typeof finding.id === "number" ? finding.id : null;

  const handleFlagForReview = () => {
    const target =
      (activeBoxId != null
        ? auditData.findings.find(f => f.id === activeBoxId)
        : null) ??
      auditData.findings.find(f => f.status !== "passed") ??
      auditData.findings[0];
    const findingId = target ? resolveFindingId(target) : null;
    if (!findingId) {
      toast.error("No finding available to flag");
      return;
    }
    flagMutation.mutate(
      { findingId, reason: "Flagged for review from workstation" },
      {
        onSuccess: () => {
          invalidateFindings();
          showUndoToast(findingId, "Flagged for review");
        },
        onError: err => toast.error(err.message || "Flag failed"),
      }
    );
  };

  const openOverrideForFinding = (finding: Finding) => {
    setActionDialog({ finding, action: "override" });
    setActionReason("");
  };

  const openCorrectForFinding = (finding: Finding) => {
    setCorrectionDialog(finding);
    setCorrectedValue(finding.message || finding.value || "");
  };

  const handleOverrideClick = (finding: Finding, e: MouseEvent) => {
    e.stopPropagation();
    openOverrideForFinding(finding);
  };

  const handleCorrectClick = (finding: Finding, e: MouseEvent) => {
    e.stopPropagation();
    openCorrectForFinding(finding);
  };

  const submitCorrection = () => {
    if (!correctionDialog) return;
    const findingId = resolveFindingId(correctionDialog);
    if (!findingId) {
      toast.error("Invalid finding id");
      return;
    }
    if (!correctedValue.trim()) {
      toast.error("Enter a corrected value");
      return;
    }
    captureCorrection.mutate(
      {
        findingId,
        fieldName: correctionDialog.field,
        originalValue: correctionDialog.value,
        correctedValue: correctedValue.trim(),
      },
      {
        onSuccess: result => {
          invalidateFindings();
          setCorrectionDialog(null);
          setCorrectedValue("");
          toast.success("Correction saved", {
            action: {
              label: "Undo",
              onClick: () => {
                undoCorrection.mutate(
                  {
                    findingId: result.findingId,
                    previousSnippet: result.previousSnippet,
                  },
                  {
                    onSuccess: () => {
                      invalidateFindings();
                      toast.success("Correction undone");
                    },
                    onError: err =>
                      toast.error(err.message || "Undo correction failed"),
                  }
                );
              },
            },
          });
        },
        onError: err => toast.error(err.message || "Correction failed"),
      }
    );
  };

  const handleBulkApproveFindings = () => {
    const openIds = auditData.findings
      .filter(f => f.status !== "passed")
      .map(f => resolveFindingId(f))
      .filter((id): id is number => id != null);
    if (openIds.length === 0) {
      toast.error("No open findings to approve");
      return;
    }
    bulkApproveMutation.mutate(
      {
        findingIds: openIds,
        reason: "Bulk approved open findings from workstation",
      },
      {
        onSuccess: result => {
          invalidateFindings();
          toast.success(
            `Approved ${result.approvedIds.length} finding(s)` +
              (result.skippedIds.length
                ? ` (${result.skippedIds.length} skipped)`
                : "")
          );
        },
        onError: err => toast.error(err.message || "Bulk approve failed"),
      }
    );
  };

  const submitActionDialog = () => {
    if (!actionDialog) return;
    const findingId = resolveFindingId(actionDialog.finding);
    if (!findingId) {
      toast.error("Invalid finding id");
      return;
    }
    if (!actionReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    const mutation =
      actionDialog.action === "waive" ? waiveMutation : overrideMutation;
    const label =
      actionDialog.action === "waive" ? "Finding waived" : "Finding overridden";
    mutation.mutate(
      { findingId, reason: actionReason.trim() },
      {
        onSuccess: () => {
          invalidateFindings();
          setActionDialog(null);
          setActionReason("");
          showUndoToast(findingId, label);
        },
        onError: err => toast.error(err.message || "Action failed"),
      }
    );
  };

  const boxes: ViewerBoundingBox[] = findingsToViewerBoxes(
    auditData.findings.map(f => ({
      id: f.id,
      pageNumber: f.pageNumber ?? f.box?.page,
      box: f.box,
      field: f.field,
      severity: f.severity,
      status: f.status,
      label: f.box?.label || f.field,
    }))
  );

  const handleBoxClick = (id: string | number) => {
    const { activeBoxId: nextId } = syncSelectionFromBox(id);
    setActiveBoxId(nextId);
    const finding = auditData.findings.find(f => f.id === id);
    const page = finding?.box?.page ?? finding?.pageNumber ?? 1;
    setFocusPage(page);
    setFocusLabel(finding?.field || finding?.box?.label || null);
    setFocusNonce(n => n + 1);
    requestAnimationFrame(() => {
      const element = document.getElementById(`finding-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  const handleFindingClick = (id: string | number) => {
    const finding = auditData.findings.find(f => f.id === id) ?? null;
    const sync = syncSelectionFromFinding(
      finding
        ? {
            id: finding.id,
            pageNumber: finding.pageNumber ?? finding.box?.page,
            box: finding.box,
            boundingBox: finding.box
              ? {
                  x: finding.box.x,
                  y: finding.box.y,
                  width: finding.box.width,
                  height: finding.box.height,
                  coordinateSpace: "percent",
                  page: finding.box.page,
                }
              : undefined,
            field: finding.field,
            fieldName: finding.field,
            label: finding.box?.label || finding.field,
            severity: finding.severity,
            status: finding.status,
          }
        : null
    );
    setActiveBoxId(sync.activeBoxId);
    setFocusPage(sync.focusPage ?? 1);
    setFocusLabel(sync.focusLabel);
    setFocusNonce(n => n + 1);
    if (!showPdfViewer) {
      setShowPdfViewer(true);
    }
    requestAnimationFrame(() => {
      const element = document.getElementById(`finding-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  const navigationFindings = useMemo(() => {
    const issues = auditData.findings.filter(f => f.status !== "passed");
    return issues.length > 0 ? issues : auditData.findings;
  }, [auditData.findings]);

  const selectFindingByOffset = usePersistFn((delta: number) => {
    if (navigationFindings.length === 0) return;
    const currentIdx =
      activeBoxId != null
        ? navigationFindings.findIndex(f => f.id === activeBoxId)
        : -1;
    const nextIdx =
      currentIdx < 0
        ? delta > 0
          ? 0
          : navigationFindings.length - 1
        : Math.max(
            0,
            Math.min(navigationFindings.length - 1, currentIdx + delta)
          );
    handleFindingClick(navigationFindings[nextIdx].id);
  });

  const getActiveFinding = usePersistFn((): Finding | null => {
    if (activeBoxId != null) {
      const active = auditData.findings.find(f => f.id === activeBoxId);
      if (active) return active;
    }
    return (
      navigationFindings[0] ??
      auditData.findings.find(f => f.status !== "passed") ??
      auditData.findings[0] ??
      null
    );
  });

  const onNextFinding = usePersistFn(() => selectFindingByOffset(1));
  const onPrevFinding = usePersistFn(() => selectFindingByOffset(-1));
  const onOverrideFinding = usePersistFn(() => {
    const finding = getActiveFinding();
    if (!finding) {
      toast.error("No finding selected");
      return;
    }
    if (finding.status === "passed") {
      toast.error("Override applies to open findings");
      return;
    }
    openOverrideForFinding(finding);
  });
  const onCorrectFinding = usePersistFn(() => {
    const finding = getActiveFinding();
    if (!finding) {
      toast.error("No finding selected");
      return;
    }
    openCorrectForFinding(finding);
  });
  const onViewFinding = usePersistFn(() => {
    const finding = getActiveFinding();
    if (!finding) {
      toast.error("No finding selected");
      return;
    }
    handleFindingClick(finding.id);
    resolvedPaneRef.current?.focus();
  });

  const findingKeyboardHandlers = useMemo(
    () => ({
      onNextFinding,
      onPrevFinding,
      onOverrideFinding,
      onCorrectFinding,
      onViewFinding,
    }),
    [
      onNextFinding,
      onPrevFinding,
      onOverrideFinding,
      onCorrectFinding,
      onViewFinding,
    ]
  );

  useReviewFindingKeyboard(
    findingKeyboardHandlers,
    auditData.findings.length > 0
  );

  const handleBoxCreate = (box: ViewerBoundingBox) => {
    setNewBox(box);
    setAnnotationOpen(true);
  };

  const submitAnnotation = () => {
    if (!newBox) return;
    toast.success("Annotation saved successfully");
    setAnnotationOpen(false);
    setNewBox(null);
    setAnnotationLabel("");
    setAnnotationComment("");
  };

  const handleReportIssue = (finding: Finding, e: MouseEvent) => {
    e.stopPropagation();
    setSelectedFinding(finding);
    setFeedbackOpen(true);
  };

  const submitFeedback = () => {
    if (!selectedFinding) return;
    createDispute.mutate(
      {
        auditFindingId:
          typeof selectedFinding.id === "number" ? selectedFinding.id : 1,
        reason: `[${feedbackType}] ${feedbackComment}`,
      },
      {
        onSuccess: () => {
          toast.success("Feedback submitted successfully");
          setFeedbackOpen(false);
          setFeedbackComment("");
        },
        onError: () => {
          toast.error("Failed to submit feedback");
        },
      }
    );
  };

  const passedFindings = auditData.findings.filter(f => f.status === "passed");
  const failedFindings = auditData.findings.filter(f => f.status !== "passed");

  return (
    <div
      ref={resolvedPaneRef}
      tabIndex={-1}
      className={`flex flex-col outline-none ${compact ? "h-full min-h-0" : "h-[calc(100vh-5.5rem)]"}`}
    >
      <div
        className={`flex items-center justify-between shrink-0 ${compact ? "mb-2 px-1" : "mb-2"}`}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2
              className={`font-bold tracking-tight ${compact ? "text-lg" : "text-2xl"}`}
            >
              {auditData.id}
            </h2>
            <Badge
              variant={
                auditData.status === "passed" ? "default" : "destructive"
              }
            >
              {auditData.status.toUpperCase()}
            </Badge>
            {(auditData.hasMajorFails ||
              (auditData.status === "failed" &&
                auditData.findings.some(f => f.failClass === "major"))) && (
              <Badge variant="destructive" className="font-semibold">
                Major fail
              </Badge>
            )}
            <DocQualityBreakdown
              score={auditData.score}
              penalties={auditData.docQualityPenalties ?? []}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Technician: {auditData.technician} • Date: {auditData.date} •{" "}
            {passedFindings.length} passed, {failedFindings.length} issues
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {showJobSheetActions && (
            <>
              <Button
                size="sm"
                onClick={onApproveJobSheet}
                disabled={approvePending}
              >
                {approvePending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onRejectJobSheet}
                disabled={rejectPending}
              >
                Reject
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReprocess}
            disabled={reprocessMutation.isPending}
          >
            {reprocessMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            Reprocess
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkApproveFindings}
            disabled={
              bulkApproveMutation.isPending || failedFindings.length === 0
            }
          >
            {bulkApproveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Approve open findings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFlagForReview}
            disabled={flagMutation.isPending}
          >
            {flagMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Flag className="w-4 h-4 mr-2" />
            )}
            Flag
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLegend(v => !v)}
            aria-label="Toggle keyboard shortcuts"
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Shortcuts
          </Button>
          {!compact && (
            <>
              <ViewPdfButton jobSheetId={jobSheetId} auditId={auditData.id} />
              <DownloadPdfButton
                jobSheetId={jobSheetId}
                auditId={auditData.id}
              />
            </>
          )}
        </div>
      </div>

      {showLegend && (
        <ReviewShortcutsLegend
          variant="workstation"
          className="bg-muted/40 mb-2"
        />
      )}

      <div className={compact ? "mb-2 px-1 space-y-2" : "mb-2 space-y-2"}>
        <SelectionTracePanel
          trace={auditData.selectionTrace ?? null}
          defaultOpen={false}
          className="shadow-none"
        />
        <SelectionMarksPanel
          marks={auditData.selectionMarks ?? null}
          defaultOpen={
            (auditData.selectionMarks?.rows.some(r => r.choice === "Fail") ||
              false) ??
            false
          }
          className="shadow-none"
          onRowClick={(_rowIndex, pageNumber) => {
            setFocusPage(pageNumber);
            if (!showPdfViewer) setShowPdfViewer(true);
          }}
        />
        <FailurePathSignalsPanel
          signals={auditData.failurePathSignals ?? null}
          signalSummary={auditData.failurePathSignalSummary}
          defaultOpen={auditData.failurePathSignals?.onFailurePath ?? false}
          className="shadow-none"
        />
      </div>

      {/* Document-first landscape: PDF takes ~70–75% width; findings are a narrow review rail */}
      <div
        className={`flex-1 grid grid-cols-1 min-h-0 gap-3 ${
          compact
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(280px,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(300px,24rem)]"
        }`}
      >
        <div className="flex flex-col min-h-0 min-w-0 h-full overflow-hidden rounded-lg border border-border bg-white">
          {!showPdfViewer ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/20 p-6">
              <Eye className="w-12 h-12 mb-4 opacity-40" />
              <p className="text-sm font-medium mb-2">Document Preview</p>
              <p className="text-xs text-center max-w-[220px] mb-4">
                Load the document to review findings against the page.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPdfViewer(true)}
              >
                <Eye className="w-4 h-4 mr-2" />
                Load Preview
              </Button>
            </div>
          ) : (
            <DocumentViewer
              url={documentUrl || ""}
              boxes={boxes}
              activeBoxId={activeBoxId}
              focusPage={focusPage}
              focusNonce={focusNonce}
              focusLabel={focusLabel}
              onBoxClick={handleBoxClick}
              onBoxCreate={handleBoxCreate}
            />
          )}
        </div>

        <Card className="flex flex-col h-full min-h-0 overflow-hidden min-w-0">
          <CardHeader className="py-2.5 px-3 border-b shrink-0">
            <CardTitle className="text-sm font-medium">
              Audit Findings
            </CardTitle>
          </CardHeader>

          <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
            <div className="px-3 pt-2 shrink-0">
              <TabsList className="w-full grid grid-cols-3 h-9">
                <TabsTrigger value="all" className="text-xs">
                  All ({auditData.findings.length})
                </TabsTrigger>
                <TabsTrigger value="issues" className="text-xs">
                  Issues ({failedFindings.length})
                </TabsTrigger>
                <TabsTrigger value="passed" className="text-xs">
                  Passed ({passedFindings.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="flex-1 min-h-0 m-0">
              <FindingsList
                findings={auditData.findings}
                activeBoxId={activeBoxId}
                onFindingClick={handleFindingClick}
                onReportIssue={handleReportIssue}
                onOverride={handleOverrideClick}
                onCorrect={handleCorrectClick}
              />
            </TabsContent>

            <TabsContent value="issues" className="flex-1 min-h-0 m-0">
              <IssuesTabContent
                findings={failedFindings}
                activeBoxId={activeBoxId}
                onFindingClick={handleFindingClick}
                onReportIssue={handleReportIssue}
                onOverride={handleOverrideClick}
                onCorrect={handleCorrectClick}
              />
            </TabsContent>

            <TabsContent value="passed" className="flex-1 min-h-0 m-0">
              <FindingsList
                findings={passedFindings}
                activeBoxId={activeBoxId}
                onFindingClick={handleFindingClick}
                onReportIssue={handleReportIssue}
                onOverride={handleOverrideClick}
                onCorrect={handleCorrectClick}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Dialog open={annotationOpen} onOpenChange={setAnnotationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Annotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Select
                value={annotationLabel}
                onValueChange={setAnnotationLabel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing">Missing Field</SelectItem>
                  <SelectItem value="incorrect">Incorrect Value</SelectItem>
                  <SelectItem value="unclear">Unclear/Illegible</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comment</Label>
              <Textarea
                placeholder="Add a comment..."
                value={annotationComment}
                onChange={e => setAnnotationComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnotationOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAnnotation}>Save Annotation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Issue with Finding</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Issue Type</Label>
              <Select value={feedbackType} onValueChange={setFeedbackType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incorrect">Incorrect Finding</SelectItem>
                  <SelectItem value="false_positive">False Positive</SelectItem>
                  <SelectItem value="missing_context">
                    Missing Context
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea
                placeholder="Please describe the issue..."
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitFeedback} disabled={createDispute.isPending}>
              {createDispute.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!actionDialog}
        onOpenChange={open => {
          if (!open) {
            setActionDialog(null);
            setActionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === "waive"
                ? "Waive Finding"
                : "Override Finding"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {actionDialog?.finding.field}
              {actionDialog?.finding.message
                ? ` — ${actionDialog.finding.message}`
                : ""}
            </p>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Explain why this action is justified..."
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
              />
            </div>
            {actionDialog?.action === "override" && (
              <Button
                variant="link"
                className="px-0 h-auto"
                onClick={() =>
                  setActionDialog(
                    actionDialog
                      ? { finding: actionDialog.finding, action: "waive" }
                      : null
                  )
                }
              >
                Switch to waive instead
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog(null);
                setActionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submitActionDialog}
              disabled={
                overrideMutation.isPending ||
                waiveMutation.isPending ||
                !actionReason.trim()
              }
            >
              {(overrideMutation.isPending || waiveMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {actionDialog?.action === "waive" ? "Waive" : "Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!correctionDialog}
        onOpenChange={open => {
          if (!open) {
            setCorrectionDialog(null);
            setCorrectedValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct field value</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {correctionDialog?.field}
            </p>
            <div className="space-y-2">
              <Label>Original</Label>
              <Input
                value={
                  correctionDialog?.value ||
                  correctionDialog?.message ||
                  "(empty)"
                }
                readOnly
                className="font-mono bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Corrected value</Label>
              <Textarea
                placeholder="Enter the correct value..."
                value={correctedValue}
                onChange={e => setCorrectedValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCorrectionDialog(null);
                setCorrectedValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submitCorrection}
              disabled={captureCorrection.isPending || !correctedValue.trim()}
            >
              {captureCorrection.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FindingsListProps {
  findings: Finding[];
  activeBoxId: string | number | null;
  onFindingClick: (id: string | number) => void;
  onReportIssue: (finding: Finding, e: MouseEvent) => void;
  onOverride: (finding: Finding, e: MouseEvent) => void;
  onCorrect: (finding: Finding, e: MouseEvent) => void;
}

function FindingsList({
  findings,
  activeBoxId,
  onFindingClick,
  onReportIssue,
  onOverride,
  onCorrect,
}: FindingsListProps) {
  if (findings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No findings in this category.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {findings.map(finding => (
          <div
            key={finding.id}
            id={`finding-${finding.id}`}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              activeBoxId === finding.id
                ? "ring-2 ring-primary border-primary bg-primary/5"
                : "hover:bg-muted/50"
            } ${
              finding.status === "missing"
                ? "bg-red-50/50 border-red-200"
                : finding.status === "warning"
                  ? "bg-orange-50/50 border-orange-200"
                  : "bg-green-50/50 border-green-200"
            }`}
            onClick={() => onFindingClick(finding.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {finding.status === "missing" ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : finding.status === "warning" ? (
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                )}
                <h3 className="font-semibold text-sm">{finding.field}</h3>
                {finding.failClass === "major" && (
                  <Badge variant="destructive" className="text-[10px] px-1.5">
                    Major
                  </Badge>
                )}
                {finding.failClass === "minor" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    Minor
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {finding.ruleId && (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] px-1.5 bg-slate-50 text-slate-600 border-slate-300"
                    title={`Rule: ${finding.ruleId}${finding.reasonCode ? ` — ${finding.reasonCode}` : ""}`}
                  >
                    {finding.ruleId}
                  </Badge>
                )}
                {finding.reasonCode && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 bg-violet-50 text-violet-600 border-violet-300"
                    title={`Reason code: ${finding.reasonCode}`}
                  >
                    {finding.reasonCode}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-white/50">
                  {(finding.confidence * 100).toFixed(0)}% Extract conf.
                </Badge>
              </div>
            </div>

            {finding.value && (
              <div className="mb-2 p-2 bg-white/60 rounded border border-black/5 font-mono text-sm">
                {finding.value}
              </div>
            )}

            {finding.message && (
              <p
                className={`text-sm ${
                  finding.status === "missing"
                    ? "text-red-700"
                    : finding.status === "warning"
                      ? "text-orange-700"
                      : "text-emerald-800"
                }`}
              >
                {finding.message}
              </p>
            )}

            {finding.whyItMatters && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                {finding.whyItMatters}
              </p>
            )}

            {finding.suggestedFix && finding.status !== "passed" && (
              <p className="mt-1 text-xs text-slate-700">
                Suggested fix: {finding.suggestedFix}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  onFindingClick(finding.id);
                }}
              >
                <Eye className="w-3 h-3 mr-1" /> View on Doc
              </Button>
              {finding.status !== "passed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs hover:text-destructive"
                  onClick={e => onOverride(finding, e)}
                >
                  Override
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={e => onCorrect(finding, e)}
              >
                <Pencil className="w-3 h-3 mr-1" /> Correct value
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary ml-auto"
                onClick={e => onReportIssue(finding, e)}
              >
                <MessageSquare className="w-3 h-3 mr-1" /> Report Issue
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function IssuesTabContent({
  findings,
  activeBoxId,
  onFindingClick,
  onReportIssue,
  onOverride,
  onCorrect,
}: FindingsListProps) {
  const relationshipFindings = findings.filter(isRelationshipFinding);
  const otherFindings = findings.filter(f => !isRelationshipFinding(f));

  if (findings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No findings in this category.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {relationshipFindings.length > 0 && (
          <RelationshipFindingsGroup
            findings={relationshipFindings}
            activeBoxId={activeBoxId}
            onFindingClick={onFindingClick}
            onReportIssue={onReportIssue}
            onOverride={onOverride}
            onCorrect={onCorrect}
          />
        )}
        {otherFindings.map(finding => (
          <div
            key={finding.id}
            id={`finding-${finding.id}`}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              activeBoxId === finding.id
                ? "ring-2 ring-primary border-primary bg-primary/5"
                : "hover:bg-muted/50"
            } ${
              finding.status === "missing"
                ? "bg-red-50/50 border-red-200"
                : finding.status === "warning"
                  ? "bg-orange-50/50 border-orange-200"
                  : "bg-green-50/50 border-green-200"
            }`}
            onClick={() => onFindingClick(finding.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {finding.status === "missing" ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : finding.status === "warning" ? (
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                )}
                <h3 className="font-semibold text-sm">{finding.field}</h3>
                {finding.failClass === "major" && (
                  <Badge variant="destructive" className="text-[10px] px-1.5">
                    Major
                  </Badge>
                )}
                {finding.failClass === "minor" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    Minor
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {finding.ruleId && (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] px-1.5 bg-slate-50 text-slate-600 border-slate-300"
                    title={`Rule: ${finding.ruleId}${finding.reasonCode ? ` — ${finding.reasonCode}` : ""}`}
                  >
                    {finding.ruleId}
                  </Badge>
                )}
                {finding.reasonCode && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 bg-violet-50 text-violet-600 border-violet-300"
                    title={`Reason code: ${finding.reasonCode}`}
                  >
                    {finding.reasonCode}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-white/50">
                  {(finding.confidence * 100).toFixed(0)}% Extract conf.
                </Badge>
              </div>
            </div>

            {finding.value && (
              <div className="mb-2 p-2 bg-white/60 rounded border border-black/5 font-mono text-sm">
                {finding.value}
              </div>
            )}

            {finding.message && (
              <p
                className={`text-sm ${
                  finding.status === "missing"
                    ? "text-red-700"
                    : finding.status === "warning"
                      ? "text-orange-700"
                      : "text-emerald-800"
                }`}
              >
                {finding.message}
              </p>
            )}

            {finding.whyItMatters && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                {finding.whyItMatters}
              </p>
            )}

            {finding.suggestedFix && finding.status !== "passed" && (
              <p className="mt-1 text-xs text-slate-700">
                Suggested fix: {finding.suggestedFix}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  onFindingClick(finding.id);
                }}
              >
                <Eye className="w-3 h-3 mr-1" /> View on Doc
              </Button>
              {finding.status !== "passed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs hover:text-destructive"
                  onClick={e => onOverride(finding, e)}
                >
                  Override
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={e => onCorrect(finding, e)}
              >
                <Pencil className="w-3 h-3 mr-1" /> Correct value
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary ml-auto"
                onClick={e => onReportIssue(finding, e)}
              >
                <MessageSquare className="w-3 h-3 mr-1" /> Report Issue
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ViewPdfButton({
  jobSheetId,
  auditId,
}: {
  jobSheetId: number;
  auditId: string;
}) {
  const handleClick = () => {
    if (!jobSheetId) {
      toast.error("No job sheet ID available");
      return;
    }
    window.open(`/api/documents/${jobSheetId}/pdf`, "_blank");
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={!jobSheetId}
    >
      <Eye className="w-4 h-4 mr-2" />
      View PDF
    </Button>
  );
}

function DownloadPdfButton({
  jobSheetId,
  auditId,
}: {
  jobSheetId: number;
  auditId: string;
}) {
  const handleClick = () => {
    if (!jobSheetId) {
      toast.error("No job sheet ID available");
      return;
    }
    const link = document.createElement("a");
    link.href = `/api/documents/${jobSheetId}/pdf?download=1`;
    link.download = `${auditId}-document.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download started");
  };

  return (
    <Button size="sm" onClick={handleClick} disabled={!jobSheetId}>
      <Download className="w-4 h-4 mr-2" />
      Download
    </Button>
  );
}
