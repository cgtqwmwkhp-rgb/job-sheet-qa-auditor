/**
 * PartsContextPanel — Parts Used assessment + catalog verify context.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface PartsAssessmentSignals {
  partsImplied: boolean;
  partsUsedPresent: boolean;
  repairsPresent: boolean;
  consumablesYes: boolean;
  lineCount: number;
  completeCount: number;
  incompleteCount: number;
  snippet: string;
}

export interface PartsCatalogSignals {
  enabled: boolean;
  lineCount: number;
  verifiedCount: number;
  matchCount: number;
  mismatchCount: number;
  unavailableCount: number;
  capped: boolean;
}

export interface PartsContextPanelProps {
  assessmentSignals: PartsAssessmentSignals | null | undefined;
  catalogSignals: PartsCatalogSignals | null | undefined;
  makeModel?: string | null;
  assessmentSummary?: string | null;
  catalogSummary?: string | null;
  hasFindings?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

type ChipVariant = "positive" | "negative" | "neutral";

const variantStyles: Record<ChipVariant, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

function boolChip(
  label: string,
  ok: boolean
): { label: string; value: string; variant: ChipVariant } {
  return {
    label,
    value: ok ? "Yes" : "No",
    variant: ok ? "positive" : "neutral",
  };
}

export function partsContextIsActionable(
  assessment: PartsAssessmentSignals | null | undefined,
  catalog: PartsCatalogSignals | null | undefined,
  hasFindings?: boolean
): boolean {
  if (hasFindings) return true;
  if ((assessment?.incompleteCount ?? 0) > 0) return true;
  if ((catalog?.mismatchCount ?? 0) > 0) return true;
  if ((catalog?.unavailableCount ?? 0) > 0 && (catalog?.lineCount ?? 0) > 0) {
    return true;
  }
  return false;
}

export function PartsContextPanel({
  assessmentSignals,
  catalogSignals,
  makeModel,
  assessmentSummary: _assessmentSummary,
  catalogSummary: _catalogSummary,
  hasFindings = false,
  defaultOpen = false,
  className,
}: PartsContextPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!assessmentSignals && !catalogSignals && !hasFindings) return null;

  const actionable = partsContextIsActionable(
    assessmentSignals,
    catalogSignals,
    hasFindings
  );

  const chips: Array<{ label: string; value: string; variant: ChipVariant }> =
    [];
  if (assessmentSignals) {
    chips.push(
      boolChip("Parts implied", assessmentSignals.partsImplied),
      boolChip("Parts Used", assessmentSignals.partsUsedPresent),
      {
        label: "Lines",
        value: `${assessmentSignals.completeCount}/${assessmentSignals.lineCount} complete`,
        variant:
          assessmentSignals.incompleteCount > 0 ? "negative" : "positive",
      }
    );
  }
  if (catalogSignals?.enabled) {
    chips.push({
      label: "Catalog",
      value: `${catalogSignals.matchCount} match · ${catalogSignals.mismatchCount} mismatch`,
      variant:
        catalogSignals.mismatchCount > 0 || catalogSignals.unavailableCount > 0
          ? "negative"
          : "positive",
    });
  }

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
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Parts used</CardTitle>
              {makeModel ? (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 truncate max-w-[120px]"
                  title={makeModel}
                >
                  {makeModel}
                </Badge>
              ) : null}
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 ml-auto",
                  actionable
                    ? "border-amber-200 text-amber-800"
                    : "border-emerald-200 text-emerald-700"
                )}
              >
                {actionable ? "Needs review" : "OK"}
              </Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-2">
            {chips.length > 0 ? (
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
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Parts findings present — open Issues for detail.
              </p>
            )}
            {assessmentSignals?.snippet ? (
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
                “{assessmentSignals.snippet}”
              </p>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function mapPartsContextFromReport(reportJson: unknown): {
  assessmentSignals: PartsAssessmentSignals | null;
  catalogSignals: PartsCatalogSignals | null;
  assessmentSummary: string | null;
  catalogSummary: string | null;
} {
  if (!reportJson || typeof reportJson !== "object") {
    return {
      assessmentSignals: null,
      catalogSignals: null,
      assessmentSummary: null,
      catalogSummary: null,
    };
  }
  const report = reportJson as Record<string, unknown>;

  const mapAssessment = (raw: unknown): PartsAssessmentSignals | null => {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    return {
      partsImplied: Boolean(s.partsImplied),
      partsUsedPresent: Boolean(s.partsUsedPresent),
      repairsPresent: Boolean(s.repairsPresent),
      consumablesYes: Boolean(s.consumablesYes),
      lineCount: typeof s.lineCount === "number" ? s.lineCount : 0,
      completeCount: typeof s.completeCount === "number" ? s.completeCount : 0,
      incompleteCount:
        typeof s.incompleteCount === "number" ? s.incompleteCount : 0,
      snippet: typeof s.snippet === "string" ? s.snippet : "",
    };
  };

  const mapCatalog = (raw: unknown): PartsCatalogSignals | null => {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    return {
      enabled: Boolean(s.enabled),
      lineCount: typeof s.lineCount === "number" ? s.lineCount : 0,
      verifiedCount: typeof s.verifiedCount === "number" ? s.verifiedCount : 0,
      matchCount: typeof s.matchCount === "number" ? s.matchCount : 0,
      mismatchCount: typeof s.mismatchCount === "number" ? s.mismatchCount : 0,
      unavailableCount:
        typeof s.unavailableCount === "number" ? s.unavailableCount : 0,
      capped: Boolean(s.capped),
    };
  };

  return {
    assessmentSignals: mapAssessment(report.partsAssessmentSignals),
    catalogSignals: mapCatalog(report.partsCatalogSignals),
    assessmentSummary:
      typeof report.partsAssessmentSummary === "string"
        ? report.partsAssessmentSummary
        : null,
    catalogSummary:
      typeof report.partsCatalogSummary === "string"
        ? report.partsCatalogSummary
        : null,
  };
}
