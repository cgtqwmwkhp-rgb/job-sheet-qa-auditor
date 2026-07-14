import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ChevronRight,
  TrendingUp,
  FileText,
  Calendar,
  Bell,
  MessageSquareWarning,
  Settings,
  Loader2,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { NotificationSettings } from "@/components/NotificationSettings";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/ui/loading-skeleton";

type PortalDefect = {
  findingId: number;
  jobSheetId: number;
  severity: string;
  severityLabel: "Critical" | "Warning" | "Minor";
  reasonCode: string;
  fieldName: string;
  title: string;
  occurredAt: string;
  relativeTime: string;
};

export default function TechnicianDashboard() {
  const { user, logout } = useAuth();
  const { fcmToken } = usePushNotifications();
  const utils = trpc.useUtils();

  const { data, isLoading, isError } = trpc.portal.myDashboard.useQuery();
  const createDispute = trpc.disputes.create.useMutation({
    onSuccess: () => {
      utils.portal.myDashboard.invalidate();
      utils.disputes.list.invalidate();
    },
  });

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [selectedDefect, setSelectedDefect] = useState<PortalDefect | null>(
    null
  );
  const [evidenceLoadingId, setEvidenceLoadingId] = useState<number | null>(
    null
  );

  const handleLogout = () => {
    logout();
  };

  const openDispute = (defect: PortalDefect) => {
    setSelectedDefect(defect);
    setDisputeReason("");
    setDisputeOpen(true);
  };

  const submitDispute = () => {
    if (!selectedDefect) return;
    const reason = disputeReason.trim();
    if (!reason) {
      toast.error("Please provide a reason for the dispute");
      return;
    }

    createDispute.mutate(
      {
        auditFindingId: selectedDefect.findingId,
        reason,
      },
      {
        onSuccess: () => {
          toast.success("Dispute submitted for QA review");
          setDisputeOpen(false);
          setDisputeReason("");
          setSelectedDefect(null);
        },
        onError: err => {
          toast.error(err.message || "Failed to submit dispute");
        },
      }
    );
  };

  const viewEvidence = async (jobSheetId: number) => {
    setEvidenceLoadingId(jobSheetId);
    try {
      const result = await utils.portal.evidenceUrl.fetch({ jobSheetId });
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Evidence file is not available");
      }
    } catch {
      toast.error("Could not load evidence");
    } finally {
      setEvidenceLoadingId(null);
    }
  };

  const score = data?.scorecard.overallScore ?? 0;
  const percentile = data?.scorecard.percentile ?? 0;
  const monthlyTarget = data?.scorecard.monthlyTarget ?? 95;
  const deltaToTarget = data?.scorecard.deltaToTarget ?? 0;
  const passedAudits = data?.stats.passedAudits ?? 0;
  const defectsFound = data?.stats.defectsFound ?? 0;

  return (
    <div className="min-h-screen bg-muted/40 pb-20">
      <header className="bg-card border-b border-border/60 sticky top-0 z-10 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-xs font-bold text-primary-foreground">
              PE
            </span>
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight text-foreground">
              Technician Portal
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {user?.name || "Technician"}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="relative hover:bg-muted/50 rounded-full"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {fcmToken && (
              <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Log out"
            onClick={handleLogout}
            className="hover:bg-muted/50 rounded-full"
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {isError && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">
              Could not load your scorecard. Pull to refresh or try again later.
            </CardContent>
          </Card>
        )}

        <Card className="bg-primary text-primary-foreground border-none shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="h-32 w-32" />
          </div>
          <CardContent className="p-6 relative z-10">
            {isLoading ? (
              <div className="flex items-center gap-2 text-primary-foreground/80">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading scorecard…</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-primary-foreground/80 text-sm font-medium mb-1">
                      Current Quality Score
                    </p>
                    <h2 className="text-5xl font-bold tracking-tight">
                      {score.toFixed(1)}%
                    </h2>
                  </div>
                  {percentile > 0 && (
                    <Badge className="bg-primary-foreground/15 hover:bg-primary-foreground/20 text-primary-foreground border-none px-3 py-1">
                      Top {Math.max(1, 100 - percentile)}%
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-primary-foreground/80">
                    <span>Monthly Target: {monthlyTarget}%</span>
                    <span className="text-primary-foreground">
                      {deltaToTarget >= 0 ? "+" : ""}
                      {deltaToTarget.toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, Math.max(0, score))}
                    className="h-2.5 bg-black/20 [&>div]:bg-white"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-green-500">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-green-50 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <span className="text-3xl font-bold text-foreground">
                {isLoading ? "—" : passedAudits}
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-1">
                Passed Audits
              </span>
            </CardContent>
          </Card>
          <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-amber-500">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-amber-50 rounded-full flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <span className="text-3xl font-bold text-foreground">
                {isLoading ? "—" : defectsFound}
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-1">
                Defects Found
              </span>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="audits" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-4 h-11 p-1 bg-muted/60">
            <TabsTrigger value="audits" className="text-xs sm:text-sm">
              Recent Audits
            </TabsTrigger>
            <TabsTrigger value="defects" className="text-xs sm:text-sm">
              My Defects
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="audits" className="space-y-3">
            {isLoading ? (
              <ListSkeleton items={4} />
            ) : !data?.recentAudits.length ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No attributed job sheets yet. Audits will appear here once
                  sheets are linked to your account.
                </CardContent>
              </Card>
            ) : (
              data.recentAudits.map(audit => {
                const failed =
                  audit.result === "fail" || audit.result === "review_queue";
                return (
                  <Card key={audit.jobSheetId} className="overflow-hidden">
                    <div className="flex items-center p-3 gap-3">
                      <div
                        className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${failed ? "bg-amber-100" : "bg-green-100"}`}
                      >
                        {failed ? (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h4 className="font-semibold text-sm truncate">
                            {audit.referenceNumber ||
                              `Job #${audit.jobSheetId}`}
                          </h4>
                          <span className="text-[10px] text-muted-foreground">
                            {audit.relativeTime}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {audit.siteInfo
                            ? `Site: ${audit.siteInfo}`
                            : "Site not recorded"}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="defects" className="space-y-3">
            {isLoading ? (
              <ListSkeleton items={3} />
            ) : !data?.defects.length ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No open defects on your attributed job sheets.
                </CardContent>
              </Card>
            ) : (
              data.defects.map(defect => (
                <Card
                  key={defect.findingId}
                  className={`border-l-4 ${
                    defect.severityLabel === "Critical"
                      ? "border-l-red-500"
                      : defect.severityLabel === "Warning"
                        ? "border-l-amber-500"
                        : "border-l-slate-400"
                  }`}
                >
                  <div className="p-3">
                    <div className="flex justify-between mb-1">
                      {defect.severityLabel === "Critical" ? (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0"
                        >
                          Critical
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${
                            defect.severityLabel === "Warning"
                              ? "bg-amber-100 text-amber-800"
                              : ""
                          }`}
                        >
                          {defect.severityLabel}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {defect.relativeTime}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm mb-1">
                      {defect.title}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Job #{defect.jobSheetId} · {defect.reasonCode}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        disabled={evidenceLoadingId === defect.jobSheetId}
                        onClick={() => viewEvidence(defect.jobSheetId)}
                      >
                        {evidenceLoadingId === defect.jobSheetId ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : null}
                        View Evidence
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 h-8 text-xs"
                        onClick={() => openDispute(defect)}
                      >
                        <MessageSquareWarning className="w-3 h-3 mr-1" />
                        Dispute
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <NotificationSettings />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  App Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Dark Mode</span>
                    <span className="text-xs text-muted-foreground">
                      Adjust app appearance
                    </span>
                  </div>
                  <Switch disabled />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Offline Mode</span>
                    <span className="text-xs text-muted-foreground">
                      Cache data for field use
                    </span>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Dispute Finding</DialogTitle>
            <DialogDescription>
              {selectedDefect
                ? `Challenge “${selectedDefect.title}” on Job #${selectedDefect.jobSheetId}. This will be sent to the QA Lead for review.`
                : "Provide a reason why this finding is incorrect."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason for Dispute</Label>
              <Textarea
                id="reason"
                placeholder="e.g., The signature is present on page 3, top right corner."
                value={disputeReason}
                onChange={e => setDisputeReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisputeOpen(false)}
              disabled={createDispute.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitDispute}
              disabled={createDispute.isPending || !disputeReason.trim()}
            >
              {createDispute.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border/60 flex justify-around py-2 px-2 z-10 safe-area-pb shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 text-primary"
        >
          <TrendingUp className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Dashboard</span>
        </Button>
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-5 w-5" />
          <span className="text-[10px] font-medium">My Jobs</span>
        </Button>
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 text-muted-foreground hover:text-foreground"
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-medium">History</span>
        </Button>
      </div>
    </div>
  );
}
