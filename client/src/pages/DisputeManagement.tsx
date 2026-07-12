import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import {
  ListSkeleton,
  StatCardSkeleton,
} from "@/components/ui/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  User,
  FileText,
  Loader2,
  Inbox,
  PlayCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type DisputeStatus =
  | "open"
  | "under_review"
  | "accepted"
  | "rejected"
  | "escalated";

type DisputeData = {
  id: number;
  auditFindingId: number;
  raisedBy: number;
  status: DisputeStatus;
  reason: string;
  evidenceUrls: unknown;
  reviewerId: number | null;
  reviewNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StatusFilter = "all" | DisputeStatus;

function DisputeStatusChip({ status }: { status: DisputeStatus }) {
  const config: Record<
    DisputeStatus,
    { label: string; className: string; icon?: React.ReactNode }
  > = {
    open: {
      label: "Open",
      className:
        "bg-[rgba(190,218,65,0.2)] text-[#333030] border-[#BEDA41]/40 hover:bg-[rgba(190,218,65,0.28)]",
    },
    under_review: {
      label: "Under review",
      className: "bg-[#F5F4F4] text-[#333030] border-[#EBE8E8]",
      icon: <Clock className="h-3 w-3" />,
    },
    accepted: {
      label: "Approved",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    rejected: {
      label: "Rejected",
      className: "bg-red-100 text-red-800 border-red-200",
      icon: <XCircle className="h-3 w-3" />,
    },
    escalated: {
      label: "Escalated",
      className: "bg-amber-100 text-amber-900 border-amber-200",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  };

  const { label, className, icon } = config[status];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium border", className)}
    >
      {icon}
      {label}
    </Badge>
  );
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "under_review", label: "In review" },
  { value: "accepted", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "escalated", label: "Escalated" },
];

export default function DisputeManagement() {
  const { data: disputes, isLoading } = trpc.disputes.list.useQuery();
  const updateDisputeStatus = trpc.disputes.updateStatus.useMutation();
  const utils = trpc.useUtils();

  const [selectedDispute, setSelectedDispute] = useState<DisputeData | null>(
    null
  );
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [adminComment, setAdminComment] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const handleAction = (dispute: DisputeData, type: "approve" | "reject") => {
    setSelectedDispute(dispute);
    setActionType(type);
    setAdminComment("");
    setResolveDialogOpen(true);
  };

  const submitResolution = () => {
    if (!selectedDispute) return;

    updateDisputeStatus.mutate(
      {
        id: selectedDispute.id,
        status: actionType === "approve" ? "accepted" : "rejected",
        reviewNotes: adminComment || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            `Dispute ${actionType === "approve" ? "approved" : "rejected"} successfully`
          );
          setResolveDialogOpen(false);
          utils.disputes.list.invalidate();
        },
        onError: () => {
          toast.error("Failed to resolve dispute");
        },
      }
    );
  };

  const handleStartReview = (dispute: DisputeData) => {
    updateDisputeStatus.mutate(
      { id: dispute.id, status: "under_review" },
      {
        onSuccess: () => {
          toast.success("Review started");
          utils.disputes.list.invalidate();
        },
        onError: () => toast.error("Failed to start review"),
      }
    );
  };

  const handleEscalate = (dispute: DisputeData) => {
    updateDisputeStatus.mutate(
      {
        id: dispute.id,
        status: "escalated",
        reviewNotes: "Escalated for senior review",
      },
      {
        onSuccess: () => {
          toast.success("Dispute escalated");
          utils.disputes.list.invalidate();
        },
        onError: () => toast.error("Failed to escalate dispute"),
      }
    );
  };

  const filteredDisputes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (disputes ?? []).filter(d => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.id.toString().includes(q) ||
        d.reason.toLowerCase().includes(q) ||
        d.raisedBy.toString().includes(q) ||
        d.auditFindingId.toString().includes(q)
      );
    });
  }, [disputes, searchTerm, statusFilter]);

  const pendingDisputes = useMemo(
    () =>
      filteredDisputes.filter(
        d => d.status === "open" || d.status === "under_review"
      ),
    [filteredDisputes]
  );

  const resolvedDisputes = useMemo(
    () =>
      filteredDisputes.filter(
        d =>
          d.status === "accepted" ||
          d.status === "rejected" ||
          d.status === "escalated"
      ),
    [filteredDisputes]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: disputes?.length ?? 0,
      open: 0,
      under_review: 0,
      accepted: 0,
      rejected: 0,
      escalated: 0,
    };
    for (const d of disputes ?? []) {
      counts[d.status as DisputeStatus] += 1;
    }
    return counts;
  }, [disputes]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-[#333030]">
              Dispute Management
            </h1>
            <p className="text-[#706D6D] mt-1">
              Triage technician-contested findings — start review, escalate, or
              resolve in one place.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <ListSkeleton items={5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-[#333030]">
              Dispute Management
            </h1>
            <p className="text-[#706D6D] mt-1">
              Triage technician-contested findings — start review, escalate, or
              resolve in one place.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#706D6D]" />
            <Input
              placeholder="Search disputes…"
              className="pl-9 bg-white border-[#EBE8E8]"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors",
                statusFilter === f.value
                  ? "bg-primary text-[#333030] border-primary"
                  : "bg-white text-[#706D6D] border-[#EBE8E8] hover:text-[#333030] hover:bg-[#F5F4F4]"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "tabular-nums text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center",
                  statusFilter === f.value
                    ? "bg-[rgba(51,48,48,0.12)]"
                    : "bg-[#F5F4F4]"
                )}
              >
                {statusCounts[f.value]}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-[#EBE8E8] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[#706D6D]">
                Pending review
              </CardTitle>
              <div className="text-2xl font-bold text-[#333030]">
                {pendingDisputes.length}
              </div>
            </CardHeader>
          </Card>
          <Card className="border-[#EBE8E8] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[#706D6D]">
                Approved
              </CardTitle>
              <div className="text-2xl font-bold text-emerald-700">
                {statusCounts.accepted}
              </div>
            </CardHeader>
          </Card>
          <Card className="border-[#EBE8E8] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[#706D6D]">
                Rejected / escalated
              </CardTitle>
              <div className="text-2xl font-bold text-[#333030]">
                {statusCounts.rejected + statusCounts.escalated}
              </div>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="h-auto p-1 bg-white border border-[#EBE8E8] rounded-lg gap-1">
            <TabsTrigger
              value="pending"
              className="relative rounded-md data-[state=active]:bg-[rgba(190,218,65,0.15)] data-[state=active]:text-[#333030] data-[state=active]:shadow-none text-[#706D6D]"
            >
              Pending review
              {pendingDisputes.length > 0 && (
                <Badge className="ml-2 h-5 min-w-5 px-1 bg-primary text-[#333030] hover:bg-primary">
                  {pendingDisputes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-md data-[state=active]:bg-[rgba(190,218,65,0.15)] data-[state=active]:text-[#333030] data-[state=active]:shadow-none text-[#706D6D]"
            >
              Resolution history
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingDisputes.length === 0 ? (
              <Card className="border-dashed border-[#EBE8E8] bg-white">
                <CardContent className="py-4">
                  <EmptyState
                    icon={Inbox}
                    title="All caught up"
                    description="No pending disputes match your filters. Technicians can raise disputes from their portal when they contest a finding."
                  />
                </CardContent>
              </Card>
            ) : (
              pendingDisputes.map(dispute => (
                <Card
                  key={dispute.id}
                  className="overflow-hidden border-[#EBE8E8] bg-white"
                >
                  <div className="flex flex-col md:flex-row">
                    <div className="p-5 flex-1 space-y-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className="font-mono border-[#EBE8E8] text-[#333030]"
                          >
                            DSP-{dispute.id}
                          </Badge>
                          <span className="text-sm text-[#706D6D] flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(dispute.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <DisputeStatusChip status={dispute.status} />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-[#706D6D] uppercase tracking-wider">
                            Technician claim
                          </h4>
                          <div className="bg-[#F9F9F9] border border-[#EBE8E8] p-3 rounded-lg text-sm text-[#333030]">
                            &ldquo;{dispute.reason}&rdquo;
                          </div>
                          <div className="flex items-center gap-2 text-sm text-[#706D6D]">
                            <User className="h-4 w-4" />
                            <span>Raised by user #{dispute.raisedBy}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-[#706D6D] uppercase tracking-wider">
                            Original finding
                          </h4>
                          <div className="border border-[#EBE8E8] rounded-lg p-3 bg-white">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-medium text-sm text-[#333030]">
                                Finding #{dispute.auditFindingId}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-[#706D6D] hover:text-[#333030]"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                View evidence
                              </Button>
                            </div>
                            <p className="text-sm text-[#706D6D]">
                              Linked via finding ID — open the audit to compare
                              technician evidence with the original QA outcome.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#F9F9F9] p-4 flex flex-row md:flex-col justify-center gap-2 border-t md:border-t-0 md:border-l border-[#EBE8E8] w-full md:w-52 shrink-0">
                      {dispute.status === "open" && (
                        <Button
                          variant="outline"
                          className="flex-1 border-[#EBE8E8] text-[#333030] hover:bg-[rgba(190,218,65,0.12)]"
                          onClick={() => handleStartReview(dispute)}
                          disabled={updateDisputeStatus.isPending}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Start review
                        </Button>
                      )}
                      <Button
                        className="flex-1 bg-primary text-[#333030] hover:bg-primary/90"
                        onClick={() => handleAction(dispute, "approve")}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-[#EBE8E8]"
                        onClick={() => handleAction(dispute, "reject")}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                      {(dispute.status === "open" ||
                        dispute.status === "under_review") && (
                        <Button
                          variant="ghost"
                          className="flex-1 text-amber-800 hover:bg-amber-50"
                          onClick={() => handleEscalate(dispute)}
                          disabled={updateDisputeStatus.isPending}
                        >
                          <ArrowUpRight className="h-4 w-4 mr-2" />
                          Escalate
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-4">
            {resolvedDisputes.length === 0 ? (
              <Card className="border-dashed border-[#EBE8E8] bg-white">
                <CardContent className="py-4">
                  <EmptyState
                    icon={FileText}
                    title="No resolution history"
                    description="Resolved disputes will appear here once you approve, reject, or escalate."
                  />
                </CardContent>
              </Card>
            ) : (
              resolvedDisputes.map(dispute => (
                <Card key={dispute.id} className="border-[#EBE8E8] bg-white">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="font-mono border-[#EBE8E8]"
                        >
                          DSP-{dispute.id}
                        </Badge>
                        <div>
                          <div className="font-medium text-[#333030]">
                            User #{dispute.raisedBy}
                          </div>
                          <div className="text-sm text-[#706D6D]">
                            Resolved{" "}
                            {dispute.resolvedAt
                              ? formatDistanceToNow(
                                  new Date(dispute.resolvedAt),
                                  { addSuffix: true }
                                )
                              : "Unknown"}
                          </div>
                        </div>
                      </div>
                      <DisputeStatusChip status={dispute.status} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-[#706D6D]">
                          Reason:
                        </span>
                        <p className="mt-1 text-[#333030]">{dispute.reason}</p>
                      </div>
                      {dispute.reviewNotes && (
                        <div className="bg-[#F9F9F9] border border-[#EBE8E8] p-3 rounded-lg">
                          <span className="font-medium text-[#706D6D]">
                            Admin note:
                          </span>
                          <p className="mt-1 italic text-[#333030]">
                            {dispute.reviewNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent className="border-[#EBE8E8]">
            <DialogHeader>
              <DialogTitle className="text-[#333030]">
                {actionType === "approve"
                  ? "Approve dispute"
                  : "Reject dispute"}
              </DialogTitle>
              <DialogDescription className="text-[#706D6D]">
                {actionType === "approve"
                  ? "This will overturn the original finding and update the technician's score."
                  : "This will uphold the original finding. Please provide a reason for the technician."}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Label htmlFor="comment" className="text-[#333030]">
                Admin comment (optional)
              </Label>
              <Textarea
                id="comment"
                placeholder={
                  actionType === "approve"
                    ? "e.g., Verified via manual review."
                    : "e.g., Evidence provided is insufficient."
                }
                value={adminComment}
                onChange={e => setAdminComment(e.target.value)}
                className="mt-2 border-[#EBE8E8]"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="border-[#EBE8E8]"
                onClick={() => setResolveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant={actionType === "approve" ? "default" : "destructive"}
                className={
                  actionType === "approve"
                    ? "bg-primary text-[#333030] hover:bg-primary/90"
                    : ""
                }
                onClick={submitResolution}
                disabled={updateDisputeStatus.isPending}
              >
                {updateDisputeStatus.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm {actionType === "approve" ? "approval" : "rejection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
