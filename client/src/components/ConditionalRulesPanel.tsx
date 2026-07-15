/**
 * Studio UI: author VOR-style if/then consistency rules into specJson.rules.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export interface ImpliesRuleDraft {
  ruleId: string;
  field: string;
  description: string;
  severity: "critical" | "major" | "minor" | "info";
  type: "implies";
  enabled: boolean;
  whenField: string;
  whenValue: string;
  thenField: string;
  thenValue: string;
  tags?: string[];
}

interface SpecLike {
  name?: string;
  version?: string;
  fields?: Array<{ field: string; label?: string }>;
  rules?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

const PRESETS: Array<{
  id: string;
  label: string;
  rule: Omit<ImpliesRuleDraft, "ruleId">;
}> = [
  {
    id: "vor-unsafe",
    label: "VOR → not safe to use",
    rule: {
      field: "safeToUse",
      description:
        "If the asset is marked VOR / Present for vorStatus, safeToUse must be No.",
      severity: "critical",
      type: "implies",
      enabled: true,
      whenField: "vorStatus",
      whenValue: "Present",
      thenField: "safeToUse",
      thenValue: "No",
      tags: ["consistency", "vor", "safety"],
    },
  },
  {
    id: "unsafe-vor",
    label: "Unsafe → VOR Present",
    rule: {
      field: "vorStatus",
      description:
        "If safeToUse is No, vorStatus should be Present (vehicle off road).",
      severity: "critical",
      type: "implies",
      enabled: true,
      whenField: "safeToUse",
      whenValue: "No",
      thenField: "vorStatus",
      thenValue: "Present",
      tags: ["consistency", "vor", "safety"],
    },
  },
  {
    id: "incomplete-return",
    label: "Incomplete work → return visit",
    rule: {
      field: "returnVisitNeeded",
      description:
        "If all works are not completed, a return visit must be required.",
      severity: "major",
      type: "implies",
      enabled: true,
      whenField: "allWorksCompleted",
      whenValue: "No",
      thenField: "returnVisitNeeded",
      thenValue: "Yes",
      tags: ["consistency", "return-visit"],
    },
  },
];

function nextRuleId(existing: Array<{ ruleId?: string }>): string {
  const nums = existing
    .map(r => String(r.ruleId ?? ""))
    .map(id => {
      const m = id.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    });
  const max = nums.length ? Math.max(...nums) : 0;
  return `R-IMPLIES-${String(max + 1).padStart(3, "0")}`;
}

function isImpliesRule(rule: Record<string, unknown>): boolean {
  return rule.type === "implies";
}

interface ConditionalRulesPanelProps {
  specJsonText: string;
  onSpecJsonChange: (next: string) => void;
  focusRuleId?: string | null;
}

export function ConditionalRulesPanel({
  specJsonText,
  onSpecJsonChange,
  focusRuleId,
}: ConditionalRulesPanelProps) {
  const [whenField, setWhenField] = useState("vorStatus");
  const [whenValue, setWhenValue] = useState("Present");
  const [thenField, setThenField] = useState("safeToUse");
  const [thenValue, setThenValue] = useState("No");
  const [severity, setSeverity] = useState<
    "critical" | "major" | "minor" | "info"
  >("critical");

  const parsed = useMemo((): SpecLike | null => {
    try {
      return JSON.parse(specJsonText || "{}") as SpecLike;
    } catch {
      return null;
    }
  }, [specJsonText]);

  const parseError =
    parsed == null
      ? "specJson is not valid JSON — fix it before adding rules."
      : null;

  const impliesRules = useMemo(() => {
    if (!parsed?.rules) return [];
    return parsed.rules.filter(isImpliesRule);
  }, [parsed]);

  const fieldOptions = useMemo(() => {
    const fromSpec = (parsed?.fields ?? []).map(f => f.field);
    const extras = [
      "vorStatus",
      "safeToUse",
      "allWorksCompleted",
      "returnVisitNeeded",
      "assetId",
      "makeModel",
    ];
    return Array.from(new Set([...fromSpec, ...extras]));
  }, [parsed]);

  const writeRules = (rules: Array<Record<string, unknown>>) => {
    if (!parsed) return;
    const next = { ...parsed, rules };
    onSpecJsonChange(JSON.stringify(next, null, 2));
  };

  const addRule = (
    draft: Omit<ImpliesRuleDraft, "ruleId"> & { ruleId?: string }
  ) => {
    if (!parsed) return;
    const rules = [...(parsed.rules ?? [])];
    const ruleId = draft.ruleId ?? nextRuleId(rules);
    rules.push({
      ...draft,
      ruleId,
      field: draft.thenField,
      type: "implies",
      enabled: true,
    });
    writeRules(rules);
  };

  const removeRule = (ruleId: string) => {
    if (!parsed?.rules) return;
    writeRules(parsed.rules.filter(r => r.ruleId !== ruleId));
  };

  return (
    <div className="space-y-4 rounded-md border border-[#BEDA41]/40 bg-[#F7F9EC] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[#333030]">
          If / then consistency (VOR-style)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Example: if section state is VOR / Present, then the asset must be
          unsafe to use. Rules save into{" "}
          <code className="text-[11px]">specJson.rules</code> as type{" "}
          <code className="text-[11px]">implies</code>.
        </p>
      </div>

      {parseError && <p className="text-xs text-destructive">{parseError}</p>}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={!!parseError}
            onClick={() => addRule(p.rule)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">If field</Label>
          <Select value={whenField} onValueChange={setWhenField}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map(f => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Is value</Label>
          <Input
            className="h-8 text-xs"
            value={whenValue}
            onChange={e => setWhenValue(e.target.value)}
            placeholder="Present / Yes / No"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Then field</Label>
          <Select value={thenField} onValueChange={setThenField}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map(f => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Must be</Label>
          <Input
            className="h-8 text-xs"
            value={thenValue}
            onChange={e => setThenValue(e.target.value)}
            placeholder="No / Present"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Severity</Label>
          <Select
            value={severity}
            onValueChange={v =>
              setSeverity(v as "critical" | "major" | "minor" | "info")
            }
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">critical</SelectItem>
              <SelectItem value="major">major</SelectItem>
              <SelectItem value="minor">minor</SelectItem>
              <SelectItem value="info">info</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-[#BEDA41] text-[#1a1f0a] hover:bg-[#a8c238]"
          disabled={!!parseError || !whenField || !thenField}
          onClick={() =>
            addRule({
              field: thenField,
              description: `If ${whenField} is ${whenValue}, then ${thenField} must be ${thenValue}.`,
              severity,
              type: "implies",
              enabled: true,
              whenField,
              whenValue,
              thenField,
              thenValue,
              tags: ["consistency", "studio"],
            })
          }
        >
          Add if / then rule
        </Button>
      </div>

      {impliesRules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No if/then rules yet. Use a preset or add your own.
        </p>
      ) : (
        <ul className="space-y-2">
          {impliesRules.map(rule => (
            <li
              key={String(rule.ruleId)}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-xs ${
                String(rule.ruleId) === focusRuleId
                  ? "border-2 border-[#BEDA41] ring-2 ring-[#BEDA41]/30"
                  : ""
              }`}
              data-testid={
                String(rule.ruleId) === focusRuleId
                  ? "studio-focused-rule-item"
                  : undefined
              }
            >
              <div className="space-y-1">
                <div className="font-medium text-[#333030]">
                  If <code>{String(rule.whenField)}</code> is “
                  {String(rule.whenValue)}” →{" "}
                  <code>{String(rule.thenField ?? rule.field)}</code> must be “
                  {String(rule.thenValue)}”
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{String(rule.severity)}</Badge>
                  <Badge variant="secondary">{String(rule.ruleId)}</Badge>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => removeRule(String(rule.ruleId))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
