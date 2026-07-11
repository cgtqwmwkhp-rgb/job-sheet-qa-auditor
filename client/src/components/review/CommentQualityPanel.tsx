/**
 * CommentQualityPanel — clinical narrative axes + coach chips.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface CommentQualitySignals {
  onFailurePath: boolean;
  present: boolean;
  wordCount: number;
  hasWhat: boolean;
  hasImpact: boolean;
  hasPartsStance: boolean;
  hasNextAction: boolean;
  isVagueOnly: boolean;
  isTooThin: boolean;
  missingAxes: string[];
  snippet: string;
  coherent: boolean;
  returnVisit: boolean;
  partsStillRequired: boolean;
  partsStillSnippet: string;
}

export interface CommentQualityPanelProps {
  signals: CommentQualitySignals | null | undefined;
  summary?: string | null;
  defaultOpen?: boolean;
  className?: string;
}

type ChipVariant = "positive" | "negative" | "neutral";

const variantStyles: Record<ChipVariant, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

function axisChip(
  label: string,
  ok: boolean,
  missingLabel?: string
): { label: string; value: string; variant: ChipVariant } {
  return {
    label,
    value: ok ? "Yes" : missingLabel || "No",
    variant: ok ? "positive" : "negative",
  };
}

export function CommentQualityPanel({
  signals,
  summary: _summary,
  defaultOpen = false,
  className,
}: CommentQualityPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!signals || !signals.onFailurePath) return null;

  const missingAxes = Array.isArray(signals.missingAxes)
    ? signals.missingAxes
    : [];

  const chips = [
    axisChip("Present", signals.present),
    axisChip("What", signals.hasWhat),
    axisChip("PartsStance", signals.hasPartsStance),
    axisChip("NextAction", signals.hasNextAction),
    {
      label: "Clarity",
      value: signals.isVagueOnly ? "Vague" : signals.isTooThin ? "Thin" : "OK",
      variant: (signals.isVagueOnly || signals.isTooThin
        ? "negative"
        : "positive") as ChipVariant,
    },
    {
      label: "Coherent",
      value: signals.coherent ? "Yes" : "No",
      variant: (signals.coherent ? "positive" : "negative") as ChipVariant,
    },
  ];

  return (
    <Card className={cn("shadow-none", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-2 px-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-1 h-7 hover:bg-transparent"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Engineer comments
              </CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 ml-auto",
                  signals.coherent
                    ? "border-emerald-200 text-emerald-700"
                    : "border-amber-200 text-amber-800"
                )}
              >
                {signals.coherent ? "Coherent" : "Needs coach"}
              </Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {chips.map(chip => (
                <Badge
                  key={chip.label}
                  variant="outline"
                  className={cn(
                    "text-xs font-normal px-2 py-0.5",
                    variantStyles[chip.variant]
                  )}
                >
                  <span className="font-medium mr-1">{chip.label}:</span>
                  {chip.value}
                </Badge>
              ))}
            </div>
            {signals.snippet ? (
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
                “{signals.snippet}”
              </p>
            ) : (
              <p className="text-[11px] text-destructive">
                No substantive engineer comments found.
              </p>
            )}
            {missingAxes.length > 0 && (
              <p className="text-[11px] text-amber-800">
                Missing: {missingAxes.join(", ")}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function mapCommentQualityFromReport(reportJson: unknown): {
  signals: CommentQualitySignals | null;
  summary: string | null;
} {
  if (!reportJson || typeof reportJson !== "object") {
    return { signals: null, summary: null };
  }
  const report = reportJson as Record<string, unknown>;
  const raw = report.commentQualitySignals;
  if (!raw || typeof raw !== "object") {
    return {
      signals: null,
      summary: (report.commentQualitySummary as string) ?? null,
    };
  }
  const s = raw as Record<string, unknown>;
  const signals: CommentQualitySignals = {
    onFailurePath: Boolean(s.onFailurePath),
    present: Boolean(s.present),
    wordCount: typeof s.wordCount === "number" ? s.wordCount : 0,
    hasWhat: Boolean(s.hasWhat),
    hasImpact: Boolean(s.hasImpact),
    hasPartsStance: Boolean(s.hasPartsStance),
    hasNextAction: Boolean(s.hasNextAction),
    isVagueOnly: Boolean(s.isVagueOnly),
    isTooThin: Boolean(s.isTooThin),
    missingAxes: Array.isArray(s.missingAxes)
      ? s.missingAxes.filter((x): x is string => typeof x === "string")
      : [],
    snippet: typeof s.snippet === "string" ? s.snippet : "",
    coherent: Boolean(s.coherent),
    returnVisit: Boolean(s.returnVisit),
    partsStillRequired: Boolean(s.partsStillRequired),
    partsStillSnippet:
      typeof s.partsStillSnippet === "string" ? s.partsStillSnippet : "",
  };
  return {
    signals,
    summary: (report.commentQualitySummary as string) ?? null,
  };
}
