import { useState } from "react";
import { useDisputes, useResolveDispute, type Dispute } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  CheckCircle2, 
  XCircle, 
  Clock, 
  MessageSquareWarning,
  Search,
  Filter,
  User,
  FileText
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function DisputeManagement() {
  const { data: disputes, isLoading } = useDisputes();
  const resolveDispute = useResolveDispute();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [adminComment, setAdminComment] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [searchTerm, setSearchTerm] = useState("");

  const handleAction = (dispute: Dispute, type: "approve" | "reject") => {
    setSelectedDispute(dispute);
    setActionType(type);
    setAdminComment("");
    setResolveDialogOpen(true);
  };

  const submitResolution = () => {
    if (!selectedDispute) return;

    resolveDispute.mutate({
      disputeId: selectedDispute.id,
      status: actionType === "approve" ? "approved" : "rejected",
      comment: adminComment
    }, {
      onSuccess: () => {
        toast.success(`Dispute ${actionType === "approve" ? "approved" : "rejected"} successfully`);
        setResolveDialogOpen(false);
      },
      onError: () => {
        toast.error("Failed to resolve dispute");
      }
    });
  };

  const filteredDisputes = disputes?.filter(d => 
    d.technicianId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingDisputes = filteredDisputes?.filter(d => d.status === "pending") || [];
  const resolvedDisputes = filteredDisputes?.filter(d => d.status !== "pending") || [];

  if (isLoading) {
    return <div className="p-8 text-center">Loading disputes...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dispute Management</h1>
          <p className="text-muted-foreground mt-1">Review and resolve findings contested by technicians.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search disputes..." 
              className="pl-8" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            <div className="text-2xl font-bold">{pendingDisputes.length}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved (This Month)</CardTitle>
            <div className="text-2xl font-bold text-green-600">12</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejected (This Month)</CardTitle>
            <div className="text-2xl font-bold text-red-600">4</div>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending Review
            {pendingDisputes.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
                {pendingDisputes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Resolution History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-4">
          {pendingDisputes.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-medium">All Caught Up!</h3>
              <p className="text-muted-foreground">There are no pending disputes to review.</p>
            </div>
          ) : (
            pendingDisputes.map((dispute) => (
              <Card key={dispute.id} className="overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  <div className="p-6 flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">{dispute.id}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(dispute.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                        Pending Review
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Technician Claim</h4>
                        <div className="bg-muted/50 p-3 rounded-md text-sm">
                          "{dispute.reason}"
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                          <User className="h-4 w-4" />
                          <span>Technician ID: {dispute.technicianId}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Original Finding</h4>
                        <div className="border rounded-md p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-sm">Finding #{dispute.findingId}</span>
                            <Button variant="ghost" size="sm" className="h-6 text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              View Evidence
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Original finding details would appear here (linked via findingId).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-6 flex flex-row md:flex-col justify-center gap-3 border-t md:border-t-0 md:border-l w-full md:w-48">
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleAction(dispute, "approve")}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="flex-1"
                      onClick={() => handleAction(dispute, "reject")}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          {resolvedDisputes.map((dispute) => (
            <Card key={dispute.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{dispute.id}</Badge>
                    <div>
                      <div className="font-medium">Technician {dispute.technicianId}</div>
                      <div className="text-sm text-muted-foreground">
                        Resolved {dispute.resolvedAt ? formatDistanceToNow(new Date(dispute.resolvedAt), { addSuffix: true }) : 'Unknown'}
                      </div>
                    </div>
                  </div>
                  <Badge 
                    variant={dispute.status === "approved" ? "default" : "destructive"}
                    className={dispute.status === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    {dispute.status === "approved" ? "Approved" : "Rejected"}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">Reason:</span>
                    <p className="mt-1">{dispute.reason}</p>
                  </div>
                  {dispute.adminComment && (
                    <div className="bg-muted/50 p-3 rounded-md">
                      <span className="font-medium text-muted-foreground">Admin Note:</span>
                      <p className="mt-1 italic">{dispute.adminComment}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Dispute" : "Reject Dispute"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve" 
                ? "This will overturn the original finding and update the technician's score."
                : "This will uphold the original finding. Please provide a reason for the technician."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="comment">Admin Comment (Optional)</Label>
            <Textarea 
              id="comment" 
              placeholder={actionType === "approve" ? "e.g., Verified via manual review." : "e.g., Evidence provided is insufficient."}
              value={adminComment}
              onChange={(e) => setAdminComment(e.target.value)}
              className="mt-2"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button 
              variant={actionType === "approve" ? "default" : "destructive"}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : ""}
              onClick={submitResolution}
            >
              Confirm {actionType === "approve" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
