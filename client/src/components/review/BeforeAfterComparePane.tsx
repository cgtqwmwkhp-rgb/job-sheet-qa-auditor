/**
 * BeforeAfterComparePane — side-by-side pair compare with confirm/override.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Images,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type AxisVerdict = "pass" | "fail" | "inconclusive";

export interface PhotoPairAxes {
  work_done: AxisVerdict;
  repaired_properly: AxisVerdict;
  clean: AxisVerdict;
  residual_risk: AxisVerdict;
}

export interface PhotoPairResult {
  beforePage: number | null;
  afterPage: number | null;
  axes: PhotoPairAxes;
  confidence: number;
  confidenceBand: "high" | "medium" | "low";
  reasoning: string;
}

export interface PhotoPairCompareArtifact {
  enabled: boolean;
  provider: string;
  model: string;
  pairs: PhotoPairResult[];
  pageRoles: Array<{
    page: number;
    role: "before" | "after" | "form" | "unknown";
  }>;
  summary: string;
  processingTimeMs: number;
}

export interface BeforeAfterComparePaneProps {
  artifact: PhotoPairCompareArtifact | null | undefined;
  documentUrl?: string;
  defaultOpen?: boolean;
  className?: string;
  onConfirmPair?: (pairIndex: number) => void;
  onOverridePair?: (pairIndex: number) => void;
}

const axisLabels: Record<keyof PhotoPairAxes, string> = {
  work_done: "Work done",
  repaired_properly: "Repaired properly",
  clean: "Clean",
  residual_risk: "Residual risk",
};

function verdictStyle(v: AxisVerdict): string {
  if (v === "pass") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (v === "fail") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function BeforeAfterComparePane({
  artifact,
  documentUrl,
  defaultOpen = false,
  className,
  onConfirmPair,
  onOverridePair,
}: BeforeAfterComparePaneProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [decisions, setDecisions] = useState<
    Record<number, "confirmed" | "overridden">
  >({});

  if (!artifact || artifact.pairs.length === 0) return null;

  const hasFail = artifact.pairs.some(
    p =>
      p.axes.work_done === "fail" ||
      p.axes.repaired_properly === "fail" ||
      p.axes.clean === "fail"
  );

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
              <Images className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Before / after compare
              </CardTitle>
              {hasFail && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 ml-auto"
                >
                  Cost risk
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              {artifact.summary} · {artifact.provider}/{artifact.model}
            </p>
            {artifact.pairs.map((pair, idx) => {
              const decision = decisions[idx];
              return (
                <div
                  key={idx}
                  className="rounded-md border border-border p-2 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-muted/40 p-2 min-h-[72px]">
                      <div className="font-medium mb-1">
                        Before · p{pair.beforePage ?? "?"}
                      </div>
                      <p className="text-muted-foreground text-[10px]">
                        {documentUrl
                          ? `Open page ${pair.beforePage ?? 1} in the PDF viewer`
                          : "Before page"}
                      </p>
                    </div>
                    <div className="rounded bg-muted/40 p-2 min-h-[72px]">
                      <div className="font-medium mb-1">
                        After · p{pair.afterPage ?? "?"}
                      </div>
                      <p className="text-muted-foreground text-[10px]">
                        {documentUrl
                          ? `Open page ${pair.afterPage ?? 1} in the PDF viewer`
                          : "After page"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(
                      Object.keys(axisLabels) as Array<keyof PhotoPairAxes>
                    ).map(axis => (
                      <Badge
                        key={axis}
                        variant="outline"
                        className={cn(
                          "text-[10px] font-normal",
                          verdictStyle(pair.axes[axis])
                        )}
                      >
                        {axisLabels[axis]}: {pair.axes[axis]}
                      </Badge>
                    ))}
                    <Badge variant="outline" className="text-[10px]">
                      {pair.confidenceBand}{" "}
                      {Math.round(pair.confidence * 100)}%
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {pair.reasoning}
                  </p>

                  <div className="flex gap-2 items-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={!!decision}
                      onClick={() => {
                        setDecisions(d => ({ ...d, [idx]: "confirmed" }));
                        onConfirmPair?.(idx);
                        toast.success(
                          "Pair confirmed — incomplete repair catch retained (cost avoided)."
                        );
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!!decision}
                      onClick={() => {
                        setDecisions(d => ({ ...d, [idx]: "overridden" }));
                        onOverridePair?.(idx);
                        toast.message(
                          "Pair overridden — finding waived for this review."
                        );
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Override
                    </Button>
                    {decision && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {decision}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function mapPhotoPairCompareFromReport(
  reportJson: unknown
): PhotoPairCompareArtifact | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const report = reportJson as Record<string, unknown>;
  const art = report.photoPairCompare as PhotoPairCompareArtifact | undefined;
  return art ?? null;
}
