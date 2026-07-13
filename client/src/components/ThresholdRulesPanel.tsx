/**
 * Studio UI: author numeric threshold / measurement rules into specJson.rules.
 * These are evaluated live in documentProcessor via evaluateRangeRules.
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
  const range = (rule.range ?? {}) as {
    min?: number | string;
    max?: number | string;
  };
  const unit = rule.unit ? ` ${rule.unit}` : "";
  const mode = rule.boundsMode as BoundsMode | undefined;
  if (mode === "under") return `≤ ${range.max ?? "?"}${unit}`;
  if (mode === "at_least") return `≥ ${range.min ?? "?"}${unit}`;
  if (mode === "over") return `> ${range.min ?? "?"}${unit}`;
  if (range.min != null && range.max != null) {
    return `${range.min}–${range.max}${unit}`;
  }
  if (range.min != null) return `≥ ${range.min}${unit}`;
  if (range.max != null) return `≤ ${range.max}${unit}`;
  return "no bounds";
}

function humanLabel(field: string): string {
  return field.replace(/_/g, " ");
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
    (existingIdx >= 0 ? String(rules[existingIdx].ruleId) : nextRuleId(rules));
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
  /** Dense layout for the ROI Regions sidebar */
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
  /** Measurement/threshold is opt-in — off unless a rule already exists or user enables it */
  const [measurementEnabled, setMeasurementEnabled] = useState(false);

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

  const activeRule = useMemo(() => {
    if (!field) return null;
    return rangeRules.find(r => r.field === field) ?? null;
  }, [rangeRules, field]);

  const fieldOptions = useMemo(() => {
    const fromSpec = (parsed?.fields ?? []).map(f => f.field);
    return Array.from(
      new Set(
        [...fromSpec, ...extraFields, defaultField].filter(Boolean) as string[]
      )
    );
  }, [parsed, extraFields, defaultField]);

  // Sync `field` from `defaultField` when it changes, without setState-in-effect
  // (React's "adjust state during render" pattern — see react.dev/learn/you-might-not-need-an-effect).
  const [prevDefaultField, setPrevDefaultField] = useState(defaultField);
  if (defaultField !== prevDefaultField) {
    setPrevDefaultField(defaultField);
    if (defaultField) setField(defaultField);
  }

  // Prefill editor from existing rule for selected field. Re-derived during
  // render (instead of in an effect) whenever `field` or `parsed` changes, to
  // avoid cascading-render setState-in-effect while preserving identical behavior.
  const [prevPrefillKey, setPrevPrefillKey] = useState<{
    field: string;
    parsed: SpecLike | null;
  }>({ field, parsed });
  if (field !== prevPrefillKey.field || parsed !== prevPrefillKey.parsed) {
    setPrevPrefillKey({ field, parsed });
    if (!field || !parsed?.rules) {
      setMeasurementEnabled(false);
    } else {
      const existing = parsed.rules.find(
        r => r.type === "range" && r.field === field
      );
      if (!existing) {
        setMeasurementEnabled(false);
        setBoundsMode("between");
        setMin("");
        setMax("");
        setUnit("NM");
        setSeverity("major");
      } else {
        setMeasurementEnabled(true);
        const range = (existing.range ?? {}) as {
          min?: number | string;
          max?: number | string;
        };
        setBoundsMode(
          existing.boundsMode ? (existing.boundsMode as BoundsMode) : "between"
        );
        setMin(range.min != null ? String(range.min) : "");
        setMax(range.max != null ? String(range.max) : "");
        setUnit(existing.unit ? String(existing.unit) : "NM");
        if (existing.severity) {
          setSeverity(
            existing.severity as "critical" | "major" | "minor" | "info"
          );
        }
      }
    }
  }

  const writeRules = (rules: Array<Record<string, unknown>>) => {
    if (!parsed) return;
    onSpecJsonChange(JSON.stringify({ ...parsed, rules }, null, 2));
  };

  const clearMeasurementForField = () => {
    if (!parsed?.rules || !field) {
      setMeasurementEnabled(false);
      return;
    }
    writeRules(
      parsed.rules.filter(r => !(r.type === "range" && r.field === field))
    );
    setMeasurementEnabled(false);
    setMin("");
    setMax("");
  };

  const setMeasurementToggle = (on: boolean) => {
    if (!on) {
      if (activeRule) clearMeasurementForField();
      else setMeasurementEnabled(false);
      return;
    }
    setMeasurementEnabled(true);
  };

  const addOrUpdate = () => {
    if (!parsed || !field.trim()) return;
    const minN = min.trim() === "" ? undefined : Number(min);
    const maxN = max.trim() === "" ? undefined : Number(max);
    if (
      boundsMode === "between" &&
      (minN === undefined || maxN === undefined)
    ) {
      return;
    }
    if (boundsMode === "under" && maxN === undefined) return;
    if (
      (boundsMode === "at_least" || boundsMode === "over") &&
      minN === undefined
    ) {
      return;
    }

    const label =
      parsed.fields?.find(f => f.field === field)?.label ?? humanLabel(field);

    const description =
      boundsMode === "under"
        ? `${label} must be ≤ ${maxN}${unit ? ` ${unit}` : ""}.`
        : boundsMode === "at_least"
          ? `${label} must be ≥ ${minN}${unit ? ` ${unit}` : ""}.`
          : boundsMode === "over"
            ? `${label} must be > ${minN}${unit ? ` ${unit}` : ""}.`
            : `${label} must be between ${minN} and ${maxN}${
                unit ? ` ${unit}` : ""
              }.`;

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

  const showMin =
    boundsMode === "between" ||
    boundsMode === "at_least" ||
    boundsMode === "over";
  const showMax = boundsMode === "between" || boundsMode === "under";

  if (compact) {
    return (
      <div
        className="overflow-hidden rounded-md border border-slate-200 bg-white"
        data-testid="threshold-rules-panel"
      >
        <label
          className="flex w-full cursor-pointer items-center justify-between gap-2 bg-slate-50 px-2.5 py-2.5"
          data-testid="threshold-toggle"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-700">
              Measurement check
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {measurementEnabled
                ? activeRule
                  ? formatBoundsSummary(activeRule)
                  : "On — set min/max + unit, then save rule"
                : "Off — not required for this label"}
            </div>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable measurement check for this ROI"
            checked={measurementEnabled}
            onChange={e => setMeasurementToggle(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[#BEDA41]"
            data-testid="threshold-enabled-switch"
          />
        </label>

        {measurementEnabled && (
          <div className="space-y-2 border-t border-slate-100 p-2.5">
            {parseError && (
              <p className="text-[11px] text-destructive">{parseError}</p>
            )}

            <p className="text-[10px] leading-snug text-slate-500">
              Optional live audit rule (e.g. torque 100–130 NM). Leave off for
              labels like Asset ID or signatures.
            </p>

            <div className="rounded bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-700">
              {field ? humanLabel(field) : "Select a region first"}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-slate-500">Check</Label>
                <Select
                  value={boundsMode}
                  onValueChange={v => setBoundsMode(v as BoundsMode)}
                  disabled={!!parseError}
                >
                  <SelectTrigger
                    className="h-8 text-[11px]"
                    data-testid="threshold-bounds-mode"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="between">Between</SelectItem>
                    <SelectItem value="under">≤ Max</SelectItem>
                    <SelectItem value="at_least">≥ Min</SelectItem>
                    <SelectItem value="over">&gt; Min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-slate-500">Unit</Label>
                <Input
                  className="h-8 text-[11px]"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="NM"
                  data-testid="threshold-unit"
                  disabled={!!parseError}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {UNIT_PRESETS.map(u => (
                <button
                  key={u}
                  type="button"
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    unit === u
                      ? "bg-[#BEDA41] font-semibold text-[#1a1f0a]"
                      : "border border-slate-200 text-slate-500 hover:border-[#BEDA41]"
                  }`}
                  onClick={() => setUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {showMin && (
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-slate-500">Min</Label>
                  <Input
                    type="number"
                    className="h-8 text-[11px]"
                    value={min}
                    onChange={e => setMin(e.target.value)}
                    data-testid="threshold-min"
                    disabled={!!parseError}
                  />
                </div>
              )}
              {showMax && (
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-slate-500">Max</Label>
                  <Input
                    type="number"
                    className="h-8 text-[11px]"
                    value={max}
                    onChange={e => setMax(e.target.value)}
                    data-testid="threshold-max"
                    disabled={!!parseError}
                  />
                </div>
              )}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-slate-500">Severity</Label>
                <Select
                  value={severity}
                  onValueChange={v =>
                    setSeverity(v as "critical" | "major" | "minor" | "info")
                  }
                  disabled={!!parseError}
                >
                  <SelectTrigger className="h-8 text-[11px]">
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

            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 bg-[#BEDA41] text-[11px] font-semibold text-[#1a1f0a] hover:bg-[#a8c438]"
                onClick={addOrUpdate}
                disabled={!!parseError || !field.trim()}
                data-testid="threshold-save-rule"
              >
                {activeRule ? "Update rule" : "Save rule"}
              </Button>
              {activeRule && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px] text-destructive"
                  onClick={() => removeRule(String(activeRule.ruleId))}
                >
                  Clear
                </Button>
              )}
            </div>

            {rangeRules.length > 0 && (
              <ul className="max-h-24 space-y-1 overflow-auto border-t border-slate-100 pt-2">
                {rangeRules.map(rule => (
                  <li
                    key={String(rule.ruleId)}
                    className="flex items-center justify-between gap-1 text-[10px]"
                  >
                    <span className="truncate font-medium text-slate-700">
                      {humanLabel(String(rule.field))}
                    </span>
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1 py-0 text-[9px]"
                    >
                      {formatBoundsSummary(rule)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-4 rounded-md border border-[#BEDA41]/40 bg-[#F7F9EC] p-4"
      data-testid="threshold-rules-panel"
    >
      <div>
        <h3 className="text-sm font-semibold text-[#333030]">
          Value thresholds (measurement)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Example: Wheel Nut Torque between 100–130 NM. Rules run on every live
          audit when this template version is active.
        </p>
      </div>

      {parseError && <p className="text-xs text-destructive">{parseError}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
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
                  {humanLabel(f)}
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
          <Input
            className="h-9"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            placeholder="NM"
            data-testid="threshold-unit"
            disabled={!!parseError}
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {UNIT_PRESETS.map(u => (
              <button
                key={u}
                type="button"
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  unit === u
                    ? "bg-[#BEDA41] font-semibold text-[#1a1f0a]"
                    : "border border-slate-200 text-muted-foreground hover:border-[#BEDA41]"
                }`}
                onClick={() => setUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {showMin && (
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

        {showMax && (
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
          No threshold rules yet. Select a field, set bounds and unit, then
          save.
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
                  {humanLabel(String(rule.field))}{" "}
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
