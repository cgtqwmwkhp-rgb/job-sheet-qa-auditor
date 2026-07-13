/**
 * Studio UI: author numeric threshold / measurement rules into specJson.rules.
 * These are evaluated live in documentProcessor via evaluateRangeRules.
 */

import { useEffect, useMemo, useState } from "react";
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

export type BoundsMode = "between" | "under" | "at_least" | "over";

export interface RangeRuleDraft {
  ruleId: string;
  field: string;
  description: string;
  severity: "critical" | "major" | "minor" | "info";
  type: "range";
  enabled: boolean;
  boundsMode?: BoundsMode;
  range?: { min?: number | string; max?: number | string };
  unit?: string;
  tags?: string[];
}

interface SpecLike {
  name?: string;
  version?: string;
  fields?: Array<{
    field: string;
    label?: string;
    type?: string;
    required?: boolean;
    aliases?: string[];
    extractionHints?: string[];
  }>;
  rules?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

const UNIT_PRESETS = ["NM", "mm", "PSI", "bar", "kg", "%"];

function nextRuleId(existing: Array<{ ruleId?: string }>): string {
  const nums = existing
    .map(r => String(r.ruleId ?? ""))
    .map(id => {
      const m = id.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    });
  const max = nums.length ? Math.max(...nums) : 0;
  return `R-RANGE-${String(max + 1).padStart(3, "0")}`;
}

function isRangeRule(rule: Record<string, unknown>): boolean {
  return rule.type === "range";
}

function formatBoundsSummary(rule: Record<string, unknown>): string {
  const range = (rule.range ?? {}) as { min?: number | string; max?: number | string };
  const unit = rule.unit ? ` ${rule.unit}` : "";
  const mode = rule.boundsMode as BoundsMode | undefined;
  if (mode === "under") return `≤ ${range.max ?? "?"}${unit}`;
  if (mode === "at_least") return `≥ ${range.min ?? "?"}${unit}`;
  if (mode === "over") return `> ${range.min ?? "?"}${unit}`;
  if (range.min != null && range.max != null) {
    return `${range.min}${unit} – ${range.max}${unit}`;
  }
  if (range.min != null) return `≥ ${range.min}${unit}`;
  if (range.max != null) return `≤ ${range.max}${unit}`;
  return "no bounds";
}

/** Ensure field exists as a number field with useful extraction hints. */
export function ensureNumericFieldInSpec(
  spec: SpecLike,
  fieldId: string,
  label: string,
  unit?: string
): SpecLike {
  const fields = [...(spec.fields ?? [])];
  const idx = fields.findIndex(f => f.field === fieldId);
  const hints = Array.from(
    new Set(
      [
        label,
        fieldId,
        unit ? `${label} (${unit})` : null,
        unit ? `${fieldId} ${unit}` : null,
      ].filter(Boolean) as string[]
    )
  );
  if (idx >= 0) {
    const existing = fields[idx];
    fields[idx] = {
      ...existing,
      type: "number",
      label: existing.label || label,
      aliases: Array.from(
        new Set([...(existing.aliases ?? []), label, fieldId])
      ),
      extractionHints: Array.from(
        new Set([...(existing.extractionHints ?? []), ...hints])
      ),
    };
  } else {
    fields.push({
      field: fieldId,
      label,
      type: "number",
      required: false,
      aliases: [label],
      extractionHints: hints,
    });
  }
  return { ...spec, fields };
}

export function upsertRangeRuleInSpec(
  specJsonText: string,
  draft: Omit<RangeRuleDraft, "ruleId"> & { ruleId?: string },
  options?: { fieldLabel?: string }
): string {
  const parsed = JSON.parse(specJsonText || "{}") as SpecLike;
  let next = ensureNumericFieldInSpec(
    parsed,
    draft.field,
    options?.fieldLabel ?? draft.field,
    draft.unit
  );
  const rules = [...(next.rules ?? [])];
  const existingIdx = rules.findIndex(
    r => r.type === "range" && r.field === draft.field
  );
  const ruleId =
    draft.ruleId ??
    (existingIdx >= 0
      ? String(rules[existingIdx].ruleId)
      : nextRuleId(rules));
  const rule: RangeRuleDraft = {
    ...draft,
    ruleId,
    type: "range",
    enabled: draft.enabled !== false,
    tags: draft.tags ?? ["threshold", "measurement"],
  };
  if (existingIdx >= 0) {
    rules[existingIdx] = { ...rules[existingIdx], ...rule };
  } else {
    rules.push({ ...rule });
  }
  next = { ...next, rules };
  return JSON.stringify(next, null, 2);
}

interface ThresholdRulesPanelProps {
  specJsonText: string;
  onSpecJsonChange: (next: string) => void;
  /** Prefill field when opened from an ROI region */
  defaultField?: string;
  /** Extra field options (e.g. ROI region names) */
  extraFields?: string[];
  compact?: boolean;
}

export function ThresholdRulesPanel({
  specJsonText,
  onSpecJsonChange,
  defaultField,
  extraFields = [],
  compact = false,
}: ThresholdRulesPanelProps) {
  const [field, setField] = useState(defaultField ?? "");
  const [boundsMode, setBoundsMode] = useState<BoundsMode>("between");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [unit, setUnit] = useState("NM");
  const [severity, setSeverity] = useState<
    "critical" | "major" | "minor" | "info"
  >("major");

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

  const rangeRules = useMemo(() => {
    if (!parsed?.rules) return [];
    return parsed.rules.filter(isRangeRule);
  }, [parsed]);

  const fieldOptions = useMemo(() => {
    const fromSpec = (parsed?.fields ?? []).map(f => f.field);
    return Array.from(
      new Set([...fromSpec, ...extraFields, defaultField].filter(Boolean) as string[])
    );
  }, [parsed, extraFields, defaultField]);

  // Keep field in sync when parent selects a region
  useEffect(() => {
    if (defaultField) setField(defaultField);
  }, [defaultField]);

  const writeRules = (rules: Array<Record<string, unknown>>) => {
    if (!parsed) return;
    onSpecJsonChange(JSON.stringify({ ...parsed, rules }, null, 2));
  };

  const addOrUpdate = () => {
    if (!parsed || !field.trim()) return;
    const minN = min.trim() === "" ? undefined : Number(min);
    const maxN = max.trim() === "" ? undefined : Number(max);
    if (boundsMode === "between" && (minN === undefined || maxN === undefined)) {
      return;
    }
    if (boundsMode === "under" && maxN === undefined) return;
    if ((boundsMode === "at_least" || boundsMode === "over") && minN === undefined) {
      return;
    }

    const label =
      parsed.fields?.find(f => f.field === field)?.label ??
      field.replace(/_/g, " ");

    const description =
      boundsMode === "under"
        ? `${label} must be ≤ ${maxN}${unit ? ` ${unit}` : ""}.`
        : boundsMode === "at_least"
          ? `${label} must be ≥ ${minN}${unit ? ` ${unit}` : ""}.`
          : boundsMode === "over"
            ? `${label} must be > ${minN}${unit ? ` ${unit}` : ""}.`
            : `${label} must be between ${minN} and ${maxN}${unit ? ` ${unit}` : ""}.`;

    const next = upsertRangeRuleInSpec(
      JSON.stringify(parsed),
      {
        field: field.trim(),
        description,
        severity,
        type: "range",
        enabled: true,
        boundsMode,
        range: {
          ...(minN !== undefined ? { min: minN } : {}),
          ...(maxN !== undefined ? { max: maxN } : {}),
        },
        unit: unit.trim() || undefined,
        tags: ["threshold", "measurement"],
      },
      { fieldLabel: label }
    );
    onSpecJsonChange(next);
  };

  const removeRule = (ruleId: string) => {
    if (!parsed?.rules) return;
    writeRules(parsed.rules.filter(r => r.ruleId !== ruleId));
  };

  return (
    <div
      className={
        compact
          ? "space-y-3 rounded-md border border-[#BEDA41]/40 bg-white p-3"
          : "space-y-4 rounded-md border border-[#BEDA41]/40 bg-[#F7F9EC] p-4"
      }
      data-testid="threshold-rules-panel"
    >
      <div>
        <h3 className="text-sm font-semibold text-[#333030]">
          Value thresholds (measurement)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Example: Wheel Nut Torque between 100–130 NM. Rules save into{" "}
          <code className="text-[11px]">specJson.rules</code> as type{" "}
          <code className="text-[11px]">range</code> and run on every live
          audit when this template version is active.
        </p>
      </div>

      {parseError && (
        <p className="text-xs text-destructive">{parseError}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Field / ROI</Label>
          <Select
            value={field || undefined}
            onValueChange={setField}
            disabled={!!parseError}
          >
            <SelectTrigger data-testid="threshold-field">
              <SelectValue placeholder="Select field" />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map(f => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="mt-1 h-8 text-xs"
            placeholder="Or type field id…"
            value={field}
            onChange={e => setField(e.target.value)}
            disabled={!!parseError}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Check</Label>
          <Select
            value={boundsMode}
            onValueChange={v => setBoundsMode(v as BoundsMode)}
            disabled={!!parseError}
          >
            <SelectTrigger data-testid="threshold-bounds-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="between">Between min and max</SelectItem>
              <SelectItem value="under">At or below max</SelectItem>
              <SelectItem value="at_least">At or above min</SelectItem>
              <SelectItem value="over">Strictly above min</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <div className="flex gap-1">
            <Input
              className="h-9"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="NM"
              data-testid="threshold-unit"
              disabled={!!parseError}
            />
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {UNIT_PRESETS.map(u => (
              <button
                key={u}
                type="button"
                className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-[#BEDA41] hover:text-foreground"
                onClick={() => setUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {(boundsMode === "between" ||
          boundsMode === "at_least" ||
          boundsMode === "over") && (
          <div className="space-y-1">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              value={min}
              onChange={e => setMin(e.target.value)}
              data-testid="threshold-min"
              disabled={!!parseError}
            />
          </div>
        )}

        {(boundsMode === "between" || boundsMode === "under") && (
          <div className="space-y-1">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              value={max}
              onChange={e => setMax(e.target.value)}
              data-testid="threshold-max"
              disabled={!!parseError}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Severity</Label>
          <Select
            value={severity}
            onValueChange={v =>
              setSeverity(v as "critical" | "major" | "minor" | "info")
            }
            disabled={!!parseError}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="major">Major</SelectItem>
              <SelectItem value="minor">Minor</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="bg-[#BEDA41] text-[#1a1f0a] hover:bg-[#a8c438]"
        onClick={addOrUpdate}
        disabled={!!parseError || !field.trim()}
        data-testid="threshold-save-rule"
      >
        Save threshold rule
      </Button>

      {rangeRules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No threshold rules yet. Select a field (e.g. Wheel_Nut_Torque), set
          bounds and unit, then save.
        </p>
      ) : (
        <ul className="space-y-2">
          {rangeRules.map(rule => (
            <li
              key={String(rule.ruleId)}
              className="flex items-start justify-between gap-2 rounded border bg-white px-3 py-2 text-xs"
            >
              <div>
                <div className="font-medium text-[#333030]">
                  {String(rule.field)}{" "}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {formatBoundsSummary(rule)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {String(rule.description ?? "")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-destructive"
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
