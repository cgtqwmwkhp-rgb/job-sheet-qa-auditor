import DashboardLayout from "@/components/DashboardLayout";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  MoreHorizontal,
  Search,
  XCircle,
  Inbox,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

export default function HoldQueue() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  // Fetch real review queue data from backend
  const {
    data: jobSheets,
    isLoading,
    error,
  } = trpc.jobSheets.list.useQuery({
    status: "review_queue",
    limit: 50,
  });

  const approveJobSheet = trpc.auditActions.approveJobSheet.useMutation();
  const undoApprove = trpc.auditActions.undoJobSheetApprove.useMutation();
  const updateStatus = trpc.jobSheets.updateStatus.useMutation();

  // Transform job sheets to hold queue items
  const holdItems = (jobSheets || []).map(sheet => ({
    id: sheet.id,
    referenceNumber: sheet.referenceNumber || `JS-${sheet.id}`,
    technician: `User ${sheet.uploadedBy}`,
    site: sheet.siteInfo || "Unknown Site",
    date: new Date(sheet.createdAt).toLocaleString(),
    reason: "Review Required", // Will be populated from audit findings
    severity: "warning" as const,
    status: "pending" as const,
    fileName: sheet.fileName,
  }));

  const totalItems = holdItems.length;

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

  const handleBulkApprove = () => {
    const ids =
      selectedIds.size > 0 ? Array.from(selectedIds) : holdItems.map(i => i.id);
    if (ids.length === 0) {
      toast.error("No items to approve");
      return;
    }
    let remaining = ids.length;
    for (const id of ids) {
      approveJobSheet.mutate(
        { jobSheetId: id, reason: "Bulk approved from hold queue" },
        {
          onSuccess: result => {
            remaining -= 1;
            if (remaining === 0) {
              utils.jobSheets.list.invalidate();
              setSelectedIds(new Set());
              toast.success(`Approved ${ids.length} job sheet(s)`, {
                action: {
                  label: "Undo last",
                  onClick: () => {
                    const lastId = ids[ids.length - 1];
                    undoApprove.mutate(
                      {
                        jobSheetId: lastId,
                        restoreStatus: result.previousStatus as
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
          },
          onError: err => {
            remaining -= 1;
            toast.error(err.message || `Failed to approve #${id}`);
          },
        }
      );
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button
              onClick={handleBulkApprove}
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

        {/* Filters & Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by ID, technician, or site..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
            >
              All ({totalItems})
            </Badge>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading review queue...</p>
            </div>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-destructive">
              <AlertCircle className="h-16 w-16 mb-4" />
              <p className="font-semibold">Failed to load review queue</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </Card>
        )}

        {/* Empty State */}
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

        {/* Queue Table */}
        {!isLoading && !error && holdItems.length > 0 && (
          <Card>
            <CardHeader className="px-6 py-4 border-b">
              <CardTitle className="text-base">
                Pending Reviews ({totalItems})
              </CardTitle>
              <CardDescription>
                Items sorted by upload date (newest first).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <span className="sr-only">Select</span>
                    </TableHead>
                    <TableHead className="w-[120px]">Reference</TableHead>
                    <TableHead>File / Site</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          aria-label={`Select ${item.referenceNumber}`}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        <Link
                          href={`/audits?id=${item.id}`}
                          className="hover:underline text-primary"
                        >
                          {item.referenceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div
                          className="font-medium truncate max-w-[200px]"
                          title={item.fileName}
                        >
                          {item.fileName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.site}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.date}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-orange-100 text-orange-800"
                        >
                          {item.reason}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="capitalize">{item.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
