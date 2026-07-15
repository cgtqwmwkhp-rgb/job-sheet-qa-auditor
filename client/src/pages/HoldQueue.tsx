import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import { ReviewWorkstationPane } from "@/components/review/ReviewWorkstationPane";
import { ReviewShortcutsLegend } from "@/components/review/ReviewShortcutsLegend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/loading-skeleton";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Keyboard,
  Loader2,
  Search,
  XCircle,
  Inbox,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useMemo, useRef, useState, useEffect } from "react";
import { useReviewQueueKeyboard } from "@/hooks/useReviewQueueKeyboard";
import { usePersistFn } from "@/hooks/usePersistFn";
import { deriveReasonChips } from "@/components/review/holdQueueReasons";
import { mapHasMajorFailsFromReport } from "@/components/review/mapAuditPolicy";
import { cn } from "@/lib/utils";

type FilterChip = "all" | "critical" | "new_form";

function reportNeedsTemplateAuthoring(reportJson: unknown): boolean {
  if (!reportJson || typeof reportJson !== "object") return false;
  return Boolean(
    (reportJson as { needsTemplateAuthoring?: boolean }).needsTemplateAuthoring
  );
}

type HoldItem = {
  id: number;
  referenceNumber: string;
  technician: string;
  site: string;
  date: string;
  severity: "critical" | "warning" | "info";
  status: "pending";
  fileName: string;
  slaBreached: boolean;
  ageHours?: number;
  hoursUntilBreach?: number;
};

function HoldItemReasonChips({
  jobSheetId,
  enabled,
}: {
  jobSheetId: number;
  /** Only fetch for active / nearby rows to avoid N+1 on large queues. */
  enabled: boolean;
}) {
  const { data: auditResult } = trpc.audits.getByJobSheet.useQuery(
    { jobSheetId },
    { staleTime: 60_000, enabled }
  );
  const { data: findings } = trpc.audits.getFindings.useQuery(
    { auditResultId: auditResult?.id ?? 0 },
    { enabled: enabled && !!auditResult?.id, staleTime: 60_000 }
  );

  const needsAuthoring = reportNeedsTemplateAuthoring(auditResult?.reportJson);

  const chips = useMemo(() => {
    if (!findings || findings.length === 0) {
      return deriveReasonChips([], {
        hasMajorFails: auditResult?.reportJson
          ? mapHasMajorFailsFromReport(auditResult.reportJson)
          : false,
        auditResult: auditResult?.result ?? null,
        needsTemplateAuthoring: needsAuthoring,
      });
    }
    return deriveReasonChips(findings, {
      hasMajorFails: auditResult?.reportJson
        ? mapHasMajorFailsFromReport(auditResult.reportJson)
        : false,
      auditResult: auditResult?.result ?? null,
      needsTemplateAuthoring: needsAuthoring,
    });
  }, [findings, auditResult, needsAuthoring]);

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      {chips.map(chip => (
        <Badge
          key={chip.key}
          variant="secondary"
          className={`text-[10px] px-1.5 py-0 leading-4 border ${chip.className}`}
        >
          {chip.label}
        </Badge>
      ))}
      {needsAuthoring && (
        <Link
          href={`/template-studio?fromJobSheet=${jobSheetId}`}
          onClick={e => e.stopPropagation()}
        >
          <Badge className="text-[10px] px-1.5 py-0 leading-4 bg-[#BEDA41] text-[#1a1f0a] hover:bg-[#a8c238] cursor-pointer">
            Teach in Studio
          </Badge>
        </Link>
      )}
    </div>
  );
}

function priorityBorderClass(item: HoldItem): string {
  if (item.slaBreached) return "border-l-[#DC2626]";
  if (item.severity === "critical") return "border-l-[#333030]";
  return "border-l-[#EBE8E8]";
}

function sortByPriority(items: HoldItem[]): HoldItem[] {
  return [...items].sort((a, b) => {
    if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1;
    const aCritical = a.severity === "critical";
    const bCritical = b.severity === "critical";
    if (aCritical !== bCritical) return aCritical ? -1 : 1;
    const aAge = a.ageHours ?? 0;
    const bAge = b.ageHours ?? 0;
    return bAge - aAge;
  });
}

