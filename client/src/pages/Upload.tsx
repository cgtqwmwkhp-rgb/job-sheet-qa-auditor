import DashboardLayout from "@/components/DashboardLayout";
import { FileUploader } from "@/components/FileUploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleUpload = (files: File[]) => {
    console.log("Uploading files:", files);
    setUploadedFiles(files);
    // In a real app, we would wait for the upload to complete here
    // For now, we'll simulate a delay and then redirect to the audit results
    setTimeout(() => {
      setLocation("/audits");
    }, 2000);
  };

  return (
    <DashboardLayout>
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

        <Card>
          <CardHeader>
            <CardTitle>File Upload</CardTitle>
            <CardDescription>
              Drag and drop your job sheets here or click to browse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploader onUpload={handleUpload} maxFiles={50} />
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
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
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground text-center py-8">
                  No recent uploads found.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
