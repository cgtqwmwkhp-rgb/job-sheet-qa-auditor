import DashboardLayout from "@/components/DashboardLayout";
import { DocOutcomeBadge } from "@/components/DocOutcomeBadge";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/loading-skeleton";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { mapHasMajorFailsFromReport } from "@/components/review/mapAuditPolicy";
import {
  isActiveJobSheetStatus,
  isTerminalJobSheetStatus,
} from "@shared/processingProgress";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: number;
  referenceNumber: string;
  fileName: string;
  siteInfo: string | null;
  status: string;
  createdAt: Date | string;
  auditResult: string | null;
  docQualityScore: number | null;
  hasMajorFails: boolean;
};

function JobSheetStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "completed") {
    return (
      <Badge className="bg-[rgba(190,218,65,0.2)] text-[#333030] border-[#BEDA41]/40">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Completed
      </Badge>
    );
  }
  if (normalized === "review_queue") {
    return (
      <Badge variant="outline" className="border-amber-400/60 text-amber-800">
        <Clock className="h-3 w-3 mr-1" />
        Review queue
      </Badge>
    );
  }
  if (normalized === "failed") {
    return (
      <Badge variant="destructive">
        <AlertCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  }
  if (normalized === "processing" || normalized === "pending") {
    return (
      <Badge variant="outline" className="border-[#EBE8E8] text-[#706D6D]">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        {normalized === "processing" ? "Processing" : "Pending"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-[#EBE8E8] text-[#706D6D]">
      {status.replace("_", " ")}
    </Badge>
  );
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQueryState] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const setQuery = (next: string) => {
    setQueryState(next);
    setHighlightedIndex(0);
  };

  const {
    data: jobSheets,
    isLoading: sheetsLoading,
    isError: sheetsError,
    refetch: refetchSheets,
  } = trpc.jobSheets.list.useQuery({ limit: 100 });

  const {
    data: auditResults,
    isLoading: auditsLoading,
    isError: auditsError,
    refetch: refetchAudits,
  } = trpc.audits.list.useQuery({ limit: 100 });

  const isLoading = sheetsLoading || auditsLoading;
  const loadError = sheetsError || auditsError;

  const auditByJobSheetId = useMemo(() => {
    const map = new Map<
      number,
      { result: string; docQualityScore: number | null; hasMajorFails: boolean }
    >();
    for (const ar of auditResults ?? []) {
      const reportJson = ar.reportJson as Record<string, unknown> | null;
      const docScore =
        typeof (reportJson as { documentationQualityScore?: unknown })
          ?.documentationQualityScore === "number"
          ? ((reportJson as { documentationQualityScore: number })
              .documentationQualityScore as number)
          : null;
      map.set(ar.jobSheetId, {
        result: ar.result,
        docQualityScore: docScore,
        hasMajorFails: mapHasMajorFailsFromReport(reportJson),
      });
    }
    return map;
  }, [auditResults]);

  const allResults = useMemo<SearchResult[]>(() => {
    return (jobSheets ?? []).map(sheet => {
      const audit = auditByJobSheetId.get(sheet.id);
      return {
        id: sheet.id,
        referenceNumber: sheet.referenceNumber || `JS-${sheet.id}`,
        fileName: sheet.fileName,
        siteInfo: sheet.siteInfo,
        status: sheet.status,
        createdAt: sheet.createdAt,
        auditResult: audit?.result ?? null,
        docQualityScore: audit?.docQualityScore ?? null,
        hasMajorFails: audit?.hasMajorFails ?? false,
      };
    });
  }, [jobSheets, auditByJobSheetId]);

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allResults.slice(0, 50);
    return allResults
      .filter(item => {
        const hay = [
          item.referenceNumber,
          item.fileName,
          item.siteInfo ?? "",
          item.status,
          item.auditResult ?? "",
          String(item.id),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [allResults, query]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const activeHighlight =
    filteredResults.length === 0
      ? -1
      : Math.min(Math.max(highlightedIndex, 0), filteredResults.length - 1);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (filteredResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex(i => {
          const cur = Math.min(Math.max(i, 0), filteredResults.length - 1);
          return cur < filteredResults.length - 1 ? cur + 1 : 0;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex(i => {
          const cur = Math.min(Math.max(i, 0), filteredResults.length - 1);
          return cur > 0 ? cur - 1 : filteredResults.length - 1;
        });
      } else if (e.key === "Enter" && activeHighlight >= 0) {
        e.preventDefault();
        const item = filteredResults[activeHighlight];
        if (item) setLocation(`/audits?id=${item.id}`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredResults, activeHighlight, setLocation]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight text-[#333030]">
            Search &amp; Archive
          </h1>
          <p className="text-[#706D6D] mt-1">
            Search all audited job sheets by reference, filename, site, or
            outcome. Press{" "}
            <kbd className="px-1.5 py-0.5 rounded border border-[#EBE8E8] bg-white text-xs font-mono">
              /
            </kbd>{" "}
            to focus, arrow keys to navigate, Enter to open.
          </p>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#706D6D]" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search job sheets, sites, references…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-14 pl-12 pr-4 text-base bg-white border-[#EBE8E8] shadow-sm focus-visible:ring-primary"
            aria-label="Search job sheets"
            autoComplete="off"
          />
        </div>

        {isLoading ? (
          <Card className="border-[#EBE8E8] bg-white">
            <CardContent className="p-0">
              <ListSkeleton items={5} />
            </CardContent>
          </Card>
        ) : loadError ? (
          <Card className="border-destructive/30 bg-white">
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="font-medium text-[#333030]">
                Unable to load search results
              </p>
              <p className="text-sm text-[#706D6D]">
                Check your connection, then retry.
              </p>
              <button
                type="button"
                className="text-sm font-medium text-[#333030] underline underline-offset-2"
                onClick={() => {
                  void refetchSheets();
                  void refetchAudits();
                }}
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : allResults.length === 0 ? (
          <Card className="border-[#EBE8E8] bg-white">
            <CardContent className="py-4">
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload job sheets to build your searchable archive of audit results."
                action={{ label: "Go to upload", href: "/upload" }}
              />
            </CardContent>
          </Card>
        ) : filteredResults.length === 0 ? (
          <Card className="border-dashed border-[#EBE8E8] bg-white">
            <CardContent className="py-4">
              <EmptyState
                compact
                icon={SearchIcon}
                title="No matches"
                description="Try a different reference, filename, or site name."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-[#706D6D]">
              {filteredResults.length} result
              {filteredResults.length !== 1 ? "s" : ""}
              {query.trim() ? ` for “${query.trim()}”` : " (showing recent)"}
            </p>
            <ul
              className="space-y-2"
              role="listbox"
              aria-label="Search results"
            >
              {filteredResults.map((item, index) => {
                const isHighlighted = index === activeHighlight;
                const showOutcome =
                  item.auditResult &&
                  isTerminalJobSheetStatus(item.status as never);

                return (
                  <li key={item.id} role="option" aria-selected={isHighlighted}>
                    <Link href={`/audits?id=${item.id}`}>
                      <Card
                        className={cn(
                          "cursor-pointer border-[#EBE8E8] bg-white transition-all hover:shadow-sm",
                          isHighlighted &&
                            "ring-2 ring-primary bg-[rgba(190,218,65,0.08)] border-primary/30"
                        )}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                              item.status === "failed"
                                ? "bg-red-100 text-red-600"
                                : item.status === "review_queue"
                                  ? "bg-amber-100 text-amber-700"
                                  : item.status === "completed"
                                    ? "bg-[rgba(190,218,65,0.25)] text-[#333030]"
                                    : isActiveJobSheetStatus(
                                          item.status as never
                                        )
                                      ? "bg-[#DBEAFE] text-[#2868CE]"
                                      : "bg-[#F5F4F4] text-[#706D6D]"
                            )}
                          >
                            {isActiveJobSheetStatus(item.status as never) ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : item.status === "failed" ? (
                              <AlertCircle className="w-5 h-5" />
                            ) : item.status === "review_queue" ? (
                              <Clock className="w-5 h-5" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-[#333030]">
                                {item.referenceNumber}
                              </span>
                              <JobSheetStatusBadge status={item.status} />
                            </div>
                            <p className="text-sm text-[#706D6D] truncate mt-0.5">
                              {item.fileName}
                              {item.siteInfo ? ` · ${item.siteInfo}` : ""}
                            </p>
                            <p className="text-xs text-[#706D6D] mt-0.5">
                              {new Date(item.createdAt).toLocaleDateString(
                                undefined,
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                            {showOutcome ? (
                              <DocOutcomeBadge
                                result={item.auditResult}
                                showDocsHint={false}
                              />
                            ) : null}
                            {item.hasMajorFails && (
                              <Badge variant="destructive" className="text-xs">
                                Major
                              </Badge>
                            )}
                            {item.docQualityScore != null && (
                              <span
                                className={cn(
                                  "text-xs font-semibold tabular-nums px-2 py-0.5 rounded",
                                  item.docQualityScore >= 80
                                    ? "bg-emerald-50 text-emerald-700"
                                    : item.docQualityScore >= 50
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-red-50 text-red-700"
                                )}
                              >
                                Doc {item.docQualityScore}%
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
