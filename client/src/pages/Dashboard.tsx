import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Loader2,
  Upload,
  ArrowRight,
  X,
} from "lucide-react";
import { SmartTip } from "@/components/SmartTip";
import { AuditTimeline } from "@/components/AuditTimeline";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { perfMark, perfClear, PERF_MARKS } from "@/lib/perf";
import { cn } from "@/lib/utils";
import { formatDateUk } from "@/lib/formatDateUk";
import { labelForReasonCode } from "@/components/review/holdQueueReasons";
import { useMemo, useState } from "react";
import type { Activity } from "@/lib/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DefectReasonRow = {
  ruleKey: string;
  name: string;
  reasonCode: string;
  ruleId: string | null;
  severity: string;
  count: number;
  overturned: number;
  overturnRate: number | null;
  sampleFindingIds: number[];
};

function buildAuditsFilterHref(input: {
  reasonCode: string;
  ruleId: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("reasonCode", input.reasonCode);
  if (input.ruleId) params.set("ruleId", input.ruleId);
  return `/audits?${params.toString()}`;
}

function KpiSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-24 animate-pulse rounded bg-[#EBE8E8]" />
      <div className="h-8 w-16 animate-pulse rounded bg-[#EBE8E8]" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#8A8787]" />
    </div>
  );
}

function relativeTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function dashboardPeriod() {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    site: "",
  };
}

