import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type FailClass = "major" | "minor" | "informational";

interface AuditPolicyRule {
  ruleId: string;
  label: string;
  description: string;
  failClass: FailClass;
  enabled: boolean;
  fieldAliases?: string[];
}

interface AuditPolicyForm {
  label: string;
  rules: AuditPolicyRule[];
}

interface AuditPolicy {
  version: number;
  weights: {
    major: number;
    minor: number;
    informational: number;
  };
  forms: Record<string, AuditPolicyForm>;
}

function failClassBadge(failClass: FailClass) {
  if (failClass === "major") {
    return <Badge variant="destructive">Major</Badge>;
  }
  if (failClass === "minor") {
    return <Badge variant="secondary">Minor</Badge>;
  }
  return <Badge variant="outline">Informational</Badge>;
}

export function AuditPolicySettings() {
  const [policy, setPolicy] = useState<AuditPolicy | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeFormId, setActiveFormId] = useState<string>("");

  const { data, isLoading, refetch } = trpc.auditPolicy.get.useQuery();
  const saveMutation = trpc.auditPolicy.save.useMutation();
  const resetMutation = trpc.auditPolicy.reset.useMutation();

  const formEntries = useMemo(
    () => (policy ? Object.entries(policy.forms) : []),
    [policy]
  );

  useEffect(() => {
    if (data) {
      const next = data as AuditPolicy;
      setPolicy(next);
      setHasChanges(false);
      const ids = Object.keys(next.forms);
      setActiveFormId(prev =>
        prev && ids.includes(prev) ? prev : (ids[0] ?? "")
      );
    }
  }, [data]);

  const updateWeights = (key: keyof AuditPolicy["weights"], value: number) => {
    setPolicy(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        weights: { ...prev.weights, [key]: value },
      };
    });
    setHasChanges(true);
  };

  const updateRule = (
    formId: string,
    ruleId: string,
    patch: Partial<AuditPolicyRule>
  ) => {
    setPolicy(prev => {
      if (!prev) return prev;
      const form = prev.forms[formId];
      if (!form) return prev;
      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            rules: form.rules.map(r =>
              r.ruleId === ruleId ? { ...r, ...patch } : r
            ),
          },
        },
      };
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!policy) return;
    setIsSaving(true);
    try {
      await saveMutation.mutateAsync(policy);
      toast.success("Audit policy saved");
      setHasChanges(false);
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save audit policy"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        "Reset Audit Policy to product defaults? This overwrites admin changes."
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const result = await resetMutation.mutateAsync();
      const next = result.policy as AuditPolicy;
      setPolicy(next);
      setHasChanges(false);
      const ids = Object.keys(next.forms);
      setActiveFormId(prev =>
        prev && ids.includes(prev) ? prev : (ids[0] ?? "")
      );
      toast.success("Audit policy reset to defaults");
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reset audit policy"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !policy) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading audit policy…
      </div>
    );
  }

  const activeForm = activeFormId ? policy.forms[activeFormId] : null;

  return (
    <div className="space-y-6">
      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-700" />
            How fail classes work
          </CardTitle>
          <CardDescription className="text-sm space-y-1">
            <span className="block">
              <strong>Major</strong> = immediate job-card fail (supersedes pass
              / fail). Doc Quality % still shows for coaching.
            </span>
            <span className="block">
              <strong>Minor</strong> = documentation score only — never forces
              FAIL alone.
            </span>
            <span className="block">
              Changes apply to new / reprocessed audits. Existing results keep
              their prior decision.
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Score weights</CardTitle>
          <CardDescription>
            Points deducted from Doc Quality (start at 100). Major coaching
            penalty does not change hard-fail logic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Major penalty</Label>
              <span className="font-mono text-sm">{policy.weights.major}</span>
            </div>
            <Slider
              value={[policy.weights.major]}
              min={0}
              max={50}
              step={1}
              onValueChange={([v]) => updateWeights("major", v)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Minor penalty</Label>
              <span className="font-mono text-sm">{policy.weights.minor}</span>
            </div>
            <Slider
              value={[policy.weights.minor]}
              min={0}
              max={50}
              step={1}
              onValueChange={([v]) => updateWeights("minor", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Job sheet type</CardTitle>
          <CardDescription>
            Pick a form family, then set each check to Major, Minor, or
            Informational.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No form policies configured.
            </p>
          ) : (
            <Tabs
              value={activeFormId}
              onValueChange={setActiveFormId}
              className="w-full"
            >
              <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 p-1">
                {formEntries.map(([formId, form]) => (
                  <TabsTrigger
                    key={formId}
                    value={formId}
                    className="flex-none px-4 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    {form.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {formEntries.map(([formId, form]) => (
                <TabsContent
                  key={formId}
                  value={formId}
                  className="mt-4 space-y-4"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{form.label}</h3>
                    <Badge variant="outline" className="font-mono text-xs">
                      {formId}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {form.rules.length} checks
                    </span>
                  </div>
                  {form.rules.map(rule => (
                    <div
                      key={rule.ruleId}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{rule.label}</span>
                            {failClassBadge(rule.failClass)}
                            <span className="text-xs font-mono text-muted-foreground">
                              {rule.ruleId}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {rule.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={checked =>
                                updateRule(formId, rule.ruleId, {
                                  enabled: checked,
                                })
                              }
                              aria-label={`Enable ${rule.ruleId}`}
                            />
                            <Label className="text-xs text-muted-foreground">
                              On
                            </Label>
                          </div>
                          <Select
                            value={rule.failClass}
                            onValueChange={value =>
                              updateRule(formId, rule.ruleId, {
                                failClass: value as FailClass,
                              })
                            }
                            disabled={!rule.enabled}
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="major">
                                <span className="flex items-center gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                                  Major fail
                                </span>
                              </SelectItem>
                              <SelectItem value="minor">
                                <span className="flex items-center gap-2">
                                  <Info className="h-3.5 w-3.5 text-amber-600" />
                                  Minor fail
                                </span>
                              </SelectItem>
                              <SelectItem value="informational">
                                <span className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  Informational
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}

          {activeFormId && !activeForm && (
            <p className="text-sm text-muted-foreground">
              Selected form is unavailable.
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-4 bg-background/95 backdrop-blur border rounded-lg p-3 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {hasChanges
            ? "Unsaved changes — save to apply on next audits."
            : "Policy matches what is saved."}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isSaving}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save policy
          </Button>
        </div>
      </div>
    </div>
  );
}