export default function HoldQueue() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChip, setFilterChip] = useState<FilterChip>("all");
  const [showLegend, setShowLegend] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const {
    data: jobSheets,
    isLoading,
    error,
  } = trpc.jobSheets.list.useQuery({
    status: "review_queue",
    limit: 50,
  });

  const { data: slaSummary } = trpc.analytics.getHoldQueueSla.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const slaById = useMemo(() => {
    const map = new Map<
      number,
      {
        breached: boolean;
        ageHours: number;
        ageingBucket: string;
        hoursUntilBreach: number;
        highestSeverity: string;
      }
    >();
    for (const item of slaSummary?.items ?? []) {
      map.set(item.jobSheetId, {
        breached: item.breached,
        ageHours: item.ageHours,
        ageingBucket: item.ageingBucket,
        hoursUntilBreach: item.hoursUntilBreach,
        highestSeverity: item.highestSeverity,
      });
    }
    return map;
  }, [slaSummary]);

  const approveJobSheet = trpc.auditActions.approveJobSheet.useMutation();
  const undoApprove = trpc.auditActions.undoJobSheetApprove.useMutation();
  const updateStatus = trpc.jobSheets.updateStatus.useMutation();

  const holdItems = useMemo(
    () =>
      (jobSheets?.items ?? []).map(sheet => {
        const sla = slaById.get(sheet.id);
        return {
          id: sheet.id,
          referenceNumber: sheet.referenceNumber || `JS-${sheet.id}`,
          technician: `User ${sheet.uploadedBy}`,
          site: sheet.siteInfo || "Unknown Site",
          date: new Date(sheet.createdAt).toLocaleString(),
          severity: (sla?.highestSeverity === "S0" ||
          sla?.highestSeverity === "S1"
            ? "critical"
            : "warning") as "critical" | "warning" | "info",
          status: "pending" as const,
          fileName: sheet.fileName,
          slaBreached: sla?.breached ?? false,
          ageHours: sla?.ageHours,
          hoursUntilBreach: sla?.hoursUntilBreach,
        };
      }),
    [jobSheets, slaById]
  );

  const holdIdsKey = useMemo(
    () => holdItems.map(i => i.id).join(","),
    [holdItems]
  );

  const [authoringById, setAuthoringById] = useState<Map<number, boolean>>(
    () => new Map()
  );

  useEffect(() => {
    const ids = holdItems.map(i => i.id);
    if (ids.length === 0) {
      setAuthoringById(new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(
      ids.map(async id => {
        try {
          const audit = await utils.audits.getByJobSheet.fetch({
            jobSheetId: id,
          });
          return [id, reportNeedsTemplateAuthoring(audit?.reportJson)] as const;
        } catch {
          return [id, false] as const;
        }
      })
    ).then(pairs => {
      if (!cancelled) setAuthoringById(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when hold set changes
  }, [holdIdsKey, utils.audits.getByJobSheet]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return holdItems.filter(item => {
      if (q) {
        const hay =
          `${item.referenceNumber} ${item.fileName} ${item.site} ${item.technician}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterChip === "critical") {
        return item.severity === "critical" || item.slaBreached;
      }
      if (filterChip === "new_form") {
        return authoringById.get(item.id) === true;
      }
      return true;
    });
  }, [holdItems, searchQuery, filterChip, authoringById]);

  const newFormCount = useMemo(() => {
    let n = 0;
    for (const item of holdItems) {
      if (authoringById.get(item.id)) n += 1;
    }
    return n;
  }, [holdItems, authoringById]);

  const sortedFilteredItems = useMemo(
    () => sortByPriority(filteredItems),
    [filteredItems]
  );

  const totalItems = holdItems.length;

  const activeId = useMemo(() => {
    if (sortedFilteredItems.length === 0) return null;
    if (
      selectedId != null &&
      sortedFilteredItems.some(item => item.id === selectedId)
    ) {
      return selectedId;
    }
    return sortedFilteredItems[0].id;
  }, [sortedFilteredItems, selectedId]);

  const showApproveUndo = (jobSheetId: number, previousStatus: string) => {
    toast.success("Job sheet approved", {
      action: {
        label: "Undo",
        onClick: () => {
          undoApprove.mutate(
            {
              jobSheetId,
              restoreStatus: previousStatus as
                | "pending"
                | "processing"
                | "completed"
                | "failed"
                | "review_queue",
            },
            {
              onSuccess: () => {
                utils.jobSheets.list.invalidate();
                toast.success("Approval undone");
              },
              onError: err => toast.error(err.message || "Undo failed"),
            }
          );
        },
      },
    });
  };

  const handleApprove = (jobSheetId: number) => {
    approveJobSheet.mutate(
      { jobSheetId, reason: "Approved from hold queue" },
      {
        onSuccess: result => {
          utils.jobSheets.list.invalidate();
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(jobSheetId);
            return next;
          });
          if (selectedId === jobSheetId) {
            const idx = sortedFilteredItems.findIndex(i => i.id === jobSheetId);
            const nextItem =
              sortedFilteredItems[idx + 1] ??
              sortedFilteredItems[idx - 1] ??
              null;
            setSelectedId(nextItem?.id ?? null);
          }
          showApproveUndo(jobSheetId, result.previousStatus);
        },
        onError: err => toast.error(err.message || "Approve failed"),
      }
    );
  };

  const handleReject = (jobSheetId: number) => {
    updateStatus.mutate(
      { id: jobSheetId, status: "failed" },
      {
        onSuccess: () => {
          utils.jobSheets.list.invalidate();
          if (selectedId === jobSheetId) {
            const idx = sortedFilteredItems.findIndex(i => i.id === jobSheetId);
            const nextItem =
              sortedFilteredItems[idx + 1] ??
              sortedFilteredItems[idx - 1] ??
              null;
            setSelectedId(nextItem?.id ?? null);
          }
          toast.success("Job sheet rejected", {
            action: {
              label: "Undo",
              onClick: () => {
                updateStatus.mutate(
                  { id: jobSheetId, status: "review_queue" },
                  {
                    onSuccess: () => {
                      utils.jobSheets.list.invalidate();
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
  };

  const handleBulkApprove = async () => {
    const ids =
      selectedIds.size > 0
        ? Array.from(selectedIds)
        : sortedFilteredItems.map(i => i.id);
    if (ids.length === 0) {
      toast.error("No items to approve");
      return;
    }

    const results = await Promise.allSettled(
      ids.map(id =>
        approveJobSheet.mutateAsync({
          jobSheetId: id,
          reason: "Bulk approved from hold queue",
        })
      )
    );

    await utils.jobSheets.list.invalidate();
    setSelectedIds(new Set());

    const succeeded = results.filter(r => r.status === "fulfilled");
    const failed = results.filter(r => r.status === "rejected");

    if (succeeded.length > 0) {
      const last = succeeded[succeeded.length - 1];
      if (last.status === "fulfilled") {
        toast.success(`Approved ${succeeded.length} job sheet(s)`, {
          action: {
            label: "Undo last",
            onClick: () => {
              undoApprove.mutate(
                {
                  jobSheetId: last.value.jobSheetId,
                  restoreStatus: last.value.previousStatus as
                    | "pending"
                    | "processing"
                    | "completed"
                    | "failed"
                    | "review_queue",
                },
                {
                  onSuccess: () => {
                    utils.jobSheets.list.invalidate();
                    toast.success("Last approval undone");
                  },
                }
              );
            },
          },
        });
      }
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} approval(s) failed`);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectByOffset = usePersistFn((delta: number) => {
    if (sortedFilteredItems.length === 0) return;
    const currentIdx = activeId
      ? sortedFilteredItems.findIndex(i => i.id === activeId)
      : -1;
    const nextIdx =
      currentIdx < 0
        ? delta > 0
          ? 0
          : sortedFilteredItems.length - 1
        : Math.max(
            0,
            Math.min(sortedFilteredItems.length - 1, currentIdx + delta)
          );
    setSelectedId(sortedFilteredItems[nextIdx].id);
  });

  const onApproveSelected = usePersistFn(() => {
    if (activeId != null) handleApprove(activeId);
  });
  const onRejectSelected = usePersistFn(() => {
    if (activeId != null) handleReject(activeId);
  });

  const keyboardHandlers = useMemo(
    () => ({
      onNext: () => selectByOffset(1),
      onPrev: () => selectByOffset(-1),
      onApprove: () => onApproveSelected(),
      onReject: () => onRejectSelected(),
      onToggleLegend: () => setShowLegend(v => !v),
      onFocusPane: () => paneRef.current?.focus(),
    }),
    [selectByOffset, onApproveSelected, onRejectSelected]
  );

  useReviewQueueKeyboard(keyboardHandlers, !isLoading && !error);

  return (
    <DashboardLayout>
      <div className="space-y-4" tabIndex={0}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-[#333030]">
              Hold Queue
            </h1>
            <p className="text-[#706D6D] mt-1">
              Priority-sorted review queue — SLA breaches and critical items
              first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-[#EBE8E8] text-[#333030] hover:bg-[#F5F4F4]"
              onClick={() => setShowLegend(v => !v)}
              aria-label="Toggle keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4 mr-2" />
              Shortcuts
            </Button>
            <Button
              variant="outline"
              className="border-[#EBE8E8] text-[#333030] hover:bg-[#F5F4F4]"
              onClick={() =>
                setFilterChip(f => (f === "all" ? "critical" : "all"))
              }
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button
              onClick={() => void handleBulkApprove()}
              disabled={approveJobSheet.isPending || totalItems === 0}
              className="bg-primary text-[#333030] hover:bg-primary/90"
            >
              {approveJobSheet.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Bulk Approve
              {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>

        {showLegend && (
          <ReviewShortcutsLegend
            variant="queue"
            className="bg-white border border-[#EBE8E8]"
          />
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#706D6D]" />
            <Input
              type="search"
              placeholder="Search by ID, technician, or site..."
              className="pl-9 bg-white border-[#EBE8E8]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={filterChip === "all"}
              onClick={() => setFilterChip("all")}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filterChip === "all"
                  ? "border-transparent bg-primary text-[#333030] hover:bg-primary/90"
                  : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              All ({totalItems})
            </button>
            <button
              type="button"
              aria-pressed={filterChip === "critical"}
              onClick={() => setFilterChip("critical")}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filterChip === "critical"
                  ? "border-transparent bg-primary text-[#333030] hover:bg-primary/90"
                  : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              Critical
            </button>
            <button
              type="button"
              aria-pressed={filterChip === "new_form"}
              onClick={() => setFilterChip("new_form")}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filterChip === "new_form"
                  ? "border-transparent bg-primary text-[#333030] hover:bg-primary/90"
                  : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              New form type{newFormCount > 0 ? ` (${newFormCount})` : ""}
            </button>
            {slaSummary && slaSummary.breachedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <Clock className="h-3 w-3" />
                {slaSummary.breachedCount} SLA breached
              </Badge>
            )}
            <Link
              href="/analytics/defects"
              className="text-sm text-[#333030] hover:underline ml-1 font-medium"
            >
              Exception analytics
            </Link>
          </div>
        </div>

        {isLoading && (
          <Card className="border-[#EBE8E8] bg-white overflow-hidden">
            <ListSkeleton items={6} />
          </Card>
        )}

        {error && (
          <Card className="p-12 border-[#EBE8E8]">
            <div className="flex flex-col items-center justify-center text-destructive">
              <AlertCircle className="h-16 w-16 mb-4" />
              <p className="font-semibold">Failed to load review queue</p>
              <p className="text-sm text-[#706D6D]">{error.message}</p>
            </div>
          </Card>
        )}

        {!isLoading && !error && holdItems.length === 0 && (
          <Card className="p-4 border-[#EBE8E8] bg-white">
            <EmptyState
              icon={Inbox}
              title="Review Queue Empty"
              description="No job sheets are currently awaiting review. All documents have been processed successfully."
            />
          </Card>
        )}

        {!isLoading && !error && holdItems.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-[calc(100vh-14rem)] h-[calc(100vh-14rem)]">
            <Card className="flex flex-col min-h-0 h-full overflow-hidden border-[#EBE8E8] bg-white">
              <CardHeader className="px-4 py-3 border-b border-[#EBE8E8] shrink-0">
                <CardTitle className="text-base text-[#333030]">
                  Pending Reviews ({sortedFilteredItems.length}
                  {sortedFilteredItems.length !== totalItems
                    ? ` of ${totalItems}`
                    : ""}
                  )
                </CardTitle>
                <CardDescription className="text-[#706D6D]">
                  Sorted by SLA breach, severity, then age. j/k to navigate.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-y-auto">
                {sortedFilteredItems.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Filter}
                    title="No items match"
                    description="Try clearing the search or filter."
                    action={{
                      label: "Clear filters",
                      onClick: () => {
                        setFilterChip("all");
                        setSearchQuery("");
                      },
                    }}
                  />
                ) : (
                  <ul className="divide-y divide-[#EBE8E8]">
                    {sortedFilteredItems.map((item, index) => {
                      const isActive = activeId === item.id;
                      const activeIndex = sortedFilteredItems.findIndex(
                        i => i.id === activeId
                      );
                      const chipsEnabled =
                        isActive ||
                        (activeIndex >= 0 &&
                          Math.abs(index - activeIndex) <= 2);
                      return (
                        <li key={item.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "group w-full text-left px-3 py-2 border-l-4 transition-colors cursor-pointer",
                              priorityBorderClass(item),
                              isActive
                                ? "bg-[rgba(190,218,65,0.12)] ring-1 ring-inset ring-primary"
                                : "hover:bg-[#F5F4F4] bg-white"
                            )}
                            onClick={() => setSelectedId(item.id)}
                            onKeyDown={e => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedId(item.id);
                              }
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                onClick={e => e.stopPropagation()}
                                aria-label={`Select ${item.referenceNumber}`}
                                className="h-4 w-4 mt-0.5 accent-primary"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-medium text-sm text-[#333030]">
                                    {item.referenceNumber}
                                  </span>
                                  <div className="flex items-center gap-1 text-xs shrink-0">
                                    {item.slaBreached ? (
                                      <Badge
                                        variant="destructive"
                                        className="text-[10px] px-1.5 py-0"
                                      >
                                        SLA
                                      </Badge>
                                    ) : item.ageHours != null ? (
                                      <span className="text-[#706D6D] flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {item.ageHours < 24
                                          ? `${Math.round(item.ageHours)}h`
                                          : `${Math.round(item.ageHours / 24)}d`}
                                      </span>
                                    ) : (
                                      <span className="text-[#706D6D] flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className="text-sm truncate text-[#333030]"
                                  title={item.fileName}
                                >
                                  {item.fileName}
                                </div>
                                <div className="text-xs text-[#706D6D] truncate">
                                  {item.site} • {item.date}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  {chipsEnabled ? (
                                    <HoldItemReasonChips
                                      jobSheetId={item.id}
                                      enabled
                                    />
                                  ) : item.severity === "critical" ? (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0 leading-4"
                                    >
                                      Critical
                                    </Badge>
                                  ) : null}
                                  {/* Quick actions: always visible on the active row; revealed
                                      on hover/focus for others so approve/reject take one click
                                      without first selecting the row. */}
                                  <div
                                    className={cn(
                                      "flex items-center gap-0.5 ml-auto shrink-0 transition-opacity duration-[var(--duration-fast)]",
                                      isActive
                                        ? "opacity-100"
                                        : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                                    )}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => handleApprove(item.id)}
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
                                      onClick={() => handleReject(item.id)}
                                      disabled={updateStatus.isPending}
                                      aria-label="Reject"
                                      title="Reject (r)"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                    <Link href={`/audits?id=${item.id}`}>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-[#706D6D] hover:bg-[#F5F4F4]"
                                        aria-label="Open full audit"
                                        title="Open full audit"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col min-h-0 h-full overflow-hidden p-0 gap-0 border-[#EBE8E8] bg-white">
              {activeId != null ? (
                <div className="flex-1 min-h-0 h-full p-3">
                  <ReviewWorkstationPane
                    jobSheetId={activeId}
                    compact
                    showJobSheetActions
                    paneRef={paneRef}
                    onApproveJobSheet={() => handleApprove(activeId)}
                    onRejectJobSheet={() => handleReject(activeId)}
                    approvePending={approveJobSheet.isPending}
                    rejectPending={updateStatus.isPending}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-3">
                  <EmptyState
                    icon={Inbox}
                    title="Select a job sheet"
                    description="Choose an item from the queue to open the review workstation (PDF + findings) without leaving this page."
                  />
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
