import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocOutcomeBadge } from "@/components/DocOutcomeBadge";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Keyboard,
  Loader2,
  Search,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
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

interface AuditOutcomeSummary {
  result: string;
  docQualityScore: number | null;
  hasMajorFails: boolean;
}

type StatusFilter =
  | "all"
  | "processing"
  | "review_queue"
  | "completed"
  | "failed";

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
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showLegend, setShowLegend] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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

  const { data: allJobSheets, isLoading: listLoading } =
    trpc.jobSheets.list.useQuery(
      { limit: 50 },
      {
        refetchInterval: query => {
          const rows = query.state.data;
          if (!rows?.length) return false;
          return rows.some(r => isActiveJobSheetStatus(r.status))
            ? 2000
            : false;
        },
      }
    );

  const { data: allAuditResults } = trpc.audits.list.useQuery({ limit: 100 });

  const auditOutcomeMap = useMemo(() => {
    const map = new Map<number, AuditOutcomeSummary>();
    if (!allAuditResults) return map;
    for (const ar of allAuditResults) {
      const reportJson = ar.reportJson as Record<string, unknown> | null;
      const docScore =
        typeof (reportJson as Record<string, unknown>)
          ?.documentationQualityScore === "number"
          ? ((reportJson as Record<string, unknown>)
              .documentationQualityScore as number)
          : null;
      map.set(ar.jobSheetId, {
        result: ar.result,
        docQualityScore: docScore,
        hasMajorFails: mapHasMajorFailsFromReport(reportJson),
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

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: allJobSheets?.length ?? 0,
      processing: 0,
      review_queue: 0,
      completed: 0,
      failed: 0,
    };
    for (const sheet of allJobSheets ?? []) {
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
    return (allJobSheets ?? []).filter(sheet => {
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

  useEffect(() => {
    setHighlightIndex(0);
  }, [listSearch, statusFilter]);

  useEffect(() => {
    if (filteredJobSheets.length === 0) return;
    setHighlightIndex(i =>
      Math.min(i, Math.max(0, filteredJobSheets.length - 1))
    );
  }, [filteredJobSheets.length]);

  const onNext = usePersistFn(() => {
    if (filteredJobSheets.length === 0) return;
    setHighlightIndex(i => Math.min(i + 1, filteredJobSheets.length - 1));
  });
  const onPrev = usePersistFn(() => {
    if (filteredJobSheets.length === 0) return;
    setHighlightIndex(i => Math.max(i - 1, 0));
  });
  const onOpenHighlighted = usePersistFn(() => {
    const sheet = filteredJobSheets[highlightIndex];
    if (sheet) navigateToAudit(sheet.id);
  });

  useReviewQueueKeyboard(
    {
      onNext,
      onPrev,
      onApprove: () => undefined,
      onReject: () => undefined,
      onToggleLegend: () => setShowLegend(v => !v),
      onFocusPane: onOpenHighlighted,
    },
    selectedAuditId == null
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
                reports. Use j/k to move, Enter to open.
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
                onChange={e => setListSearch(e.target.value)}
                aria-label="Search audits"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setStatusFilter(chip.key)}
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
          ) : !allJobSheets || allJobSheets.length === 0 ? (
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
            </Card>
          ) : (
            <Card className="border-[#EBE8E8] bg-white overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-[#EBE8E8] bg-white">
                <CardTitle className="text-sm font-semibold text-[#333030]">
                  {filteredJobSheets.length} audit
                  {filteredJobSheets.length === 1 ? "" : "s"}
                  {filteredJobSheets.length !== allJobSheets.length
                    ? ` · ${allJobSheets.length} total`
                    : ""}
                </CardTitle>
              </CardHeader>
              <ScrollArea className="h-[calc(100vh-18rem)]">
                <div className="p-2 space-y-1" ref={listRef}>
                  {filteredJobSheets.map((sheet, index) => {
                    const outcome = auditOutcomeMap.get(sheet.id);
                    const isHighlighted = index === highlightIndex;
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
                            {outcome?.hasMajorFails && (
                              <Badge
                                variant="destructive"
                                className="gap-1 h-5 text-[10px] bg-[#BA3737] hover:bg-[#962C2C]"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Major
                              </Badge>
                            )}
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
                          {outcome?.docQualityScore != null && (
                            <span
                              className={cn(
                                "text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded border",
                                outcome.docQualityScore >= 80
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : outcome.docQualityScore >= 50
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                              )}
                              title="Documentation quality score"
                            >
                              {outcome.docQualityScore}%
                            </span>
                          )}
                          <span className="text-[11px] text-[#8A8787] tabular-nums hidden sm:inline">
                            {new Date(sheet.createdAt).toLocaleDateString()}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[#8A8787] group-hover:text-[#333030] transition-colors" />
                        </div>
                      </div>
                    );
                  })}
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

  return (
    <DashboardLayout>
      <div className="-m-6 h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
        <ReviewWorkstationPane
          jobSheetId={numericId}
          auditData={auditData}
          documentUrl={pdfProxyUrl}
          onBack={goBackToList}
        />
      </div>
    </DashboardLayout>
  );
}
