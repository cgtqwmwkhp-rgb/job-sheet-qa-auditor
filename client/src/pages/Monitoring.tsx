/**
 * Monitoring Dashboard
 *
 * Live system health, AI providers, DLQ, drift alerts, and FinOps throughput.
 * No hardcoded performance sample data — unavailable metrics are labeled honestly.
 */

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity,
  AlertCircle,
  Clock,
  Database,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Server,
  Zap,
  Webhook,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Link } from "wouter";

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #ebe8e8",
  borderRadius: "8px",
  color: "#333030",
};

function monitoringPeriod() {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    site: "",
  };
}

export default function Monitoring() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [healthTs, setHealthTs] = useState(() => Date.now());
  const { hasRole } = useAuth();
  const period = useMemo(() => monitoringPeriod(), []);
  const isAdmin = hasRole(["admin"]);
  const canFinOps = hasRole(["admin", "qa_lead"]);

  const {
    data: health,
    isLoading: healthLoading,
    isError: healthError,
    error: healthErr,
    refetch: refetchHealth,
    isFetching: healthFetching,
  } = trpc.system.health.useQuery({ timestamp: healthTs });

  const {
    data: version,
    isLoading: versionLoading,
    isError: versionError,
    error: versionErr,
    refetch: refetchVersion,
    isFetching: versionFetching,
  } = trpc.system.version.useQuery();

  const { data: statsData, refetch: refetchStats } =
    trpc.stats.dashboard.useQuery();

  const { data: aiHealth, refetch: refetchAi } = trpc.ai.healthCheck.useQuery(
    undefined,
    { retry: false }
  );

  const { data: driftAlertsData, refetch: refetchAlerts } =
    trpc.analytics.getDriftAlerts.useQuery(period, { retry: false });

  const { data: dlqStatus, refetch: refetchDlq } =
    trpc.analytics.getDlqStatus.useQuery(undefined, {
      enabled: isAdmin,
      retry: false,
    });

  const { data: costSummary, refetch: refetchCosts } =
    trpc.system.apiCostSummary.useQuery(
      { windowHours: 48, dayLimit: 14 },
      { enabled: canFinOps, retry: false }
    );

  const {
    data: deliveryReceipts,
    isError: deliveryReceiptsError,
    refetch: refetchReceipts,
  } = trpc.webhooks.deliveryReceipts.useQuery(
    { limit: 15, event: "audit.completed" },
    { enabled: canFinOps, retry: false }
  );

  const { data: allSheets, refetch: refetchSheets } =
    trpc.jobSheets.list.useQuery({
      limit: 100,
    });

  const isInitialLoading = healthLoading || versionLoading;
  const isRefreshing = healthFetching || versionFetching;
  const hasQueryError = healthError || versionError;

  const statusData = useMemo(() => {
    const counts = {
      completed: 0,
      processing: 0,
      failed: 0,
      review_queue: 0,
      pending: 0,
    };
    for (const sheet of allSheets?.items ?? []) {
      if (sheet.status === "completed") counts.completed += 1;
      else if (sheet.status === "processing") counts.processing += 1;
      else if (sheet.status === "failed") counts.failed += 1;
      else if (sheet.status === "review_queue") counts.review_queue += 1;
      else counts.pending += 1;
    }
    return [
      { name: "Completed", value: counts.completed, color: "#5a7a1a" },
      { name: "Processing", value: counts.processing, color: "#2563eb" },
      { name: "Failed", value: counts.failed, color: "#ba3737" },
      { name: "Hold", value: counts.review_queue, color: "#ca8a04" },
      { name: "Pending", value: counts.pending, color: "#8A8787" },
    ].filter(d => d.value > 0);
  }, [allSheets]);

  const throughputData = useMemo(() => {
    return (costSummary?.byDay ?? [])
      .slice()
      .reverse()
      .map(row => ({
        day: row.period.slice(5),
        calls: row.callCount,
        jobSheets: row.jobSheetsReviewed,
      }));
  }, [costSummary]);

  const operationalIssues = useMemo(() => {
    const items: {
      id: string;
      message: string;
      detail: string;
      severity: "critical" | "warning" | "info";
    }[] = [];

    for (const job of dlqStatus?.recoverableJobs?.slice(0, 8) ?? []) {
      items.push({
        id: `dlq-${job.id}`,
        message: `DLQ: ${job.stage} failed for JS-${job.jobSheetId}`,
        detail: job.errorMessage,
        severity: "critical",
      });
    }

    for (const alert of (driftAlertsData?.alerts ?? []).slice(0, 8)) {
      items.push({
        id: alert.id,
        message: alert.message,
        detail: alert.suggestedAction,
        severity: alert.severity,
      });
    }

    if (aiHealth?.mistralOcr && !aiHealth.mistralOcr.valid) {
      items.push({
        id: "ai-mistral",
        message: "Mistral OCR unhealthy",
        detail: aiHealth.mistralOcr.error || "Validation failed",
        severity: "warning",
      });
    }

    return items;
  }, [dlqStatus, driftAlertsData, aiHealth]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setHealthTs(Date.now());
      void refetchHealth();
      void refetchVersion();
      void refetchStats();
      void refetchAi();
      void refetchAlerts();
      void refetchSheets();
      if (isAdmin) void refetchDlq();
      if (canFinOps) {
        void refetchCosts();
        void refetchReceipts();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [
    autoRefresh,
    refetchHealth,
    refetchVersion,
    refetchStats,
    refetchAi,
    refetchAlerts,
    refetchSheets,
    refetchDlq,
    refetchCosts,
    refetchReceipts,
    isAdmin,
    canFinOps,
  ]);

  const handleManualRefresh = () => {
    setHealthTs(Date.now());
    void refetchHealth();
    void refetchVersion();
    void refetchStats();
    void refetchAi();
    void refetchAlerts();
    void refetchSheets();
    if (isAdmin) void refetchDlq();
    if (canFinOps) {
      void refetchCosts();
      void refetchReceipts();
    }
  };

  const systemHealthy = health?.ok === true;
  const dbConfigured = health?.config?.databaseConfigured ?? false;
  const oauthConfigured = health?.config?.oauthConfigured ?? false;
  const holdCount = statsData?.reviewQueue ?? 0;
  const totalAudits = statsData?.totalAudits ?? 0;
  const dlqCount = dlqStatus?.totalFailed ?? dlqStatus?.recoverable ?? 0;
  const llmCalls = costSummary?.totalCalls ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              System Monitoring
            </h1>
            <p className="text-muted-foreground mt-1">
              Live health, AI providers, queues, and FinOps throughput
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/feature-flags">Feature flags</Link>
            </Button>
            <Badge variant={autoRefresh ? "default" : "outline"}>
              {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Pause refresh" : "Resume refresh"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh now
            </Button>
          </div>
        </div>

        {isInitialLoading ? (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Checking system health…</p>
            </div>
          </Card>
        ) : hasQueryError ? (
          <Card className="p-12 border-destructive/30">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-lg font-semibold">
                Unable to reach monitoring APIs
              </h2>
              <p className="text-muted-foreground max-w-md">
                {healthErr?.message ||
                  versionErr?.message ||
                  "Health check failed."}
              </p>
              <Button variant="outline" size="sm" onClick={handleManualRefresh}>
                Retry
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <section aria-labelledby="health-heading">
              <div className="mb-4">
                <h2
                  id="health-heading"
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  System health
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Live status from health, version, and AI provider checks
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard
                  title="Overall status"
                  value={systemHealthy ? "Healthy" : "Degraded"}
                  icon={
                    systemHealthy ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )
                  }
                  variant={systemHealthy ? "success" : "warning"}
                  subtitle={
                    version?.environment ||
                    health?.config?.environment ||
                    "unknown env"
                  }
                />
                <StatusCard
                  title="Database"
                  value={dbConfigured ? "Connected" : "Not configured"}
                  icon={<Database className="h-5 w-5" />}
                  variant={dbConfigured ? "success" : "error"}
                  subtitle="Connection config"
                />
                <StatusCard
                  title="Authentication"
                  value={oauthConfigured ? "OAuth ready" : "Local mode"}
                  icon={<Server className="h-5 w-5" />}
                  variant={oauthConfigured ? "success" : "info"}
                  subtitle="Identity provider"
                />
                <StatusCard
                  title="Hold queue"
                  value={String(holdCount)}
                  icon={<AlertCircle className="h-5 w-5" />}
                  variant={holdCount === 0 ? "success" : "warning"}
                  subtitle={`${totalAudits} total audits`}
                />
              </div>

              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Deployment info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <InfoItem
                      label="Version"
                      value={
                        version?.gitShaShort || version?.gitSha || "unknown"
                      }
                    />
                    <InfoItem
                      label="Environment"
                      value={
                        version?.environment ||
                        health?.config?.environment ||
                        "unknown"
                      }
                    />
                    <InfoItem
                      label="Platform"
                      value={version?.platformVersion || "—"}
                    />
                    <InfoItem
                      label="Build time"
                      value={
                        version?.buildTime
                          ? new Date(version.buildTime).toLocaleString("en-GB")
                          : "—"
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="performance-heading">
              <div className="mb-4">
                <h2
                  id="performance-heading"
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Providers & throughput
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Live AI health and FinOps call volume — APM latency is not
                  instrumented yet
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatusCard
                  title="Mistral OCR"
                  value={
                    aiHealth?.mistralOcr?.configured
                      ? aiHealth.mistralOcr.valid
                        ? "Ready"
                        : "Unhealthy"
                      : "Not configured"
                  }
                  icon={<Zap className="h-5 w-5" />}
                  variant={
                    aiHealth?.mistralOcr?.valid
                      ? "success"
                      : aiHealth?.mistralOcr?.configured
                        ? "error"
                        : "warning"
                  }
                  subtitle="OCR provider"
                />
                <StatusCard
                  title="Gemini"
                  value={
                    aiHealth?.geminiAnalyzer?.configured ? "Configured" : "Off"
                  }
                  icon={<Activity className="h-5 w-5" />}
                  variant={
                    aiHealth?.geminiAnalyzer?.configured ? "success" : "info"
                  }
                  subtitle="Analyzer provider"
                />
                <StatusCard
                  title="DLQ depth"
                  value={isAdmin ? String(dlqCount) : "Admin only"}
                  icon={<Database className="h-5 w-5" />}
                  variant={
                    !isAdmin ? "info" : dlqCount === 0 ? "success" : "warning"
                  }
                  subtitle={
                    isAdmin ? "Failed pipeline jobs" : "Requires admin role"
                  }
                />
                <StatusCard
                  title="LLM calls (48h)"
                  value={
                    canFinOps
                      ? llmCalls != null
                        ? String(llmCalls)
                        : "—"
                      : "QA lead+"
                  }
                  icon={<TrendingUp className="h-5 w-5" />}
                  variant="info"
                  subtitle={
                    canFinOps
                      ? "Estimated FinOps ledger"
                      : "Requires qa_lead or admin"
                  }
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-5 w-5" />
                      LLM throughput (by day)
                    </CardTitle>
                    <CardDescription>
                      Estimated API call volume from FinOps ledger
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {throughputData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={throughputData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-border"
                          />
                          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={CHART_TOOLTIP_STYLE}
                            labelStyle={{ color: "#333030" }}
                          />
                          <Bar
                            dataKey="calls"
                            fill="#beda41"
                            name="API calls"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        compact
                        icon={Activity}
                        title="No LLM traffic yet"
                        description={
                          canFinOps
                            ? "Call volume appears after AI audits run on this revision."
                            : "FinOps throughput requires qa_lead or admin."
                        }
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-5 w-5" />
                      Job status distribution
                    </CardTitle>
                    <CardDescription>
                      Mix across the latest 100 accessible job sheets (sample,
                      not full population)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {statusData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name}: ${(percent * 100).toFixed(0)}%`
                            }
                          >
                            {statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        compact
                        icon={Database}
                        title="No job sheets yet"
                        description="Status mix appears after uploads are processed."
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>

            <section aria-labelledby="ops-heading">
              <div className="mb-4">
                <h2
                  id="ops-heading"
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Operations detail
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertCircle className="h-5 w-5" />
                      Operational issues
                    </CardTitle>
                    <CardDescription>
                      DLQ recoverables, drift alerts, and AI provider faults
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {operationalIssues.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-[#5a7a1a]" />
                          No active operational issues
                        </div>
                      ) : (
                        operationalIssues.map(issue => (
                          <div
                            key={issue.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-white gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <XCircle
                                className={cn(
                                  "h-5 w-5 shrink-0",
                                  issue.severity === "critical"
                                    ? "text-destructive"
                                    : "text-warning"
                                )}
                              />
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {issue.message}
                                </p>
                                <p className="text-sm text-muted-foreground truncate">
                                  {issue.detail}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={
                                issue.severity === "critical"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {issue.severity}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="ops-webhook-delivery-receipts">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Webhook className="h-5 w-5" />
                      audit.completed delivery receipts
                    </CardTitle>
                    <CardDescription>
                      Downstream webhook attempts for completed audits — empty
                      is honest, not a fake success.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!canFinOps ? (
                      <p className="text-sm text-muted-foreground">
                        Delivery receipts require QA lead or admin access.
                      </p>
                    ) : deliveryReceiptsError ? (
                      <p className="text-sm text-destructive">
                        Delivery receipts unavailable — could not load the
                        webhook log.
                      </p>
                    ) : deliveryReceipts && !deliveryReceipts.available ? (
                      <p className="text-sm text-destructive">
                        Delivery receipts unavailable
                        {deliveryReceipts.unavailableReason
                          ? `: ${deliveryReceipts.unavailableReason}`
                          : "."}
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="secondary">
                            Subscribers:{" "}
                            {deliveryReceipts?.auditCompletedSubscriberCount ??
                              "—"}
                          </Badge>
                          <Badge variant="outline">
                            Receipts shown:{" "}
                            {deliveryReceipts?.receiptCount ?? 0}
                          </Badge>
                        </div>
                        {(deliveryReceipts?.receiptCount ?? 0) === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {deliveryReceipts?.auditCompletedSubscriberCount ===
                            0
                              ? "No active audit.completed subscribers — nothing to deliver yet."
                              : "No audit.completed deliveries recorded yet."}
                          </p>
                        ) : (
                          <ul className="space-y-2 max-h-56 overflow-y-auto text-sm">
                            {deliveryReceipts?.receipts.map(r => (
                              <li
                                key={r.id}
                                className="flex items-start justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    Audit{" "}
                                    {r.auditId != null ? `#${r.auditId}` : "—"}
                                    {r.statusCode != null
                                      ? ` · HTTP ${r.statusCode}`
                                      : ""}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {new Date(r.deliveredAt).toLocaleString()}
                                    {r.error ? ` · ${r.error}` : ""}
                                  </p>
                                </div>
                                {r.success ? (
                                  <Badge className="shrink-0 bg-green-100 text-green-800 hover:bg-green-100">
                                    Delivered
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="destructive"
                                    className="shrink-0"
                                  >
                                    Failed
                                  </Badge>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Database className="h-5 w-5" />
                      Quick links
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      asChild
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Link href="/hold-queue">Hold queue</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Link href="/analytics/drift">Drift detection</Link>
                    </Button>
                    {canFinOps ? (
                      <Button
                        asChild
                        variant="outline"
                        className="w-full justify-start"
                      >
                        <Link href="/settings?tab=api-costs">API costs</Link>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

interface StatusCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "error" | "info";
  subtitle?: string;
}

function StatusCard({
  title,
  value,
  icon,
  variant,
  subtitle,
}: StatusCardProps) {
  const variantStyles = {
    success: "text-[#5a7a1a] bg-[rgba(190,218,65,0.15)]",
    warning: "text-warning bg-warning-light",
    error: "text-destructive bg-destructive/10",
    info: "text-info bg-info-light",
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div
            className={cn("p-3 rounded-lg shrink-0", variantStyles[variant])}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium truncate" title={value}>
        {value}
      </p>
    </div>
  );
}
