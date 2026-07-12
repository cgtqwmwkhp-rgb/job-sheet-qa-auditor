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
} from "lucide-react";
import { SmartTip } from "@/components/SmartTip";
import { AuditTimeline } from "@/components/AuditTimeline";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { perfMark, perfClear, PERF_MARKS } from "@/lib/perf";
import { cn } from "@/lib/utils";

function KpiSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-24 animate-pulse rounded bg-[#EBE8E8]" />
      <div className="h-8 w-16 animate-pulse rounded bg-[#EBE8E8]" />
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();

  const navigateToAudit = (id: number) => {
    perfClear();
    perfMark(PERF_MARKS.AUDIT_DETAIL_CLICK);
    setLocation(`/audits?id=${id}`);
  };

  const { data: statsData, isLoading: statsLoading } =
    trpc.stats.dashboard.useQuery();
  const { data: recentJobSheets, isLoading: jobSheetsLoading } =
    trpc.jobSheets.list.useQuery({ limit: 5 });
  const { user } = useAuth();

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

  const recentActivity: {
    id: number;
    type: "audit" | "review" | "system";
    message: string;
    time: string;
  }[] = [];

  const hasNoAudits = !statsLoading && (statsData?.totalAudits ?? 0) === 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
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
              <div className="flex items-center gap-2 rounded-full border border-[#D4E86D] bg-[rgba(190,218,65,0.12)] px-3 py-1 text-xs font-medium text-[#4A4646]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                System operational
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
                Daily audit volume and pass/fail breakdown.
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="flex h-[280px] items-center justify-center">
                {statsLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-[#8A8787]" />
                ) : (
                  <EmptyState
                    compact
                    icon={TrendingUp}
                    title="No audit activity yet"
                    description="Process job sheets to see daily volume and pass/fail trends."
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
            <CardHeader>
              <CardTitle>Top Defect Reasons</CardTitle>
              <CardDescription>
                Breakdown of reasons for audit failure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[280px] items-center justify-center">
                {statsLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-[#8A8787]" />
                ) : (
                  <EmptyState
                    compact
                    icon={AlertTriangle}
                    title="No defect data yet"
                    description="Defect breakdown appears after audits complete."
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
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2">
            <Tabs defaultValue="recent" className="space-y-4">
              <TabsList>
                <TabsTrigger value="recent">Recent Audits</TabsTrigger>
                <TabsTrigger value="hold">Hold Queue</TabsTrigger>
                <TabsTrigger value="alerts">System Alerts</TabsTrigger>
              </TabsList>
              <TabsContent value="recent" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle>Recent Audits</CardTitle>
                      <CardDescription>
                        Latest job sheets processed by the system.
                      </CardDescription>
                    </div>
                    {!jobSheetsLoading &&
                    recentJobSheets &&
                    recentJobSheets.length > 0 ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href="/audits">View all</Link>
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
                    ) : recentJobSheets && recentJobSheets.length > 0 ? (
                      <div className="space-y-3">
                        {recentJobSheets.map(sheet => (
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
                                {new Date(sheet.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
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
                  <CardHeader>
                    <CardTitle>Hold Queue</CardTitle>
                    <CardDescription>
                      Items requiring manual review.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmptyState
                      compact
                      icon={Clock}
                      title="Hold queue is clear"
                      description="No items are waiting for manual review right now."
                      action={{ label: "Open hold queue", href: "/hold-queue" }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="alerts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>System Alerts</CardTitle>
                    <CardDescription>
                      Important notifications and warnings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmptyState
                      compact
                      icon={AlertTriangle}
                      title="No active alerts"
                      description="System notifications will appear here when action is needed."
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="col-span-1">
            <AuditTimeline activities={recentActivity} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
