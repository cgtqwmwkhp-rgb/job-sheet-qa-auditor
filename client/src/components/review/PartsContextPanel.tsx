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
import { ChevronDown, ChevronRight, ExternalLink, Package, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Keep in sync with server MAX_PARTS_CATALOG_LINES. */
const MAX_PARTS_CATALOG_LINES = 10;

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

export type PartsCatalogLineOutcome = "match" | "mismatch" | "unavailable";

export interface PartsCatalogLineResult {
  partNumber: string;
  description: string;
  outcome: PartsCatalogLineOutcome;
  evidenceUrls: string[];
}

export interface PartsContextPanelProps {
  assessmentSignals: PartsAssessmentSignals | null | undefined;
  catalogSignals: PartsCatalogSignals | null | undefined;
  lineResults?: PartsCatalogLineResult[] | null;
  makeModel?: string | null;
  assessmentSummary?: string | null;
  catalogSummary?: string | null;
  jobSheetId?: number | null;
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

export function partsCatalogNeedsRecheck(
  catalog: PartsCatalogSignals | null | undefined
): boolean {
  if (!catalog?.enabled) return false;
  return (
    (catalog.unavailableCount ?? 0) > 0 || (catalog.mismatchCount ?? 0) > 0
  );
}

function resolveJobSheetIdFromSearch(search: string): number | null {
  const id = Number(new URLSearchParams(search).get("id"));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function resolveJobSheetIdFromCache(
  queryClient: ReturnType<typeof useQueryClient>
): number | null {
  const cached = queryClient.getQueriesData({
    predicate: query => {
      const key = query.queryKey;
      if (!Array.isArray(key) || !Array.isArray(key[0])) return false;
      const path = key[0] as unknown[];
      return path[0] === "audits" && path[1] === "getByJobSheet";
    },
  });
  for (const [key, data] of cached) {
    if (data && typeof data === "object" && "jobSheetId" in data) {
      const id = (data as { jobSheetId?: unknown }).jobSheetId;
      if (typeof id === "number" && id > 0) return id;
    }
    const input = (key as unknown[])[1] as
      | { input?: { jobSheetId?: unknown } }
      | undefined;
    const fromInput = input?.input?.jobSheetId;
    if (typeof fromInput === "number" && fromInput > 0) return fromInput;
  }
  return null;
}

function coerceLineResults(raw: unknown): PartsCatalogLineResult[] {
  if (!Array.isArray(raw)) return [];
  const out: PartsCatalogLineResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const partNumber =
      typeof row.partNumber === "string" ? row.partNumber.trim() : "";
    const description =
      typeof row.description === "string" ? row.description.trim() : "";
    const outcome = row.outcome;
    if (
      !partNumber ||
      !description ||
      (outcome !== "match" &&
        outcome !== "mismatch" &&
        outcome !== "unavailable")
    ) {
      continue;
    }
    const evidenceUrls = Array.isArray(row.evidenceUrls)
      ? row.evidenceUrls.filter(
          (u): u is string => typeof u === "string" && u.trim() !== ""
        )
      : [];
    out.push({ partNumber, description, outcome, evidenceUrls });
  }
  return out;
}

const outcomeChip: Record<
  PartsCatalogLineOutcome,
  { label: string; variant: ChipVariant }
> = {
  match: { label: "Match", variant: "positive" },
  mismatch: { label: "Mismatch", variant: "negative" },
  unavailable: { label: "Unavailable", variant: "negative" },
};

export function PartsContextPanel({
  assessmentSignals,
  catalogSignals,
  lineResults: lineResultsProp,
  makeModel,
  assessmentSummary: _assessmentSummary,
  catalogSummary,
  jobSheetId: jobSheetIdProp,
  hasFindings = false,
  defaultOpen = false,
  className,
}: PartsContextPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const search = useSearch();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const resolvedJobSheetId = useMemo(() => {
    if (typeof jobSheetIdProp === "number" && jobSheetIdProp > 0) {
      return jobSheetIdProp;
    }
    return (
      resolveJobSheetIdFromSearch(search) ??
      resolveJobSheetIdFromCache(queryClient)
    );
  }, [jobSheetIdProp, search, queryClient]);

  const auditQuery = trpc.audits.getByJobSheet.useQuery(
    { jobSheetId: resolvedJobSheetId ?? 0 },
    { enabled: (resolvedJobSheetId ?? 0) > 0 }
  );

  const lineResults = useMemo(() => {
    if (lineResultsProp && lineResultsProp.length > 0) return lineResultsProp;
    const report = auditQuery.data?.reportJson;
    if (!report || typeof report !== "object") return [];
    return coerceLineResults(
      (report as Record<string, unknown>).partsCatalogLineResults
    );
  }, [lineResultsProp, auditQuery.data?.reportJson]);

  const liveCatalogSignals = useMemo(() => {
    const report = auditQuery.data?.reportJson;
    if (!report || typeof report !== "object") return catalogSignals;
    const mapped = mapPartsContextFromReport(report).catalogSignals;
    return mapped ?? catalogSignals;
  }, [auditQuery.data?.reportJson, catalogSignals]);

  const liveCatalogSummary = useMemo(() => {
    const report = auditQuery.data?.reportJson;
    if (!report || typeof report !== "object") return catalogSummary ?? null;
    const mapped = mapPartsContextFromReport(report).catalogSummary;
    return mapped ?? catalogSummary ?? null;
  }, [auditQuery.data?.reportJson, catalogSummary]);

  const recheckMutation = trpc.audits.recheckPartsCatalog.useMutation({
    onSuccess: async () => {
      if (resolvedJobSheetId) {
        await utils.audits.getByJobSheet.invalidate({
          jobSheetId: resolvedJobSheetId,
        });
      }
      toast.success("Parts catalog re-checked");
    },
    onError: err => {
      toast.error(err.message || "Parts catalog re-check failed");
    },
  });

  if (!assessmentSignals && !liveCatalogSignals && !hasFindings) return null;

  const actionable = partsContextIsActionable(
    assessmentSignals,
    liveCatalogSignals,
    hasFindings
  );
  const needsRecheck = partsCatalogNeedsRecheck(liveCatalogSignals);

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
  if (liveCatalogSignals?.enabled) {
    chips.push({
      label: "Catalog",
      value: `${liveCatalogSignals.matchCount} match · ${liveCatalogSignals.mismatchCount} mismatch`,
      variant:
        liveCatalogSignals.mismatchCount > 0 ||
        liveCatalogSignals.unavailableCount > 0
          ? "negative"
          : "positive",
    });
    if ((liveCatalogSignals.unavailableCount ?? 0) > 0) {
      chips.push({
        label: "Unavailable",
        value: String(liveCatalogSignals.unavailableCount),
        variant: "negative",
      });
    }
    if (liveCatalogSignals.capped) {
      chips.push({
        label: "Capped",
        value: `max ${MAX_PARTS_CATALOG_LINES}`,
        variant: "neutral",
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
            {liveCatalogSummary ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {liveCatalogSummary}
              </p>
            ) : null}
            {assessmentSignals?.snippet ? (
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
                “{assessmentSignals.snippet}”
              </p>
            ) : null}

            {lineResults.length > 0 ? (
              <ul className="space-y-1.5">
                {lineResults.map(line => {
                  const chip = outcomeChip[line.outcome];
                  return (
                    <li
                      key={`${line.partNumber}:${line.description}`}
                      className="rounded border border-slate-100 px-2 py-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium truncate">
                            {line.partNumber}{" "}
                            <span className="font-normal text-muted-foreground">
                              — {line.description}
                            </span>
                          </p>
                          {line.evidenceUrls.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                              {line.evidenceUrls.map(url => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-sky-700 hover:underline truncate max-w-full"
                                  title={url}
                                >
                                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">
                                    {safeEvidenceHost(url)}
                                  </span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 shrink-0",
                            variantStyles[chip.variant]
                          )}
                        >
                          {chip.label}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {needsRecheck && resolvedJobSheetId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={recheckMutation.isPending}
                onClick={() =>
                  recheckMutation.mutate({ jobSheetId: resolvedJobSheetId })
                }
              >
                <RefreshCw
                  className={cn(
                    "h-3 w-3",
                    recheckMutation.isPending && "animate-spin"
                  )}
                />
                {recheckMutation.isPending ? "Re-checking…" : "Re-check catalog"}
              </Button>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function safeEvidenceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

export function mapPartsContextFromReport(reportJson: unknown): {
  assessmentSignals: PartsAssessmentSignals | null;
  catalogSignals: PartsCatalogSignals | null;
  lineResults: PartsCatalogLineResult[];
  assessmentSummary: string | null;
  catalogSummary: string | null;
} {
  if (!reportJson || typeof reportJson !== "object") {
    return {
      assessmentSignals: null,
      catalogSignals: null,
      lineResults: [],
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
    lineResults: coerceLineResults(report.partsCatalogLineResults),
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
