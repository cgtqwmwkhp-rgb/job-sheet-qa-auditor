import { useCallback, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

/** Matches server/utils/fileValidation DEFAULT_OPTIONS.maxSizeBytes */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const DEFAULT_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

interface FileUploaderProps {
  onUpload: (files: File[]) => void | Promise<void>;
  maxFiles?: number;
  accept?: Record<string, string[]>;
  /** Parent-driven upload lock (PX-102) — disables Start Upload while pending */
  isUploading?: boolean;
  /** Optional per-file quality / retake hints from intake gate */
  intakeHints?: Array<{
    fileName: string;
    qualityScore: number | null;
    retakeFeedback: string[];
  }>;
}

interface FileStatus {
  file: File;
  status: "pending" | "uploading" | "completed" | "error" | "rejected";
  progress: number;
  qualityScore?: number | null;
  retakeFeedback?: string[];
  rejectReason?: string;
}

function rejectionMessage(rejection: FileRejection): string {
  const name = rejection.file.name || "File";
  const codes = new Set(rejection.errors.map(e => e.code));
  if (codes.has("file-too-large")) {
    return `"${name}" is over 10MB and was not added.`;
  }
  if (codes.has("file-invalid-type")) {
    return `"${name}" is not a supported type. Use PDF, JPG, or PNG.`;
  }
  if (codes.has("too-many-files")) {
    return `Too many files — max allowed in one batch.`;
  }
  return (
    rejection.errors[0]?.message || `"${name}" was rejected and was not added.`
  );
}

export function FileUploader({
  onUpload,
  maxFiles = 10,
  accept,
  isUploading = false,
  intakeHints,
}: FileUploaderProps) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [localUploading, setLocalUploading] = useState(false);

  const busy = isUploading || localUploading;

  // Merge intake hints during render — avoid setState-in-effect cascading renders
  const displayFiles = useMemo(() => {
    if (!intakeHints || intakeHints.length === 0) return files;
    return files.map(f => {
      const hint = intakeHints.find(h => h.fileName === f.file.name);
      if (!hint) return f;
      return {
        ...f,
        status: "rejected" as const,
        progress: 100,
        qualityScore: hint.qualityScore,
        retakeFeedback: hint.retakeFeedback,
      };
    });
  }, [files, intakeHints]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      // PX-068 / PX-069 — explicit feedback for oversize & unsupported types
      for (const rejection of fileRejections) {
        toast.error(rejectionMessage(rejection));
      }

      const sizedOk = acceptedFiles.filter(file => {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`"${file.name}" is over 10MB and was not added.`);
          return false;
        }
        return true;
      });

      if (sizedOk.length === 0) return;

      const newFiles = sizedOk.map(file => ({
        file,
        status: "pending" as const,
        progress: 0,
      }));
      setFiles(prev => [...prev, ...newFiles]);
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    maxSize: MAX_UPLOAD_BYTES,
    disabled: busy,
    accept: accept || DEFAULT_ACCEPT,
  });

  const removeFile = (index: number) => {
    if (busy) return;
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (busy) return;

    const uploadFiles = files
      .filter(f => {
        const hint = intakeHints?.find(h => h.fileName === f.file.name);
        return !hint && f.status !== "rejected" && f.status !== "completed";
      })
      .map(f => f.file);

    if (uploadFiles.length === 0) {
      toast.info("No pending files to upload.");
      return;
    }

    setLocalUploading(true);
    setFiles(prev =>
      prev.map(f => {
        const hint = intakeHints?.find(h => h.fileName === f.file.name);
        if (hint) {
          return {
            ...f,
            status: "rejected" as const,
            progress: 100,
            qualityScore: hint.qualityScore,
            retakeFeedback: hint.retakeFeedback,
          };
        }
        if (f.status === "completed" || f.status === "rejected") return f;
        return { ...f, status: "uploading" as const, progress: 10 };
      })
    );

    const interval = setInterval(() => {
      setFiles(prev => {
        const active = prev.filter(
          f => f.status === "uploading" || f.status === "pending"
        );
        if (active.length === 0) {
          clearInterval(interval);
          return prev;
        }
        return prev.map(f => {
          if (f.status === "uploading") {
            const newProgress = Math.min(f.progress + 15, 90);
            return { ...f, progress: newProgress };
          }
          return f;
        });
      });
    }, 400);

    void Promise.resolve(onUpload(uploadFiles))
      .then(() => {
        clearInterval(interval);
        setFiles(prev =>
          prev.map(f =>
            f.status === "uploading"
              ? { ...f, status: "completed" as const, progress: 100 }
              : f
          )
        );
      })
      .catch(() => {
        clearInterval(interval);
        setFiles(prev =>
          prev.map(f =>
            f.status === "uploading"
              ? { ...f, status: "error" as const, progress: 100 }
              : f
          )
        );
      })
      .finally(() => {
        setLocalUploading(false);
      });
  };

  const pendingCount = displayFiles.filter(
    f => f.status === "pending" || f.status === "error"
  ).length;

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer outline-none transition-[border-color,background-color,box-shadow] duration-[var(--duration-normal)] focus-visible:ring-[3px] focus-visible:ring-primary/30 ${
          busy
            ? "pointer-events-none opacity-60 border-[#C5C2C2]"
            : isDragActive
              ? "border-primary bg-[rgba(190,218,65,0.12)] shadow-[0_0_0_4px_rgba(190,218,65,0.15)]"
              : "border-[#C5C2C2] hover:border-primary/60 hover:bg-[rgba(190,218,65,0.06)]"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <div className="p-4 rounded-full bg-muted">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">
            {isDragActive ? "Drop files here" : "Drag & drop files here"}
          </h3>
          <p className="text-sm text-muted-foreground">
            or click to select files (PDF, JPG, PNG)
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Max {maxFiles} files · up to 10MB each · unsupported types are
            rejected with a message
          </p>
        </div>
      </div>

      {displayFiles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="min-w-0">
                <h4 className="font-medium">
                  Selected Files ({displayFiles.length})
                </h4>
                <p className="text-xs text-muted-foreground">
                  Click Start Upload to send files — processing begins after
                  upload is accepted.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={busy || pendingCount === 0}
              >
                {busy ? "Uploading…" : "Start Upload"}
              </Button>
            </div>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {displayFiles.map((fileStatus, index) => (
                  <div
                    key={`${fileStatus.file.name}-${fileStatus.file.size}-${index}`}
                    className={`flex items-center gap-4 p-3 border rounded-lg bg-card ${
                      fileStatus.status === "rejected" ||
                      fileStatus.status === "error"
                        ? "border-amber-300 bg-amber-50/50"
                        : ""
                    }`}
                  >
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <File className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <p
                          className="text-sm font-medium truncate"
                          title={fileStatus.file.name}
                        >
                          {fileStatus.file.name}
                          {fileStatus.qualityScore != null && (
                            <span className="ml-2 text-xs font-normal text-amber-800">
                              Quality {fileStatus.qualityScore}/100
                            </span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          disabled={busy}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                          aria-label={`Remove ${fileStatus.file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {fileStatus.status === "rejected" &&
                      fileStatus.retakeFeedback &&
                      fileStatus.retakeFeedback.length > 0 ? (
                        <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5">
                          {fileStatus.retakeFeedback.map(tip => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={fileStatus.progress}
                            className="h-2"
                          />
                          <span className="text-xs w-10 text-right tabular-nums">
                            {fileStatus.progress}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {fileStatus.status === "completed" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {(fileStatus.status === "error" ||
                        fileStatus.status === "rejected") && (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
