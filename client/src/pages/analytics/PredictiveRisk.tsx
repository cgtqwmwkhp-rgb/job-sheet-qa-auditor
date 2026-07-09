import { AnalyticsLayout } from "./AnalyticsLayout";
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
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  BrainCircuit,
  Loader2,
  Package,
  Target,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PredictiveAlerts } from "@/components/PredictiveAlerts";
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

const BAND_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

function bandVariant(
  band: string
): "destructive" | "secondary" | "outline" | "default" {
  if (band === "critical") return "destructive";
  if (band === "high") return "secondary";
  return "outline";
}

export default function PredictiveRisk() {
  const { startDate, endDate } = useAnalyticsFilters();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: summary,
    isLoading,
    error,
  } = trpc.analytics.getPredictiveRiskSummary.useQuery({ startDate, endDate });

  const chartData = useMemo(
    () =>
      (summary?.attentionQueue ?? []).slice(0, 8).map(item => ({
        name:
          item.label.length > 16 ? `${item.label.slice(0, 14)}…` : item.label,
        fullName: item.label,
        risk: item.riskScore,
        band: item.band,
      })),
    [summary]
  );

  const selected = useMemo(
    () =>
      summary?.attentionQueue.find(q => q.id === selectedId) ??
      summary?.attentionQueue[0] ??
      null,
    [summary, selectedId]
  );

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Predictive Risk"
        description="Leading-indicator risk scoring and fix packs for entities needing attention."
      >
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading predictive risk...
          </span>
        </div>
      </AnalyticsLayout>
    );
  }

  if (error || !summary) {
    return (
      <AnalyticsLayout
        title="Predictive Risk"
        description="Leading-indicator risk scoring and fix packs for entities needing attention."
      >
        <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
          <AlertTriangle className="h-16 w-16 mb-4" />
          <p>{error?.message ?? "Unable to load predictive risk."}</p>
        </div>
      </AnalyticsLayout>
    );
  }

  const hasQueue = summary.attentionQueue.length > 0;

  return (
    <AnalyticsLayout
      title="Predictive Risk"
      description="Leading indicators (minor-issue mix, dispute rate, ambiguity trend) → needing-attention queue with fix packs."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entities scored</CardDescription>
            <CardTitle className="text-3xl">
              {summary.summary.entitiesScored}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needing attention</CardDescription>
            <CardTitle className="text-3xl">
              {summary.summary.needingAttention}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical / high</CardDescription>
            <CardTitle className="text-3xl text-destructive">
              {summary.summary.criticalCount + summary.summary.highCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fix packs</CardDescription>
            <CardTitle className="text-3xl">
              {summary.summary.fixPackCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {!hasQueue ? (
        <Card className="p-12 mt-6">
          <div className="flex flex-col items-center justify-center text-center">
            <Target className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              No entities needing attention
            </h2>
            <p className="text-muted-foreground max-w-md">
              Leading indicators are quiet for the current period. Risk scores
              will surface engineers, assets, and templates when minor-issue
              mix, disputes, or ambiguity trends rise.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5" />
                Attention queue
              </CardTitle>
              <CardDescription>
                Ranked by composite leading-indicator risk score.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, "Risk"]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName ?? ""
                    }
                  />
                  <Bar dataKey="risk" radius={[4, 4, 0, 0]}>
                    {chartData.map((row, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={BAND_COLORS[row.band] ?? "#64748b"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <PredictiveAlerts predictions={summary.predictions} />
        </div>
      )}

      {hasQueue && (
        <div className="grid gap-6 lg:grid-cols-2 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Needing attention</CardTitle>
              <CardDescription>
                Select a row to inspect drivers and the attached fix pack.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead>Docs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.attentionQueue.map(item => (
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer ${
                        (selectedId ?? summary.attentionQueue[0]?.id) ===
                        item.id
                          ? "bg-muted/60"
                          : ""
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <TableCell className="font-medium">
                        {item.label}
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {item.entityType}
                      </TableCell>
                      <TableCell>{item.riskScore}</TableCell>
                      <TableCell>
                        <Badge
                          variant={bandVariant(item.band)}
                          className="capitalize"
                        >
                          {item.band}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.documentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {selected ? selected.label : "Entity detail"}
              </CardTitle>
              <CardDescription>
                {selected?.suggestedAction ??
                  "Leading-indicator breakdown and coaching pack."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Select an entity from the queue.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Ambiguity trend</span>
                      <span>{selected.indicators.ambiguityTrend}</span>
                    </div>
                    <Progress value={selected.indicators.ambiguityTrend} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Dispute rate</span>
                      <span>{selected.indicators.disputeRate}</span>
                    </div>
                    <Progress value={selected.indicators.disputeRate} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Minor-issue mix</span>
                      <span>{selected.indicators.minorIssueMix}</span>
                    </div>
                    <Progress value={selected.indicators.minorIssueMix} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Issue rate</span>
                      <span>{selected.indicators.issueRate}</span>
                    </div>
                    <Progress value={selected.indicators.issueRate} />
                  </div>

                  {selected.drivers.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Top drivers</p>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                        {selected.drivers.map(d => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.fixPack &&
                  selected.fixPack.summary.totalIssues > 0 ? (
                    <div className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <p className="font-medium text-sm">Fix pack</p>
                        <Badge variant="outline">
                          {selected.fixPack.summary.totalIssues} issues
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Focus:{" "}
                        {selected.fixPack.summary.focusAreas.join(", ") || "—"}
                      </p>
                      <div className="space-y-2">
                        {selected.fixPack.issues.slice(0, 4).map((issue, i) => (
                          <div
                            key={`${issue.issueType}-${issue.fieldName}-${i}`}
                            className="text-sm border-t pt-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {issue.issueType}
                              </span>
                              <Badge variant="outline">{issue.severity}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {issue.fieldName} · {issue.occurrenceCount}× ·{" "}
                              {issue.correctProcedure.split("\n")[0]}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No engineer fix pack for this entity (asset/template
                      coaching uses suggested actions above).
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {summary.fixPacks.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Wired fix packs
            </CardTitle>
            <CardDescription>
              Generated from engineer findings in the attention queue (PR-15
              engine).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead>Focus areas</TableHead>
                  <TableHead>Valid until</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.fixPacks.map(fp => (
                  <TableRow key={fp.id}>
                    <TableCell className="font-medium">
                      {fp.engineerName}
                    </TableCell>
                    <TableCell>{fp.summary.totalIssues}</TableCell>
                    <TableCell>{fp.summary.criticalIssues}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fp.summary.focusAreas.join(", ")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(fp.validUntil).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </AnalyticsLayout>
  );
}
