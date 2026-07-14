import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BrainCircuit,
  Scale,
  MessageSquareWarning,
  FileSearch,
  Save,
  RefreshCw,
} from "lucide-react";

/** Illustrative defaults — persona is not persisted and does not drive the engine. */
const PREVIEW_STRICTNESS = [70];
const PREVIEW_INSTRUCTIONS =
  "Ensure the engineer provides a clear root cause for any return visit. Flag vague phrases like 'fixed it' or 'done' without technical detail. Check for professional language.";

export function AIPersonaSettings() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <CardTitle>Auditor Persona</CardTitle>
            <Badge variant="secondary">Preview — not saved</Badge>
          </div>
          <CardDescription>
            Conceptual controls for how the AI might evaluate notes. Disabled
            until a persona API exists — they do not change live analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertDescription>
              Preview only. Strictness and check toggles are not applied to the
              production audit engine.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Audit Strictness
              </Label>
              <span className="font-mono text-sm">
                {PREVIEW_STRICTNESS[0]}%
              </span>
            </div>
            <Slider
              value={PREVIEW_STRICTNESS}
              max={100}
              step={5}
              disabled
              className="py-2"
              aria-label="Audit strictness (preview only)"
            />
            <p className="text-xs text-muted-foreground">
              Higher strictness would flag minor omissions when this setting is
              wired.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="tone-check" className="flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4" />
                Tone & Language Analysis
              </Label>
              <Switch
                id="tone-check"
                checked
                disabled
                aria-label="Tone and language analysis (preview only)"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Detect unprofessional language, frustration, or inappropriate
              remarks in job notes.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="completeness-check"
                className="flex items-center gap-2"
              >
                <FileSearch className="h-4 w-4" />
                Completeness & Loose Ends
              </Label>
              <Switch
                id="completeness-check"
                checked
                disabled
                aria-label="Completeness check (preview only)"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Identify missing technical details, unanswered questions, or vague
              descriptions (e.g., &quot;parts ordered&quot; without part
              numbers).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Custom Instructions</CardTitle>
            <Badge variant="secondary">Preview — not saved</Badge>
          </div>
          <CardDescription>
            Example prompt text for a future override. Read-only — not sent to
            the analysis engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-prompt-override">
              System Prompt Override
            </Label>
            <Textarea
              id="system-prompt-override"
              className="min-h-[200px] font-mono text-sm"
              value={PREVIEW_INSTRUCTIONS}
              readOnly
              disabled
              aria-describedby="prompt-override-hint"
            />
            <p
              id="prompt-override-hint"
              className="text-xs text-muted-foreground"
            >
              Not editable — no persona persistence API.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="opacity-60">
              Focus: Safety Compliance
            </Badge>
            <Badge variant="outline" className="opacity-60">
              Focus: Customer Interaction
            </Badge>
            <Badge variant="outline" className="opacity-60">
              Focus: Parts Usage
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Focus chips are labels only — they do not apply filters.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled
            title="Reset unavailable — settings are not persisted"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button disabled title="Save unavailable — no persona settings API">
            <Save className="h-4 w-4 mr-2" />
            Save Configuration (not wired)
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
