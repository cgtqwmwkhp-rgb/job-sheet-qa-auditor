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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit, FileJson, History, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// Mock rules for demo (would be stored in spec JSON in real implementation)
const mockRules = [
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
  const [selectedSpecId, setSelectedSpecId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState("");
  const [newSpecVersion, setNewSpecVersion] = useState("1.0.0");
  
  // Fetch specs from API
  const { data: specs, isLoading } = trpc.specs.list.useQuery();
  const createSpec = trpc.specs.create.useMutation();
  const activateSpec = trpc.specs.activate.useMutation();
  const utils = trpc.useUtils();

  const handleCreateSpec = () => {
    if (!newSpecName.trim()) {
      toast.error("Please enter a spec name");
      return;
    }

    createSpec.mutate({
      name: newSpecName,
      version: newSpecVersion,
      schema: {
        name: newSpecName,
        version: newSpecVersion,
        rules: mockRules,
        baseSchema: "Global_Base_V1",
      },
    }, {
      onSuccess: () => {
        toast.success("Specification created successfully");
        setCreateDialogOpen(false);
        setNewSpecName("");
        setNewSpecVersion("1.0.0");
        utils.specs.list.invalidate();
      },
      onError: () => {
        toast.error("Failed to create specification");
      }
    });
  };

  const handleActivateSpec = (id: number) => {
    activateSpec.mutate({ id }, {
      onSuccess: () => {
        toast.success("Specification activated");
        utils.specs.list.invalidate();
      },
      onError: () => {
        toast.error("Failed to activate specification");
      }
    });
  };

  // Get selected spec or first active one
  const selectedSpec = specs?.find(s => s.id === selectedSpecId) || specs?.find(s => s.isActive) || specs?.[0];

  // Parse rules from spec JSON
  const currentRules = selectedSpec?.schema && typeof selectedSpec.schema === 'object' 
    ? (selectedSpec.schema as any).rules || mockRules 
    : mockRules;

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
          <Button onClick={() => setCreateDialogOpen(true)}>
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
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : specs && specs.length > 0 ? (
                <div className="divide-y">
                  {specs.map((spec) => (
                    <div 
                      key={spec.id} 
                      className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                        selectedSpec?.id === spec.id 
                          ? 'bg-muted/50 border-l-4 border-l-brand-lime' 
                          : 'border-l-4 border-l-transparent'
                      }`}
                      onClick={() => setSelectedSpecId(spec.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">GS-{spec.id}</span>
                        <Badge variant={spec.isActive ? 'default' : 'secondary'}>
                          {spec.isActive ? 'active' : 'archived'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{spec.name}</p>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>v{spec.version}</span>
                        <span>{currentRules.length} Rules</span>
                        <span>{formatDistanceToNow(new Date(spec.createdAt), { addSuffix: true })}</span>
                      </div>
                      {!spec.isActive && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActivateSpec(spec.id);
                          }}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileJson className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No specifications found.</p>
                  <p className="text-sm">Create your first spec to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Panel: Rule Editor */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  Rules Definition: {selectedSpec ? `GS-${selectedSpec.id}` : 'No Spec Selected'}
                </CardTitle>
                <CardDescription>
                  {selectedSpec 
                    ? `Defining validation logic for "${selectedSpec.name}"`
                    : 'Select or create a specification to view rules'
                  }
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
              {selectedSpec ? (
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
                    {currentRules.map((rule: any) => (
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
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileJson className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No specification selected</p>
                  <p className="text-sm">Select a spec from the list or create a new one.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Spec Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Specification</DialogTitle>
            <DialogDescription>
              Define a new Gold Standard specification for job sheet validation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="spec-name">Specification Name</Label>
              <Input 
                id="spec-name"
                placeholder="e.g., Standard Maintenance Job Sheet"
                value={newSpecName}
                onChange={(e) => setNewSpecName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spec-version">Version</Label>
              <Input 
                id="spec-version"
                placeholder="1.0.0"
                value={newSpecVersion}
                onChange={(e) => setNewSpecVersion(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSpec} disabled={createSpec.isPending}>
              {createSpec.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Specification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
