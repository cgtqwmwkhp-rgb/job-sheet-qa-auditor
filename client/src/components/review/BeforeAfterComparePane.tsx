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
import { PdfPageThumb } from "@/components/review/PdfPageThumb";

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
  /** Resolve true only after server mutate succeeds (mutate-then-commit). */
  onConfirmPair?: (pairIndex: number) => void | Promise<boolean | "deferred">;
  onOverridePair?: (pairIndex: number) => void | Promise<boolean | "deferred">;
  /** Server-resolved findings hydrate pair state after reopening a review. */
  resolvedDecisions?: Record<number, "confirmed" | "overridden">;
  onFocusPage?: (page: number) => void;
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

const EMPTY_AXES: PhotoPairAxes = {
  work_done: "inconclusive",
  repaired_properly: "inconclusive",
  clean: "inconclusive",
  residual_risk: "inconclusive",
};

function isAxisVerdict(v: unknown): v is AxisVerdict {
  return v === "pass" || v === "fail" || v === "inconclusive";
}

function normalizeAxes(raw: unknown): PhotoPairAxes {
  if (!raw || typeof raw !== "object") return { ...EMPTY_AXES };
  const o = raw as Record<string, unknown>;
  return {
    work_done: isAxisVerdict(o.work_done) ? o.work_done : "inconclusive",
    repaired_properly: isAxisVerdict(o.repaired_properly)
      ? o.repaired_properly
      : "inconclusive",
    clean: isAxisVerdict(o.clean) ? o.clean : "inconclusive",
    residual_risk: isAxisVerdict(o.residual_risk)
      ? o.residual_risk
      : "inconclusive",
  };
}

/** True when work_done or repaired_properly failed (actionable pair fail). */
export function pairHasActionableFail(
  pair: Pick<PhotoPairResult, "axes"> | null | undefined
): boolean {
  const axes = pair?.axes;
  if (!axes) return false;
  return axes.work_done === "fail" || axes.repaired_properly === "fail";
}

export function photoPairHasActionableFail(
  artifact: PhotoPairCompareArtifact | null | undefined
): boolean {
  if (!artifact || !Array.isArray(artifact.pairs)) return false;
  return artifact.pairs.some(p => pairHasActionableFail(p));
}

export function BeforeAfterComparePane({
  artifact,
  documentUrl,
  defaultOpen = false,
  className,
  onConfirmPair,
  onOverridePair,
  resolvedDecisions,
  onFocusPage,
}: BeforeAfterComparePaneProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [decisions, setDecisions] = useState<
    Record<number, "confirmed" | "overridden">
  >({});
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);

  const pairs = Array.isArray(artifact?.pairs) ? artifact!.pairs : [];
  if (!artifact || pairs.length === 0) return null;

  const hasFail = pairs.some(p => pairHasActionableFail(p));

  const commitDecision = async (
    idx: number,
    kind: "confirmed" | "overridden",
    handler?: (pairIndex: number) => void | Promise<boolean | "deferred">
  ) => {
    if (decisions[idx] || pendingIdx != null) return;
    setPendingIdx(idx);
    try {
      if (handler) {
        const ok = await Promise.resolve(handler(idx));
        if (ok === "deferred") return;
        // void handlers (legacy) → treat as success after settle
        if (ok === false) {
          toast.error("Failed to persist pair decision");
          return;
        }
      } else if (kind === "confirmed") {
        toast.success(
          "Pair confirmed — incomplete repair catch retained (cost avoided)."
        );
      } else {
        toast.message("Pair overridden — finding overturned for this review.");
      }
      setDecisions(d => ({ ...d, [idx]: kind }));
    } finally {
      setPendingIdx(null);
    }
  };

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
            {pairs.map((pair, idx) => {
              const decision = decisions[idx] ?? resolvedDecisions?.[idx];
              const axes = pair.axes ?? EMPTY_AXES;
              const beforePage = pair.beforePage ?? 1;
              const afterPage = pair.afterPage ?? 1;
              return (
                <div
                  key={idx}
                  className="rounded-md border border-border p-2 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <PdfPageThumb
                      documentUrl={documentUrl}
                      page={beforePage}
                      label={`Before · p${pair.beforePage ?? "?"}`}
                      onClick={
                        onFocusPage ? () => onFocusPage(beforePage) : undefined
                      }
                    />
                    <PdfPageThumb
                      documentUrl={documentUrl}
                      page={afterPage}
                      label={`After · p${pair.afterPage ?? "?"}`}
                      onClick={
                        onFocusPage ? () => onFocusPage(afterPage) : undefined
                      }
                    />
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
                          verdictStyle(axes[axis])
                        )}
                      >
                        {axisLabels[axis]}: {axes[axis]}
                      </Badge>
                    ))}
                    <Badge variant="outline" className="text-[10px]">
                      {pair.confidenceBand}{" "}
                      {Math.round((pair.confidence ?? 0) * 100)}%
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
                      disabled={!!decision || pendingIdx === idx}
                      onClick={() =>
                        void commitDecision(idx, "confirmed", onConfirmPair)
                      }
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!!decision || pendingIdx === idx}
                      onClick={() =>
                        void commitDecision(idx, "overridden", onOverridePair)
                      }
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

