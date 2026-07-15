/**
 * AttrContextPanel — engineer name extraction + user-match attribution.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type AttributionConfidence =
  | "exact"
  | "fuzzy"
  | "none"
  | "ambiguous"
  | string;

export interface AttributionStamp {
  extractedName: string | null;
  displayName: string | null;
  technicianId: number | null;
  confidence: AttributionConfidence;
  matchedOn: string | null;
}

export interface AttrContextPanelProps {
  attribution: AttributionStamp | null | undefined;
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

export function attrContextIsActionable(
  attribution: AttributionStamp | null | undefined,
  hasFindings?: boolean
): boolean {
  if (hasFindings) return true;
  if (!attribution) return false;
  if (attribution.technicianId == null) return true;
  return attribution.confidence !== "exact";
}

function confidenceVariant(confidence: AttributionConfidence): ChipVariant {
  if (confidence === "exact") return "positive";
  if (confidence === "none") return "negative";
  return "neutral";
}

export function AttrContextPanel({
  attribution,
  hasFindings = false,
  defaultOpen = false,
  className,
}: AttrContextPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!attribution && !hasFindings) return null;

  const actionable = attrContextIsActionable(attribution, hasFindings);
  const displayName =
    attribution?.displayName ?? attribution?.extractedName ?? null;

  const chips: Array<{ label: string; value: string; variant: ChipVariant }> =
    [];
  if (attribution) {
    chips.push({
      label: "Extracted",
      value: attribution.extractedName ?? "—",
      variant: attribution.extractedName ? "neutral" : "negative",
    });
    chips.push({
      label: "Match",
      value: attribution.confidence ?? "none",
      variant: confidenceVariant(attribution.confidence ?? "none"),
    });
    if (attribution.technicianId != null) {
      chips.push({
        label: "Technician ID",
        value: String(attribution.technicianId),
        variant: "positive",
      });
    }
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
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Engineer attribution
              </CardTitle>
              {displayName ? (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 truncate max-w-[120px]"
                  title={displayName}
                >
                  {displayName}
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
                {actionable ? "Gap" : "Matched"}
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
                Attribution findings present — open Issues for detail.
              </p>
            )}
            {attribution?.matchedOn ? (
              <p className="text-[11px] text-muted-foreground">
                Matched on: {attribution.matchedOn}
              </p>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function mapAttributionFromReport(
  reportJson: unknown
): AttributionStamp | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const report = reportJson as Record<string, unknown>;
  const raw = report.attribution;
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  return {
    extractedName: typeof a.extractedName === "string" ? a.extractedName : null,
    displayName: typeof a.displayName === "string" ? a.displayName : null,
    technicianId: typeof a.technicianId === "number" ? a.technicianId : null,
    confidence:
      typeof a.confidence === "string" ? a.confidence : ("none" as const),
    matchedOn: typeof a.matchedOn === "string" ? a.matchedOn : null,
  };
}
