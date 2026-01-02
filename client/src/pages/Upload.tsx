import DashboardLayout from "@/components/DashboardLayout";
import { FileUploader } from "@/components/FileUploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Info, FileText, CheckCircle2, Clock, Loader2, Play, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { GuidedTour } from "@/components/GuidedTour";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  const [processingIds, setProcessingIds] = useState<number[]>([]);
  
  // Fetch recent uploads
  const { data: recentUploads, isLoading: uploadsLoading, refetch } = trpc.jobSheets.list.useQuery({ limit: 10 });
  const uploadMutation = trpc.jobSheets.upload.useMutation();
  const processMutation = trpc.jobSheets.process.useMutation();
  const utils = trpc.useUtils();

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    const uploadedIds: number[] = [];
    
    try {
      // Upload files one by one
      for (const file of files) {
        // Convert file to base64
        const base64 = await fileToBase64(file);
        
        const result = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
          referenceNumber: generateReferenceNumber(),
        });
        
        uploadedIds.push(result.id);
      }
      
      toast.success(`Successfully uploaded ${files.length} file(s). Starting AI analysis...`);
      
      // Invalidate queries to refresh data
      utils.jobSheets.list.invalidate();
      utils.stats.dashboard.invalidate();
      
      // Auto-process the uploaded files
      setProcessingIds(uploadedIds);
      for (const id of uploadedIds) {
        try {
          await processMutation.mutateAsync({ id });
        } catch (error) {
          console.error(`Failed to process job sheet ${id}:`, error);
        }
      }
      setProcessingIds([]);
      
      // Refresh the list
      refetch();
      utils.stats.dashboard.invalidate();
      
      toast.success("AI analysis complete! View results in Audit Results.");
      
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files. Please try again.");
    } finally {
      setIsUploading(false);
      setProcessingIds([]);
    }
  };

  const handleProcessSingle = async (id: number) => {
    setProcessingIds(prev => [...prev, id]);
    try {
      await processMutation.mutateAsync({ id });
      toast.success("Analysis complete!");
      refetch();
      utils.stats.dashboard.invalidate();
    } catch (error) {
      console.error("Processing error:", error);
      toast.error("Failed to process document. Please try again.");
    } finally {
      setProcessingIds(prev => prev.filter(i => i !== id));
    }
  };

  const getStatusIcon = (status: string, id: number) => {
    if (processingIds.includes(id)) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      case 'review_queue':
        return <Clock className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string, id: number) => {
    if (processingIds.includes(id)) {
      return 'bg-blue-100 text-blue-600';
    }
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-600';
      case 'processing':
        return 'bg-blue-100 text-blue-600';
      case 'failed':
        return 'bg-red-100 text-red-600';
      case 'review_queue':
        return 'bg-yellow-100 text-yellow-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <DashboardLayout>
      <GuidedTour 
        tourId="upload-page-tour"
        steps={[
          {
            element: "#upload-area",
            popover: {
              title: "Upload Zone",
              description: "Drag and drop your PDF job sheets here. Files are automatically processed through Mistral OCR and Gemini AI analysis.",
              side: "bottom",
              align: "start"
            }
          },
          {
            element: "#upload-guidelines",
            popover: {
              title: "Best Practices",
              description: "Check these guidelines to ensure the highest OCR accuracy and avoid audit failures.",
              side: "top",
              align: "start"
            }
          }
        ]}
      />
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Upload Job Cards</h1>
          <p className="text-muted-foreground mt-1">
            Upload single or multiple job sheets for automated AI-powered auditing.
          </p>
        </div>

        <Alert className="bg-blue-50 border-blue-200 text-blue-800">
          <Info className="h-4 w-4 text-blue-800" />
          <AlertTitle>AI-Powered Processing</AlertTitle>
          <AlertDescription>
            Files are automatically processed using <strong>Mistral OCR</strong> for text extraction 
            and <strong>Google Gemini 2.5</strong> for intelligent analysis against the Gold Standard specification.
          </AlertDescription>
        </Alert>

        <Card id="upload-area">
          <CardHeader>
            <CardTitle>File Upload</CardTitle>
            <CardDescription>
              Drag and drop your job sheets here or click to browse. Processing starts automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isUploading || processingIds.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg bg-blue-50/50">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">
                  {isUploading ? "Uploading files..." : "Running AI Analysis..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isUploading 
                    ? "Please wait while we upload your documents." 
                    : "Mistral OCR → Gemini Analysis → Generating Report"}
                </p>
                {processingIds.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Processing {processingIds.length} document(s)...
                  </p>
                )}
              </div>
            ) : (
              <FileUploader onUpload={handleUpload} maxFiles={50} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card id="upload-guidelines">
            <CardHeader>
              <CardTitle>Upload Guidelines</CardTitle>
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
              <CardTitle>Recent Uploads</CardTitle>
              <CardDescription>Click to view details or re-process pending items</CardDescription>
            </CardHeader>
            <CardContent>
              {uploadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentUploads && recentUploads.length > 0 ? (
                <div className="space-y-3">
                  {recentUploads.map((upload) => (
                    <div 
                      key={upload.id} 
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getStatusColor(upload.status, upload.id)}`}>
                        {getStatusIcon(upload.status, upload.id)}
                      </div>
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setLocation(`/audits`)}
                      >
                        <p className="text-sm font-medium truncate">{upload.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(upload.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {(upload.status === 'pending' || upload.status === 'failed') && !processingIds.includes(upload.id) && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleProcessSingle(upload.id)}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Process
                        </Button>
                      )}
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        processingIds.includes(upload.id) ? 'bg-blue-100 text-blue-700' :
                        upload.status === 'completed' ? 'bg-green-100 text-green-700' :
                        upload.status === 'failed' ? 'bg-red-100 text-red-700' :
                        upload.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        upload.status === 'review_queue' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {processingIds.includes(upload.id) ? 'Analyzing...' :
                         upload.status.charAt(0).toUpperCase() + upload.status.slice(1).replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No recent uploads found.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Helper function to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// Generate a reference number
function generateReferenceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `JOB-${year}${month}${day}-${random}`;
}
