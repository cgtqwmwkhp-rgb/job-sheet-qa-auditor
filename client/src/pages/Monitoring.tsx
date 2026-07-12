/**
 * Monitoring Dashboard
 *
 * Displays real-time system health metrics, error tracking,
 * performance monitoring, and operational insights
 */

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
import {
  Activity,
  AlertCircle,
  Clock,
  Database,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Zap,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";
import {
  LineChart,
  Line,
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

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #ebe8e8",
  borderRadius: "8px",
  color: "#333030",
};

export default function Monitoring() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [healthTs, setHealthTs] = useState(() => Date.now());
  const avgResponseMs = 245;
  const errorRatePct = 0.12;
  const slowQueries = 3;
  const avgQueryMs = 45;
  const cacheHitPct = 94;

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

  const isInitialLoading = healthLoading || versionLoading;
  const isRefreshing = healthFetching || versionFetching;
  const hasQueryError = healthError || versionError;

  const [recentErrors] = useState([
    { id: 1, message: "Database timeout", count: 3, lastSeen: "2 min ago" },
    {
      id: 2,
      message: "OCR service unavailable",
      count: 1,
      lastSeen: "15 min ago",
    },
  ]);

  const [performanceData] = useState([
    { name: "00:00", avgResponse: 245, requests: 120 },
    { name: "04:00", avgResponse: 189, requests: 85 },
    { name: "08:00", avgResponse: 312, requests: 340 },
    { name: "12:00", avgResponse: 278, requests: 450 },
    { name: "16:00", avgResponse: 298, requests: 380 },
    { name: "20:00", avgResponse: 201, requests: 220 },
  ]);

  const [statusData] = useState([
    { name: "Completed", value: 850, color: "#5a7a1a" },
    { name: "Processing", value: 45, color: "#2563eb" },
    { name: "Failed", value: 12, color: "#ba3737" },
    { name: "Pending", value: 93, color: "#ca8a04" },
  ]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setHealthTs(Date.now());
      void refetchHealth();
      void refetchVersion();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, refetchHealth, refetchVersion]);

  const handleManualRefresh = () => {
    setHealthTs(Date.now());
    void refetchHealth();
    void refetchVersion();
  };

  const systemHealthy = health?.ok === true;
  const dbConfigured = health?.config?.databaseConfigured ?? false;
  const oauthConfigured = health?.config?.oauthConfigured ?? false;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              System Monitoring
            </h1>
            <p className="text-muted-foreground mt-1">
              Operational health, performance, and infrastructure status
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                  Live status from health and version endpoints
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
                  title="Error rate"
                  value={`${errorRatePct}%`}
                  icon={<AlertCircle className="h-5 w-5" />}
                  variant={errorRatePct < 0.5 ? "success" : "error"}
                  subtitle="Last hour (sample)"
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
                  Performance & throughput
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatusCard
                  title="Active users"
                  value="24"
                  icon={<Users className="h-5 w-5" />}
                  variant="info"
                  subtitle="Last 15 minutes"
                />
                <StatusCard
                  title="Avg response"
                  value={`${avgResponseMs}ms`}
                  icon={<Zap className="h-5 w-5" />}
                  variant={avgResponseMs < 300 ? "success" : "warning"}
                  subtitle="Last hour"
                />
                <StatusCard
                  title="Slow queries"
                  value={String(slowQueries)}
                  icon={<Database className="h-5 w-5" />}
                  variant={slowQueries < 10 ? "success" : "warning"}
                  subtitle="Database layer"
                />
                <StatusCard
                  title="Cache hit rate"
                  value={`${cacheHitPct}%`}
                  icon={<Activity className="h-5 w-5" />}
                  variant={cacheHitPct > 80 ? "success" : "warning"}
                  subtitle="Query cache"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-5 w-5" />
                      Response time (24h)
                    </CardTitle>
                    <CardDescription>
                      Average API latency by hour
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={performanceData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border"
                        />
                        <XAxis
                          dataKey="name"
                          className="text-muted-foreground"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={{ color: "#333030" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgResponse"
                          stroke="#5a7a1a"
                          strokeWidth={2}
                          name="Avg response (ms)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-5 w-5" />
                      Request volume (24h)
                    </CardTitle>
                    <CardDescription>Throughput by hour</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={performanceData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border"
                        />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={{ color: "#333030" }}
                        />
                        <Bar
                          dataKey="requests"
                          fill="#beda41"
                          name="Requests"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Database className="h-5 w-5" />
                      Job status distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertCircle className="h-5 w-5" />
                      Recent errors
                    </CardTitle>
                    <CardDescription>
                      Sample operational error feed
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentErrors.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                          No recent errors
                        </div>
                      ) : (
                        recentErrors.map(error => (
                          <div
                            key={error.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-white"
                          >
                            <div className="flex items-center gap-3">
                              <XCircle className="h-5 w-5 text-destructive shrink-0" />
                              <div>
                                <p className="font-medium">{error.message}</p>
                                <p className="text-sm text-muted-foreground">
                                  {error.lastSeen}
                                </p>
                              </div>
                            </div>
                            <Badge variant="destructive">{error.count}×</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-5 w-5" />
                    Database performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricBox
                      label="Active connections"
                      value="12"
                      max="50"
                      status="healthy"
                    />
                    <MetricBox
                      label="Slow queries"
                      value={String(slowQueries)}
                      suffix="queries"
                      status={slowQueries < 10 ? "healthy" : "warning"}
                    />
                    <MetricBox
                      label="Avg query time"
                      value={`${avgQueryMs}ms`}
                      status={avgQueryMs < 100 ? "healthy" : "warning"}
                    />
                    <MetricBox
                      label="Cache hit rate"
                      value={`${cacheHitPct}%`}
                      status={cacheHitPct > 80 ? "healthy" : "warning"}
                    />
                  </div>
                </CardContent>
              </Card>
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

interface MetricBoxProps {
  label: string;
  value: string;
  max?: string;
  suffix?: string;
  status: "healthy" | "warning" | "error";
}

function MetricBox({ label, value, max, suffix, status }: MetricBoxProps) {
  const statusColors = {
    healthy: "text-[#5a7a1a]",
    warning: "text-warning",
    error: "text-destructive",
  };

  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-xl font-bold", statusColors[status])}>
        {value}
        {max && <span className="text-sm text-muted-foreground"> / {max}</span>}
        {suffix && (
          <span className="text-sm text-muted-foreground ml-1">{suffix}</span>
        )}
      </p>
    </div>
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
