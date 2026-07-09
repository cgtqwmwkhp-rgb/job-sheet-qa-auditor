import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, Clock, Eye, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
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
import { perfMark, PERF_MARKS, perfClear } from "@/lib/perf";

// No mock data - only show real audit results

export default function AuditResults() {
  const [, setLocation] = useLocation();

  // Track selected audit ID in state since wouter doesn't include query params in location
  const [selectedAuditId, setSelectedAuditId] = useState<number | null>(() => {
    // Initialize from URL on first render
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      return id ? parseInt(id) : null;
    }
    return null;
  });

  console.log("[AuditResults] selectedAuditId:", selectedAuditId);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      setSelectedAuditId(id ? parseInt(id) : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Function to go back to list
  const goBackToList = () => {
    setSelectedAuditId(null);
    setLocation("/audits");
  };

  // Navigate to audit detail with perf marking
  const navigateToAudit = (id: number) => {
    console.log("[AuditResults] Navigating to audit:", id);
    perfClear(); // Clear previous marks
    perfMark(PERF_MARKS.AUDIT_DETAIL_CLICK);
    setSelectedAuditId(id); // Update state to trigger re-render
    setLocation(`/audits?id=${id}`); // Update URL for bookmarkability
  };

  // Try to fetch from real API if we have a selected audit ID
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

  // Log for debugging
  if (numericId > 0) {
    console.log("[AuditResults] Fetching job sheet:", numericId, {
      isLoading,
      hasData: !!jobSheetData,
      error: jobSheetError?.message,
    });
  }

  // Fetch all job sheets for the list view — poll while any are processing
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

  // Fetch the audit result for this job sheet (always call, use enabled flag)
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

  // Fetch findings if we have an audit result (always call, use enabled flag)
  const { data: findingsData } = trpc.audits.getFindings.useQuery(
    { auditResultId: auditResult?.id || 0 },
    { enabled: !!auditResult?.id }
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

  // If there's an error fetching the job sheet, show error state
  if (numericId > 0 && jobSheetError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <AlertCircle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to Load Audit</h2>
          <p className="text-muted-foreground mb-4">{jobSheetError.message}</p>
          <Button onClick={goBackToList}>Back to List</Button>
        </div>
      </DashboardLayout>
    );
  }

  // Deep link while still processing — show live stages instead of empty findings
  if (
    numericId > 0 &&
    jobSheetData &&
    isActiveJobSheetStatus(jobSheetData.status)
  ) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-heading font-bold tracking-tight">
                {jobSheetData.referenceNumber || `JS-${jobSheetData.id}`}
              </h1>
              <p className="text-muted-foreground mt-1">
                {jobSheetData.fileName} is still processing. This page updates
                automatically.
              </p>
            </div>
            <Button variant="outline" onClick={goBackToList}>
              Back to List
            </Button>
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

  // If no ID provided or job sheet not found, show the list of audits
  if (!numericId || !jobSheetData) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              Audit Results
            </h1>
            <p className="text-muted-foreground mt-1">
              Select an audit to view details, findings, and generated reports.
            </p>
          </div>

          {listLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !allJobSheets || allJobSheets.length === 0 ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No Audits Yet</h2>
                <p className="text-muted-foreground max-w-md mb-4">
                  Upload your first job sheet to get started with auditing.
                </p>
                <Button onClick={() => setLocation("/upload")}>
                  Upload Job Sheet
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>All Audits ({allJobSheets.length})</CardTitle>
              </CardHeader>
              <ScrollArea className="h-[calc(100vh-16rem)]">
                <div className="p-4 space-y-3">
                  {allJobSheets.map(sheet => (
                    <div
                      key={sheet.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigateToAudit(sheet.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e =>
                        e.key === "Enter" && navigateToAudit(sheet.id)
                      }
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            sheet.status === "failed"
                              ? "bg-red-100 text-red-600"
                              : sheet.status === "review_queue"
                                ? "bg-orange-100 text-orange-600"
                                : sheet.status === "completed"
                                  ? "bg-lime-100 text-lime-700"
                                  : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {sheet.status === "failed" ? (
                            <AlertCircle className="w-5 h-5" />
                          ) : sheet.status === "review_queue" ? (
                            <Clock className="w-5 h-5" />
                          ) : sheet.status === "completed" ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium font-mono">
                            {sheet.referenceNumber || `JS-${sheet.id}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {sheet.fileName} •{" "}
                            {sheet.siteInfo || "No site info"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p
                            className={`font-bold text-sm ${
                              sheet.status === "failed"
                                ? "text-red-600"
                                : sheet.status === "review_queue"
                                  ? "text-orange-600"
                                  : sheet.status === "completed"
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                            }`}
                          >
                            {sheet.status.toUpperCase().replace("_", " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sheet.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Show loading while fetching audit result
  if (auditLoading && jobSheetData) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading audit results...
          </span>
        </div>
      </DashboardLayout>
    );
  }

  const findings: Finding[] = mapFindingsFromApi(findingsData || []);

  // Convert real job sheet data to AuditData format
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
  };

  // Use the PDF proxy endpoint for same-origin loading (avoids CORS issues)
  const pdfProxyUrl = `/api/documents/${numericId}/pdf`;

  return (
    <DashboardLayout>
      <ReviewWorkstationPane
        jobSheetId={numericId}
        auditData={auditData}
        documentUrl={pdfProxyUrl}
      />
    </DashboardLayout>
  );
}
