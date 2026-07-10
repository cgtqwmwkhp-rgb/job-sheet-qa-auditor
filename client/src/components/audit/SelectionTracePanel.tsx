/**
 * SelectionTracePanel Component - PR-2
 *
 * Displays template selection trace for explainability.
 * Shows how the template was selected, candidates considered,
 * confidence bands, and any manual overrides.
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Confidence band type
 */
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW" | "NONE";

/**
 * Template candidate in selection trace
 */
export interface TemplateCandidate {
  templateId: string;
  templateName: string;
  version: string;
  score: number;
  matchedTokens: string[];
  missingTokens: string[];
}

/**
 * Selection trace data structure
 */
export interface SelectionTrace {
  /** Input signals used for selection */
  inputSignals: {
    tokens: string[];
    documentType?: string;
    customerId?: string;
  };
  /** Sorted candidates (score desc, templateId asc) */
  candidates: TemplateCandidate[];
  /** Selected template/version (null if blocked) */
  selected: {
    templateId: string;
    templateName: string;
    version: string;
  } | null;
  /** Block reason if selection was blocked */
  blockReason?: string;
  /** Confidence band */
  confidenceBand: ConfidenceBand;
  /** Gap between top candidate and runner-up */
  runnerUpDelta: number;
  /** Manual override if applied */
  override?: {
    templateId: string;
    version: string;
    overriddenBy: string;
    reason: string;
  };
  /** Timestamp of selection */
  timestamp: string;
}

/**
 * Props for SelectionTracePanel
 */
export interface SelectionTracePanelProps {
  trace: SelectionTrace | null;
  className?: string;
  defaultOpen?: boolean;
}

/**
 * Get confidence band display
 */
function getConfidenceDisplay(band: ConfidenceBand) {
  switch (band) {
    case "HIGH":
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        label: "High Confidence",
        color: "text-green-600",
        bgColor: "bg-green-100",
      };
    case "MEDIUM":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
        label: "Medium Confidence",
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
      };
    case "LOW":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
        label: "Low Confidence",
        color: "text-orange-600",
        bgColor: "bg-orange-100",
      };
    case "NONE":
      return {
        icon: <XCircle className="h-4 w-4 text-red-500" />,
        label: "No Match",
        color: "text-red-600",
        bgColor: "bg-red-100",
      };
  }
}

/**
 * SelectionTracePanel Component
 *
 * Displays deterministic template selection trace for audit transparency.
 */
export function SelectionTracePanel({
  trace,
  className,
  defaultOpen = false,
}: SelectionTracePanelProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  if (!trace) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-5 w-5" />
            Template Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Selection trace not available for this audit.
          </p>
        </CardContent>
      </Card>
    );
  }

  const confidenceDisplay = getConfidenceDisplay(trace.confidenceBand);
  const selectedLabel =
    trace.selected?.templateName ||
    trace.selected?.templateId ||
    "No template selected";
  const gapHealthy =
    trace.confidenceBand === "HIGH" || trace.runnerUpDelta >= 10;

  return (
    <Card className={cn("shadow-none", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-2 px-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
            >
              <div className="flex items-center gap-2 min-w-0 text-left">
                <FileSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    Template: {selectedLabel}
                    {trace.selected?.version
                      ? ` · v${trace.selected.version}`
                      : ""}
                  </div>
                  {!isOpen && (
                    <div className="text-xs text-muted-foreground truncate">
                      {trace.confidenceBand} confidence ·{" "}
                      {trace.runnerUpDelta.toFixed(0)}% ahead of runner-up
                      {gapHealthy ? " (clear win)" : " (close call)"}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  className={cn(
                    "text-xs",
                    confidenceDisplay.bgColor,
                    confidenceDisplay.color
                  )}
                >
                  {trace.confidenceBand}
                </Badge>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0 px-3 pb-3">
            {trace.override && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-sm text-blue-700">
                Manual override to <strong>{trace.override.templateId}</strong>{" "}
                v{trace.override.version} by {trace.override.overriddenBy}:{" "}
                {trace.override.reason}
              </div>
            )}

            {trace.blockReason && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                Selection blocked: {trace.blockReason}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border px-2.5 py-2">
                <div className="text-xs text-muted-foreground">Confidence</div>
                <div
                  className={cn(
                    "font-medium flex items-center gap-1",
                    confidenceDisplay.color
                  )}
                >
                  {confidenceDisplay.icon}
                  {trace.confidenceBand}
                </div>
              </div>
              <div className="rounded-md border px-2.5 py-2">
                <div className="text-xs text-muted-foreground">
                  Runner-up gap
                </div>
                <div className="font-medium">
                  {trace.runnerUpDelta.toFixed(1)} pts
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {gapHealthy
                    ? "Healthy margin — selection is decisive (HIGH needs score ≥80; gap matters most under MEDIUM)."
                    : "Close race — review candidates if judgment looks wrong."}
                </div>
              </div>
            </div>

            {trace.inputSignals.tokens.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Signals: </span>
                {trace.inputSignals.tokens.slice(0, 8).join(", ")}
                {trace.inputSignals.tokens.length > 8
                  ? ` +${trace.inputSignals.tokens.length - 8}`
                  : ""}
              </div>
            )}

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-1.5 font-medium">#</th>
                    <th className="text-left p-1.5 font-medium">Template</th>
                    <th className="text-right p-1.5 font-medium">Score</th>
                    <th className="text-left p-1.5 font-medium">Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.candidates.slice(0, 4).map((candidate, index) => (
                    <tr
                      key={`${candidate.templateId}-${candidate.version}`}
                      className={cn(
                        "border-t",
                        index === 0 &&
                          trace.selected?.templateId === candidate.templateId
                          ? "bg-green-50"
                          : ""
                      )}
                    >
                      <td className="p-1.5 text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="p-1.5 font-medium">
                        {candidate.templateId}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          v{candidate.version}
                        </span>
                      </td>
                      <td className="p-1.5 text-right font-mono">
                        {candidate.score.toFixed(0)}
                      </td>
                      <td className="p-1.5 text-muted-foreground truncate max-w-[140px]">
                        {candidate.matchedTokens.slice(0, 3).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default SelectionTracePanel;
