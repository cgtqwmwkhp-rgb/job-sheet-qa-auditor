/**
 * PhotoEvidenceContextPanel — photo hints + coaching when pair-compare
 * cannot run (Images pack without Before/After labels).
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { PhotoPairCompareArtifact } from "@/components/review/BeforeAfterComparePane";

export interface PhotoEvidenceHintsView {
  hasBeforeLabel: boolean;
  hasAfterLabel: boolean;
  photoNumberCount: number;
  pageMarkers: number;
  totalPagesHint: number | null;
  hintSummary: string[];
}

export interface PhotoEvidenceView {
  hasPhotoHints: boolean;
  hasPartsOrRepairs: boolean;
  duplicateFileHash: boolean;
  summary: string;
  hints: PhotoEvidenceHintsView;
}

export interface PhotoEvidenceContextPanelProps {
  evidence: PhotoEvidenceView | null | undefined;
  pairCompare?: PhotoPairCompareArtifact | null;
  defaultOpen?: boolean;
  className?: string;
}

type ChipVariant = "positive" | "negative" | "neutral" | "warning";

const variantStyles: Record<ChipVariant, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
};

export function photoEvidenceNeedsCoach(
  evidence: PhotoEvidenceView | null | undefined,
  pairCompare?: PhotoPairCompareArtifact | null
): boolean {
  if (!evidence?.hasPhotoHints) return false;
  const pairCount = pairCompare?.pairs?.length ?? 0;
  if (pairCount > 0) return false;
  const h = evidence.hints;
  return !h.hasBeforeLabel || !h.hasAfterLabel;
}

export function photoEvidenceContextIsVisible(
  evidence: PhotoEvidenceView | null | undefined,
  pairCompare?: PhotoPairCompareArtifact | null
): boolean {
  const pairCount = pairCompare?.pairs?.length ?? 0;
  // When pairs exist, BeforeAfterComparePane owns the photo UI.
  if (pairCount > 0) return false;
  if (evidence?.hasPhotoHints) return true;
  if (pairCompare?.enabled) return true;
  return false;
}

export function mapPhotoEvidenceFromReport(reportJson: unknown): {
  evidence: PhotoEvidenceView | null;
} {
  if (!reportJson || typeof reportJson !== "object") {
    return { evidence: null };
  }
  const report = reportJson as Record<string, unknown>;
  const raw = report.photoEvidence;
  if (!raw || typeof raw !== "object") return { evidence: null };
  const pe = raw as Record<string, unknown>;
  const hintsRaw =
    pe.hints && typeof pe.hints === "object"
      ? (pe.hints as Record<string, unknown>)
      : {};
  const hintSummary = Array.isArray(hintsRaw.hintSummary)
    ? hintsRaw.hintSummary.filter((x): x is string => typeof x === "string")
    : [];
  return {
    evidence: {
      hasPhotoHints: Boolean(pe.hasPhotoHints),
      hasPartsOrRepairs: Boolean(pe.hasPartsOrRepairs),
      duplicateFileHash: Boolean(pe.duplicateFileHash),
      summary: typeof pe.summary === "string" ? pe.summary : "",
      hints: {
        hasBeforeLabel: Boolean(hintsRaw.hasBeforeLabel),
        hasAfterLabel: Boolean(hintsRaw.hasAfterLabel),
        photoNumberCount:
          typeof hintsRaw.photoNumberCount === "number"
            ? hintsRaw.photoNumberCount
            : 0,
        pageMarkers:
          typeof hintsRaw.pageMarkers === "number" ? hintsRaw.pageMarkers : 0,
        totalPagesHint:
          typeof hintsRaw.totalPagesHint === "number"
            ? hintsRaw.totalPagesHint
            : null,
        hintSummary,
      },
    },
  };
}

export function PhotoEvidenceContextPanel({
  evidence,
  pairCompare,
  defaultOpen = false,
  className,
}: PhotoEvidenceContextPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!photoEvidenceContextIsVisible(evidence, pairCompare)) return null;

  const hints = evidence?.hints;
  const pairCount = pairCompare?.pairs?.length ?? 0;
  const needsCoach = photoEvidenceNeedsCoach(evidence, pairCompare);
  const pages =
    hints?.totalPagesHint != null
      ? String(hints.totalPagesHint)
      : hints?.pageMarkers
        ? `~${hints.pageMarkers} markers`
        : "—";

  const chips: Array<{ label: string; value: string; variant: ChipVariant }> = [
    {
      label: "Pages",
      value: pages,
      variant: "neutral",
    },
    {
      label: "Before label",
      value: hints?.hasBeforeLabel ? "Yes" : "No",
      variant: hints?.hasBeforeLabel ? "positive" : "warning",
    },
    {
      label: "After label",
      value: hints?.hasAfterLabel ? "Yes" : "No",
      variant: hints?.hasAfterLabel ? "positive" : "warning",
    },
    {
      label: "Paired compare",
      value: pairCount > 0 ? `${pairCount} pair(s)` : "None",
      variant: pairCount > 0 ? "positive" : "warning",
    },
  ];

  return (
    <Card className={cn("shadow-none", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-2 px-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start h-auto py-1.5 px-1 hover:bg-muted/60"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              )}
              <Camera className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
              <CardTitle className="text-xs font-medium text-left">
                Photo evidence
              </CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 ml-auto",
                  needsCoach
                    ? "border-amber-200 text-amber-800"
                    : "border-emerald-200 text-emerald-700"
                )}
              >
                {needsCoach ? "Needs labels" : "Hints OK"}
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
            {hints?.hintSummary?.length ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Hints: {hints.hintSummary.join(", ")}
              </p>
            ) : null}
            {evidence?.summary ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {evidence.summary}
              </p>
            ) : null}
            {needsCoach ? (
              <p className="text-[11px] text-amber-800 leading-snug">
                Photo page(s) look present, but Before/After labels are missing
                so multimodal pair compare cannot score work-done / clean /
                residual risk. Label images{" "}
                <span className="font-medium">Before</span> and{" "}
                <span className="font-medium">After</span> (or Photo #1 / #2) on
                the pack so QA can verify the repair visually.
              </p>
            ) : pairCount > 0 ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Pair compare ran — review axes in the Before/After panel below.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Photo hints recorded; open page 2+ in the viewer to inspect
                images.
              </p>
            )}
            {pairCompare?.summary && pairCount === 0 ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Pair engine: {pairCompare.summary}
              </p>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
