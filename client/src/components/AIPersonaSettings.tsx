import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  BrainCircuit,
  Scale,
  MessageSquareWarning,
  FileSearch,
  Save,
  RefreshCw,
  Loader2,
  FlaskConical,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type FocusArea = "safety" | "customer" | "parts";

interface AiPersona {
  version: string;
  strictness: number;
  toneCheck: boolean;
  completenessCheck: boolean;
  customInstructions: string;
  focusAreas: FocusArea[];
  updatedAt?: string;
}

const FOCUS_OPTIONS: { id: FocusArea; label: string }[] = [
  { id: "safety", label: "Safety Compliance" },
  { id: "customer", label: "Customer Interaction" },
  { id: "parts", label: "Parts Usage" },
];

function bandLabel(strictness: number): string {
  if (strictness < 40) return "Lenient";
  if (strictness > 70) return "Strict";
  return "Standard";
}

export function AIPersonaSettings() {
  const [persona, setPersona] = useState<AiPersona | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [sampleNote, setSampleNote] = useState(
    "Compressor failed on start. Ordered seal kit. Return visit tomorrow to fit and retest."
  );

  const { data, isLoading, refetch } = trpc.aiPersona.get.useQuery();
  const saveMutation = trpc.aiPersona.save.useMutation();
  const resetMutation = trpc.aiPersona.reset.useMutation();
  const previewMutation = trpc.aiPersona.preview.useMutation();

  useEffect(() => {
    if (data) {
      setPersona(data as AiPersona);
      setHasChanges(false);
    }
  }, [data]);

  const band = useMemo(
    () => (persona ? bandLabel(persona.strictness) : "—"),
    [persona]
  );

  const update = (patch: Partial<AiPersona>) => {
    setPersona(prev => (prev ? { ...prev, ...patch } : prev));
    setHasChanges(true);
  };

  const toggleFocus = (id: FocusArea) => {
    if (!persona) return;
    const has = persona.focusAreas.includes(id);
    const next = has
      ? persona.focusAreas.filter(f => f !== id)
      : [...persona.focusAreas, id].slice(0, 3);
    update({ focusAreas: next });
  };

  const handleSave = async () => {
    if (!persona) return;
    try {
      const result = await saveMutation.mutateAsync({
        version: persona.version,
        strictness: persona.strictness,
        toneCheck: persona.toneCheck,
        completenessCheck: persona.completenessCheck,
        customInstructions: persona.customInstructions,
        focusAreas: persona.focusAreas,
      });
      setPersona(result.persona as AiPersona);
      setHasChanges(false);
      toast.success(`AI persona saved (v${result.persona.version})`);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    }
  };

  const handleReset = async () => {
    try {
      const result = await resetMutation.mutateAsync();
      setPersona(result.persona as AiPersona);
      setHasChanges(false);
      toast.success("AI persona reset to defaults");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  };

  const handlePreview = async () => {
    if (!persona) return;
    try {
      const result = await previewMutation.mutateAsync({
        commentSnippet: sampleNote,
        onFailurePath: true,
        draft: {
          strictness: persona.strictness,
          toneCheck: persona.toneCheck,
          completenessCheck: persona.completenessCheck,
          customInstructions: persona.customInstructions,
          focusAreas: persona.focusAreas,
        },
      });
      if (result.adequate === null) {
        toast.message(result.summary);
      } else if (result.adequate) {
        toast.success(result.summary);
      } else {
        toast.warning(
          result.gaps.length
            ? result.gaps.slice(0, 3).join(" · ")
            : result.summary
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    }
  };

  if (isLoading || !persona) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading AI persona…
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <CardTitle>Auditor Persona</CardTitle>
            <Badge variant="outline">v{persona.version}</Badge>
            <Badge variant="secondary">{band}</Badge>
          </div>
          <CardDescription>
            Shapes advisory sufficiency, Deep Note voice, and coaching tone.
            Majors/Minors stay under Audit Policy — persona never softens hard
            clinical rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertDescription>
              Saved persona applies to the next processed job sheets. Historical
              audits keep the persona stamp from process time.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Audit Strictness
              </Label>
              <span className="font-mono text-sm">{persona.strictness}%</span>
            </div>
            <Slider
              value={[persona.strictness]}
              max={100}
              step={5}
              onValueChange={v => update({ strictness: v[0] ?? 70 })}
              className="py-2"
              aria-label="Audit strictness"
            />
            <p className="text-xs text-muted-foreground">
              Higher strictness adds advisory gaps for thin write-ups — it does
              not create new hard fails.
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
                checked={persona.toneCheck}
                onCheckedChange={v => update({ toneCheck: v })}
                aria-label="Tone and language analysis"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Flag unprofessional language or non-technical close-outs in
              advisory notes.
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
                checked={persona.completenessCheck}
                onCheckedChange={v => update({ completenessCheck: v })}
                aria-label="Completeness check"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Emphasize missing next action, parts stance, or vague descriptions.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Custom Instructions</CardTitle>
            {hasChanges && <Badge variant="destructive">Unsaved</Badge>}
          </div>
          <CardDescription>
            Appended to the advisory sufficiency and coaching prompts (capped /
            sanitized).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-prompt-override">
              System Prompt Override
            </Label>
            <Textarea
              id="system-prompt-override"
              className="min-h-[160px] font-mono text-sm"
              value={persona.customInstructions}
              maxLength={1500}
              onChange={e => update({ customInstructions: e.target.value })}
              aria-describedby="prompt-override-hint"
            />
            <p
              id="prompt-override-hint"
              className="text-xs text-muted-foreground"
            >
              {persona.customInstructions.length}/1500 characters
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FOCUS_OPTIONS.map(opt => {
              const active = persona.focusAreas.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleFocus(opt.id)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground opacity-70 hover:opacity-100"
                  )}
                >
                  Focus: {opt.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label
              htmlFor="sample-note"
              className="flex items-center gap-2 text-sm"
            >
              <FlaskConical className="h-4 w-4" />
              Try on sample note
            </Label>
            <Input
              id="sample-note"
              value={sampleNote}
              onChange={e => setSampleNote(e.target.value)}
              className="text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-2" />
              )}
              Preview advisory gaps
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={resetMutation.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
