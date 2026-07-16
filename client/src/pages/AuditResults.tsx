import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocOutcomeBadge } from "@/components/DocOutcomeBadge";
import {
  ExportButton,
  type ExportOptions,
} from "@/components/audit/ExportButton";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Keyboard,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProcessingProgressPanel } from "@/components/ProcessingProgressPanel";
import { useJobSheetProcessStatus } from "@/hooks/useProcessingWatch";
import {
  isActiveJobSheetStatus,
  isTerminalJobSheetStatus,
} from "@shared/processingProgress";
import {
  ReviewWorkstationPane,
  mapFindingsFromApi,
  type AuditData,
  type Finding,
} from "@/components/review/ReviewWorkstationPane";
import { ReviewShortcutsLegend } from "@/components/review/ReviewShortcutsLegend";
import { mapHasMajorFailsFromReport } from "@/components/review/mapAuditPolicy";
import { perfMark, PERF_MARKS, perfClear } from "@/lib/perf";
import { useReviewQueueKeyboard } from "@/hooks/useReviewQueueKeyboard";
import { usePersistFn } from "@/hooks/usePersistFn";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

const JOB_SHEET_PAGE_SIZE = 50;
const AUDIT_PAGE_SIZE = 100;

type JobSheetListItem =
  inferRouterOutputs<AppRouter>["jobSheets"]["list"]["items"][number];
type AuditListItem =
  inferRouterOutputs<AppRouter>["audits"]["list"]["items"][number];

function mergePage<T extends { id: number }>(existing: T[], page: T[]): T[] {
  const rows = new Map(existing.map(row => [row.id, row]));
  for (const row of page) rows.set(row.id, row);
  return Array.from(rows.values());
}

function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface AuditOutcomeSummary {
  result: string;
}

type StatusFilter =
  | "all"
  | "processing"
  | "review_queue"
  | "completed"
  | "failed";

type JobSheetStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "review_queue";

