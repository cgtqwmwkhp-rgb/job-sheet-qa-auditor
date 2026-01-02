import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Download, Eye, Flag } from "lucide-react";
import { useState } from "react";
import { DocumentViewer, BoundingBox } from "@/components/DocumentViewer";

// Mock Data for Audit Result
const auditData = {
  id: "JS-2024-001",
  status: "failed",
  score: "C",
  technician: "John Doe",
  date: "2024-01-15",
  site: "London HQ",
  documentUrl: "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf", // Sample PDF
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
  const [activeBoxId, setActiveBoxId] = useState<string | number | null>(null);

  const boxes: BoundingBox[] = auditData.findings
    .filter(f => f.box)
    .map(f => ({
      id: f.id,
      ...f.box
    } as BoundingBox));

  const handleBoxClick = (id: string | number) => {
    setActiveBoxId(id);
    // Scroll to finding in the list
    const element = document.getElementById(`finding-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

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
          <div className="h-full overflow-hidden">
            <DocumentViewer 
              url={auditData.documentUrl} 
              boxes={boxes}
              onBoxClick={handleBoxClick}
            />
          </div>

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
                        id={`finding-${finding.id}`}
                        className={`p-4 rounded-lg border transition-all ${
                          activeBoxId === finding.id ? 'ring-2 ring-offset-2 ring-primary' : ''
                        } ${
                          finding.status === 'missing' ? 'border-red-200 bg-red-50' :
                          finding.status === 'warning' ? 'border-orange-200 bg-orange-50' :
                          'border-green-200 bg-green-50'
                        }`}
                        onClick={() => setActiveBoxId(finding.id)}
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
