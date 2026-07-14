import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalyticsLayout } from "./AnalyticsLayout";
import { AnalyticsSkeleton } from "@/components/ui/loading-skeleton";
import {
  CheckCircle2,
  FileText,
  AlertTriangle,
  Users,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import OverturnMetricsCard from "@/components/OverturnMetricsCard";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { cn } from "@/lib/utils";

function formatPeriodRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(end).toLocaleDateString(undefined, opts)}`;
}

const quickLinks = [
  {
    href: "/analytics/defects",
    label: "Exceptions",
    description: "Defect trends and severity breakdown",
  },
  {
    href: "/analytics/technicians",
    label: "Technician performance",
    description: "Scorecards and coaching packs",
  },
  {
    href: "/analytics/predictive",
    label: "Predictive risk",
    description: "Forward-looking quality signals",
  },
];

export default function ExecutiveDashboard() {
  const { startDate, endDate, site } = useAnalyticsFilters();
  const {
    data: statsData,
    isLoading,
    error,
  } = trpc.analytics.getExecutiveSummary.useQuery({ startDate, endDate, site });

  const totalAudits = statsData?.totalAudits ?? 0;
  const passRate = statsData?.passRate ?? 0;
  const criticalIssues = statsData?.criticalIssues ?? 0;
  const reviewQueue = statsData?.reviewQueue ?? 0;
  const periodLabel = statsData?.period
    ? formatPeriodRange(statsData.period.start, statsData.period.end)
    : formatPeriodRange(startDate, endDate);
  const hasData = totalAudits > 0 || reviewQueue > 0 || criticalIssues > 0;

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Executive Overview"
        description={`High-level operational metrics for ${periodLabel}.`}
      >
        <AnalyticsSkeleton />
      </AnalyticsLayout>
    );
  }

  if (error) {
    return (
      <AnalyticsLayout
        title="Executive Overview"
        description={`High-level operational metrics for ${periodLabel}.`}
      >
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Failed to Load Analytics
            </h2>
            <p className="text-muted-foreground max-w-md">{error.message}</p>
          </div>
        </Card>
      </AnalyticsLayout>
    );
  }

  if (!hasData) {
    return (
      <AnalyticsLayout
        title="Executive Overview"
        description={`High-level operational metrics for ${periodLabel}.`}
      >
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              No Analytics Data Yet
            </h2>
            <p className="text-muted-foreground max-w-md">
              Upload and process job sheets to start seeing executive analytics
              and insights here.
            </p>
          </div>
        </Card>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout
      title="Executive Overview"
      description={`High-level operational metrics for ${periodLabel}.`}
    >
      <div className="space-y-8">
        <section aria-labelledby="kpi-heading">
          <div className="mb-4">
            <h2
              id="kpi-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Key performance indicators
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Snapshot for the selected reporting period
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5 border-primary/20 bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Overall pass rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-5xl font-bold tracking-tight text-foreground">
                      {passRate}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Based on completed audits in period
                    </p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[rgba(190,218,65,0.15)]">
                    <CheckCircle2 className="h-7 w-7 text-[#5a7a1a]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total audits
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {totalAudits.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Processed in period
                </p>
              </CardContent>
            </Card>

            <Card
              className={cn(
                "lg:col-span-2",
                criticalIssues > 0 && "border-destructive/30"
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Critical issues
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "text-3xl font-bold",
                    criticalIssues > 0 && "text-destructive"
                  )}
                >
                  {criticalIssues}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Requires attention
                </p>
              </CardContent>
            </Card>

            <Card
              className={cn(
                "lg:col-span-2",
                reviewQueue > 0 && "border-warning/40"
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Review queue
                </CardTitle>
                <Users className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "text-3xl font-bold",
                    reviewQueue > 0 && "text-warning"
                  )}
                >
                  {reviewQueue}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Live snapshot
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <OverturnMetricsCard />

        <section aria-labelledby="explore-heading">
          <div className="mb-4">
            <h2
              id="explore-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Explore further
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {quickLinks.map(link => (
              <Card
                key={link.href}
                className="group hover:border-primary/30 transition-colors"
              >
                <CardContent className="pt-5 pb-4">
                  <p className="font-medium text-foreground">{link.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {link.description}
                  </p>
                  <Link href={link.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-8 px-0 text-primary hover:text-primary"
                    >
                      Open
                      <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AnalyticsLayout>
  );
}
