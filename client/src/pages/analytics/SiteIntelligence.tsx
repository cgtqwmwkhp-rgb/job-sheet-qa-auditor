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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CohortDimension = "site" | "assetType" | "workType";

function passRatePct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function SiteIntelligence() {
  const { startDate, endDate, site } = useAnalyticsFilters();
  const [dimension, setDimension] = useState<CohortDimension>("site");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const {
    data: summary,
    isLoading,
    error,
  } = trpc.analytics.getCohortSummary.useQuery({ startDate, endDate, site });

  const { data: collisionReport, isLoading: collisionLoading } =
    trpc.analytics.getTemplateCollisionReport.useQuery(undefined, {
      retry: false,
    });

  const { data: drilldown, isLoading: drillLoading } =
    trpc.analytics.getCohortDrilldown.useQuery(
      {
        dimension,
        key: selectedKey ?? "",
        startDate,
        endDate,
        site,
      },
      { enabled: !!selectedKey }
    );

  const buckets = useMemo(() => {
    if (!summary) return [];
    if (dimension === "site") return summary.bySite.buckets;
    if (dimension === "assetType") return summary.byAssetType.buckets;
    return summary.byWorkType.buckets;
  }, [summary, dimension]);

  const chartData = useMemo(
    () =>
      buckets.slice(0, 8).map(b => ({
        name: b.label.length > 18 ? `${b.label.slice(0, 16)}…` : b.label,
        fullName: b.label,
        documents: b.documentCount,
        passRate: Math.round(b.passRate * 100),
        issues: b.issueCount,
      })),
    [buckets]
  );

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Site & Cohort Intelligence"
        description="Compare audit quality by site, asset type, and work type."
      >
        <AnalyticsSkeleton />
      </AnalyticsLayout>
    );
  }

  if (error) {
    return (
      <AnalyticsLayout
        title="Site & Cohort Intelligence"
        description="Compare audit quality by site, asset type, and work type."
      >
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Failed to Load Cohort Analytics
          </h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </AnalyticsLayout>
    );
  }

  if (!summary || summary.totals.documentCount === 0) {
    // PX-096 — site filter no-match is not the same as first-time onboarding
    const filteredEmpty = Boolean(site?.trim());
    return (
      <AnalyticsLayout
        title="Site & Cohort Intelligence"
        description="Compare audit quality by site, asset type, and work type."
      >
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <MapPin className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {filteredEmpty
                ? `No data for site “${site.trim()}”`
                : "No Cohort Data Yet"}
            </h2>
            <p className="text-muted-foreground max-w-md">
              {filteredEmpty
                ? "Clear or change the site filter to see other cohorts. This is a filter miss, not an empty product."
                : "Process job sheets with site info and template selection to unlock site, asset-type, and work-type comparisons."}
            </p>
          </div>
        </Card>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout
      title="Site & Cohort Intelligence"
      description="Compare audit quality by site, asset type, and work type — plus template collision governance."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totals.documentCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {passRatePct(summary.totals.passRate)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totals.issueCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Critical (S0/S1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totals.criticalIssueCount}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Template Collision Governance
            </CardTitle>
            <CardDescription>
              Fingerprint overlap across the in-memory template catalog
            </CardDescription>
          </CardHeader>
          <CardContent>
            {collisionLoading ? (
              <div className="flex items-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Checking fingerprints...
              </div>
            ) : collisionReport ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      collisionReport.allowed
                        ? "border-green-300 text-green-800"
                        : "border-red-300 text-red-800"
                    }
                  >
                    {collisionReport.allowed ? "Clear" : "Blocked"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {collisionReport.templateCount} templates ·{" "}
                    {collisionReport.blockingCount} blocking ·{" "}
                    {collisionReport.warningCount} warnings
                  </span>
                </div>
                <p className="text-sm">{collisionReport.message}</p>
                {collisionReport.blocking.slice(0, 5).map((m, i) => (
                  <div
                    key={`${m.templateA}-${m.templateB}-${i}`}
                    className="text-sm border rounded-md p-2"
                  >
                    <span className="font-medium uppercase">{m.severity}</span>:{" "}
                    {m.templateA} ↔ {m.templateB} — {m.reason}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Collision report unavailable (admin access may be required).
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs
          value={dimension}
          onValueChange={v => {
            setDimension(v as CohortDimension);
            setSelectedKey(null);
          }}
        >
          <TabsList>
            <TabsTrigger value="site">By Site</TabsTrigger>
            <TabsTrigger value="assetType">By Asset Type</TabsTrigger>
            <TabsTrigger value="workType">By Work Type</TabsTrigger>
          </TabsList>

          <TabsContent value={dimension} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Volume & Pass Rate
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {chartData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No buckets for this dimension
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Bar
                          yAxisId="left"
                          dataKey="documents"
                          fill="#2563eb"
                          name="Documents"
                        />
                        <Bar
                          yAxisId="right"
                          dataKey="passRate"
                          fill="#16a34a"
                          name="Pass %"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cohort Buckets</CardTitle>
                  <CardDescription>
                    Select a row to drill into findings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bucket</TableHead>
                        <TableHead className="text-right">Docs</TableHead>
                        <TableHead className="text-right">Pass</TableHead>
                        <TableHead className="text-right">Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buckets.map(b => (
                        <TableRow
                          key={b.key}
                          className={
                            selectedKey === b.key
                              ? "bg-muted/60 cursor-pointer"
                              : "cursor-pointer"
                          }
                          onClick={() => setSelectedKey(b.key)}
                        >
                          <TableCell className="font-medium">
                            {b.label}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.documentCount}
                          </TableCell>
                          <TableCell className="text-right">
                            {passRatePct(b.passRate)}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.issueCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {selectedKey && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Findings — {selectedKey}</CardTitle>
                    <CardDescription>
                      Drill-through to underlying audits
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedKey(null)}
                  >
                    Clear
                  </Button>
                </CardHeader>
                <CardContent>
                  {drillLoading ? (
                    <div className="flex items-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading findings...
                    </div>
                  ) : !drilldown || drilldown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No findings in this cohort bucket.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job sheet</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Field</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drilldown.map(row => (
                          <TableRow key={row.findingId}>
                            <TableCell>
                              <Link href={`/audits?id=${row.jobSheetId}`}>
                                <a className="text-[#2868CE] hover:underline inline-flex items-center gap-1">
                                  <FileText className="h-3.5 w-3.5" />#
                                  {row.jobSheetId}
                                </a>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.severity}</Badge>
                            </TableCell>
                            <TableCell>{row.reasonCode}</TableCell>
                            <TableCell>{row.fieldName}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          Period {new Date(summary.period.start).toLocaleDateString()} –{" "}
          {new Date(summary.period.end).toLocaleDateString()}
        </div>
      </div>
    </AnalyticsLayout>
  );
}
