import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Download, Eye, Flag, MessageSquare, Loader2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentViewer, BoundingBox as ViewerBoundingBox } from "@/components/DocumentViewer";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Local Finding type for this page
interface Finding {
  id: number | string;
  field: string;
  status: "passed" | "missing" | "warning";
  severity?: "critical" | "major" | "minor";
  value?: string;
  message?: string;
  confidence: number;
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

interface AuditData {
  id: string;
  status: string;
  score: string;
  date: string;
  technician: string;
  documentUrl: string;
  findings: Finding[];
}

// Mock data for demo
const mockAuditData: AuditData = {
  id: "JS-2024-001",
  status: "failed",
  score: "C",
  technician: "John Doe",
  date: "2024-01-15",
  documentUrl: "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf",
  findings: [
    {
      id: 1,
      field: "Customer Signature",
      status: "missing",
      severity: "critical",
      message: "Customer signature is required but not detected.",
      confidence: 0.98,
      box: { page: 1, x: 10, y: 80, width: 30, height: 5, color: "#ef4444", label: "Missing Signature" }
    },
    {
      id: 2,
      field: "Date of Service",
      status: "passed",
      value: "15/01/2024",
      confidence: 0.99,
      box: { page: 1, x: 70, y: 15, width: 20, height: 3, color: "#22c55e", label: "Date" }
    },
    {
      id: 3,
      field: "Serial Number",
      status: "warning",
      value: "SN-12345-??",
      message: "Serial number is partially obscured.",
      confidence: 0.75,
      box: { page: 1, x: 40, y: 30, width: 25, height: 4, color: "#f97316", label: "Serial #" }
    },
    {
      id: 4,
      field: "Work Description",
      status: "passed",
      value: "Routine maintenance performed. Replaced filters.",
      confidence: 0.95,
      box: { page: 1, x: 10, y: 40, width: 80, height: 20, color: "#22c55e", label: "Description" }
    },
  ],
};

export default function AuditResults() {
  const [_location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const idParam = searchParams.get("id");
  
  // Try to fetch from real API if we have a numeric ID
  const numericId = idParam ? parseInt(idParam) : 0;
  const { data: jobSheetData, isLoading } = trpc.jobSheets.get.useQuery(
    { id: numericId },
    { enabled: numericId > 0 }
  );

  // If loading real data
  if (isLoading && numericId > 0) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-8rem)] flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Convert real job sheet data to AuditData format if available
  let auditData: AuditData;
  if (jobSheetData && numericId > 0) {
    auditData = {
      id: jobSheetData.referenceNumber || `JS-${jobSheetData.id}`,
      status: jobSheetData.status === 'completed' ? 'passed' : jobSheetData.status === 'failed' ? 'failed' : 'pending',
      score: jobSheetData.status === 'completed' ? 'A' : jobSheetData.status === 'failed' ? 'F' : '-',
      date: new Date(jobSheetData.createdAt).toLocaleDateString(),
      technician: `User ${jobSheetData.uploadedBy}`,
      documentUrl: jobSheetData.fileUrl,
      findings: [], // Would be populated from audit results in a real implementation
    };
  } else {
    // Use mock data for demo
    auditData = mockAuditData;
  }

  return <AuditResultsContent auditData={auditData} />;
}

