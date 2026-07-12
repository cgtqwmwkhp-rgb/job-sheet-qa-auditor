import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDateRangePicker } from "@/components/ui/date-range-picker";
import {
  Download,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Users,
  FileText,
  Loader2,
  BarChart3,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import OverturnMetricsCard from "@/components/OverturnMetricsCard";

function TechnicianAnalyticsPreview() {
  const { data, isLoading, error } =
    trpc.analytics.getEngineerSummary.useQuery();

  if (isLoading) {
    return (
      <Card className="p-12">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading technicians...
          </span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
          <h2 className="text-lg font-semibold mb-1">
            Failed to load technicians
          </h2>
          <p className="text-muted-foreground text-sm">{error.message}</p>
        </div>
      </Card>
    );
  }

  if (!data || data.engineerCount === 0) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Users className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            No Technician Attribution Yet
          </h2>
          <p className="text-muted-foreground max-w-md">
            Assign technicians on job sheet upload to unlock scorecards and
            drill-through.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Technician leaderboard</CardTitle>
          <CardDescription>
            Team avg {data.teamAvgScore} · {data.engineerCount} technicians ·{" "}
            {data.totalIssues} findings
          </CardDescription>
        </div>
        <Link href="/analytics/technicians">
          <Button variant="outline" size="sm">
            Open technician performance
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.leaderboard.slice(0, 5).map(row => (
          <div
            key={row.engineerId}
            className="flex items-center justify-between border rounded-lg p-3"
          >
            <div>
              <p className="font-medium">{row.engineerName}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {row.trend} · {row.documentsProcessed} docs ·{" "}
                {Math.round(row.issueRate * 100)}% issue rate
              </p>
            </div>
            <span className="text-xl font-bold">{row.overallScore}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  // Use real data from the stats endpoint
  const {
    data: statsData,
    isLoading: statsLoading,
    error,
  } = trpc.stats.dashboard.useQuery();

  // Calculate real KPIs from stats
  const totalAudits = statsData?.totalAudits ?? 0;
  const passRate = statsData?.passRate ?? 0;
  const criticalIssues = statsData?.criticalIssues ?? 0;
  const reviewQueue = statsData?.reviewQueue ?? 0;

  // Check if we have any real data
  const hasData = totalAudits > 0;

  // Loading state
  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading analytics...
          </span>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Failed to Load Analytics
          </h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Deep dive into audit performance, defect trends, and operational
              metrics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDateRangePicker />
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                <SelectItem value="london">London HQ</SelectItem>
                <SelectItem value="manchester">Manchester Branch</SelectItem>
                <SelectItem value="leeds">Leeds Hub</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* KPI Cards - Using Real Data */}
        <section aria-labelledby="analytics-kpi-heading">
          <div className="mb-4">
            <h2
              id="analytics-kpi-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Key metrics
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Overall pass rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-5xl font-bold tracking-tight">{passRate}%</div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Based on completed audits
                    </p>
                  </div>
                  <CheckCircle2 className="h-10 w-10 text-[#5a7a1a] opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
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
                  All time total
                </p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Critical issues
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${criticalIssues > 0 ? "text-destructive" : ""}`}>
                  {criticalIssues}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Requires attention
                </p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Review queue
                </CardTitle>
                <Users className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${reviewQueue > 0 ? "text-warning" : ""}`}>
                  {reviewQueue}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending review
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trends" disabled={!hasData}>
              Trends (Coming Soon)
            </TabsTrigger>
            <TabsTrigger value="technicians" disabled={!hasData}>
              Technicians
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <OverturnMetricsCard />
            {hasData ? (
              <Card>
                <CardHeader>
                  <CardTitle>Audit Summary</CardTitle>
                  <CardDescription>
                    Current status of your audit pipeline.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-8 w-8 text-green-500" />
                          <div>
                            <p className="font-semibold">Pass Rate</p>
                            <p className="text-sm text-muted-foreground">
                              Overall quality score
                            </p>
                          </div>
                        </div>
                        <span className="text-3xl font-bold text-green-600">
                          {passRate}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-blue-500" />
                          <div>
                            <p className="font-semibold">Total Processed</p>
                            <p className="text-sm text-muted-foreground">
                              All time audits
                            </p>
                          </div>
                        </div>
                        <span className="text-3xl font-bold">
                          {totalAudits}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-8 w-8 text-red-500" />
                          <div>
                            <p className="font-semibold">Critical Issues</p>
                            <p className="text-sm text-muted-foreground">
                              Needs attention
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-3xl font-bold ${criticalIssues > 0 ? "text-red-600" : "text-green-600"}`}
                        >
                          {criticalIssues}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Users className="h-8 w-8 text-orange-500" />
                          <div>
                            <p className="font-semibold">Review Queue</p>
                            <p className="text-sm text-muted-foreground">
                              Pending review
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-3xl font-bold ${reviewQueue > 0 ? "text-orange-600" : "text-green-600"}`}
                        >
                          {reviewQueue}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold mb-2">
                    No Analytics Data Yet
                  </h2>
                  <p className="text-muted-foreground max-w-md">
                    Upload and process job sheets to start seeing analytics and
                    insights here.
                  </p>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">
                  Trends Coming Soon
                </h2>
                <p className="text-muted-foreground max-w-md">
                  Performance trends and time-series analytics will be available
                  in a future update.
                </p>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="technicians" className="space-y-4">
            <TechnicianAnalyticsPreview />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
