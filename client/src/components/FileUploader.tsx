import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileUploaderProps {
  onUpload: (files: File[]) => void;
  maxFiles?: number;
  accept?: Record<string, string[]>;
}

interface FileStatus {
  file: File;
  status: "pending" | "uploading" | "completed" | "error";
  progress: number;
}

export function FileUploader({ onUpload, maxFiles = 10, accept }: FileUploaderProps) {
  const [files, setFiles] = useState<FileStatus[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: accept || {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    // Simulate upload process for now
    setFiles((prev) =>
      prev.map((f) => ({ ...f, status: "uploading", progress: 0 }))
    );

    const uploadFiles = files.map((f) => f.file);
    onUpload(uploadFiles);

    // Simulate progress
    const interval = setInterval(() => {
      setFiles((prev) => {
        const allCompleted = prev.every((f) => f.progress >= 100);
        if (allCompleted) {
          clearInterval(interval);
          return prev.map((f) => ({ ...f, status: "completed" }));
        }

        return prev.map((f) => {
          if (f.status === "uploading") {
            const newProgress = Math.min(f.progress + 10, 100);
            return {
              ...f,
              progress: newProgress,
              status: newProgress === 100 ? "completed" : "uploading",
            };
          }
          return f;
        });
      });
    }, 500);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-brand-lime bg-brand-lime/10"
            : "border-muted-foreground/25 hover:border-brand-lime/50"
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
            Max {maxFiles} files. Up to 10MB each.
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Selected Files ({files.length})</h4>
              <Button onClick={handleUpload} disabled={files.some(f => f.status === 'uploading')}>
                {files.some(f => f.status === 'uploading') ? 'Uploading...' : 'Start Upload'}
              </Button>
            </div>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {files.map((fileStatus, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-3 border rounded-lg bg-card"
                  >
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <File className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate">
                          {fileStatus.file.name}
                        </p>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={fileStatus.progress} className="h-2" />
                        <span className="text-xs w-10 text-right">
                          {fileStatus.progress}%
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {fileStatus.status === "completed" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {fileStatus.status === "error" && (
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
