import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, Download, Mail, Clock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const reportTemplates = [
  { id: 1, name: "Weekly Executive Summary", schedule: "Every Monday, 9:00 AM", format: "PDF", recipients: 4 },
  { id: 2, name: "Technician Performance Card", schedule: "Monthly, 1st Day", format: "PDF", recipients: 12 },
  { id: 3, name: "Defect Raw Data Export", schedule: "Daily, 11:59 PM", format: "CSV", recipients: 1 },
];

export default function ReportStudio() {
  return (
    <AnalyticsLayout 
      title="Report Studio" 
      description="Create, schedule, and manage custom reports."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {/* Create New Report */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Report Builder</CardTitle>
            <CardDescription>Select metrics and dimensions to include in your custom report.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium">1. Select Data Modules</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox id="module-kpi" defaultChecked />
                  <Label htmlFor="module-kpi" className="cursor-pointer">Executive KPIs</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox id="module-defects" defaultChecked />
                  <Label htmlFor="module-defects" className="cursor-pointer">Defect Analysis</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox id="module-tech" />
                  <Label htmlFor="module-tech" className="cursor-pointer">Technician Leaderboard</Label>
                </div>

                <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox id="module-ai" />
                  <Label htmlFor="module-ai" className="cursor-pointer">AI Insights</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox id="module-raw" />
                  <Label htmlFor="module-raw" className="cursor-pointer">Raw Data Appendix</Label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium">2. Configuration</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Report Name</Label>
                  <input type="text" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" placeholder="e.g., Q1 Compliance Review" />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option>PDF Document</option>
                    <option>Excel Spreadsheet</option>
                    <option>CSV Data File</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline">Preview</Button>
              <Button>
                <Download className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Reports */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Scheduled Reports</span>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reportTemplates.map((template) => (
                <div key={template.id} className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{template.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {template.format}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1.5" />
                      {template.schedule}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Mail className="w-3 h-3 mr-1.5" />
                      {template.recipients} Recipients
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs">Edit</Button>
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs">Run Now</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AnalyticsLayout>
  );
}
