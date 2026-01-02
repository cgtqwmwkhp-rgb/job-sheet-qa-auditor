import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, Flag, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";

// Mock Data for Audit Result
const auditData = {
  id: "JS-2024-001",
  status: "failed",
  score: "C",
  technician: "John Doe",
  date: "2024-01-15",
  site: "London HQ",
  findings: [
    {
      id: 1,
      field: "Customer Signature",
      status: "missing",
      severity: "critical",
      message: "Customer signature is required but not detected.",
      confidence: 0.98,
    },
    {
      id: 2,
      field: "Date of Service",
      status: "passed",
      value: "15/01/2024",
      confidence: 0.99,
    },
    {
      id: 3,
      field: "Serial Number",
      status: "warning",
      value: "SN-12345-??",
      message: "Serial number is partially obscured.",
      confidence: 0.75,
    },
    {
      id: 4,
      field: "Work Description",
      status: "passed",
      value: "Routine maintenance performed. Replaced filters.",
      confidence: 0.95,
    },
  ],
};

export default function AuditResults() {
  const [zoom, setZoom] = useState(100);

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold tracking-tight">Audit Result: {auditData.id}</h1>
              <Badge variant={auditData.status === "passed" ? "default" : "destructive"} className="uppercase">
                {auditData.status}
              </Badge>
              <Badge variant="outline" className="font-mono">Score: {auditData.score}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Processed on {auditData.date} • Technician: {auditData.technician}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button variant="default" size="sm">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </div>
        </div>

        {/* Split Screen Content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Left Panel: Document Viewer */}
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between shrink-0 bg-muted/30">
              <CardTitle className="text-sm font-medium">Document Viewer</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(50, z - 10))}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs w-12 text-center">{zoom}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(200, z + 10))}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <div className="flex-1 bg-muted/50 overflow-auto p-4 flex items-center justify-center relative">
              {/* Placeholder for PDF/Image Viewer */}
              <div 
                className="bg-white shadow-lg transition-transform duration-200 origin-center"
                style={{ 
                  width: `${zoom * 4}px`, 
                  height: `${zoom * 6}px`,
                  transform: `scale(${zoom / 100})` 
                }}
              >
                <div className="w-full h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted m-2">
                  Document Preview
                </div>
                
                {/* Overlay Bounding Boxes (Example) */}
                <div className="absolute top-[80%] left-[10%] w-[30%] h-[5%] border-2 border-red-500 bg-red-500/10" title="Missing Signature" />
                <div className="absolute top-[15%] right-[10%] w-[20%] h-[3%] border-2 border-green-500 bg-green-500/10" title="Date" />
              </div>
            </div>
          </Card>

          {/* Right Panel: Audit Findings */}
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="py-3 px-4 border-b shrink-0">
              <CardTitle className="text-sm font-medium">Audit Findings</CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-hidden flex flex-col">
              <Tabs defaultValue="all" className="flex-1 flex flex-col">
                <div className="px-4 pt-2">
                  <TabsList className="w-full justify-start">
                    <TabsTrigger value="all">All Findings</TabsTrigger>
                    <TabsTrigger value="critical" className="text-destructive">Critical Issues</TabsTrigger>
                    <TabsTrigger value="warnings" className="text-orange-500">Warnings</TabsTrigger>
                  </TabsList>
                </div>
                
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {auditData.findings.map((finding) => (
                      <div 
                        key={finding.id} 
                        className={`p-4 rounded-lg border ${
                          finding.status === 'missing' ? 'border-red-200 bg-red-50' :
                          finding.status === 'warning' ? 'border-orange-200 bg-orange-50' :
                          'border-green-200 bg-green-50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {finding.status === 'missing' ? <AlertCircle className="w-5 h-5 text-red-600" /> :
                             finding.status === 'warning' ? <Flag className="w-5 h-5 text-orange-600" /> :
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
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </Tabs>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
