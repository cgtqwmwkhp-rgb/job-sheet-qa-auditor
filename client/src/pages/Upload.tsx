import DashboardLayout from "@/components/DashboardLayout";
import { FileUploader } from "@/components/FileUploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, FileText, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { GuidedTour } from "@/components/GuidedTour";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  
  // Fetch recent uploads
  const { data: recentUploads, isLoading: uploadsLoading } = trpc.jobSheets.list.useQuery({ limit: 5 });
  const uploadMutation = trpc.jobSheets.upload.useMutation();
  const utils = trpc.useUtils();

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    
    try {
      // Upload files one by one (could be parallelized)
      for (const file of files) {
        // Convert file to base64
        const base64 = await fileToBase64(file);
        
        await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
          referenceNumber: generateReferenceNumber(),
        });
      }
      
      toast.success(`Successfully uploaded ${files.length} file(s)`);
      
      // Invalidate queries to refresh data
      utils.jobSheets.list.invalidate();
      utils.stats.dashboard.invalidate();
      
      // Redirect to audit results after a short delay
      setTimeout(() => {
        setLocation("/audits");
      }, 1500);
      
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files. Please try again.");
    } finally {
      setIsUploading(false);
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
              description: "Drag and drop your PDF job sheets here. You can upload up to 50 files at once for batch processing.",
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
            Upload single or multiple job sheets for automated auditing.
          </p>
        </div>

        <Alert className="bg-blue-50 border-blue-200 text-blue-800">
          <Info className="h-4 w-4 text-blue-800" />
          <AlertTitle>Batch Processing Available</AlertTitle>
          <AlertDescription>
            You can upload up to 50 files at once. Supported formats: PDF, JPG, PNG.
            Ensure images are clear and legible for best results.
          </AlertDescription>
        </Alert>

        <Card id="upload-area">
          <CardHeader>
            <CardTitle>File Upload</CardTitle>
            <CardDescription>
              Drag and drop your job sheets here or click to browse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">Uploading files...</p>
                <p className="text-sm text-muted-foreground">Please wait while we process your documents.</p>
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
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/audits/${upload.id}`)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        upload.status === 'completed' ? 'bg-green-100 text-green-600' :
                        upload.status === 'failed' ? 'bg-red-100 text-red-600' :
                        upload.status === 'processing' ? 'bg-blue-100 text-blue-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {upload.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
                         upload.status === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                         upload.status === 'pending' ? <Clock className="w-4 h-4" /> :
                         <FileText className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{upload.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(upload.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        upload.status === 'completed' ? 'bg-green-100 text-green-700' :
                        upload.status === 'failed' ? 'bg-red-100 text-red-700' :
                        upload.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {upload.status.charAt(0).toUpperCase() + upload.status.slice(1)}
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
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

// Helper function to generate a reference number
function generateReferenceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `JS-${year}-${random}`;
}
