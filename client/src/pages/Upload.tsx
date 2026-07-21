import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import { FileUploader } from "@/components/FileUploader";
import { ProcessingProgressPanel } from "@/components/ProcessingProgressPanel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Info,
  FileText,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  AlertCircle,
  User,
  ArrowRight,
  Upload as UploadIcon,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { GuidedTour } from "@/components/GuidedTour";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  useJobSheetProcessStatus,
  watchJobSheetsProcessing,
} from "@/hooks/useProcessingWatch";
import { isActiveJobSheetStatus } from "@shared/processingProgress";
import { cn } from "@/lib/utils";
import { handleProcessJobSheetOutcome } from "@/lib/processJobSheetFeedback";

interface IntakeFeedback {
  fileName: string;
  qualityScore: number | null;
  grade: string | null;
  retakeFeedback: string[];
}

interface UploadSuccess {
  ids: number[];
  fileNames: string[];
}

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  const [processingIds, setProcessingIds] = useState<number[]>([]);
  const [intakeRejections, setIntakeRejections] = useState<IntakeFeedback[]>(
    []
  );
  const [technicianId, setTechnicianId] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState<UploadSuccess | null>(
    null
  );

  const {
    data: recentUploads,
    isLoading: uploadsLoading,
    refetch,
  } = trpc.jobSheets.list.useQuery(
    { limit: 10 },
    {
      refetchInterval: query => {
        const rows = query.state.data?.items;
        if (!rows?.length) return false;
        const active =
          rows.some(r => isActiveJobSheetStatus(r.status)) ||
          processingIds.length > 0;
        return active ? 2000 : false;
      },
    }
  );
  const { data: technicians } = trpc.jobSheets.listTechnicians.useQuery();
  const uploadMutation = trpc.jobSheets.upload.useMutation();
  const processMutation = trpc.jobSheets.process.useMutation();
  const deleteMutation = trpc.jobSheets.delete.useMutation();
  const utils = trpc.useUtils();

  const selectedTechnician = useMemo(
    () => technicians?.find(t => String(t.id) === technicianId),
    [technicians, technicianId]
  );

  const primaryProcessingId = useMemo(() => {
    if (processingIds.length > 0) return processingIds[0];
    const fromList = recentUploads?.items.find(u =>
      isActiveJobSheetStatus(u.status)
    );
    return fromList?.id ?? null;
  }, [processingIds, recentUploads]);

  const { data: liveProgress } = useJobSheetProcessStatus(primaryProcessingId, {
    enabled: primaryProcessingId != null,
  });

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadSuccess(null);
    const uploaded: Array<{ id: number; fileName: string }> = [];
    const rejections: IntakeFeedback[] = [];

    try {
      for (const file of files) {
        const base64 = await fileToBase64(file);

        const result = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
          referenceNumber: generateReferenceNumber(),
          ...(technicianId ? { technicianId: Number(technicianId) } : {}),
        });

        const uploadResult = result as {
          id?: number;
          rejected?: boolean;
          deduped?: boolean;
          reason?: string;
          reusedFromJobSheetId?: number;
          retakeFeedback?: string[];
          intake?: {
            qualityScore: number | null;
            grade: string | null;
            retakeFeedback?: string[];
          };
        };

        if (uploadResult.rejected) {
          rejections.push({
            fileName: file.name,
            qualityScore: uploadResult.intake?.qualityScore ?? null,
            grade: uploadResult.intake?.grade ?? null,
            retakeFeedback:
              uploadResult.retakeFeedback ??
              uploadResult.intake?.retakeFeedback ??
              [],
          });
          continue;
        }

        if (uploadResult.deduped && typeof uploadResult.id === "number") {
          const reuseId = uploadResult.reusedFromJobSheetId ?? uploadResult.id;
          toast.info(
            `"${file.name}" matches an existing upload (#${reuseId}) — no orphan row created. Open the original instead of waiting forever.`,
            {
              action: {
                label: "Open",
                onClick: () => setLocation(`/audits?id=${reuseId}`),
              },
            }
          );
          continue;
        }

        if (typeof uploadResult.id === "number") {
          uploaded.push({ id: uploadResult.id, fileName: file.name });
        }
      }

      setIntakeRejections(rejections);

      if (rejections.length > 0) {
        toast.error(
          `${rejections.length} file(s) need a retake — check quality feedback below.`
        );
      }

      if (uploaded.length === 0) {
        return;
      }

      setUploadSuccess({
        ids: uploaded.map(u => u.id),
        fileNames: uploaded.map(u => u.fileName),
      });

      toast.success(
        `Uploaded ${uploaded.length} file(s). Processing in the background — you can navigate away.`
      );

      utils.jobSheets.list.invalidate();
      utils.stats.dashboard.invalidate();

      const ids = uploaded.map(u => u.id);
      setProcessingIds(ids);
      watchJobSheetsProcessing(uploaded);

      void (async () => {
        for (const item of uploaded) {
          try {
            const result = await processMutation.mutateAsync({ id: item.id });
            handleProcessJobSheetOutcome({
              result,
              fileName: item.fileName,
              onDeduped: message => toast.info(message),
              onError: message => toast.error(message),
            });
          } catch (error) {
            console.error(`Failed to process job sheet ${item.id}:`, error);
            handleProcessJobSheetOutcome({
              error,
              fileName: item.fileName,
              onDeduped: message => toast.info(message),
              onError: message => toast.error(message),
            });
          }
        }
        setProcessingIds([]);
        refetch();
        utils.stats.dashboard.invalidate();
      })();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files. Please try again.");
      setProcessingIds([]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcessSingle = async (id: number, fileName?: string) => {
    setProcessingIds(prev => [...prev, id]);
    watchJobSheetsProcessing([{ id, fileName }]);
    try {
      const result = await processMutation.mutateAsync({ id });
      const outcome = handleProcessJobSheetOutcome({
        result,
        fileName,
        onDeduped: message => toast.info(message),
        onError: message => toast.error(message),
      });
      if (outcome !== "error") {
        refetch();
        utils.stats.dashboard.invalidate();
      }
    } catch (error) {
      console.error("Processing error:", error);
      handleProcessJobSheetOutcome({
        error,
        fileName,
        onDeduped: message => toast.info(message),
        onError: message => toast.error(message),
      });
    } finally {
      setProcessingIds(prev => prev.filter(i => i !== id));
    }
  };

  const getStatusIcon = (status: string, id: number) => {
    if (processingIds.includes(id) || status === "processing") {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "failed":
        return <AlertCircle className="h-4 w-4" />;
      case "review_queue":
        return <Clock className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string, id: number) => {
    if (processingIds.includes(id) || status === "processing") {
      return "bg-[#DBEAFE] text-[#2868CE]";
    }
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-600";
      case "failed":
        return "bg-red-100 text-red-600";
      case "review_queue":
        return "bg-yellow-100 text-yellow-600";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const primarySuccessHref = uploadSuccess
    ? uploadSuccess.ids.length === 1
      ? `/audits?id=${uploadSuccess.ids[0]}`
      : "/audits"
    : "/audits";

  const primarySuccessLabel =
    uploadSuccess && uploadSuccess.ids.length === 1
      ? "View audit result"
      : "View audit results";

  return (
    <DashboardLayout>
      <GuidedTour
        tourId="upload-page-tour"
        steps={[
          {
            element: "#upload-area",
            popover: {
              title: "Upload Zone",
              description:
                "Drag and drop your PDF job sheets here. Files are processed through OCR and Gemini 3.1 Pro analysis with live per-stage progress.",
              side: "bottom",
              align: "start",
            },
          },
          {
            element: "#upload-guidelines",
            popover: {
              title: "Best Practices",
              description:
                "Check these guidelines to ensure the highest OCR accuracy and avoid audit failures.",
              side: "top",
              align: "start",
            },
          },
        ]}
      />
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="text-muted-foreground">
          Drop a job sheet below — processing starts automatically. One clear
          path from upload to audit result.
        </p>

        {uploadSuccess ? (
          <Alert className="border-primary/30 bg-[rgba(190,218,65,0.12)] text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertTitle>Upload complete</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {uploadSuccess.fileNames.length === 1
                  ? `"${uploadSuccess.fileNames[0]}" is processing. You'll get a notification when the audit finishes.`
                  : `${uploadSuccess.fileNames.length} files are processing. You'll get a notification when audits finish.`}
              </span>
              <Button
                asChild
                size="sm"
                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href={primarySuccessHref}>
                  {primarySuccessLabel}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <Alert className="border-[#DBEAFE] bg-[#F0F7FF] text-[#2868CE]">
          <Info className="h-4 w-4" />
          <AlertTitle>AI-powered processing</AlertTitle>
          <AlertDescription>
            OCR extraction and Gold Standard judgment run in the background.
            Progress updates live — you can leave this page safely.
          </AlertDescription>
        </Alert>

        <Card id="upload-area" className="overflow-hidden">
          <CardHeader className="border-b border-border bg-background pb-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-full bg-[rgba(190,218,65,0.15)] px-2.5 py-1 text-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  1
                </span>
                Technician
              </span>
              <span className="text-[#C5C2C2]">→</span>
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-bold">
                  2
                </span>
                Upload file
              </span>
              <span className="text-[#C5C2C2]">→</span>
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-bold">
                  3
                </span>
                Review result
              </span>
            </div>
            <CardTitle className="mt-3">Upload job sheet</CardTitle>
            <CardDescription>
              Drag and drop or browse. Processing begins as soon as the file is
              accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div
              className={cn(
                "rounded-lg border p-4 transition-colors duration-[var(--duration-normal)]",
                technicianId
                  ? "border-primary/40 bg-[rgba(190,218,65,0.08)]"
                  : "border-border bg-[#F9F9F9]"
              )}
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background shadow-sm">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="upload-technician"
                    className="text-sm font-semibold text-foreground"
                  >
                    Assign technician
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Required for scorecards. Pick now or let OCR auto-match the
                    engineer name on the sheet.
                  </p>
                </div>
                {selectedTechnician ? (
                  <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                    Assigned
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                    Optional
                  </span>
                )}
              </div>
              <Select
                value={technicianId || "auto"}
                onValueChange={value =>
                  setTechnicianId(value === "auto" ? "" : value)
                }
                disabled={isUploading}
              >
                <SelectTrigger
                  id="upload-technician"
                  className="w-full bg-background"
                >
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto-match from OCR name (or leave unassigned)
                  </SelectItem>
                  {(technicians ?? []).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                      {t.role === "technician" ? "" : ` (${t.role})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isUploading ? (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-[rgba(190,218,65,0.08)] py-12">
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Uploading files…</p>
                <p className="text-sm text-muted-foreground">
                  Please wait while we upload your documents.
                </p>
              </div>
            ) : (
              <FileUploader
                onUpload={handleUpload}
                maxFiles={50}
                intakeHints={intakeRejections}
              />
            )}

            {liveProgress && isActiveJobSheetStatus(liveProgress.status) ? (
              <ProcessingProgressPanel
                progress={liveProgress}
                title="Live pipeline progress"
              />
            ) : null}

            {intakeRejections.length > 0 ? (
              <div className="space-y-3" data-testid="intake-retake-feedback">
                {intakeRejections.map(item => (
                  <Alert
                    key={item.fileName}
                    className="border-amber-200 bg-amber-50 text-amber-900"
                  >
                    <AlertCircle className="h-4 w-4 text-amber-800" />
                    <AlertTitle>
                      Retake needed: {item.fileName}
                      {item.qualityScore != null ? (
                        <span className="ml-2 text-sm font-normal">
                          Quality {item.qualityScore}/100
                          {item.grade ? ` (grade ${item.grade})` : ""}
                        </span>
                      ) : null}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {item.retakeFeedback.map(tip => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card id="upload-guidelines">
            <CardHeader>
              <CardTitle>Upload guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Ensure the entire page is visible in the photo.</p>
              <p>• Avoid glare and shadows on the document.</p>
              <p>• Text should be sharp and readable.</p>
              <p>• Supported file types: PDF, JPEG, PNG.</p>
              <p>• Maximum file size: 10MB per file.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent uploads</CardTitle>
              <CardDescription>
                Open audit results or re-process pending items.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {uploadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (recentUploads?.items.length ?? 0) > 0 ? (
                <div className="space-y-3">
                  {recentUploads!.items.map(upload => (
                    <div
                      key={upload.id}
                      className="flex items-center gap-3 rounded-lg p-2 transition-colors duration-[var(--duration-normal)] hover:bg-accent"
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full",
                          getStatusColor(upload.status, upload.id)
                        )}
                      >
                        {getStatusIcon(upload.status, upload.id)}
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        onClick={() => setLocation(`/audits?id=${upload.id}`)}
                      >
                        <p className="truncate text-sm font-medium">
                          {upload.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(upload.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </button>
                      {(upload.status === "pending" ||
                        upload.status === "failed") &&
                      !processingIds.includes(upload.id) ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleProcessSingle(upload.id, upload.fileName)
                            }
                          >
                            <Play className="mr-1 h-3 w-3" />
                            Process
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            title="Remove stuck / orphan upload"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                !confirm(
                                  `Remove "${upload.fileName}"? This deletes the stuck upload so it cannot sit in Pending forever.`
                                )
                              ) {
                                return;
                              }
                              deleteMutation.mutate(
                                {
                                  id: upload.id,
                                  reason: "Removed orphan / stuck upload",
                                },
                                {
                                  onSuccess: () => {
                                    toast.success("Upload removed");
                                    refetch();
                                    utils.jobSheets.list.invalidate();
                                  },
                                  onError: err =>
                                    toast.error(err.message || "Delete failed"),
                                }
                              );
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : null}
                      <span
                        className={cn(
                          "rounded px-2 py-1 text-xs font-medium",
                          processingIds.includes(upload.id) ||
                            upload.status === "processing"
                            ? "bg-blue-100 text-blue-700"
                            : upload.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : upload.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : upload.status === "review_queue"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-700"
                        )}
                      >
                        {processingIds.includes(upload.id) ||
                        upload.status === "processing"
                          ? "Processing…"
                          : upload.status.charAt(0).toUpperCase() +
                            upload.status.slice(1).replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={UploadIcon}
                  title="No uploads yet"
                  description="Your recent job sheets will appear here after the first upload."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

function generateReferenceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `JOB-${year}${month}${day}-${random}`;
}
