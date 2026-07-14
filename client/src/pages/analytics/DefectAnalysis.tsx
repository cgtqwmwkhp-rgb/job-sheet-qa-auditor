import { AnalyticsLayout } from "./AnalyticsLayout";
import { AnalyticsSkeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function pct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function formatHours(h: number): string {
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function buildTemplateStudioHref(input: {
  ruleId: string | null;
  reasonCode: string;
  severity: string;
  jobSheetId?: number;
}): string {
  const params = new URLSearchParams();
  if (input.jobSheetId != null) {
    params.set("fromJobSheet", String(input.jobSheetId));
  }
  if (input.ruleId) params.set("focusRule", input.ruleId);
  params.set("focusReason", input.reasonCode);
  params.set("severity", input.severity);
  return `/template-studio?${params.toString()}`;
}

function WorstRuleActions({
  rule,
  jobSheetIds,
}: {
  rule: {
    ruleId: string | null;
    reasonCode: string;
    severity: string;
    sampleFindingIds: number[];
  };
  jobSheetIds: number[];
}) {
  const primaryJobSheetId = jobSheetIds[0];

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {jobSheetIds.length > 0 ? (
        jobSheetIds.slice(0, 3).map(jobSheetId => (
          <Link key={jobSheetId} href={`/audits?id=${jobSheetId}`}>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <FileText className="h-3 w-3 mr-1" />
              JS-{jobSheetId}
            </Button>
          </Link>
        ))
      ) : rule.sampleFindingIds.length > 0 ? (
        <span className="text-xs text-muted-foreground">Resolving…</span>
      ) : (
        <span className="text-xs text-muted-foreground">No samples</span>
      )}
      <Link
        href={buildTemplateStudioHref({
          ruleId: rule.ruleId,
          reasonCode: rule.reasonCode,
          severity: rule.severity,
          jobSheetId: primaryJobSheetId,
        })}
      >
        <Button size="sm" variant="secondary" className="h-7 text-xs">
          <ExternalLink className="h-3 w-3 mr-1" />
          Studio
        </Button>
      </Link>
    </div>
  );
}

export default function DefectAnalysis() {
  const { startDate, endDate, site } = useAnalyticsFilters();
  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = trpc.analytics.getExceptionSummary.useQuery({ startDate, endDate, site });

  const { data: evidenceRoi } = trpc.analytics.getEvidenceRoi.useQuery({
    startDate,
    endDate,
    site,
  });

  const { data: dlqStatus } = trpc.analytics.getDlqStatus.useQuery(undefined, {
    retry: false,
  });

  const runRetry = trpc.analytics.runDlqRetry.useMutation({
    onSuccess: result => {
      toast.success(
        `DLQ retry: ${result.recovered} recovered, ${result.scheduled} scheduled, ${result.exhausted} exhausted`
      );
      refetch();
    },
    onError: err => toast.error(err.message || "DLQ retry failed"),
  });

  const ageingChart = useMemo(
    () =>
      (summary?.holdQueue.ageing ?? []).map(b => ({
        name: b.label,
        count: b.count,
        breached: b.breachedCount,
      })),
    [summary]
  );

  const sampleFindingIds = useMemo(
    () =>
      summary
        ? [
            ...Array.from(
              new Set(
                summary.overturns.worstRules.flatMap(r => r.sampleFindingIds)
              )
            ),
          ]
        : [],
    [summary]
  );

  const { data: sampleAudits } = trpc.auditActions.resolveSampleAudits.useQuery(
    { findingIds: sampleFindingIds },
    { enabled: sampleFindingIds.length > 0, staleTime: 60_000 }
  );

  const jobSheetsByRuleKey = useMemo(() => {
    const findingToSheet = new Map<number, number>();
    for (const s of sampleAudits?.samples ?? []) {
      findingToSheet.set(s.findingId, s.jobSheetId);
    }
    const map = new Map<string, number[]>();
    if (!summary) return map;
    for (const rule of summary.overturns.worstRules) {
      const ids: number[] = [];
      const seen = new Set<number>();
      for (const fid of rule.sampleFindingIds) {
        const js = findingToSheet.get(fid);
        if (js != null && !seen.has(js)) {
          seen.add(js);
          ids.push(js);
        }
      }
      map.set(rule.ruleKey, ids);
    }
    return map;
  }, [sampleAudits, summary]);

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Exception Management"
        description="Review SLAs, hold-queue ageing, and per-rule overturn rates."
      >
        <AnalyticsSkeleton />
      </AnalyticsLayout>
    );
  }

  if (error || !summary) {
    return (
      <AnalyticsLayout
        title="Exception Management"
        description="Review SLAs, hold-queue ageing, and per-rule overturn rates."
      >
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load</h2>
            <p className="text-muted-foreground max-w-md">
              {error?.message ?? "No exception data available."}
            </p>
          </div>
        </Card>
      </AnalyticsLayout>
    );
  }

  const { holdQueue, overturns, recurrence } = summary;

  return (
    <AnalyticsLayout
      title="Exception Management"
      description="Review SLAs, hold-queue ageing, recurrence, and per-rule overturn rates."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>On hold</CardDescription>
              <CardTitle className="text-3xl">
                {holdQueue.totalOnHold}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/hold-queue"
                className="text-sm text-primary hover:underline"
              >
                Open review queue
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>SLA breached</CardDescription>
              <CardTitle className="text-3xl text-destructive">
                {holdQueue.breachedCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Breach rate {pct(holdQueue.breachRate)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overturns (period)</CardDescription>
              <CardTitle className="text-3xl">
                {overturns.overturnedCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Overall overturn {pct(overturns.overallOverturnRate)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Recurrence clusters</CardDescription>
              <CardTitle className="text-3xl">
                {recurrence.clusterCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Threshold ≥ {recurrence.threshold} occurrences
            </CardContent>
          </Card>
        </div>

        {evidenceRoi && (
          <Card>
            <CardHeader>
              <CardTitle>Evidence ROI (comments + photos)</CardTitle>
              <CardDescription>{evidenceRoi.moneySignal}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Comment Majors
                  </p>
                  <p className="text-2xl font-semibold">
                    {evidenceRoi.commentMajorCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Photo Majors</p>
                  <p className="text-2xl font-semibold">
                    {evidenceRoi.photoMajorCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Coherence Majors
                  </p>
                  <p className="text-2xl font-semibold">
                    {evidenceRoi.coherenceMajorCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Cards blocked (est.)
                  </p>
                  <p className="text-2xl font-semibold text-destructive">
                    {evidenceRoi.cardsBlockedEstimate}
                  </p>
                </div>
              </div>
              {evidenceRoi.byRule.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Major</TableHead>
                      <TableHead>Overturn</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evidenceRoi.byRule.slice(0, 8).map(rule => (
                      <TableRow key={rule.ruleId}>
                        <TableCell className="font-mono text-xs">
                          {rule.ruleId}
                        </TableCell>
                        <TableCell>{rule.totalFindings}</TableCell>
                        <TableCell>{rule.majorCount}</TableCell>
                        <TableCell>{pct(rule.overturnRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Hold-queue ageing
              </CardTitle>
              <CardDescription>
                Age buckets for sheets currently in review_queue
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageingChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Items"
                    fill="hsl(var(--primary))"
                  />
                  <Bar
                    dataKey="breached"
                    name="Breached"
                    fill="hsl(var(--destructive))"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Breached / oldest holds
              </CardTitle>
              <CardDescription>Worst SLA items first</CardDescription>
            </CardHeader>
            <CardContent>
              {holdQueue.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Queue is clear.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sheet</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdQueue.items.slice(0, 8).map(item => (
                      <TableRow key={item.jobSheetId}>
                        <TableCell>
                          <Link
                            href={`/audits?id=${item.jobSheetId}`}
                            className="text-primary hover:underline"
                          >
                            {item.referenceNumber || `JS-${item.jobSheetId}`}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {item.siteInfo || "Unknown site"}
                          </div>
                        </TableCell>
                        <TableCell>{formatHours(item.ageHours)}</TableCell>
                        <TableCell>
                          {item.highestSeverity} / {item.slaHours}h
                        </TableCell>
                        <TableCell>
                          {item.breached ? (
                            <Badge variant="destructive">Breached</Badge>
                          ) : (
                            <Badge variant="secondary">
                              {formatHours(item.hoursUntilBreach)} left
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Worst rules by overturn rate</CardTitle>
            <CardDescription>
              Rules humans keep overturning — review quarterly for spec quality
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overturns.worstRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No overturned findings in this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="text-right">Findings</TableHead>
                    <TableHead className="text-right">Overturned</TableHead>
                    <TableHead className="text-right">Overturn rate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overturns.worstRules.map(rule => (
                    <TableRow key={rule.ruleKey}>
                      <TableCell className="font-mono text-sm">
                        {rule.ruleId || "—"}
                      </TableCell>
                      <TableCell>{rule.reasonCode}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{rule.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {rule.totalFindings}
                      </TableCell>
                      <TableCell className="text-right">
                        {rule.overturnedCount}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {pct(rule.overturnRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <WorstRuleActions
                          rule={rule}
                          jobSheetIds={
                            jobSheetsByRuleKey.get(rule.ruleKey) ?? []
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {recurrence.clusters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recurrence clusters</CardTitle>
              <CardDescription>
                Same rule + site repeating in the period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead className="text-right">Occurrences</TableHead>
                    <TableHead className="text-right">Job sheets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurrence.clusters.slice(0, 10).map(c => (
                    <TableRow key={c.key}>
                      <TableCell>{c.site}</TableCell>
                      <TableCell>{c.reasonCode}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {c.ruleId || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.occurrenceCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.distinctJobSheets}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Dead-letter queue</CardTitle>
              <CardDescription>
                Durable failed_jobs (PR-3) — light retry without live OCR/LLM
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={runRetry.isPending}
              onClick={() => runRetry.mutate({ limit: 25 })}
            >
              {runRetry.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run retry pass
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {dlqStatus ? (
              <p>
                {dlqStatus.totalFailed} failed · {dlqStatus.recoverable}{" "}
                recoverable · {dlqStatus.unrecoverable} unrecoverable
              </p>
            ) : (
              <p>DLQ status unavailable (admin-only or empty).</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AnalyticsLayout>
  );
}
