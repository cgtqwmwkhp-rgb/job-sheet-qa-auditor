import DashboardLayout from "@/components/DashboardLayout";
import { ReviewWorkstationPane } from "@/components/review/ReviewWorkstationPane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Search,
  XCircle,
  Inbox,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useMemo, useRef, useState } from "react";
import { useReviewQueueKeyboard } from "@/hooks/useReviewQueueKeyboard";
import { usePersistFn } from "@/hooks/usePersistFn";

type FilterChip = "all" | "critical";

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
      (jobSheets || []).map(sheet => {
        const sla = slaById.get(sheet.id);
        return {
          id: sheet.id,
          referenceNumber: sheet.referenceNumber || `JS-${sheet.id}`,
          technician: `User ${sheet.uploadedBy}`,
          site: sheet.siteInfo || "Unknown Site",
          date: new Date(sheet.createdAt).toLocaleString(),
          reason: "Review Required",
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
      return true;
    });
  }, [holdItems, searchQuery, filterChip]);

  const totalItems = holdItems.length;

  const activeId = useMemo(() => {
    if (filteredItems.length === 0) return null;
    if (
      selectedId != null &&
      filteredItems.some(item => item.id === selectedId)
    ) {
      return selectedId;
    }
    return filteredItems[0].id;
  }, [filteredItems, selectedId]);

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
            const idx = filteredItems.findIndex(i => i.id === jobSheetId);
            const nextItem =
              filteredItems[idx + 1] ?? filteredItems[idx - 1] ?? null;
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
            const idx = filteredItems.findIndex(i => i.id === jobSheetId);
            const nextItem =
              filteredItems[idx + 1] ?? filteredItems[idx - 1] ?? null;
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
      selectedIds.size > 0 ? Array.from(selectedIds) : holdItems.map(i => i.id);
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
              const lastId = ids[ids.length - 1];
              undoApprove.mutate(
                {
                  jobSheetId: lastId,
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
    if (filteredItems.length === 0) return;
    const currentIdx = activeId
      ? filteredItems.findIndex(i => i.id === activeId)
      : -1;
    const nextIdx =
      currentIdx < 0
        ? delta > 0
          ? 0
          : filteredItems.length - 1
        : Math.max(0, Math.min(filteredItems.length - 1, currentIdx + delta));
    setSelectedId(filteredItems[nextIdx].id);
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
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              Hold Queue
            </h1>
            <p className="text-muted-foreground mt-1">
              Review and resolve flagged job sheets requiring manual
              intervention.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowLegend(v => !v)}
              aria-label="Toggle keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4 mr-2" />
              Shortcuts
            </Button>
            <Button
              variant="outline"
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
          <Card className="bg-muted/40">
            <CardContent className="py-3 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <kbd className="font-mono text-foreground">j</kbd> /{" "}
                <kbd className="font-mono text-foreground">k</kbd> next / prev
                job
              </span>
              <span>
                <kbd className="font-mono text-foreground">a</kbd> approve
              </span>
              <span>
                <kbd className="font-mono text-foreground">r</kbd> reject
              </span>
              <span>
                <kbd className="font-mono text-foreground">n</kbd> /{" "}
                <kbd className="font-mono text-foreground">p</kbd> next / prev
                finding
              </span>
              <span>
                <kbd className="font-mono text-foreground">o</kbd> override
              </span>
              <span>
                <kbd className="font-mono text-foreground">c</kbd> correct
              </span>
              <span>
                <kbd className="font-mono text-foreground">v</kbd> view on PDF
              </span>
              <span>
                <kbd className="font-mono text-foreground">Enter</kbd> focus
                pane
              </span>
              <span>
                <kbd className="font-mono text-foreground">?</kbd> toggle this
                legend
              </span>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by ID, technician, or site..."
              className="pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={filterChip === "all" ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={() => setFilterChip("all")}
            >
              All ({totalItems})
            </Badge>
            <Badge
              variant={filterChip === "critical" ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={() => setFilterChip("critical")}
            >
              Critical
            </Badge>
            {slaSummary && slaSummary.breachedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <Clock className="h-3 w-3" />
                {slaSummary.breachedCount} SLA breached
              </Badge>
            )}
            <Link
              href="/analytics/defects"
              className="text-sm text-primary hover:underline ml-1"
            >
              Exception analytics
            </Link>
          </div>
        </div>

        {isLoading && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading review queue...</p>
            </div>
          </Card>
        )}

        {error && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-destructive">
              <AlertCircle className="h-16 w-16 mb-4" />
              <p className="font-semibold">Failed to load review queue</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </Card>
        )}

        {!isLoading && !error && holdItems.length === 0 && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Review Queue Empty</h2>
              <p className="text-muted-foreground max-w-md">
                No job sheets are currently awaiting review. All documents have
                been processed successfully.
              </p>
            </div>
          </Card>
        )}

        {!isLoading && !error && holdItems.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-[calc(100vh-14rem)]">
            <Card className="flex flex-col min-h-0 overflow-hidden">
              <CardHeader className="px-4 py-3 border-b shrink-0">
                <CardTitle className="text-base">
                  Pending Reviews ({filteredItems.length}
                  {filteredItems.length !== totalItems
                    ? ` of ${totalItems}`
                    : ""}
                  )
                </CardTitle>
                <CardDescription>
                  Select a row to review in place. j/k to navigate.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-y-auto">
                {filteredItems.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">
                    No items match the current search/filter.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {filteredItems.map(item => {
                      const isActive = activeId === item.id;
                      return (
                        <li key={item.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                              isActive
                                ? "bg-primary/5 ring-2 ring-inset ring-primary"
                                : ""
                            }`}
                            onClick={() => setSelectedId(item.id)}
                            onKeyDown={e => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedId(item.id);
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                onClick={e => e.stopPropagation()}
                                aria-label={`Select ${item.referenceNumber}`}
                                className="h-4 w-4 mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-medium text-sm">
                                    {item.referenceNumber}
                                  </span>
                                  <div className="flex items-center gap-1 text-xs">
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
                                  className="text-sm truncate"
                                  title={item.fileName}
                                >
                                  {item.fileName}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.site} • {item.date}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="bg-orange-100 text-orange-800 text-xs"
                                  >
                                    {item.reason}
                                  </Badge>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 ml-auto"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>
                                        Actions
                                      </DropdownMenuLabel>
                                      <DropdownMenuItem
                                        onClick={() => handleApprove(item.id)}
                                      >
                                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                                        Approve
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleReject(item.id)}
                                      >
                                        <XCircle className="w-4 h-4 mr-2 text-red-600" />
                                        Reject
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem asChild>
                                        <Link href={`/audits?id=${item.id}`}>
                                          View Details
                                        </Link>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
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

            <Card className="flex flex-col min-h-0 overflow-hidden p-3">
              {activeId != null ? (
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
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                  <Inbox className="h-12 w-12 mb-3 opacity-40" />
                  <p className="font-medium">Select a job sheet</p>
                  <p className="text-sm mt-1 max-w-sm">
                    Choose an item from the queue to open the review workstation
                    (PDF + findings) without leaving this page.
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
