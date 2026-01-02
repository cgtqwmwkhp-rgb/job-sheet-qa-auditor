import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BrainCircuit, 
  Scale, 
  MessageSquareWarning, 
  FileSearch, 
  Save,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export function AIPersonaSettings() {
  const [strictness, setStrictness] = useState([70]);
  const [toneCheck, setToneCheck] = useState(true);
  const [completenessCheck, setCompletenessCheck] = useState(true);
  const [customInstructions, setCustomInstructions] = useState(
    "Ensure the engineer provides a clear root cause for any return visit. Flag vague phrases like 'fixed it' or 'done' without technical detail. Check for professional language."
  );

  const handleSave = () => {
    toast.success("AI Persona settings saved successfully.");
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <CardTitle>Auditor Persona</CardTitle>
          </div>
          <CardDescription>
            Define the "lens" through which the AI evaluates engineer notes and job sheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Audit Strictness
              </Label>
              <span className="font-mono text-sm">{strictness}%</span>
            </div>
            <Slider 
              value={strictness} 
              onValueChange={setStrictness} 
              max={100} 
              step={5} 
              className="py-2"
            />
            <p className="text-xs text-muted-foreground">
              Higher strictness will flag minor omissions and require more detailed evidence.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4" />
                Tone & Language Analysis
              </Label>
              <Switch checked={toneCheck} onCheckedChange={setToneCheck} />
            </div>
            <p className="text-xs text-muted-foreground">
              Detect unprofessional language, frustration, or inappropriate remarks in job notes.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileSearch className="h-4 w-4" />
                Completeness & Loose Ends
              </Label>
              <Switch checked={completenessCheck} onCheckedChange={setCompletenessCheck} />
            </div>
            <p className="text-xs text-muted-foreground">
              Identify missing technical details, unanswered questions, or vague descriptions (e.g., "parts ordered" without part numbers).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Instructions</CardTitle>
          <CardDescription>
            Specific rules or focus areas for the AI analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>System Prompt Override</Label>
            <Textarea 
              className="min-h-[200px] font-mono text-sm"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Enter specific instructions for the AI..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">Focus: Safety Compliance</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">Focus: Customer Interaction</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">Focus: Parts Usage</Badge>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