/** Map a compare pair to open PHOTO-C012 / PHOTO-C013 findings (ruleId + page). */
export function resolvePhotoPairFindings<
  T extends {
    ruleId?: string | null;
    pageNumber?: number;
    box?: { page: number };
    status?: string;
  },
>(findings: T[], pair: PhotoPairResult, includeResolved = false): T[] {
  const c012Page = pair.afterPage ?? pair.beforePage ?? 1;
  const c013Page = pair.afterPage ?? 1;
  const candidates = findings.filter(
    f =>
      (includeResolved || f.status !== "passed") &&
      (f.ruleId === "PHOTO-C012" || f.ruleId === "PHOTO-C013")
  );
  const byPage = candidates.filter(f => {
    const page = f.pageNumber ?? f.box?.page ?? 1;
    if (f.ruleId === "PHOTO-C012") return page === c012Page;
    if (f.ruleId === "PHOTO-C013") return page === c013Page;
    return false;
  });
  // Prefer page match; fall back to any open PHOTO-C012/C013 when pages differ.
  return byPage.length > 0 ? byPage : candidates;
}

export function mapPhotoPairCompareFromReport(
  reportJson: unknown
): PhotoPairCompareArtifact | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const report = reportJson as Record<string, unknown>;
  const art = report.photoPairCompare;
  if (!art || typeof art !== "object") return null;
  const raw = art as Record<string, unknown>;
  if (!Array.isArray(raw.pairs)) return null;

  const pairs: PhotoPairResult[] = raw.pairs
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map(p => ({
      beforePage:
        typeof p.beforePage === "number"
          ? p.beforePage
          : p.beforePage == null
            ? null
            : Number(p.beforePage) || null,
      afterPage:
        typeof p.afterPage === "number"
          ? p.afterPage
          : p.afterPage == null
            ? null
            : Number(p.afterPage) || null,
      axes: normalizeAxes(p.axes),
      confidence: typeof p.confidence === "number" ? p.confidence : 0,
      confidenceBand:
        p.confidenceBand === "high" ||
        p.confidenceBand === "medium" ||
        p.confidenceBand === "low"
          ? p.confidenceBand
          : "low",
      reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
    }));

  return {
    enabled: Boolean(raw.enabled),
    provider: typeof raw.provider === "string" ? raw.provider : "unknown",
    model: typeof raw.model === "string" ? raw.model : "unknown",
    pairs,
    pageRoles: Array.isArray(raw.pageRoles)
      ? (raw.pageRoles as PhotoPairCompareArtifact["pageRoles"])
      : [],
    summary: typeof raw.summary === "string" ? raw.summary : "",
    processingTimeMs:
      typeof raw.processingTimeMs === "number" ? raw.processingTimeMs : 0,
  };
}