function AuditResultsContent({ auditData }: { auditData: AuditData }) {
  const [activeBoxId, setActiveBoxId] = useState<string | number | null>(null);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [newBox, setNewBox] = useState<ViewerBoundingBox | null>(null);
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [annotationComment, setAnnotationComment] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [feedbackType, setFeedbackType] = useState("incorrect");
  const [feedbackComment, setFeedbackComment] = useState("");
  
  const createDispute = trpc.disputes.create.useMutation();

  const boxes: ViewerBoundingBox[] = auditData.findings
    .filter((f) => f.box)
    .map((f) => ({
      id: f.id,
      page: f.box!.page,
      x: f.box!.x,
      y: f.box!.y,
      width: f.box!.width,
      height: f.box!.height,
      color: f.box!.color,
      label: f.box!.label,
    }));

  const handleBoxClick = (id: string | number) => {
    setActiveBoxId(id);
    const element = document.getElementById(`finding-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleBoxCreate = (box: ViewerBoundingBox) => {
    setNewBox(box);
    setAnnotationOpen(true);
  };

  const submitAnnotation = () => {
    if (!newBox) return;
    
    // In a real implementation, this would call an API
    toast.success("Annotation saved successfully");
    setAnnotationOpen(false);
    setNewBox(null);
    setAnnotationLabel("");
    setAnnotationComment("");
  };

  const handleReportIssue = (finding: Finding, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFinding(finding);
    setFeedbackOpen(true);
  };

  const submitFeedback = () => {
    if (!selectedFinding) return;
    
    // Create a dispute for this finding
    createDispute.mutate({
      auditFindingId: typeof selectedFinding.id === 'number' ? selectedFinding.id : 1,
      reason: `[${feedbackType}] ${feedbackComment}`,
    }, {
      onSuccess: () => {
        toast.success("Feedback submitted successfully");
        setFeedbackOpen(false);
        setFeedbackComment("");
      },
      onError: () => {
        toast.error("Failed to submit feedback");
      }
    });
  };

  const passedFindings = auditData.findings.filter(f => f.status === 'passed');
  const failedFindings = auditData.findings.filter(f => f.status !== 'passed');

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{auditData.id}</h1>
              <Badge variant={auditData.status === 'passed' ? 'default' : 'destructive'}>
                {auditData.status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="font-mono">
                Score: {auditData.score}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Technician: {auditData.technician} • Date: {auditData.date} • 
              {passedFindings.length} passed, {failedFindings.length} issues
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Flag className="w-4 h-4 mr-2" />
              Flag for Review
            </Button>
            <Button size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Split Screen */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Document Viewer */}
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between shrink-0 bg-muted/30">
              <CardTitle className="text-sm font-medium">Document Preview</CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-hidden">
              <DocumentViewer
                url={auditData.documentUrl}
                boxes={boxes}
                onBoxClick={handleBoxClick}
                onBoxCreate={handleBoxCreate}
              />
            </div>
          </Card>

          {/* Findings Panel */}
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="py-3 px-4 border-b shrink-0">
              <CardTitle className="text-sm font-medium">Audit Findings</CardTitle>
            </CardHeader>
            
            <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-3 shrink-0">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="all">All ({auditData.findings.length})</TabsTrigger>
                  <TabsTrigger value="issues">Issues ({failedFindings.length})</TabsTrigger>
                  <TabsTrigger value="passed">Passed ({passedFindings.length})</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="all" className="flex-1 min-h-0 m-0">
                <FindingsList 
                  findings={auditData.findings} 
                  activeBoxId={activeBoxId}
                  onFindingClick={setActiveBoxId}
                  onReportIssue={handleReportIssue}
                />
              </TabsContent>
              
              <TabsContent value="issues" className="flex-1 min-h-0 m-0">
                <FindingsList 
                  findings={failedFindings} 
                  activeBoxId={activeBoxId}
                  onFindingClick={setActiveBoxId}
                  onReportIssue={handleReportIssue}
                />
              </TabsContent>
              
              <TabsContent value="passed" className="flex-1 min-h-0 m-0">
                <FindingsList 
                  findings={passedFindings} 
                  activeBoxId={activeBoxId}
                  onFindingClick={setActiveBoxId}
                  onReportIssue={handleReportIssue}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      {/* Annotation Dialog */}
      <Dialog open={annotationOpen} onOpenChange={setAnnotationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Annotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Select value={annotationLabel} onValueChange={setAnnotationLabel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing">Missing Field</SelectItem>
                  <SelectItem value="incorrect">Incorrect Value</SelectItem>
                  <SelectItem value="unclear">Unclear/Illegible</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comment</Label>
              <Textarea 
                placeholder="Add a comment..."
                value={annotationComment}
                onChange={(e) => setAnnotationComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnotationOpen(false)}>Cancel</Button>
            <Button onClick={submitAnnotation}>Save Annotation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
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
                  <SelectItem value="missing_context">Missing Context</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea 
                placeholder="Please describe the issue..."
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>Cancel</Button>
            <Button onClick={submitFeedback} disabled={createDispute.isPending}>
              {createDispute.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

interface FindingsListProps {
  findings: Finding[];
  activeBoxId: string | number | null;
  onFindingClick: (id: string | number) => void;
  onReportIssue: (finding: Finding, e: React.MouseEvent) => void;
}

function FindingsList({ findings, activeBoxId, onFindingClick, onReportIssue }: FindingsListProps) {
  if (findings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No findings in this category.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {findings.map((finding) => (
          <div
            key={finding.id}
            id={`finding-${finding.id}`}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              activeBoxId === finding.id 
                ? 'ring-2 ring-primary border-primary bg-primary/5' 
                : 'hover:bg-muted/50'
            } ${
              finding.status === 'missing' ? 'bg-red-50/50 border-red-200' :
              finding.status === 'warning' ? 'bg-orange-50/50 border-orange-200' :
              'bg-green-50/50 border-green-200'
            }`}
            onClick={() => onFindingClick(finding.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {finding.status === 'missing' ? 
                  <AlertCircle className="w-5 h-5 text-red-600" /> :
                 finding.status === 'warning' ?
                  <AlertCircle className="w-5 h-5 text-orange-600" /> :
                  <CheckCircle2 className="w-5 h-5 text-green-600" />}
                <h3 className="font-semibold text-sm">{finding.field}</h3>
              </div>
              <Badge variant="outline" className="bg-white/50">
                {(finding.confidence * 100).toFixed(0)}% Conf.
              </Badge>
            </div>
            
            {finding.value && (
              <div className="mb-2 p-2 bg-white/60 rounded border border-black/5 font-mono text-sm">
                {finding.value}
              </div>
            )}
            
            {finding.message && (
              <p className={`text-sm ${
                finding.status === 'missing' ? 'text-red-700' : 'text-orange-700'
              }`}>
                {finding.message}
              </p>
            )}
            
            <div className="mt-3 flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <Eye className="w-3 h-3 mr-1" /> View on Doc
              </Button>
              {finding.status !== 'passed' && (
                <Button variant="ghost" size="sm" className="h-7 text-xs hover:text-destructive">
                  Override
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-muted-foreground hover:text-primary ml-auto"
                onClick={(e) => onReportIssue(finding, e)}
              >
                <MessageSquare className="w-3 h-3 mr-1" /> Report Issue
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
