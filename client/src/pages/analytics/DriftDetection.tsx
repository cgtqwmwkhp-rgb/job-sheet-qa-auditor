import { AnalyticsLayout } from "./AnalyticsLayout";
import { AnalyticsSkeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";
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
import { AlertTriangle, Activity, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function pct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

function severityVariant(
  severity: string
): "destructive" | "secondary" | "outline" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

export default function DriftDetection() {
  const { startDate, endDate, site } = useAnalyticsFilters();
  const {
    data: summary,
    isLoading,
    error,
  } = trpc.analytics.getDriftSummary.useQuery({ startDate, endDate, site });

  const topSeries = useMemo(() => summary?.series.slice(0, 8) ?? [], [summary]);

  const chartSeries = useMemo(() => {
    const first = summary?.series[0];
    if (!first) return [];
    return first.series
      .filter(p => p.documentCount > 0 || p.rate > 0)
      .map((p, i) => ({
        day: p.t.slice(5),
        rate: Math.round(p.rate * 1000) / 10,
        ewma: Math.round((first.ewma.state.ewma[i] ?? 0) * 1000) / 10,
      }));
  }, [summary]);

  const calibrationChart = useMemo(
    () =>
      (summary?.calibration.bins ?? [])
        .filter(b => b.count > 0)
        .map(b => ({
          name: b.label,
          predicted: Math.round(b.meanPredicted * 100),
          observed: Math.round(b.observedRate * 100),
          count: b.count,
        })),
    [summary]
  );

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Drift Detection"
        description="EWMA/CUSUM on defect-rate series with confidence calibration."
      >
        <AnalyticsSkeleton />
      </AnalyticsLayout>
    );
  }

  if (error || !summary) {
    return (
      <AnalyticsLayout
        title="Drift Detection"
        description="EWMA/CUSUM on defect-rate series with confidence calibration."
      >
        <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
          <AlertTriangle className="h-16 w-16 mb-4" />
          <p>{error?.message ?? "Unable to load drift analytics."}</p>
        </div>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout
      title="Drift Detection"
      description="EWMA/CUSUM outlier detection per engineer, asset, and template — plus confidence calibration."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Series monitored</CardDescription>
            <CardTitle className="text-3xl">
              {summary.summary.seriesCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active alerts</CardDescription>
            <CardTitle className="text-3xl">
              {summary.summary.alertCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical</CardDescription>
            <CardTitle className="text-3xl text-destructive">
              {summary.summary.criticalAlerts}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Calibration ECE</CardDescription>
            <CardTitle className="text-3xl">
              {pct(summary.summary.ece)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <CardTitle>Top series defect rate</CardTitle>
            </div>
            <CardDescription>
              {summary.series[0]
                ? `${summary.series[0].label} (${summary.series[0].dimension})`
                : "No series yet"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough daily samples to chart.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSeries}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    unit="%"
                    domain={[0, "auto"]}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="Defect %"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ewma"
                    name="EWMA %"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              <CardTitle>Confidence calibration</CardTitle>
            </div>
            <CardDescription>
              Predicted confidence vs observed pass rate by bin
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {calibrationChart.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No confidence samples in period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calibrationChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip />
                  <Bar
                    dataKey="predicted"
                    name="Predicted %"
                    fill="hsl(var(--primary))"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="observed"
                    name="Observed %"
                    fill="hsl(var(--muted-foreground))"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            EWMA band breaches, CUSUM shifts, and calibration ECE
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active drift alerts in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Detector</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.alerts.map(alert => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge variant={severityVariant(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="uppercase text-xs tracking-wide">
                      {alert.detector}
                    </TableCell>
                    <TableCell>
                      {alert.label}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({alert.dimension})
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      {alert.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Monitored series</CardTitle>
          <CardDescription>
            Defect-rate EWMA/CUSUM by engineer, asset, and template
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No series with enough documents yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="text-right">Docs</TableHead>
                  <TableHead className="text-right">Latest rate</TableHead>
                  <TableHead className="text-right">EWMA</TableHead>
                  <TableHead className="text-right">CUSUM S+</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSeries.map(s => {
                  const status =
                    s.ewma.severity !== "none"
                      ? s.ewma.severity
                      : s.cusum.direction === "increase"
                        ? s.cusum.severity
                        : "ok";
                  return (
                    <TableRow key={`${s.dimension}:${s.key}`}>
                      <TableCell className="capitalize">
                        {s.dimension}
                      </TableCell>
                      <TableCell>{s.label}</TableCell>
                      <TableCell className="text-right">
                        {s.documentCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(s.latestDefectRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(s.ewma.lastEwma)}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.cusum.lastSHigh.toFixed(3)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "ok"
                              ? "outline"
                              : severityVariant(status)
                          }
                        >
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AnalyticsLayout>
  );
}
