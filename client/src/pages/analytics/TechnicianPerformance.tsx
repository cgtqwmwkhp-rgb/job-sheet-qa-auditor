import { AnalyticsLayout } from "./AnalyticsLayout";
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
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
  Minus,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useMemo, useState } from "react";
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

const SCORE_COLORS = ["#16a34a", "#2563eb", "#ca8a04", "#dc2626", "#7c3aed"];

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") {
    return <TrendingUp className="h-4 w-4 text-green-600" />;
  }
  if (trend === "declining") {
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "S0":
      return "bg-red-100 text-red-800 border-red-200";
    case "S1":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "S2":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function TechnicianPerformance() {
  const { startDate, endDate } = useAnalyticsFilters();
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(
    null
  );

  const {
    data: summary,
    isLoading,
    error,
  } = trpc.analytics.getEngineerSummary.useQuery({ startDate, endDate });

  const { data: detail, isLoading: detailLoading } =
    trpc.analytics.getEngineerScoreCard.useQuery(
      { engineerId: selectedEngineerId!, startDate, endDate },
      { enabled: !!selectedEngineerId }
    );

  const chartData = useMemo(
    () =>
      (summary?.leaderboard ?? []).slice(0, 8).map(row => ({
        name:
          row.engineerName.length > 14
            ? `${row.engineerName.slice(0, 12)}…`
            : row.engineerName,
        score: row.overallScore,
        issues: row.criticalIssues,
      })),
    [summary]
  );

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Technician Performance"
        description="Track and compare technician quality metrics."
      >
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading engineer analytics...
          </span>
        </div>
      </AnalyticsLayout>
    );
  }

  if (error) {
    return (
      <AnalyticsLayout
        title="Technician Performance"
        description="Track and compare technician quality metrics."
      >
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Failed to Load Engineer Analytics
          </h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </AnalyticsLayout>
    );
  }

  const hasData = (summary?.engineerCount ?? 0) > 0;

  if (!hasData) {
    return (
      <AnalyticsLayout
        title="Technician Performance"
        description="Track and compare technician quality metrics."
      >
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              No Technician Attribution Yet
            </h2>
            <p className="text-muted-foreground max-w-md">
              Upload and process job sheets with a technician assigned to see
              scorecards, trends, and drill-through to underlying audits.
            </p>
          </div>
        </Card>
      </AnalyticsLayout>
    );
  }

  if (selectedEngineerId) {
    const scoreCard = detail?.scoreCard;
    const drilldown = detail?.drilldown ?? [];

    return (
      <AnalyticsLayout
        title="Technician Performance"
        description="Scorecard and finding drill-through for the selected technician."
      >
        <div className="space-y-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedEngineerId(null)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to leaderboard
          </Button>

          {detailLoading || !scoreCard ? (
            <div className="flex items-center justify-center h-[30vh]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {scoreCard.engineerName}
                    </CardTitle>
                    <CardDescription>Overall score</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2">
                    <span className="text-3xl font-bold">
                      {scoreCard.overallScore}
                    </span>
                    <TrendIcon trend={scoreCard.trend} />
                    <span className="text-sm text-muted-foreground capitalize">
                      {scoreCard.trend}
                    </span>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {scoreCard.documentsProcessed}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {scoreCard.documentsWithIssues} with issues (
                      {Math.round(scoreCard.issueRate * 100)}%)
                    </p>
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
                      {scoreCard.issuesBySeverity.S0 +
                        scoreCard.issuesBySeverity.S1}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      S0 {scoreCard.issuesBySeverity.S0} · S1{" "}
                      {scoreCard.issuesBySeverity.S1}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Peer percentile
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {scoreCard.peerComparison.percentile}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Team avg {scoreCard.peerComparison.teamAvgScore}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {scoreCard.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Coaching recommendations</CardTitle>
                    <CardDescription>
                      Generated from recurring and critical findings in-period.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {scoreCard.recommendations.map(rec => (
                      <div
                        key={rec.id}
                        className="flex items-start justify-between gap-4 border rounded-lg p-3"
                      >
                        <div>
                          <p className="font-medium">{rec.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {rec.description}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="capitalize shrink-0"
                        >
                          {rec.priority}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {detail?.fixPack && detail.fixPack.summary.totalIssues > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Fix pack</CardTitle>
                    <CardDescription>
                      Targeted coaching pack from in-period findings (also
                      surfaced on Predictive Risk).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge variant="outline">
                        {detail.fixPack.summary.totalIssues} issues
                      </Badge>
                      <Badge variant="secondary">
                        {detail.fixPack.summary.criticalIssues} critical
                      </Badge>
                      <span className="text-muted-foreground">
                        Focus:{" "}
                        {detail.fixPack.summary.focusAreas.join(", ") || "—"}
                      </span>
                    </div>
                    {detail.fixPack.issues.slice(0, 5).map((issue, i) => (
                      <div
                        key={`${issue.issueType}-${issue.fieldName}-${i}`}
                        className="border rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">
                            {issue.issueType} · {issue.fieldName}
                          </p>
                          <Badge
                            variant="outline"
                            className={severityBadgeClass(issue.severity)}
                          >
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {issue.occurrenceCount}× ·{" "}
                          {issue.correctProcedure.split("\n")[0]}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Findings drill-through</CardTitle>
                  <CardDescription>
                    Open the underlying job sheet audit for each finding.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {drilldown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No findings in this period.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job sheet</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Issue</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drilldown.map(row => (
                          <TableRow key={row.findingId}>
                            <TableCell>
                              <Link href={`/audits?id=${row.jobSheetId}`}>
                                <a className="text-primary hover:underline font-medium">
                                  JS-{row.jobSheetId}
                                </a>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={severityBadgeClass(row.severity)}
                              >
                                {row.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.issueType}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.fieldName}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {row.resolutionStatus}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(row.occurredAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout
      title="Technician Performance"
      description="Track and compare technician quality metrics."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Technicians</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary!.engineerCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                With attributed job sheets
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Team avg score
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary!.teamAvgScore}</div>
              <p className="text-xs text-muted-foreground mt-1">
                0–100 quality score
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary!.totalDocuments}
              </div>
              <p className="text-xs text-muted-foreground mt-1">In period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Findings</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary!.totalIssues}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Trend: {summary!.trends.overallTrend.direction}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Score distribution</CardTitle>
              <CardDescription>
                Top technicians by overall quality score.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mr-2" />
                  No chart data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SCORE_COLORS[index % SCORE_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>
                Declining scores or below team quality threshold.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(summary!.trends.needingAttention.length === 0
                ? summary!.leaderboard.slice(-3).reverse()
                : summary!.trends.needingAttention
              ).map(row => (
                <button
                  key={row.engineerId}
                  type="button"
                  onClick={() => setSelectedEngineerId(row.engineerId)}
                  className="w-full flex items-center justify-between border rounded-lg p-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <p className="font-medium">{row.engineerName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {"trend" in row ? row.trend : "stable"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendIcon
                      trend={"trend" in row ? String(row.trend) : "stable"}
                    />
                    <span className="font-semibold">
                      {"currentScore" in row
                        ? row.currentScore
                        : row.overallScore}
                    </span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>
              Click a technician to open scorecard and audit drill-through.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Issue rate</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead>Top issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary!.leaderboard.map(row => (
                  <TableRow
                    key={row.engineerId}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelectedEngineerId(row.engineerId)}
                  >
                    <TableCell className="font-medium">
                      {row.engineerName}
                    </TableCell>
                    <TableCell>{row.overallScore}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 capitalize">
                        <TrendIcon trend={row.trend} />
                        {row.trend}
                      </div>
                    </TableCell>
                    <TableCell>{row.documentsProcessed}</TableCell>
                    <TableCell>{Math.round(row.issueRate * 100)}%</TableCell>
                    <TableCell>{row.criticalIssues}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.topIssueType ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AnalyticsLayout>
  );
}