function JobSheetStatusChip({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    failed: {
      label: "Failed",
      className: "bg-red-50 text-[#BA3737] border-red-200",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    review_queue: {
      label: "In review",
      className: "bg-amber-50 text-[#D4A337] border-amber-200",
      icon: <Clock className="w-3 h-3" />,
    },
    completed: {
      label: "Completed",
      className: "bg-[#BEDA41]/15 text-[#333030] border-[#BEDA41]/40",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    processing: {
      label: "Processing",
      className: "bg-[#2868CE]/10 text-[#2868CE] border-[#2868CE]/25",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    pending: {
      label: "Pending",
      className: "bg-[#F5F4F4] text-[#706D6D] border-[#EBE8E8]",
      icon: <Clock className="w-3 h-3" />,
    },
  };

  const chip = config[status] ?? {
    label: status.replace("_", " "),
    className: "bg-[#F5F4F4] text-[#706D6D] border-[#EBE8E8]",
    icon: null,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        chip.className
      )}
    >
      {chip.icon}
      {chip.label}
    </span>
  );
}

function AuditListSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 border border-[#EBE8E8] rounded-lg bg-white"
        >
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function AuditResults() {
  const [, setLocation] = useLocation();
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jobSheetOffset, setJobSheetOffset] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [allJobSheets, setAllJobSheets] = useState<JobSheetListItem[]>([]);
  const [allAuditResults, setAllAuditResults] = useState<AuditListItem[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showLegend, setShowLegend] = useState(false);
  const [reviewClaim, setReviewClaim] = useState<{
    jobSheetId: number;
    token?: string;
  }>();
  const listRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const approveJobSheet = trpc.auditActions.approveJobSheet.useMutation();
  const undoApprove = trpc.auditActions.undoJobSheetApprove.useMutation();
  const updateStatus = trpc.jobSheets.updateStatus.useMutation();

  const [selectedAuditId, setSelectedAuditId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      return id ? parseInt(id) : null;
    }
    return null;
  });

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      setSelectedAuditId(id ? parseInt(id) : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const goBackToList = () => {
    setSelectedAuditId(null);
    setLocation("/audits");
  };

  const navigateToAudit = (id: number) => {
    perfClear();
    perfMark(PERF_MARKS.AUDIT_DETAIL_CLICK);
    setSelectedAuditId(id);
    setLocation(`/audits?id=${id}`);
  };

  const numericId = selectedAuditId ?? 0;
  const {
    data: jobSheetData,
    isLoading,
    error: jobSheetError,
  } = trpc.jobSheets.get.useQuery(
    { id: numericId },
    {
      enabled: numericId > 0,
      refetchInterval: query => {
        const status = query.state.data?.status;
        if (status && isActiveJobSheetStatus(status)) return 1500;
        return false;
      },
    }
  );

  const { data: processProgress } = useJobSheetProcessStatus(numericId, {
    enabled:
      numericId > 0 &&
      !!jobSheetData &&
      isActiveJobSheetStatus(jobSheetData.status),
  });

  const {
    data: jobSheetPage,
    isLoading: listLoading,
    isFetching: jobSheetsFetching,
  } = trpc.jobSheets.list.useQuery(
    { limit: JOB_SHEET_PAGE_SIZE, offset: jobSheetOffset },
    {
      refetchInterval: query => {
        const rows = query.state.data?.items;
        if (!rows?.length) return false;
        return rows.some(r => isActiveJobSheetStatus(r.status)) ? 2000 : false;
      },
    }
  );

  const { data: auditResultsPage, isFetching: auditsFetching } =
    trpc.audits.list.useQuery({
      limit: AUDIT_PAGE_SIZE,
      offset: auditOffset,
    });

  useEffect(() => {
    if (!jobSheetPage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- offset pages are accumulated from the query cache.
    setAllJobSheets(existing =>
      jobSheetOffset === 0
        ? jobSheetPage.items
        : mergePage(existing, jobSheetPage.items)
    );
  }, [jobSheetOffset, jobSheetPage]);

  useEffect(() => {
    if (!auditResultsPage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- offset pages are accumulated from the query cache.
    setAllAuditResults(existing =>
      auditOffset === 0
        ? auditResultsPage.items
        : mergePage(existing, auditResultsPage.items)
    );
  }, [auditOffset, auditResultsPage]);

  const hasMoreJobSheets = jobSheetPage?.hasMore ?? false;
  const loadMoreAudits = () => {
    if (!hasMoreJobSheets || jobSheetsFetching || auditsFetching) return;
    setJobSheetOffset(offset => offset + JOB_SHEET_PAGE_SIZE);
    setAuditOffset(offset => offset + AUDIT_PAGE_SIZE);
  };

  const auditOutcomeMap = useMemo(() => {
    const map = new Map<number, AuditOutcomeSummary>();
    if (!allAuditResults) return map;
    for (const ar of allAuditResults) {
      map.set(ar.jobSheetId, {
        result: ar.result,
      });
    }
    return map;
  }, [allAuditResults]);

  const { data: auditResult, isLoading: auditLoading } =
    trpc.audits.getByJobSheet.useQuery(
      { jobSheetId: numericId },
      {
        enabled:
          numericId > 0 &&
          !!jobSheetData &&
          isTerminalJobSheetStatus(jobSheetData.status),
      }
    );

  const { data: findingsData } = trpc.audits.getFindings.useQuery(
    { auditResultId: auditResult?.id || 0 },
    { enabled: !!auditResult?.id }
  );

  const { data: deliveryReceipt, isError: deliveryReceiptError } =
    trpc.webhooks.auditCompletedReceipt.useQuery(
      { auditId: auditResult?.id || 0 },
      { enabled: !!auditResult?.id, retry: false }
    );

  const trpcUtils = trpc.useUtils();

  const handleAuditExport = useCallback(
    async (options: ExportOptions) => {
      try {
        if (options.format === "csv") {
          const result = await trpcUtils.exports.validatedFieldsCSV.fetch({
            auditId: options.auditId,
            redacted: options.redacted,
            tab: options.tab,
          });
          downloadTextFile(
            result.content,
            result.filename,
            "text/csv;charset=utf-8"
          );
        } else {
          const result = await trpcUtils.exports.bundle.fetch({
            auditId: options.auditId,
            redacted: options.redacted,
          });
          downloadTextFile(
            JSON.stringify(result.content, null, 2),
            result.filename,
            "application/json;charset=utf-8"
          );
        }
        toast.success(
          options.redacted
            ? "Redacted export downloaded"
            : "Unredacted export downloaded"
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Export failed");
        throw error;
      }
    },
    [trpcUtils]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: allJobSheets.length,
      processing: 0,
      review_queue: 0,
      completed: 0,
      failed: 0,
    };
    for (const sheet of allJobSheets) {
      if (sheet.status === "processing" || sheet.status === "pending") {
        counts.processing += 1;
      } else if (sheet.status in counts) {
        counts[sheet.status as StatusFilter] += 1;
      }
    }
    return counts;
  }, [allJobSheets]);

  const filteredJobSheets = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return allJobSheets.filter(sheet => {
      if (statusFilter !== "all") {
        if (statusFilter === "processing") {
          if (sheet.status !== "processing" && sheet.status !== "pending") {
            return false;
          }
        } else if (sheet.status !== statusFilter) {
          return false;
        }
      }
      if (!q) return true;
      const hay =
        `${sheet.referenceNumber ?? ""} ${sheet.fileName} ${sheet.siteInfo ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allJobSheets, listSearch, statusFilter]);

  const safeHighlightIndex =
    filteredJobSheets.length === 0
      ? 0
      : Math.min(highlightIndex, filteredJobSheets.length - 1);

  const invalidateAfterSheetAction = usePersistFn(async () => {
    await Promise.all([
      utils.jobSheets.list.invalidate(),
      utils.jobSheets.get.invalidate(),
      utils.audits.list.invalidate(),
      utils.audits.getByJobSheet.invalidate(),
    ]);
  });

  const showApproveUndo = usePersistFn(
    (jobSheetId: number, previousStatus: string) => {
      toast.success("Job sheet approved", {
        action: {
          label: "Undo",
          onClick: () => {
            undoApprove.mutate(
              {
                jobSheetId,
                restoreStatus: previousStatus as JobSheetStatus,
              },
              {
                onSuccess: () => {
                  void invalidateAfterSheetAction();
                  toast.success("Approval undone");
                },
                onError: err => toast.error(err.message || "Undo failed"),
              }
            );
          },
        },
      });
    }
  );

  const handleApprove = usePersistFn(
    (jobSheetId: number, suppliedClaimToken?: string) => {
      const claimToken =
        suppliedClaimToken ??
        (reviewClaim?.jobSheetId === jobSheetId
          ? reviewClaim.token
          : undefined);
      approveJobSheet.mutate(
        {
          jobSheetId,
          reason: "Approved from audit results",
          claimToken,
        },
        {
          onSuccess: result => {
            void invalidateAfterSheetAction();
            if (selectedAuditId === jobSheetId) {
              goBackToList();
            }
            showApproveUndo(jobSheetId, result.previousStatus);
          },
          onError: err => toast.error(err.message || "Approve failed"),
        }
      );
    }
  );

  const handleReject = usePersistFn((jobSheetId: number) => {
    updateStatus.mutate(
      { id: jobSheetId, status: "failed" },
      {
        onSuccess: () => {
          void invalidateAfterSheetAction();
          if (selectedAuditId === jobSheetId) {
            goBackToList();
          }
          toast.success("Job sheet rejected", {
            action: {
              label: "Undo",
              onClick: () => {
                updateStatus.mutate(
                  { id: jobSheetId, status: "review_queue" },
                  {
                    onSuccess: () => {
                      void invalidateAfterSheetAction();
                      toast.success("Rejection undone");
                    },
                  }
                );
              },
            },
          });
        },
        onError: err => toast.error(err.message || "Reject failed"),
      }
    );
  });

  const onNext = usePersistFn(() => {
    if (selectedAuditId != null) return;
    if (filteredJobSheets.length === 0) return;
    setHighlightIndex(i =>
      Math.min(
        Math.min(i, filteredJobSheets.length - 1) + 1,
        filteredJobSheets.length - 1
      )
    );
  });
  const onPrev = usePersistFn(() => {
    if (selectedAuditId != null) return;
    if (filteredJobSheets.length === 0) return;
    setHighlightIndex(i =>
      Math.max(Math.min(i, filteredJobSheets.length - 1) - 1, 0)
    );
  });
  const onOpenHighlighted = usePersistFn(() => {
    if (selectedAuditId != null) return;
    const sheet = filteredJobSheets[safeHighlightIndex];
    if (sheet) navigateToAudit(sheet.id);
  });

  const onApproveHighlighted = usePersistFn(() => {
    if (selectedAuditId != null) {
      if (jobSheetData?.status === "review_queue") {
        handleApprove(selectedAuditId);
      }
      return;
    }
    const sheet = filteredJobSheets[safeHighlightIndex];
    if (sheet?.status === "review_queue") {
      handleApprove(sheet.id);
    }
  });

  const onRejectHighlighted = usePersistFn(() => {
    if (selectedAuditId != null) {
      if (jobSheetData?.status === "review_queue") {
        handleReject(selectedAuditId);
      }
      return;
    }
    const sheet = filteredJobSheets[safeHighlightIndex];
    if (sheet?.status === "review_queue") {
      handleReject(sheet.id);
    }
  });

  useReviewQueueKeyboard(
    {
      onNext,
      onPrev,
      onApprove: onApproveHighlighted,
      onReject: onRejectHighlighted,
      onToggleLegend: () => setShowLegend(v => !v),
      onFocusPane: onOpenHighlighted,
    },
    true
  );

  if (isLoading && numericId > 0) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-8rem)] flex flex-col animate-in fade-in duration-[var(--duration-slow)]">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center gap-2 text-[#706D6D]">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading audit…</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (numericId > 0 && jobSheetError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] animate-in fade-in duration-[var(--duration-slow)]">
          <div className="rounded-full bg-red-50 p-4 mb-4">
            <AlertCircle className="h-10 w-10 text-[#BA3737]" />
          </div>
          <h2 className="text-xl font-semibold text-[#333030] mb-2">
            Failed to load audit
          </h2>
          <p className="text-[#706D6D] mb-6 max-w-md text-center">
            {jobSheetError.message}
          </p>
          <Button onClick={goBackToList} variant="outline">
            Back to list
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (
    numericId > 0 &&
    jobSheetData &&
    isActiveJobSheetStatus(jobSheetData.status)
  ) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-[var(--duration-slow)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 -ml-2 text-[#706D6D] hover:text-[#333030]"
                onClick={goBackToList}
              >
                ← All audits
              </Button>
              <h1 className="text-2xl font-heading font-bold tracking-tight text-[#333030]">
                {jobSheetData.referenceNumber || `JS-${jobSheetData.id}`}
              </h1>
              <p className="text-[#706D6D] mt-1 text-sm">
                {jobSheetData.fileName} is still processing — this page updates
                automatically.
              </p>
            </div>
            <JobSheetStatusChip status={jobSheetData.status} />
          </div>
          <ProcessingProgressPanel
            progress={
              processProgress ?? {
                jobSheetId: numericId,
                status: jobSheetData.status,
                currentStage: "OCR Text Extraction",
                stages: [],
                percentComplete: jobSheetData.status === "processing" ? 10 : 0,
                startedAt: null,
                updatedAt: null,
                source: "status_only",
              }
            }
            title="Live processing"
          />
        </div>
      </DashboardLayout>
    );
  }

  if (!numericId || !jobSheetData) {
    const filterChips: { key: StatusFilter; label: string }[] = [
      { key: "all", label: "All" },
      { key: "review_queue", label: "In review" },
      { key: "completed", label: "Completed" },
      { key: "processing", label: "Processing" },
      { key: "failed", label: "Failed" },
    ];

    return (
      <DashboardLayout>
        <div
          className="space-y-5 animate-in fade-in duration-[var(--duration-slow)]"
          data-testid="audit-list"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-heading font-bold tracking-tight text-[#333030]">
                Audit Results
              </h1>
              <p className="text-[#706D6D] mt-1 text-sm">
                Select an audit to review findings, documentation quality, and
                reports. Use j/k to move, a/r to approve or reject in-review
                sheets, Enter to open.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setShowLegend(v => !v)}
              aria-pressed={showLegend}
            >
              <Keyboard className="h-4 w-4" />
              Shortcuts
            </Button>
          </div>

          {showLegend ? (
            <ReviewShortcutsLegend
              variant="list"
              className="bg-white border border-[#EBE8E8]"
            />
          ) : null}

          <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[#F9F9F9]/95 backdrop-blur-sm space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8787]" />
              <Input
                type="search"
                placeholder="Search by reference, file, or site…"
                className="pl-9 h-10 bg-white border-[#EBE8E8] focus-visible:ring-[#BEDA41]/40"
                value={listSearch}
                onChange={e => {
                  setListSearch(e.target.value);
                  setHighlightIndex(0);
                }}
                aria-label="Search audits"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={statusFilter === chip.key}
                  aria-label={`Filter ${chip.label}, ${statusCounts[chip.key]} audits`}
                  onClick={() => {
                    setStatusFilter(chip.key);
                    setHighlightIndex(0);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-[var(--duration-normal)]",
                    statusFilter === chip.key
                      ? "bg-[#BEDA41]/20 border-[#BEDA41] text-[#333030]"
                      : "bg-white border-[#EBE8E8] text-[#706D6D] hover:border-[#333030]/30"
                  )}
                >
                  {chip.label}
                  <span
                    className={cn(
                      "tabular-nums rounded-full px-1.5 py-px text-[10px]",
                      statusFilter === chip.key
                        ? "bg-[#BEDA41]/30"
                        : "bg-[#F5F4F4]"
                    )}
                  >
                    {statusCounts[chip.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {listLoading ? (
            <Card className="border-[#EBE8E8] bg-white overflow-hidden">
              <AuditListSkeleton />
            </Card>
          ) : allJobSheets.length === 0 ? (
            <Card className="border-[#EBE8E8] bg-white p-4">
              <EmptyState
                icon={FileText}
                title="No audits yet"
                description="Upload your first job sheet to start automated QA review."
                action={{ label: "Upload job sheet", href: "/upload" }}
              />
            </Card>
          ) : filteredJobSheets.length === 0 ? (
            <Card className="border-dashed border-[#EBE8E8] bg-white p-4">
              <EmptyState
                compact
                icon={Search}
                title="No matching audits"
                description="Try a different search term or clear filters."
                action={{
                  label: "Clear filters",
                  onClick: () => {
                    setListSearch("");
                    setStatusFilter("all");
                  },
                }}
              />
              {hasMoreJobSheets ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={loadMoreAudits}
                    disabled={jobSheetsFetching || auditsFetching}
                  >
                    {jobSheetsFetching || auditsFetching
                      ? "Loading more…"
                      : `Load ${JOB_SHEET_PAGE_SIZE} more audits`}
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : (
            <Card className="border-[#EBE8E8] bg-white overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-[#EBE8E8] bg-white">
                <CardTitle className="text-sm font-semibold text-[#333030]">
                  {filteredJobSheets.length} audit
                  {filteredJobSheets.length === 1 ? "" : "s"}
                  {filteredJobSheets.length !== allJobSheets.length
                    ? ` · ${allJobSheets.length} loaded`
                    : " loaded"}
                </CardTitle>
              </CardHeader>
              <ScrollArea className="h-[calc(100vh-18rem)]">
                <div className="p-2 space-y-1" ref={listRef}>
                  {filteredJobSheets.map((sheet, index) => {
                    const outcome = auditOutcomeMap.get(sheet.id);
                    const isHighlighted = index === safeHighlightIndex;
                    return (
                      <div
                        key={sheet.id}
                        className={cn(
                          "group flex items-center gap-3 p-3 rounded-lg border transition-all duration-[var(--duration-normal)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEDA41]",
                          isHighlighted
                            ? "border-[#BEDA41] bg-[#BEDA41]/10 ring-1 ring-[#BEDA41]/40"
                            : "border-transparent hover:border-[#BEDA41]/50 hover:bg-[#BEDA41]/5"
                        )}
                        onClick={() => navigateToAudit(sheet.id)}
                        role="button"
                        tabIndex={0}
                        aria-current={isHighlighted ? "true" : undefined}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigateToAudit(sheet.id);
                          }
                        }}
                        onMouseEnter={() => setHighlightIndex(index)}
                      >
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center shrink-0 border",
                            sheet.status === "failed"
                              ? "bg-red-50 text-[#BA3737] border-red-200"
                              : sheet.status === "review_queue"
                                ? "bg-amber-50 text-[#D4A337] border-amber-200"
                                : sheet.status === "completed"
                                  ? "bg-[#BEDA41]/15 text-[#333030] border-[#BEDA41]/40"
                                  : "bg-[#2868CE]/10 text-[#2868CE] border-[#2868CE]/25"
                          )}
                        >
                          {sheet.status === "failed" ? (
                            <AlertCircle className="w-4 h-4" />
                          ) : sheet.status === "review_queue" ? (
                            <Clock className="w-4 h-4" />
                          ) : sheet.status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium font-mono text-sm text-[#333030]">
                              {sheet.referenceNumber || `JS-${sheet.id}`}
                            </p>
                            <JobSheetStatusChip status={sheet.status} />
                          </div>
                          <p className="text-xs text-[#706D6D] truncate mt-0.5">
                            {sheet.fileName}
                            {sheet.siteInfo ? ` · ${sheet.siteInfo}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {outcome ? (
                            <DocOutcomeBadge
                              result={outcome.result}
                              showDocsHint={false}
                            />
                          ) : isTerminalJobSheetStatus(sheet.status) ? (
                            <DocOutcomeBadge
                              result={null}
                              showDocsHint={false}
                            />
                          ) : null}
                          {sheet.status === "review_queue" && (
                            <div
                              className={cn(
                                "flex items-center gap-0.5 transition-opacity duration-[var(--duration-fast)]",
                                isHighlighted
                                  ? "opacity-100"
                                  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                              )}
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleApprove(sheet.id)}
                                disabled={approveJobSheet.isPending}
                                aria-label="Approve"
                                title="Approve (a)"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                                onClick={() => handleReject(sheet.id)}
                                disabled={updateStatus.isPending}
                                aria-label="Reject"
                                title="Reject (r)"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                          <span className="text-[11px] text-[#8A8787] tabular-nums hidden sm:inline">
                            {new Date(sheet.createdAt).toLocaleDateString()}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[#8A8787] group-hover:text-[#333030] transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                  {hasMoreJobSheets ? (
                    <div className="px-2 pt-3 pb-1 text-center">
                      <p className="mb-2 text-xs text-[#706D6D]">
                        Showing {allJobSheets.length} loaded audits. Load more
                        to see older results.
                      </p>
                      <Button
                        variant="outline"
                        onClick={loadMoreAudits}
                        disabled={jobSheetsFetching || auditsFetching}
                      >
                        {jobSheetsFetching || auditsFetching
                          ? "Loading more…"
                          : `Load ${JOB_SHEET_PAGE_SIZE} more audits`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (auditLoading && jobSheetData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh] gap-2 text-[#706D6D]">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading audit results…</span>
        </div>
      </DashboardLayout>
    );
  }

  const findings: Finding[] = mapFindingsFromApi(findingsData || []);
  const hasMajorFails = mapHasMajorFailsFromReport(auditResult?.reportJson);

  const auditData: AuditData = {
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
    findings,
    hasMajorFails,
  };

  const pdfProxyUrl = `/api/documents/${numericId}/pdf`;

  const canSheetApprove = jobSheetData.status === "review_queue";

  return (
    <DashboardLayout>
      <div className="-m-6 h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden flex flex-col">
        {auditResult?.id ? (
          <div
            className="shrink-0 flex items-center justify-between gap-2 border-b border-[#EBE8E8] bg-white px-4 py-2"
            data-testid="audit-export-toolbar"
          >
            <div
              className="min-w-0 text-xs text-muted-foreground"
              data-testid="audit-completed-delivery-receipt"
            >
              {deliveryReceiptError ||
              (deliveryReceipt && !deliveryReceipt.available) ? (
                <span>Webhook delivery receipts unavailable</span>
              ) : deliveryReceipt?.status === "none" ? (
                <span>
                  audit.completed delivery: none recorded
                  {deliveryReceipt.auditCompletedSubscriberCount === 0
                    ? " (no subscribers)"
                    : ""}
                </span>
              ) : deliveryReceipt?.status === "delivered" ? (
                <span className="text-green-700">
                  audit.completed delivery: {deliveryReceipt.receiptCount}{" "}
                  receipt
                  {deliveryReceipt.receiptCount === 1 ? "" : "s"}
                </span>
              ) : deliveryReceipt?.status === "partial_or_failed" ? (
                <span className="text-amber-700">
                  audit.completed delivery: partial or failed (
                  {deliveryReceipt.receiptCount})
                </span>
              ) : (
                <span>audit.completed delivery: loading…</span>
              )}
            </div>
            <ExportButton
              auditId={auditResult.id}
              onExport={handleAuditExport}
            />
          </div>
        ) : null}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReviewWorkstationPane
            jobSheetId={numericId}
            auditData={auditData}
            documentUrl={pdfProxyUrl}
            onBack={goBackToList}
            showJobSheetActions={canSheetApprove}
            onApproveJobSheet={
              canSheetApprove
                ? claimToken => handleApprove(numericId, claimToken)
                : undefined
            }
            onRejectJobSheet={
              canSheetApprove ? () => handleReject(numericId) : undefined
            }
            onReviewClaimChange={token =>
              setReviewClaim({ jobSheetId: numericId, token })
            }
            approvePending={approveJobSheet.isPending}
            rejectPending={updateStatus.isPending}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
