/**
 * FailurePathSignalsPanel — "What we read" explainability panel.
 *
 * Renders compact read-only chips summarising the failure-path signals
 * extracted from a job sheet (VOR, SafeToUse, ReturnVisit, Incomplete,
 * FailMarks, PartsStillRequired). Gracefully hidden when the data is absent.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface FailurePathSignals {
  vor: boolean;
  unsafe: boolean;
  safeYes: boolean;
  returnVisit: boolean;
  returnVisitNo: boolean;
  incomplete: boolean;
  worksCompleteYes: boolean;
  repairsPath: boolean;
  partsUsed: boolean;
  partsStillRequired: boolean;
  partsStillSnippet: string;
  partsUsedSnippet: string;
  failMarkCount: number;
  hasSubstantiveComments: boolean;
  commentSnippet: string;
  onFailurePath: boolean;
}

export interface FailurePathSignalsPanelProps {
  signals: FailurePathSignals | null | undefined;
  signalSummary?: string | null;
  defaultOpen?: boolean;
  className?: string;
}

type ChipVariant = "positive" | "negative" | "neutral";

interface SignalChip {
  label: string;
  value: string;
  variant: ChipVariant;
}

function resolveChips(signals: FailurePathSignals): SignalChip[] {
  const chips: SignalChip[] = [];

  // SafeToUse
  if (signals.unsafe) {
    chips.push({ label: "SafeToUse", value: "No", variant: "negative" });
  } else if (signals.safeYes) {
    chips.push({ label: "SafeToUse", value: "Yes", variant: "positive" });
  } else {
    chips.push({ label: "SafeToUse", value: "Unknown", variant: "neutral" });
  }

  // ReturnVisit
  if (signals.returnVisit) {
    chips.push({ label: "ReturnVisit", value: "Yes", variant: "negative" });
  } else if (signals.returnVisitNo) {
    chips.push({ label: "ReturnVisit", value: "No", variant: "positive" });
  } else {
    chips.push({ label: "ReturnVisit", value: "Unknown", variant: "neutral" });
  }

  // VOR
  chips.push({
    label: "VOR",
    value: signals.vor ? "Yes" : "No",
    variant: signals.vor ? "negative" : "positive",
  });

  // Incomplete
  if (signals.incomplete) {
    chips.push({ label: "Incomplete", value: "Yes", variant: "negative" });
  } else if (signals.worksCompleteYes) {
    chips.push({ label: "Incomplete", value: "No", variant: "positive" });
  } else {
    chips.push({ label: "Incomplete", value: "Unknown", variant: "neutral" });
  }

  // FailMarks
  chips.push({
    label: "FailMarks",
    value: String(signals.failMarkCount),
    variant: signals.failMarkCount > 0 ? "negative" : "positive",
  });

  // PartsStillRequired
  chips.push({
    label: "PartsStillRequired",
    value: signals.partsStillRequired ? "Yes" : "No",
    variant: signals.partsStillRequired ? "negative" : "neutral",
  });

  // EngineerComments
  chips.push({
    label: "EngineerComments",
    value: signals.hasSubstantiveComments ? "Yes" : "No",
    variant: signals.hasSubstantiveComments ? "positive" : "negative",
  });

  return chips;
}

const variantStyles: Record<ChipVariant, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

export function FailurePathSignalsPanel({
  signals,
  signalSummary,
  defaultOpen = false,
  className,
}: FailurePathSignalsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!signals) return null;

  const chips = resolveChips(signals);

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
              <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                What we read
              </CardTitle>
              {signals.onFailurePath && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 ml-auto"
                >
                  On failure path
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0">
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
            {signalSummary && (
              <p className="mt-2 text-[11px] text-muted-foreground font-mono leading-snug truncate">
                {signalSummary}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Extract failurePathSignals from a reportJson blob (server audit result).
 * Returns null if absent so the panel hides gracefully.
 */
export function mapFailurePathSignalsFromReport(reportJson: unknown): {
  signals: FailurePathSignals | null;
  signalSummary: string | null;
} {
  if (!reportJson || typeof reportJson !== "object") {
    return { signals: null, signalSummary: null };
  }
  const report = reportJson as Record<string, unknown>;
  const signals = report.failurePathSignals as FailurePathSignals | undefined;
  const summary = (report.signalSummary as string) ?? null;
  return { signals: signals ?? null, signalSummary: summary };
}
