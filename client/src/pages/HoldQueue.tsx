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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ListSkeleton } from "@/components/ui/loading-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { ReviewClaimStatus } from "@/hooks/useReviewClaim";
import { deriveReasonChips } from "@/components/review/holdQueueReasons";
import { mapHasMajorFailsFromReport } from "@/components/review/mapAuditPolicy";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
          title={chip.label}
          className={`text-[10px] px-1.5 py-0 leading-4 border max-w-[9rem] truncate ${chip.className}`}
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
  if (item.severity === "critical") return "border-l-foreground";
  return "border-l-border";
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
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChip, setFilterChip] = useState<FilterChip>("all");
  const [showLegend, setShowLegend] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkApproveConfirmOpen, setBulkApproveConfirmOpen] = useState(false);
  const [pendingBulkApproveIds, setPendingBulkApproveIds] = useState<number[]>(
    []
  );
  const [activeClaim, setActiveClaim] = useState<{
    jobSheetId?: number;
    token?: string;
    status: ReviewClaimStatus;
  }>({ status: "idle" });
  const paneRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const { data: technicians } = trpc.jobSheets.listTechnicians.useQuery();
  const technicianNameById = useMemo(
    () =>
      new Map(
        (technicians ?? []).map(technician => [technician.id, technician.name])
      ),
    [technicians]
  );

  const {
    data: jobSheets,
    isLoading,
    error,
  } = trpc.jobSheets.list.useQuery({
    status: "review_queue",
    limit: 100,
  });

  // PX-076 — debounce filter so typing never remounts the workstation pane
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput), 200);
    return () => window.clearTimeout(t);
  }, [searchInput]);

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
          technician:
            technicianNameById.get(sheet.uploadedBy) ??
            `User ${sheet.uploadedBy}`,
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
    [jobSheets, slaById, technicianNameById]
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

  const handleApprove = (jobSheetId: number, claimToken?: string) => {
    const claimStatus =
      activeClaim.jobSheetId === jobSheetId ? activeClaim.status : "claiming";
    if (jobSheetId === activeId && (!claimToken || claimStatus !== "claimed")) {
      toast.error(
        claimStatus === "conflict"
          ? "This review is claimed by another reviewer"
          : "Wait for the review claim before approving"
      );
      return;
    }
    approveJobSheet.mutate(
      { jobSheetId, reason: "Approved from hold queue", claimToken },
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

  const openRejectDialog = (jobSheetId: number) => {
    setRejectTargetId(jobSheetId);
    setRejectReason("");
  };

  const confirmReject = () => {
    if (rejectTargetId == null) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error("Enter a rejection reason (at least 3 characters)");
      return;
    }
    const jobSheetId = rejectTargetId;
    updateStatus.mutate(
      { id: jobSheetId, status: "failed", reason },
      {
        onSuccess: () => {
          utils.jobSheets.list.invalidate();
          setRejectTargetId(null);
          setRejectReason("");
          if (selectedId === jobSheetId) {
            const idx = sortedFilteredItems.findIndex(i => i.id === jobSheetId);
            const nextItem =
              sortedFilteredItems[idx + 1] ??
              sortedFilteredItems[idx - 1] ??
              null;
            setSelectedId(nextItem?.id ?? null);
          }
          toast.success("Job sheet rejected", {
            duration: 2500,
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

  const runBulkApprove = async (ids: number[]) => {
    const results = await Promise.allSettled(
      ids.map(id =>
        approveJobSheet.mutateAsync({
          jobSheetId: id,
          reason: "Bulk approved from hold queue",
          claimToken:
            activeClaim.jobSheetId === id ? activeClaim.token : undefined,
        })
      )
    );

    await utils.jobSheets.list.invalidate();
    setSelectedIds(new Set());

    const succeeded = results.flatMap(r =>
      r.status === "fulfilled" ? [r.value] : []
    );
    const failed = results.filter(r => r.status === "rejected");

    if (succeeded.length > 0) {
      toast.success(`Approved ${succeeded.length} job sheet(s)`, {
        action: {
          label: "Undo all",
          onClick: () => {
            void (async () => {
              let undone = 0;
              for (const result of succeeded) {
                try {
                  await undoApprove.mutateAsync({
                    jobSheetId: result.jobSheetId,
                    restoreStatus: result.previousStatus as
                      | "pending"
                      | "processing"
                      | "completed"
                      | "failed"
                      | "review_queue",
                  });
                  undone++;
                } catch {
                  // continue remaining
                }
              }
              await utils.jobSheets.list.invalidate();
              if (undone > 0) {
                toast.success(`Undid ${undone} approval(s)`);
              } else {
                toast.error("Undo failed");
              }
            })();
          },
        },
      });
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} approval(s) failed`);
    }
  };

  const handleBulkApprove = () => {
    const ids =
      selectedIds.size > 0
        ? Array.from(selectedIds)
        : sortedFilteredItems.map(i => i.id);
    if (ids.length === 0) {
      toast.error("No items to approve");
      return;
    }
    // PX-087: confirm before bulk sheet approve
    setPendingBulkApproveIds(ids);
    setBulkApproveConfirmOpen(true);
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
    if (activeId != null) {
      handleApprove(
        activeId,
        activeClaim.jobSheetId === activeId ? activeClaim.token : undefined
      );
    }
  });
  const onRejectSelected = usePersistFn(() => {
    if (activeId != null) openRejectDialog(activeId);
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
      <AlertDialog
        open={bulkApproveConfirmOpen}
        onOpenChange={setBulkApproveConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk approve job sheets?</AlertDialogTitle>
            <AlertDialogDescription>
              Approve {pendingBulkApproveIds.length} sheet
              {pendingBulkApproveIds.length === 1 ? "" : "s"} for release. You
              can undo all from the success toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ids = pendingBulkApproveIds;
                setBulkApproveConfirmOpen(false);
                setPendingBulkApproveIds([]);
                void runBulkApprove(ids);
              }}
            >
              Approve {pendingBulkApproveIds.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="space-y-4" tabIndex={0}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
              Hold Queue
            </h1>
            <p className="text-muted-foreground mt-1">
              Priority-sorted review queue — SLA breaches and critical items
              first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-accent"
              onClick={() => setShowLegend(v => !v)}
              aria-label="Toggle keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4 mr-2" />
              Shortcuts
            </Button>
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-accent"
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
              className="bg-primary text-foreground hover:bg-primary/90"
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
            className="bg-background border border-border"
          />
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by ID, technician, or site..."
              className="pl-9 bg-background border-border"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
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
                  ? "border-transparent bg-primary text-foreground hover:bg-primary/90"
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
                  ? "border-transparent bg-primary text-foreground hover:bg-primary/90"
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
                  ? "border-transparent bg-primary text-foreground hover:bg-primary/90"
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
              className="text-sm text-foreground hover:underline ml-1 font-medium"
            >
              Exception analytics
            </Link>
          </div>
        </div>

        {isLoading && (
          <Card className="border-border bg-background overflow-hidden">
            <ListSkeleton items={6} />
          </Card>
        )}

        {error && (
          <Card className="p-12 border-border">
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex flex-col items-center justify-center text-destructive"
            >
              <AlertCircle className="h-16 w-16 mb-4" />
              <p className="font-semibold">Failed to load review queue</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </Card>
        )}

        {!isLoading && !error && holdItems.length === 0 && (
          <Card className="p-4 border-border bg-background">
            <div role="status" aria-live="polite" aria-atomic="true">
              <EmptyState
                icon={Inbox}
                title="Review Queue Empty"
                description="No job sheets are currently awaiting review. All documents have been processed successfully."
              />
            </div>
          </Card>
        )}

        {!isLoading && !error && holdItems.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-[calc(100vh-14rem)] h-[calc(100vh-14rem)]">
            <Card className="flex flex-col min-h-0 h-full overflow-hidden border-border bg-background">
              <CardHeader className="px-4 py-3 border-b border-border shrink-0">
                <CardTitle className="text-base text-foreground">
                  Pending Reviews ({sortedFilteredItems.length}
                  {sortedFilteredItems.length !== totalItems
                    ? ` of ${totalItems}`
                    : ""}
                  )
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Sorted by SLA breach, severity, then age. j/k to navigate.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-y-auto">
                {sortedFilteredItems.length === 0 ? (
                  <div role="status" aria-live="polite" aria-atomic="true">
                    <EmptyState
                      compact
                      icon={Filter}
                      title="No items match"
                      description="Try clearing the search or filter."
                      action={{
                        label: "Clear filters",
                        onClick: () => {
                          setFilterChip("all");
                          setSearchInput("");
                          setSearchQuery("");
                        },
                      }}
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
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
                                : "hover:bg-accent bg-background"
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
                                  <span className="font-mono font-medium text-sm text-foreground">
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
                                      <span className="text-muted-foreground flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {item.ageHours < 24
                                          ? `${Math.round(item.ageHours)}h`
                                          : `${Math.round(item.ageHours / 24)}d`}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className="text-sm truncate text-foreground"
                                  title={item.fileName}
                                >
                                  {item.fileName}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
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
                                      onClick={() => {
                                        if (item.id !== activeId) {
                                          setSelectedId(item.id);
                                          toast.info(
                                            "Claiming review — approve once the claim is ready"
                                          );
                                          return;
                                        }
                                        handleApprove(
                                          item.id,
                                          activeClaim.token
                                        );
                                      }}
                                      disabled={
                                        approveJobSheet.isPending ||
                                        (isActive &&
                                          (activeClaim.jobSheetId !== item.id ||
                                            activeClaim.status !== "claimed"))
                                      }
                                      aria-label="Approve"
                                      title="Approve (a)"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                                      onClick={() => openRejectDialog(item.id)}
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
                                        className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent"
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

            <Card className="flex flex-col min-h-0 h-full overflow-hidden p-0 gap-0 border-border bg-background">
              {activeId != null ? (
                <div className="flex-1 min-h-0 h-full p-3">
                  <ReviewWorkstationPane
                    jobSheetId={activeId}
                    compact
                    showJobSheetActions
                    paneRef={paneRef}
                    onApproveJobSheet={claimToken =>
                      handleApprove(activeId, claimToken)
                    }
                    onRejectJobSheet={() => openRejectDialog(activeId)}
                    onReviewClaimChange={(token, status) =>
                      setActiveClaim({ jobSheetId: activeId, token, status })
                    }
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

        {/* PX-074 — require rejection reason */}
        <Dialog
          open={rejectTargetId != null}
          onOpenChange={open => {
            if (!open) {
              setRejectTargetId(null);
              setRejectReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject job sheet</DialogTitle>
              <DialogDescription>
                Provide a short reason. This is recorded in the audit log and
                helps coaching.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="hold-reject-reason">Rejection reason</Label>
              <Textarea
                id="hold-reject-reason"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Missing engineer signature / unreadable photo evidence"
                rows={3}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectTargetId(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={
                  updateStatus.isPending || rejectReason.trim().length < 3
                }
                onClick={confirmReject}
              >
                {updateStatus.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
