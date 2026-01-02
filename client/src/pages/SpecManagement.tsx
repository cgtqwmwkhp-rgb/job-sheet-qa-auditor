import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Copy, Edit, FileJson, History, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

// Mock Data
const specs = [
  {
    id: "GS-V2.1",
    name: "Standard Maintenance Job Sheet",
    version: "2.1.0",
    status: "active",
    lastUpdated: "2024-01-10",
    rules: 24,
  },
  {
    id: "GS-V2.0",
    name: "Standard Maintenance Job Sheet",
    version: "2.0.0",
    status: "archived",
    lastUpdated: "2023-11-15",
    rules: 22,
  },
  {
    id: "INSTALL-V1.0",
    name: "New Installation Checklist",
    version: "1.0.0",
    status: "active",
    lastUpdated: "2023-12-01",
    rules: 18,
  },
];

const currentRules = [
  {
    id: "R-001",
    field: "Customer Signature",
    type: "presence",
    required: true,
    description: "Must contain a valid signature in the customer sign-off box.",
  },
  {
    id: "R-002",
    field: "Date of Service",
    type: "format",
    format: "DD/MM/YYYY",
    required: true,
    description: "Date must be present and match the standard format.",
  },
  {
    id: "R-003",
    field: "Serial Number",
    type: "regex",
    pattern: "^SN-\\d{5}-[A-Z]{2}$",
    required: true,
    description: "Serial number must match the pattern SN-XXXXX-XX.",
  },
];

export default function SpecManagement() {
  const [editingRule, setEditingRule] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Spec Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage Gold Standard specifications and validation rules.
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create New Spec
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Panel: Spec List */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
              <CardDescription>
                Select a spec to view or edit rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {specs.map((spec) => (
                  <div 
                    key={spec.id} 
                    className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${spec.status === 'active' && spec.id === 'GS-V2.1' ? 'bg-muted/50 border-l-4 border-l-brand-lime' : 'border-l-4 border-l-transparent'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{spec.id}</span>
                      <Badge variant={spec.status === 'active' ? 'default' : 'secondary'}>
                        {spec.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{spec.name}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>v{spec.version}</span>
                      <span>{spec.rules} Rules</span>
                      <span>{spec.lastUpdated}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Right Panel: Rule Editor */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Rules Definition: GS-V2.1</CardTitle>
                <CardDescription>
                  Defining validation logic for "Standard Maintenance Job Sheet"
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <History className="w-4 h-4 mr-2" />
                  History
                </Button>
                <Button variant="outline" size="sm">
                  <FileJson className="w-4 h-4 mr-2" />
                  Export JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-background rounded border">
                      <FileJson className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Base Schema</p>
                      <p className="text-xs text-muted-foreground">Inherits from Global_Base_V1</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">View Schema</Button>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Validation Rules ({currentRules.length})</h3>
                  <Button variant="ghost" size="sm" className="h-8">
                    <Plus className="w-3 h-3 mr-1" /> Add Rule
                  </Button>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {currentRules.map((rule) => (
                    <AccordionItem key={rule.id} value={rule.id}>
                      <AccordionTrigger className="hover:no-underline py-3 px-4 hover:bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-4 w-full">
                          <Badge variant="outline" className="font-mono">{rule.id}</Badge>
                          <span className="font-medium flex-1 text-left">{rule.field}</span>
                          <Badge variant="secondary" className="mr-4">{rule.type}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Field Name</label>
                              <div className="text-sm font-mono bg-muted p-2 rounded">{rule.field}</div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Validation Type</label>
                              <div className="text-sm bg-muted p-2 rounded capitalize">{rule.type}</div>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Description</label>
                            {editingRule === rule.id ? (
                              <Textarea defaultValue={rule.description} className="min-h-[80px]" />
                            ) : (
                              <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded border">
                                {rule.description}
                              </div>
                            )}
                          </div>

                          {rule.pattern && (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Regex Pattern</label>
                              <div className="text-sm font-mono bg-muted p-2 rounded">{rule.pattern}</div>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2 pt-2">
                            {editingRule === rule.id ? (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => setEditingRule(null)}>Cancel</Button>
                                <Button size="sm" onClick={() => setEditingRule(null)}>
                                  <Save className="w-3 h-3 mr-2" /> Save Changes
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                  <Trash2 className="w-3 h-3 mr-2" /> Delete
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingRule(rule.id)}>
                                  <Edit className="w-3 h-3 mr-2" /> Edit Rule
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