const CHART_TOOLTIP = {
  backgroundColor: "#ffffff",
  border: "1px solid #ebe8e8",
  borderRadius: "8px",
  color: "#333030",
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const period = useMemo(() => dashboardPeriod(), []);
  const [selectedRuleKey, setSelectedRuleKey] = useState<string | null>(null);

  const navigateToAudit = (id: number) => {
    perfClear();
    perfMark(PERF_MARKS.AUDIT_DETAIL_CLICK);
    setLocation(`/audits?id=${id}`);
  };

  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = trpc.stats.dashboard.useQuery(undefined, { enabled: !!user });
  const { data: holdQueueSheets, isLoading: holdLoading } =
    trpc.jobSheets.list.useQuery(
      { status: "review_queue", limit: 5 },
      { enabled: !!user }
    );
  const { data: driftSummary, isLoading: driftLoading } =
    trpc.analytics.getDriftSummary.useQuery(period, { enabled: !!user });
  const { data: exceptionSummary, isLoading: exceptionLoading } =
    trpc.analytics.getExceptionSummary.useQuery(period, { enabled: !!user });
  const { data: driftAlertsData, isLoading: alertsLoading } =
    trpc.analytics.getDriftAlerts.useQuery(period, { enabled: !!user });
  const [healthTs] = useState(() => Date.now());
  const { data: health } = trpc.system.health.useQuery(
    { timestamp: healthTs },
    { enabled: !!user, refetchInterval: 60_000 }
  );

  const systemHealthy = health?.ok === true;

  const defectReasons: DefectReasonRow[] = useMemo(() => {
    const rules = exceptionSummary?.overturns.worstRules ?? [];
    return rules.slice(0, 6).map(rule => ({
      ruleKey: rule.ruleKey,
      name: labelForReasonCode(rule.reasonCode),
      reasonCode: rule.reasonCode,
      ruleId: rule.ruleId,
      severity: rule.severity,
      count: rule.totalFindings,
      overturned: rule.overturnedCount,
      overturnRate: rule.overturnRate,
      sampleFindingIds: rule.sampleFindingIds ?? [],
    }));
  }, [exceptionSummary]);

  const selectedDefect = useMemo(
    () => defectReasons.find(r => r.ruleKey === selectedRuleKey) ?? null,
    [defectReasons, selectedRuleKey]
  );

  const { data: recentJobSheets, isLoading: jobSheetsLoading } =
    trpc.jobSheets.list.useQuery(
      {
        limit: 5,
        ...(selectedDefect
          ? {
              reasonCode: selectedDefect.reasonCode,
              ...(selectedDefect.ruleId
                ? { ruleId: selectedDefect.ruleId }
                : {}),
            }
          : {}),
      },
      { enabled: !!user }
    );

  const sampleFindingIds = selectedDefect?.sampleFindingIds ?? [];
  const { data: sampleAudits, isLoading: samplesLoading } =
    trpc.auditActions.resolveSampleAudits.useQuery(
      { findingIds: sampleFindingIds },
      { enabled: !!user && sampleFindingIds.length > 0 }
    );

  const activityChart = useMemo(() => {
    const series = driftSummary?.series ?? [];
    if (series.length === 0) return [];
    const byDay = new Map<string, { audits: number; defects: number }>();
    for (const s of series) {
      for (const p of s.series) {
        const key = p.t.slice(0, 10);
        const prev = byDay.get(key) ?? { audits: 0, defects: 0 };
        byDay.set(key, {
          audits: Math.max(prev.audits, p.documentCount),
          defects: Math.max(prev.defects, p.defectCount),
        });
      }
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        day: day.slice(5),
        audits: v.audits,
        defects: v.defects,
      }));
  }, [driftSummary]);

  const recentActivity: Activity[] = useMemo(() => {
    return (recentJobSheets?.items ?? []).slice(0, 8).map(sheet => ({
      id: sheet.id,
      type:
        sheet.status === "review_queue"
          ? ("review" as const)
          : sheet.status === "failed"
            ? ("system" as const)
            : ("audit" as const),
      message: `${sheet.referenceNumber || `JS-${sheet.id}`} · ${sheet.status.replace(/_/g, " ")}`,
      time: relativeTime(sheet.createdAt),
    }));
  }, [recentJobSheets]);

  const alerts = driftAlertsData?.alerts ?? [];

  const getGreeting = () => {
    if (!user) return "Welcome back";
    const hour = new Date().getHours();
    const timeGreeting =
      hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";

    const criticalCount = statsData?.criticalIssues ?? 0;
    const queueCount = statsData?.reviewQueue ?? 0;
    const passRate = statsData?.passRate ?? "0";

    if (user.role === "admin") {
      return `${timeGreeting}, ${user.name}. ${criticalCount} critical issue${criticalCount !== 1 ? "s" : ""} need attention.`;
    }
    if (user.role === "qa_lead") {
      return `${timeGreeting}, ${user.name}. ${queueCount} item${queueCount !== 1 ? "s" : ""} in the hold queue.`;
    }
    return `${timeGreeting}, ${user.name}. Pass rate is ${passRate}%.`;
  };

  const stats = [
    {
      title: "Total Audits",
      value: statsLoading
        ? null
        : (statsData?.totalAudits ?? 0).toLocaleString(),
      icon: FileText,
      accent: "border-l-[#2868CE]",
      iconColor: "text-[#2868CE]",
      href: "/audits",
      tip: "Total number of job sheets processed by the system in the current period.",
    },
    {
      title: "Pass Rate",
      value: statsLoading ? null : `${statsData?.passRate ?? 0}%`,
      icon: CheckCircle2,
      accent: "border-l-primary",
      iconColor: "text-primary",
      href: "/analytics",
      tip: "Percentage of job sheets that met all Gold Standard criteria without manual intervention.",
      highlight: true,
    },
    {
      title: "Hold Queue",
      value: statsLoading ? null : (statsData?.reviewQueue ?? 0).toString(),
      icon: Clock,
      accent: "border-l-[#E8A317]",
      iconColor: "text-[#C48A00]",
      href: "/hold-queue",
      tip: "Job sheets flagged for manual review due to low confidence or ambiguity.",
    },
    {
      title: "Critical Issues",
      value: statsLoading ? null : (statsData?.criticalIssues ?? 0).toString(),
      icon: AlertTriangle,
      accent: "border-l-destructive",
      iconColor: "text-destructive",
      href: "/audits",
      tip: "Number of S0/S1 defects detected (e.g., missing safety signatures) requiring immediate attention.",
    },
  ];

  const hasNoAudits = !statsLoading && (statsData?.totalAudits ?? 0) === 0;
  const chartsLoading = driftLoading || exceptionLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {statsError ? (
          <Card className="border-destructive/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm font-medium text-destructive">
              Unable to load dashboard stats. Refresh and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetchStats()}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {/* Hero */}
        <section className="rounded-xl border border-[#EBE8E8] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-lg text-[#706D6D]">
                {statsLoading ? (
                  <span className="inline-block h-5 w-64 animate-pulse rounded bg-[#EBE8E8]" />
                ) : (
                  getGreeting()
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                  systemHealthy
                    ? "border-[#D4E86D] bg-[rgba(190,218,65,0.12)] text-[#4A4646]"
                    : "border-[#E8A317] bg-[rgba(232,163,23,0.12)] text-[#4A4646]"
                )}
              >
                <span className="relative flex h-2 w-2">
                  {systemHealthy ? (
                    <>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </>
                  ) : (
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E8A317]" />
                  )}
                </span>
                {health
                  ? systemHealthy
                    ? "System operational"
                    : "System degraded"
                  : "Checking health…"}
              </div>
              <Button
                asChild
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/upload">
                  <Upload className="mr-1.5 h-4 w-4" />
                  Upload job sheet
                </Link>
              </Button>
            </div>
          </div>

          {/* KPI row */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(stat => (
              <Link key={stat.title} href={stat.href}>
                <Card
                  className={cn(
                    "group cursor-pointer border-l-4 border-l-transparent bg-[#F9F9F9] shadow-none transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] hover:-translate-y-0.5 hover:border-l-primary hover:shadow-md",
                    stat.accent,
                    stat.highlight && "bg-white"
                  )}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#8A8787]">
                      {stat.title}
                      <SmartTip content={stat.tip} />
                    </CardTitle>
                    <stat.icon
                      className={cn("h-4 w-4", stat.iconColor)}
                      aria-hidden
                    />
                  </CardHeader>
                  <CardContent>
                    {stat.value === null ? (
                      <KpiSkeleton />
                    ) : (
                      <div className="flex items-end justify-between gap-2">
                        <p
                          className={cn(
                            "font-heading font-bold tracking-tight text-[#333030]",
                            stat.highlight ? "text-4xl" : "text-3xl"
                          )}
                        >
                          {stat.value}
                        </p>
                        <ArrowRight className="h-4 w-4 text-[#8A8787] opacity-0 transition-opacity duration-[var(--duration-normal)] group-hover:opacity-100" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Audit Activity</CardTitle>
              <CardDescription>
                Daily audit volume and defect counts (last 14 days).
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[280px]">
                {chartsLoading ? (
                  <ChartSkeleton />
                ) : activityChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityChart}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Bar
                        dataKey="audits"
                        fill="#beda41"
                        name="Audits"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="defects"
                        fill="#ba3737"
                        name="Defects"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    compact
                    icon={TrendingUp}
                    title={
                      hasNoAudits
                        ? "No audit activity yet"
                        : "Activity series unavailable"
                    }
                    description={
                      hasNoAudits
                        ? "Process job sheets to see daily volume and defect trends."
                        : "Audits exist, but drift analytics has no series for this 14-day window."
                    }
                    action={
                      hasNoAudits
                        ? { label: "Upload first job sheet", href: "/upload" }
                        : undefined
                    }
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-3">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>Top Defect Reasons</CardTitle>
                  <CardDescription>
                    Highest-impact rules by findings (last 14 days). Click a bar
                    to drill down.
                  </CardDescription>
                </div>
                {selectedDefect ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    onClick={() => setSelectedRuleKey(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                ) : null}
              </div>
              {selectedDefect ? (
                <Badge variant="secondary" className="w-fit gap-1 font-normal">
                  Filter: {selectedDefect.name}
                  {selectedDefect.ruleId ? ` · ${selectedDefect.ruleId}` : ""}
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-[220px]">
                {chartsLoading ? (
                  <ChartSkeleton />
                ) : defectReasons.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={defectReasons}
                      layout="vertical"
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={148}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP}
                        formatter={(value: number, _name, item) => {
                          const row = item?.payload as
                            | DefectReasonRow
                            | undefined;
                          const overturned = row?.overturned ?? 0;
                          return [
                            `${value} findings · ${overturned} overturned`,
                            "Findings",
                          ];
                        }}
                        labelFormatter={(label, payload) => {
                          const row = payload?.[0]?.payload as
                            | DefectReasonRow
                            | undefined;
                          if (!row) return String(label);
                          const ruleBit = row.ruleId ?? "no-rule";
                          return `${row.name} · ${ruleBit} · ${row.severity}`;
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Findings"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(data: { payload?: DefectReasonRow }) => {
                          const key = data?.payload?.ruleKey;
                          if (!key) return;
                          setSelectedRuleKey(prev =>
                            prev === key ? null : key
                          );
                        }}
                      >
                        {defectReasons.map(row => (
                          <Cell
                            key={row.ruleKey}
                            fill={
                              selectedRuleKey === row.ruleKey
                                ? "#1d4f9c"
                                : "#2868CE"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    compact
                    icon={AlertTriangle}
                    title={
                      hasNoAudits
                        ? "No defect data yet"
                        : "Defect breakdown unavailable"
                    }
                    description={
                      hasNoAudits
                        ? "Defect breakdown appears after audits complete."
                        : "Audits exist, but exception analytics has no overturn rules for this window."
                    }
                    action={
                      hasNoAudits
                        ? { label: "Upload first job sheet", href: "/upload" }
                        : undefined
                    }
                  />
                )}
              </div>

              {selectedDefect ? (
                <div className="rounded-lg border bg-[#F9F9F9] p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {selectedDefect.severity}
                    </Badge>
                    {selectedDefect.ruleId ? (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {selectedDefect.ruleId}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedDefect.count} findings
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedDefect.overturned} overturned
                    </Badge>
                    {selectedDefect.overturnRate != null ? (
                      <Badge variant="outline" className="text-[10px]">
                        {(selectedDefect.overturnRate * 100).toFixed(0)}%
                        overturn rate
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {samplesLoading ? (
                      <span className="text-xs text-muted-foreground">
                        Resolving sample audits…
                      </span>
                    ) : (sampleAudits?.jobSheetIds ?? []).length > 0 ? (
                      sampleAudits!.jobSheetIds.slice(0, 5).map(jobSheetId => (
                        <Button
                          key={jobSheetId}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => navigateToAudit(jobSheetId)}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          JS-{jobSheetId}
                        </Button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No sample audits for this rule.
                      </span>
                    )}
                  </div>
                  <Button asChild size="sm" className="h-8 w-full text-xs">
                    <Link
                      href={buildAuditsFilterHref({
                        reasonCode: selectedDefect.reasonCode,
                        ruleId: selectedDefect.ruleId,
                      })}
                    >
                      View all matching audits
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2">
            <Tabs defaultValue="recent" className="space-y-4">
              <TabsList>
                <TabsTrigger value="recent">Recent Audits</TabsTrigger>
                <TabsTrigger value="hold">
                  Hold Queue
                  {/* PX-082 — KPI count, not the preview page length (limit 5) */}
                  {(statsData?.reviewQueue ?? 0) > 0 ? (
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                      {statsData!.reviewQueue}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="alerts">
                  System Alerts
                  {alerts.length > 0 ? (
                    <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
                      {alerts.length}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="recent" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle>Recent Audits</CardTitle>
                      <CardDescription>
                        {selectedDefect
                          ? `Filtered by ${selectedDefect.name}${
                              selectedDefect.ruleId
                                ? ` · ${selectedDefect.ruleId}`
                                : ""
                            }.`
                          : "Latest job sheets processed by the system."}
                      </CardDescription>
                    </div>
                    {!jobSheetsLoading &&
                    recentJobSheets &&
                    recentJobSheets.items.length > 0 ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={
                            selectedDefect
                              ? buildAuditsFilterHref({
                                  reasonCode: selectedDefect.reasonCode,
                                  ruleId: selectedDefect.ruleId,
                                })
                              : "/audits"
                          }
                        >
                          View all
                        </Link>
                      </Button>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    {jobSheetsLoading ? (
                      <div className="space-y-3 py-2">
                        {[1, 2, 3].map(row => (
                          <div
                            key={row}
                            className="flex items-center gap-4 rounded-lg border p-4"
                          >
                            <div className="h-10 w-10 animate-pulse rounded-full bg-[#EBE8E8]" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-32 animate-pulse rounded bg-[#EBE8E8]" />
                              <div className="h-3 w-48 animate-pulse rounded bg-[#EBE8E8]" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : recentJobSheets && recentJobSheets.items.length > 0 ? (
                      <div className="space-y-3">
                        {recentJobSheets.items.map(sheet => (
                          <div
                            key={sheet.id}
                            className="flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors duration-[var(--duration-normal)] hover:bg-[#F5F4F4]"
                            onClick={() => navigateToAudit(sheet.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e =>
                              e.key === "Enter" && navigateToAudit(sheet.id)
                            }
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-full",
                                  sheet.status === "failed"
                                    ? "bg-red-100 text-red-600"
                                    : sheet.status === "review_queue"
                                      ? "bg-orange-100 text-orange-600"
                                      : "bg-[rgba(190,218,65,0.2)] text-[#6B7F1E]"
                                )}
                              >
                                {sheet.status === "failed" ? (
                                  <AlertTriangle className="h-5 w-5" />
                                ) : sheet.status === "review_queue" ? (
                                  <Clock className="h-5 w-5" />
                                ) : (
                                  <CheckCircle2 className="h-5 w-5" />
                                )}
                              </div>
                              <div>
                                <p className="font-mono font-medium">
                                  {sheet.referenceNumber || `JS-${sheet.id}`}
                                </p>
                                <p className="text-sm text-[#706D6D]">
                                  {sheet.fileName} •{" "}
                                  {sheet.siteInfo || "No site info"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={cn(
                                  "text-sm font-semibold",
                                  sheet.status === "failed"
                                    ? "text-red-600"
                                    : sheet.status === "review_queue"
                                      ? "text-orange-600"
                                      : sheet.status === "completed"
                                        ? "text-[#6B7F1E]"
                                        : "text-[#706D6D]"
                                )}
                              >
                                {sheet.status.toUpperCase().replace("_", " ")}
                              </p>
                              <p className="text-xs text-[#8A8787]">
                                {formatDateUk(sheet.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : selectedDefect ? (
                      <EmptyState
                        compact
                        icon={AlertTriangle}
                        title="No matching audits"
                        description={`No recent job sheets with ${selectedDefect.name}${
                          selectedDefect.ruleId
                            ? ` (${selectedDefect.ruleId})`
                            : ""
                        }.`}
                        action={{
                          label: "Clear filter",
                          onClick: () => setSelectedRuleKey(null),
                        }}
                      />
                    ) : (
                      <EmptyState
                        icon={FileText}
                        title="No job sheets yet"
                        description="Upload your first job sheet to start automated QA auditing."
                        action={{
                          label: "Upload job sheet",
                          href: "/upload",
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="hold" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle>Hold Queue</CardTitle>
                      <CardDescription>
                        Items requiring manual review.
                      </CardDescription>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/hold-queue">Open queue</Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {holdLoading ? (
                      <ChartSkeleton />
                    ) : holdQueueSheets && holdQueueSheets.items.length > 0 ? (
                      <div className="space-y-3">
                        {holdQueueSheets.items.map(sheet => (
                          <div
                            key={sheet.id}
                            className="flex cursor-pointer items-center justify-between rounded-lg border border-l-4 border-l-[#E8A317] p-4 transition-colors duration-[var(--duration-normal)] hover:bg-[#F5F4F4]"
                            onClick={() => setLocation(`/hold-queue`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e =>
                              e.key === "Enter" && setLocation("/hold-queue")
                            }
                          >
                            <div>
                              <p className="font-mono font-medium">
                                {sheet.referenceNumber || `JS-${sheet.id}`}
                              </p>
                              <p className="text-sm text-[#706D6D]">
                                {sheet.fileName} · {sheet.siteInfo || "No site"}
                              </p>
                            </div>
                            <p className="text-xs text-[#8A8787]">
                              {relativeTime(sheet.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        icon={Clock}
                        title="Hold queue is clear"
                        description="No items are waiting for manual review right now."
                        action={{
                          label: "Open hold queue",
                          href: "/hold-queue",
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="alerts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>System Alerts</CardTitle>
                    <CardDescription>
                      Drift and operational warnings (last 14 days).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {alertsLoading ? (
                      <ChartSkeleton />
                    ) : alerts.length > 0 ? (
                      <div className="space-y-3">
                        {alerts.slice(0, 8).map(alert => (
                          <div
                            key={alert.id}
                            className="flex items-start justify-between gap-3 rounded-lg border p-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    alert.severity === "critical"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {alert.severity}
                                </Badge>
                                <p className="truncate text-sm font-medium">
                                  {alert.label}
                                </p>
                              </div>
                              <p className="mt-1 text-sm text-[#706D6D]">
                                {alert.message}
                              </p>
                            </div>
                            <Button asChild variant="ghost" size="sm">
                              <Link href="/analytics/drift">Review</Link>
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        icon={AlertTriangle}
                        title="No active alerts"
                        description="System notifications will appear here when action is needed."
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="col-span-1">
            {recentActivity.length > 0 ? (
              <AuditTimeline activities={recentActivity} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-medium">
                    Audit History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    compact
                    icon={FileText}
                    title="No recent activity"
                    description="Processed job sheets will appear in this timeline."
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
