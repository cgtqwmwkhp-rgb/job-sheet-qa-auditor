/**
 * ReviewWorkstationPane (PR-13)
 *
 * Extracted from AuditResults: PDF preview + findings list with
 * PR-10 actions, PR-12 PDF↔finding sync, bulk finding approve,
 * and field correction capture.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Download,
  Eye,
  Flag,
  Keyboard,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  FileText,
} from "lucide-react";
import {
  useState,
  useRef,
  useMemo,
  useEffect,
  type RefObject,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
import { useAuth } from "@/contexts/AuthContext";
import {
  findingsToViewerBoxes,
  syncSelectionFromBox,
  syncSelectionFromFinding,
} from "@/lib/pdfFindingSync";
import {
  nextOpenFindingId,
  scrollFindingIntoView,
} from "@/lib/reviewActionFeel";
import { isTerminalJobSheetStatus } from "@shared/processingProgress";
import { type SelectionTrace } from "@/components/audit/SelectionTracePanel";
import { mapSelectionTraceFromReport } from "@/components/review/mapSelectionTrace";
import { mapHasMajorFailsFromReport } from "@/components/review/mapAuditPolicy";
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
import {
  TyreFindingsGroup,
  isTyreComplianceFinding,
} from "@/components/review/TyreFindingsGroup";
import {
  CommentFindingsGroup,
  isCommentQualityFinding,
} from "@/components/review/CommentFindingsGroup";
import {
  PhotoEvidenceFindingsGroup,
  isPhotoPairFinding,
} from "@/components/review/PhotoEvidenceFindingsGroup";
import { ReviewShortcutsLegend } from "@/components/review/ReviewShortcutsLegend";
import {
  mapFailurePathSignalsFromReport,
  type FailurePathSignals,
} from "@/components/review/FailurePathSignalsPanel";
import {
  mapCommentQualityFromReport,
  type CommentQualitySignals,
} from "@/components/review/CommentQualityPanel";
import {
  mapPhotoPairCompareFromReport,
  resolvePhotoPairFindings,
  type PhotoPairCompareArtifact,
} from "@/components/review/BeforeAfterComparePane";
import {
  mapDeepNoteFromReport,
  type DeepNoteAnalysisData,
} from "@/components/DeepNoteAnalysis";
import {
  ClinicalContextStack,
  hasActionableClinicalContext,
} from "@/components/review/ClinicalContextStack";

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
  /** Unknown / low-confidence form — teach in Template Studio. */
  needsTemplateAuthoring?: boolean;
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
    resolutionStatus?: string | null;
  }>
): Finding[] {
  return findingsData.map(f => {
    // Check if finding has been resolved (approved, waived, overridden)
    const isResolved = f.resolutionStatus && f.resolutionStatus !== "open";

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
    // If finding is resolved, show as "passed"; otherwise use severity-based status
    const status = isResolved
      ? "passed"
      : failClass === "major"
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
  /** Optional back navigation (Audit Results list → detail). */
  onBack?: () => void;
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
  onBack,
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
          needsTemplateAuthoring: Boolean(
            (
              auditResult?.reportJson as
                | { needsTemplateAuthoring?: boolean }
                | null
                | undefined
            )?.needsTemplateAuthoring
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

  const commentQualityDerived = mapCommentQualityFromReport(
    auditResult?.reportJson
  );
  const photoPairCompare = mapPhotoPairCompareFromReport(
    auditResult?.reportJson
  );
  const deepNoteAnalysis = mapDeepNoteFromReport(auditResult?.reportJson);

  const auditData = auditDataProp
    ? {
        ...auditDataProp,
        selectionTrace,
        selectionMarks,
        hasMajorFails,
        docQualityPenalties,
        failurePathSignals: failurePathSignalsDerived.signals,
        failurePathSignalSummary: failurePathSignalsDerived.signalSummary,
        needsTemplateAuthoring:
          auditDataProp.needsTemplateAuthoring ??
          Boolean(
            (
              auditResult?.reportJson as
                | { needsTemplateAuthoring?: boolean }
                | null
                | undefined
            )?.needsTemplateAuthoring
          ),
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
    <ErrorBoundary>
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
        onBack={onBack}
        commentQualityDerived={commentQualityDerived}
        photoPairCompare={photoPairCompare}
        deepNoteAnalysis={deepNoteAnalysis}
      />
    </ErrorBoundary>
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
  onBack,
  commentQualityDerived,
  photoPairCompare,
  deepNoteAnalysis,
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
  onBack?: () => void;
  commentQualityDerived: {
    signals: CommentQualitySignals | null;
    summary: string | null;
  };
  photoPairCompare: PhotoPairCompareArtifact | null;
  deepNoteAnalysis: DeepNoteAnalysisData | null;
}) {
  const [activeBoxId, setActiveBoxId] = useState<string | number | null>(null);
  const [focusPage, setFocusPage] = useState<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
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
  /** Instant UI: treat these ids as passed while override/waive is in flight. */
  const [optimisticPassedIds, setOptimisticPassedIds] = useState(
    () => new Set<string | number>()
  );
  const [pendingActionIds, setPendingActionIds] = useState(
    () => new Set<number>()
  );
  const localPaneRef = useRef<HTMLDivElement>(null);
  const resolvedPaneRef = paneRef ?? localPaneRef;

  const focusWorkstationPane = usePersistFn(() => {
    resolvedPaneRef.current?.focus({ preventScroll: true });
  });

  // Arm keyboard path as soon as the workstation mounts (J-AUD-02/03).
  useEffect(() => {
    focusWorkstationPane();
  }, [focusWorkstationPane, jobSheetId]);

  const createDispute = trpc.disputes.create.useMutation();
  const flagMutation = trpc.auditActions.flag.useMutation();
  const overrideMutation = trpc.auditActions.override.useMutation();
  const approveMutation = trpc.auditActions.approve.useMutation();
  const waiveMutation = trpc.auditActions.waive.useMutation();
  const undoMutation = trpc.auditActions.undo.useMutation();
  const bulkApproveMutation = trpc.auditActions.bulkApprove.useMutation();
  const captureCorrection =
    trpc.auditActions.captureFieldCorrection.useMutation();
  const undoCorrection = trpc.auditActions.undoFieldCorrection.useMutation();
  const reprocessMutation = trpc.jobSheets.reprocess.useMutation();
  const templateOverrideMutation = trpc.templates.overrides.set.useMutation();
  const { data: templateCatalog } = trpc.templates.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideVersionId, setOverrideVersionId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const { hasRole } = useAuth();
  const canOverrideTemplate = hasRole(["admin", "qa_lead"]);
  const utils = trpc.useUtils();

  const displayFindings = useMemo(() => {
    if (optimisticPassedIds.size === 0) return auditData.findings;
    return auditData.findings.map(f =>
      optimisticPassedIds.has(f.id) ? { ...f, status: "passed" as const } : f
    );
  }, [auditData.findings, optimisticPassedIds]);

  // Drop optimistic marks once the server reflects the override/waive.
  useEffect(() => {
    setOptimisticPassedIds(prev => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        const server = auditData.findings.find(f => f.id === id);
        if (!server || server.status === "passed") {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [auditData.findings]);

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
          toast.success(
            "Reprocessing started — results will refresh automatically"
          );
          utils.jobSheets.get.invalidate({ id: jobSheetId });
          invalidateFindings();
        },
        onError: err => {
          const msg = err.message || "Reprocess failed";
          if (msg.includes("UNAUTHORIZED") || msg.includes("FORBIDDEN")) {
            toast.error(
              "You don't have permission to reprocess this job sheet"
            );
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
        ? displayFindings.find(f => f.id === activeBoxId)
        : null) ??
      displayFindings.find(f => f.status !== "passed") ??
      displayFindings[0];
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
    // Focus reason on next paint so o → type → ⌘↵ is one continuous keyboard path.
    requestAnimationFrame(() => {
      document.getElementById("override-reason")?.focus();
    });
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
          focusWorkstationPane();
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
    const openIds = displayFindings
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
    const finding = actionDialog.finding;
    const findingId = resolveFindingId(finding);
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
    const reason = actionReason.trim();
    const actionKind = actionDialog.action;

    // Close + optimistic pass immediately so p95 action feel is not network-bound.
    setActionDialog(null);
    setActionReason("");
    const nextOptimistic = new Set(optimisticPassedIds);
    nextOptimistic.add(finding.id);
    setOptimisticPassedIds(nextOptimistic);
    setPendingActionIds(prev => {
      const next = new Set(prev);
      next.add(findingId);
      return next;
    });

    const advanceId = nextOpenFindingId(
      navigationFindings,
      finding.id,
      nextOptimistic
    );
    if (advanceId != null) {
      handleFindingClick(advanceId);
    } else {
      focusWorkstationPane();
    }

    mutation.mutate(
      { findingId, reason },
      {
        onSuccess: () => {
          setPendingActionIds(prev => {
            const next = new Set(prev);
            next.delete(findingId);
            return next;
          });
          invalidateFindings();
          showUndoToast(findingId, label);
          focusWorkstationPane();
        },
        onError: err => {
          setOptimisticPassedIds(prev => {
            const next = new Set(prev);
            next.delete(finding.id);
            return next;
          });
          setPendingActionIds(prev => {
            const next = new Set(prev);
            next.delete(findingId);
            return next;
          });
          toast.error(err.message || "Action failed");
          setActionDialog({ finding, action: actionKind });
          setActionReason(reason);
        },
      }
    );
  };

  const onActionReasonKeyDown = (
    e: ReactKeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (actionReason.trim()) {
        submitActionDialog();
      }
    }
  };

  const applyBeforeAfterPairAction = (
    pairIndex: number,
    action: "approve" | "override"
  ) => {
    const pairs = Array.isArray(photoPairCompare?.pairs)
      ? photoPairCompare!.pairs
      : [];
    const pair = pairs[pairIndex];
    if (!pair) {
      toast.error("Pair not found");
      return;
    }
    const targets = resolvePhotoPairFindings(auditData.findings, pair);
    if (targets.length === 0) {
      toast.error("No PHOTO-C012/C013 finding mapped for this pair");
      return;
    }
    const reason =
      action === "approve"
        ? "Confirmed before/after pair catch from workstation"
        : "Overridden before/after pair from workstation";
    const mutation = action === "approve" ? approveMutation : overrideMutation;
    const label =
      action === "approve" ? "Pair catch confirmed" : "Pair finding overridden";

    void Promise.allSettled(
      targets.map(f => {
        const findingId = resolveFindingId(f);
        if (findingId == null) {
          return Promise.reject(new Error("Invalid finding id"));
        }
        return mutation.mutateAsync({ findingId, reason });
      })
    ).then(results => {
      const ok = results.filter(r => r.status === "fulfilled");
      const failed = results.filter(r => r.status === "rejected");
      if (ok.length > 0) {
        invalidateFindings();
        const firstId = resolveFindingId(targets[0]!);
        if (firstId != null) {
          showUndoToast(
            firstId,
            ok.length > 1 ? `${label} (${ok.length})` : label
          );
        } else {
          toast.success(label);
        }
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === results.length
            ? "Failed to persist pair decision"
            : `${failed.length} of ${results.length} pair finding actions failed`
        );
      }
    });
  };

  const handleConfirmPair = (pairIndex: number) =>
    applyBeforeAfterPairAction(pairIndex, "approve");

  const handleOverridePair = (pairIndex: number) =>
    applyBeforeAfterPairAction(pairIndex, "override");

  const boxes: ViewerBoundingBox[] = findingsToViewerBoxes(
    displayFindings.map(f => ({
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
    const finding = displayFindings.find(f => f.id === id);
    const page = finding?.box?.page ?? finding?.pageNumber ?? 1;
    setFocusPage(page);
    setFocusLabel(finding?.field || finding?.box?.label || null);
    setFocusNonce(n => n + 1);
    requestAnimationFrame(() => {
      scrollFindingIntoView(id);
      focusWorkstationPane();
    });
  };

  const handleFindingClick = (id: string | number) => {
    const finding = displayFindings.find(f => f.id === id) ?? null;
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
      scrollFindingIntoView(id);
      focusWorkstationPane();
    });
  };

  const navigationFindings = useMemo(() => {
    const issues = displayFindings.filter(f => f.status !== "passed");
    return issues.length > 0 ? issues : displayFindings;
  }, [displayFindings]);

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
      const active = displayFindings.find(f => f.id === activeBoxId);
      if (active) return active;
    }
    return (
      navigationFindings[0] ??
      displayFindings.find(f => f.status !== "passed") ??
      displayFindings[0] ??
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

  useReviewFindingKeyboard(findingKeyboardHandlers, displayFindings.length > 0);

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

  const passedFindings = displayFindings.filter(f => f.status === "passed");
  const failedFindings = displayFindings.filter(f => f.status !== "passed");

  const hasMajor =
    Boolean(auditData.hasMajorFails) ||
    displayFindings.some(f => f.failClass === "major" && f.status !== "passed");
  const outcome: {
    label: "Pass" | "Needs review" | "Fail";
    variant: "default" | "secondary" | "destructive";
  } = hasMajor
    ? { label: "Fail", variant: "destructive" }
    : failedFindings.length > 0
      ? { label: "Needs review", variant: "secondary" }
      : auditData.status === "failed"
        ? { label: "Fail", variant: "destructive" }
        : { label: "Pass", variant: "default" };

  return (
    <div
      ref={resolvedPaneRef}
      tabIndex={-1}
      data-review-workstation
      className="flex flex-col outline-none overflow-hidden h-full min-h-0"
    >
      <div
        className={`flex items-center justify-between shrink-0 gap-2 border-b border-[#EBE8E8] bg-white sticky top-0 z-10 ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}
      >
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[#333030] hover:bg-[#F5F4F4] shrink-0"
              onClick={onBack}
              aria-label="Back to audit list"
            >
              <ChevronLeft className="w-4 h-4 mr-0.5" />
              <span className="hidden sm:inline text-sm">All audits</span>
            </Button>
          )}
          <h2 className="font-semibold tracking-tight truncate text-base text-[#333030]">
            {auditData.id}
          </h2>
          <Badge
            variant={outcome.variant}
            className="font-semibold text-[10px]"
          >
            {outcome.label}
          </Badge>
          <DocQualityBreakdown
            score={auditData.score}
            penalties={auditData.docQualityPenalties ?? []}
          />
          <span className="text-xs text-muted-foreground truncate">
            {auditData.technician} · {auditData.date} · {failedFindings.length}{" "}
            issue{failedFindings.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showJobSheetActions && (
            <>
              <Button
                size="sm"
                className="h-8"
                onClick={onApproveJobSheet}
                disabled={approvePending}
              >
                {approvePending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span className="ml-1.5 hidden xl:inline">Approve</span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
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
            className="h-8"
            onClick={handleBulkApproveFindings}
            disabled={
              bulkApproveMutation.isPending || failedFindings.length === 0
            }
          >
            {bulkApproveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            )}
            Approve open
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleFlagForReview}
            disabled={flagMutation.isPending}
          >
            {flagMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Flag className="w-4 h-4 mr-1.5" />
            )}
            Flag
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleReprocess}
                disabled={reprocessMutation.isPending}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reprocess
              </DropdownMenuItem>
              {canOverrideTemplate && (
                <DropdownMenuItem onClick={() => setOverrideOpen(true)}>
                  <FileText className="w-4 h-4 mr-2" />
                  Override template + reprocess
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowLegend(v => !v)}>
                <Keyboard className="w-4 h-4 mr-2" />
                Shortcuts
              </DropdownMenuItem>
              {!compact && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (!jobSheetId) {
                        toast.error("No job sheet ID available");
                        return;
                      }
                      window.open(`/api/documents/${jobSheetId}/pdf`, "_blank");
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = `/api/documents/${jobSheetId}/pdf`;
                      a.download = `${auditData.id}.pdf`;
                      a.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showLegend && (
        <ReviewShortcutsLegend
          variant="workstation"
          className="bg-muted/40 shrink-0 border-b"
        />
      )}

      {canOverrideTemplate && auditData.needsTemplateAuthoring && (
        <div className="shrink-0 border-b border-[#BEDA41]/50 bg-[#BEDA41]/15 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[#333030]">
            Unknown or low-confidence form — teach the ordering tool what to
            look for in Template Studio.
          </p>
          <Button
            size="sm"
            className="h-8 bg-[#BEDA41] text-[#1a1f0a] hover:bg-[#a8c238]"
            onClick={() => {
              window.location.href = `/template-studio?fromJobSheet=${jobSheetId}`;
            }}
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Teach in Template Studio
          </Button>
        </div>
      )}

      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={
          compact ? "review-workstation-compact" : "review-workstation"
        }
        className={`flex-1 min-h-0 ${compact ? "lg:min-h-[40vh]" : ""}`}
      >
        <ResizablePanel
          defaultSize={compact ? 62 : 68}
          minSize={40}
          className="min-w-0"
        >
          <div className="flex flex-col min-h-0 min-w-0 h-full overflow-hidden bg-white border-r border-border">
            {!showPdfViewer ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/20 p-6">
                <Eye className="w-12 h-12 mb-4 opacity-40" />
                <p className="text-sm font-medium mb-2">Document Preview</p>
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
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle
          withHandle
          className="hidden lg:flex w-1.5 bg-[#EBE8E8] hover:bg-primary/40 transition-colors"
        />

        <ResizablePanel
          defaultSize={compact ? 38 : 32}
          minSize={22}
          maxSize={55}
          className="min-w-0"
        >
          <Card className="flex flex-col h-full min-h-0 overflow-hidden min-w-0 rounded-none border-0 shadow-none">
            <Tabs
              defaultValue="issues"
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="px-2 pt-2 shrink-0 border-b border-border pb-2">
                <TabsList className="w-full grid grid-cols-4 h-8">
                  <TabsTrigger value="issues" className="text-[11px] px-1">
                    Issues ({failedFindings.length})
                  </TabsTrigger>
                  <TabsTrigger value="all" className="text-[11px] px-1">
                    All ({auditData.findings.length})
                  </TabsTrigger>
                  <TabsTrigger value="passed" className="text-[11px] px-1">
                    Passed
                  </TabsTrigger>
                  <TabsTrigger value="context" className="text-[11px] px-1">
                    Context
                    {hasActionableClinicalContext({
                      commentSignals: commentQualityDerived.signals,
                      photoPairCompare,
                    }) ? (
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                    ) : null}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="issues"
                className="flex-1 min-h-0 m-0 overflow-hidden data-[state=inactive]:hidden"
              >
                <IssuesTabContent
                  findings={failedFindings}
                  activeBoxId={activeBoxId}
                  pendingActionIds={pendingActionIds}
                  onFindingClick={handleFindingClick}
                  onReportIssue={handleReportIssue}
                  onOverride={handleOverrideClick}
                  onCorrect={handleCorrectClick}
                />
              </TabsContent>

              <TabsContent
                value="all"
                className="flex-1 min-h-0 m-0 overflow-hidden data-[state=inactive]:hidden"
              >
                <FindingsList
                  findings={displayFindings}
                  activeBoxId={activeBoxId}
                  pendingActionIds={pendingActionIds}
                  onFindingClick={handleFindingClick}
                  onReportIssue={handleReportIssue}
                  onOverride={handleOverrideClick}
                  onCorrect={handleCorrectClick}
                />
              </TabsContent>

              <TabsContent
                value="passed"
                className="flex-1 min-h-0 m-0 overflow-hidden data-[state=inactive]:hidden"
              >
                <FindingsList
                  findings={passedFindings}
                  activeBoxId={activeBoxId}
                  pendingActionIds={pendingActionIds}
                  onFindingClick={handleFindingClick}
                  onReportIssue={handleReportIssue}
                  onOverride={handleOverrideClick}
                  onCorrect={handleCorrectClick}
                />
              </TabsContent>

              <TabsContent
                value="context"
                className="flex-1 min-h-0 m-0 overflow-hidden data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full">
                  <ClinicalContextStack
                    selectionTrace={auditData.selectionTrace ?? null}
                    selectionMarks={auditData.selectionMarks ?? null}
                    failurePathSignals={auditData.failurePathSignals ?? null}
                    failurePathSignalSummary={
                      auditData.failurePathSignalSummary
                    }
                    commentSignals={commentQualityDerived.signals}
                    commentSummary={commentQualityDerived.summary}
                    photoPairCompare={photoPairCompare}
                    deepNoteAnalysis={deepNoteAnalysis}
                    documentUrl={documentUrl}
                    onConfirmPair={handleConfirmPair}
                    onOverridePair={handleOverridePair}
                    onMarksRowClick={(_rowIndex, pageNumber) => {
                      setFocusPage(pageNumber);
                      if (!showPdfViewer) setShowPdfViewer(true);
                    }}
                  />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override template + reprocess</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Force a registry template version for this job sheet, then
              reprocess. Use when Selection Trace confidence is LOW or wrong.
            </p>
            <div className="space-y-2">
              <Label>Active template version</Label>
              <Select
                value={overrideVersionId}
                onValueChange={setOverrideVersionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select active version" />
                </SelectTrigger>
                <SelectContent>
                  {(templateCatalog ?? [])
                    .filter(t => t.activeVersionId != null)
                    .map(t => (
                      <SelectItem
                        key={t.activeVersionId!}
                        value={String(t.activeVersionId)}
                      >
                        {t.name} (v{t.activeVersion})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (min 5 chars)</Label>
              <Textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Wrong template auto-selected — force Generator Service"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                templateOverrideMutation.isPending ||
                !overrideVersionId ||
                overrideReason.trim().length < 5
              }
              onClick={() => {
                const versionId = Number(overrideVersionId);
                const tpl = (templateCatalog ?? []).find(
                  t => t.activeVersionId === versionId
                );
                if (!tpl?.activeVersionId || !jobSheetId) return;
                templateOverrideMutation.mutate(
                  {
                    jobSheetId,
                    templateId: tpl.id,
                    versionId,
                    originalConfidence:
                      auditData.selectionTrace?.confidenceBand === "HIGH" ||
                      auditData.selectionTrace?.confidenceBand === "MEDIUM" ||
                      auditData.selectionTrace?.confidenceBand === "LOW"
                        ? auditData.selectionTrace.confidenceBand
                        : "LOW",
                    originalTopScore:
                      auditData.selectionTrace?.candidates?.[0]?.score ?? 0,
                    reason: overrideReason.trim(),
                    reprocess: true,
                  },
                  {
                    onSuccess: result => {
                      const ok =
                        result.reprocessResult == null ||
                        (typeof result.reprocessResult === "object" &&
                          result.reprocessResult !== null &&
                          "success" in result.reprocessResult &&
                          (result.reprocessResult as { success?: boolean })
                            .success !== false);
                      if (ok) {
                        toast.success(
                          "Template override applied — reprocessing"
                        );
                      } else {
                        toast.error(
                          "Override saved but reprocess reported failure — check job status"
                        );
                      }
                      setOverrideOpen(false);
                      setOverrideReason("");
                      utils.jobSheets.get.invalidate({ id: jobSheetId });
                      invalidateFindings();
                    },
                    onError: err =>
                      toast.error(err.message || "Override failed"),
                  }
                );
              }}
            >
              {templateOverrideMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Override & reprocess
            </Button>
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
            focusWorkstationPane();
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
          <div className="space-y-3 py-3">
            <p className="text-sm text-muted-foreground">
              {actionDialog?.finding.field}
              {actionDialog?.finding.message
                ? ` — ${actionDialog.finding.message}`
                : ""}
            </p>
            <div className="space-y-2">
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea
                id="override-reason"
                autoFocus
                placeholder="Explain why this action is justified..."
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                onKeyDown={onActionReasonKeyDown}
                aria-keyshortcuts="Meta+Enter Control+Enter"
              />
              <p className="text-[11px] text-muted-foreground">
                Press <kbd className="font-mono text-foreground">⌘</kbd>
                <kbd className="font-mono text-foreground">Enter</kbd> to
                confirm
              </p>
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
                focusWorkstationPane();
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
  pendingActionIds?: ReadonlySet<number>;
  onFindingClick: (id: string | number) => void;
  onReportIssue: (finding: Finding, e: MouseEvent) => void;
  onOverride: (finding: Finding, e: MouseEvent) => void;
  onCorrect: (finding: Finding, e: MouseEvent) => void;
}

function findingPending(
  finding: Finding,
  pendingActionIds?: ReadonlySet<number>
): boolean {
  return (
    typeof finding.id === "number" && Boolean(pendingActionIds?.has(finding.id))
  );
}

function FindingsList({
  findings,
  activeBoxId,
  pendingActionIds,
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
      <div className="p-2 space-y-1.5">
        {findings.map(finding => {
          const pending = findingPending(finding, pendingActionIds);
          return (
            <div
              key={finding.id}
              id={`finding-${finding.id}`}
              data-finding-pending={pending ? "true" : undefined}
              className={`p-2.5 rounded-md border cursor-pointer transition-colors ${
                activeBoxId === finding.id
                  ? "ring-2 ring-primary border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              } ${
                finding.status === "missing"
                  ? "bg-red-50/50 border-red-200"
                  : finding.status === "warning"
                    ? "bg-orange-50/50 border-orange-200"
                    : "bg-green-50/50 border-green-200"
              } ${pending ? "opacity-70" : ""}`}
              onClick={() => onFindingClick(finding.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {pending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  ) : finding.status === "missing" ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  ) : finding.status === "warning" ? (
                    <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  )}
                  <h3 className="font-semibold text-xs truncate">
                    {finding.field}
                  </h3>
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {finding.ruleId && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] px-1.5 bg-slate-50 text-slate-600 border-slate-300"
                      title={`Rule: ${finding.ruleId}${finding.reasonCode ? ` — ${finding.reasonCode}` : ""}`}
                    >
                      {finding.ruleId}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {(finding.confidence * 100).toFixed(0)}%
                    {finding.reasonCode ? ` · ${finding.reasonCode}` : ""}
                  </span>
                </div>
              </div>

              {finding.value && (
                <div className="mb-1 px-1.5 py-1 bg-white/60 rounded border border-black/5 font-mono text-xs truncate">
                  {finding.value}
                </div>
              )}

              {finding.message && (
                <p
                  className={`text-xs leading-snug ${
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
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {finding.whyItMatters}
                </p>
              )}

              {finding.suggestedFix && finding.status !== "passed" && (
                <p className="mt-0.5 text-[11px] text-slate-700 line-clamp-1">
                  Suggested fix: {finding.suggestedFix}
                </p>
              )}

              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5"
                  onClick={e => {
                    e.stopPropagation();
                    onFindingClick(finding.id);
                  }}
                >
                  <Eye className="w-3 h-3 mr-1" /> View
                </Button>
                {finding.status !== "passed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-1.5 hover:text-destructive"
                    title="Override (o)"
                    aria-keyshortcuts="o"
                    onClick={e => onOverride(finding, e)}
                  >
                    Override
                    <kbd className="ml-1 font-mono text-[10px] text-muted-foreground">
                      o
                    </kbd>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5"
                  title="Correct value (c)"
                  aria-keyshortcuts="c"
                  onClick={e => onCorrect(finding, e)}
                >
                  <Pencil className="w-3 h-3 mr-1" /> Correct
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-primary ml-auto"
                  onClick={e => onReportIssue(finding, e)}
                >
                  <MessageSquare className="w-3 h-3 mr-1" /> Report
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function IssuesTabContent({
  findings,
  activeBoxId,
  pendingActionIds,
  onFindingClick,
  onReportIssue,
  onOverride,
  onCorrect,
}: FindingsListProps) {
  const relationshipFindings = findings.filter(isRelationshipFinding);
  const tyreFindings = findings.filter(
    f => !isRelationshipFinding(f) && isTyreComplianceFinding(f)
  );
  const commentFindings = findings.filter(
    f =>
      !isRelationshipFinding(f) &&
      !isTyreComplianceFinding(f) &&
      isCommentQualityFinding(f)
  );
  const photoFindings = findings.filter(
    f =>
      !isRelationshipFinding(f) &&
      !isTyreComplianceFinding(f) &&
      !isCommentQualityFinding(f) &&
      isPhotoPairFinding(f)
  );
  const otherFindings = findings.filter(
    f =>
      !isRelationshipFinding(f) &&
      !isTyreComplianceFinding(f) &&
      !isCommentQualityFinding(f) &&
      !isPhotoPairFinding(f)
  );

  if (findings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No findings in this category.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-1.5">
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
        {tyreFindings.length > 0 && (
          <TyreFindingsGroup
            findings={tyreFindings}
            activeBoxId={activeBoxId}
            onFindingClick={onFindingClick}
            onReportIssue={onReportIssue}
            onOverride={onOverride}
            onCorrect={onCorrect}
          />
        )}
        {commentFindings.length > 0 && (
          <CommentFindingsGroup
            findings={commentFindings}
            activeBoxId={activeBoxId}
            onFindingClick={onFindingClick}
            onReportIssue={onReportIssue}
            onOverride={onOverride}
            onCorrect={onCorrect}
          />
        )}
        {photoFindings.length > 0 && (
          <PhotoEvidenceFindingsGroup
            findings={photoFindings}
            activeBoxId={activeBoxId}
            onFindingClick={onFindingClick}
          />
        )}
        {otherFindings.map(finding => {
          const pending = findingPending(finding, pendingActionIds);
          return (
            <div
              key={finding.id}
              id={`finding-${finding.id}`}
              data-finding-pending={pending ? "true" : undefined}
              className={`p-2.5 rounded-md border cursor-pointer transition-colors ${
                activeBoxId === finding.id
                  ? "ring-2 ring-primary border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              } ${
                finding.status === "missing"
                  ? "bg-red-50/50 border-red-200"
                  : finding.status === "warning"
                    ? "bg-orange-50/50 border-orange-200"
                    : "bg-green-50/50 border-green-200"
              } ${pending ? "opacity-70" : ""}`}
              onClick={() => onFindingClick(finding.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {pending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  ) : finding.status === "missing" ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  ) : finding.status === "warning" ? (
                    <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  )}
                  <h3 className="font-semibold text-xs truncate">
                    {finding.field}
                  </h3>
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {finding.ruleId && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] px-1.5 bg-slate-50 text-slate-600 border-slate-300"
                      title={`Rule: ${finding.ruleId}${finding.reasonCode ? ` — ${finding.reasonCode}` : ""}`}
                    >
                      {finding.ruleId}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {(finding.confidence * 100).toFixed(0)}%
                    {finding.reasonCode ? ` · ${finding.reasonCode}` : ""}
                  </span>
                </div>
              </div>

              {finding.value && (
                <div className="mb-1 px-1.5 py-1 bg-white/60 rounded border border-black/5 font-mono text-xs truncate">
                  {finding.value}
                </div>
              )}

              {finding.message && (
                <p
                  className={`text-xs leading-snug ${
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
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {finding.whyItMatters}
                </p>
              )}

              {finding.suggestedFix && finding.status !== "passed" && (
                <p className="mt-0.5 text-[11px] text-slate-700 line-clamp-1">
                  Suggested fix: {finding.suggestedFix}
                </p>
              )}

              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5"
                  onClick={e => {
                    e.stopPropagation();
                    onFindingClick(finding.id);
                  }}
                >
                  <Eye className="w-3 h-3 mr-1" /> View
                </Button>
                {finding.status !== "passed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-1.5 hover:text-destructive"
                    title="Override (o)"
                    aria-keyshortcuts="o"
                    onClick={e => onOverride(finding, e)}
                  >
                    Override
                    <kbd className="ml-1 font-mono text-[10px] text-muted-foreground">
                      o
                    </kbd>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5"
                  title="Correct value (c)"
                  aria-keyshortcuts="c"
                  onClick={e => onCorrect(finding, e)}
                >
                  <Pencil className="w-3 h-3 mr-1" /> Correct
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-primary ml-auto"
                  onClick={e => onReportIssue(finding, e)}
                >
                  <MessageSquare className="w-3 h-3 mr-1" /> Report
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
