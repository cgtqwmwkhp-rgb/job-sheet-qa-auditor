import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type WindowHours = 1 | 24 | 48 | 168 | 720 | "all";

function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

function formatPct(share?: number): string {
  if (share === undefined || Number.isNaN(share)) return "—";
  return `${Math.round(share * 1000) / 10}%`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ShareBar({ share }: { share?: number }) {
  const pct = Math.max(0, Math.min(100, (share ?? 0) * 100));
  return (
    <div
      className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
      aria-hidden
    >
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ApiCostSettings() {
  const [window, setWindow] = useState<WindowHours>(48);
  const [view, setView] = useState("overview");

  const windowHours = window === "all" ? null : window;

  const query = trpc.system.apiCostSummary.useQuery(
    {
      windowHours,
      recentLimit: 50,
      jobSheetLimit: 50,
      dayLimit: 62,
      monthLimit: 24,
    },
    { refetchInterval: 30_000 }
  );

  const summary = query.data;

  const totals = useMemo(
    () => ({
      cost: summary?.totalCostUsd ?? 0,
      calls: summary?.totalCalls ?? 0,
      input: summary?.totalInputTokens ?? 0,
      output: summary?.totalOutputTokens ?? 0,
      avgCall: summary?.avgCostPerCallUsd ?? 0,
      avgJob: summary?.avgCostPerJobSheetUsd ?? 0,
      jobs: summary?.jobSheetsReviewed ?? 0,
      tools: summary?.byTool.length ?? 0,
    }),
    [summary]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            API Cost Tracking
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Best-in-class FinOps view: cost by AI tool, job-sheet review, day,
            and month. Estimates use public list rates — not provider invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(window)}
            onValueChange={v =>
              setWindow(v === "all" ? "all" : (Number(v) as WindowHours))
            }
          >
            <SelectTrigger className="w-[160px]" aria-label="Cost time window">
              <SelectValue placeholder="Window" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last hour</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="48">Last 48 hours</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
              <SelectItem value="720">Last 30 days</SelectItem>
              <SelectItem value="all">All retained</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh API costs"
          >
            {query.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading cost summary…
        </div>
      ) : query.isError ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Could not load API costs. Confirm you are signed in as an admin.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardDescription>Estimated spend</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatUsd(totals.cost)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg / review</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {formatUsd(totals.avgJob)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Reviews</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {formatTokens(totals.jobs)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>AI tools</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {formatTokens(totals.tools)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg / call</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {formatUsd(totals.avgCall)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>API calls</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {formatTokens(totals.calls)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tokens in/out</CardDescription>
                <CardTitle className="text-sm tabular-nums pt-1">
                  {formatTokens(totals.input)} / {formatTokens(totals.output)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">{summary?.retentionNote}</p>

          <Tabs value={view} onValueChange={setView} className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tools">By AI tool</TabsTrigger>
              <TabsTrigger value="reviews">By review</TabsTrigger>
              <TabsTrigger value="day">By day</TabsTrigger>
              <TabsTrigger value="month">By month</TabsTrigger>
              <TabsTrigger value="calls">Recent calls</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top AI tools</CardTitle>
                    <CardDescription>
                      Spend share by tool in this window.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(summary?.byTool.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No usage yet.
                      </p>
                    ) : (
                      summary!.byTool.slice(0, 8).map(row => (
                        <div key={row.key} className="space-y-1">
                          <div className="flex items-center justify-between text-sm gap-2">
                            <span className="truncate font-medium">
                              {row.label || row.key}
                            </span>
                            <span className="tabular-nums text-muted-foreground shrink-0">
                              {formatUsd(row.totalCostUsd)} ·{" "}
                              {formatPct(row.share)}
                            </span>
                          </div>
                          <ShareBar share={row.share} />
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent days</CardTitle>
                    <CardDescription>
                      Daily spend and average cost per review.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(summary?.byDay.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No daily spend yet.
                      </p>
                    ) : (
                      summary!.byDay.slice(0, 7).map(row => (
                        <div
                          key={row.period}
                          className="flex items-center justify-between text-sm gap-2"
                        >
                          <span className="font-medium tabular-nums">
                            {row.period}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatUsd(row.totalCostUsd)} · avg{" "}
                            {formatUsd(row.avgCostPerJobSheetUsd)}/review ·{" "}
                            {row.jobSheetsReviewed} reviews
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="tools">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cost by AI tool</CardTitle>
                  <CardDescription>
                    Every recorded provider capability (judgment, coaching, VLM,
                    OCR, …) with share of total spend.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(summary?.byTool.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No AI tool usage recorded yet.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>AI tool</TableHead>
                            <TableHead className="text-right">Calls</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-right">Share</TableHead>
                            <TableHead className="text-right">
                              Est. cost
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary!.byTool.map(row => (
                            <TableRow key={row.key}>
                              <TableCell>
                                <div className="font-medium">
                                  {row.label || row.key}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {row.key}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.count}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {formatTokens(row.inputTokens)} /{" "}
                                {formatTokens(row.outputTokens)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPct(row.share)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatUsd(row.totalCostUsd)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reviews">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Cost by job sheet review
                  </CardTitle>
                  <CardDescription>
                    Total estimated spend per reviewed job sheet, broken down by
                    AI tools used on that review.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(summary?.byJobSheet.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No job-sheet-attributed costs yet. Judgment and other
                      attributed calls populate this after processing.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Review</TableHead>
                            <TableHead>AI tools used</TableHead>
                            <TableHead className="text-right">Calls</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-right">
                              Est. cost
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary!.byJobSheet.map(row => (
                            <TableRow key={row.jobSheetId}>
                              <TableCell className="font-medium">
                                Job sheet #{row.jobSheetId}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {row.byTool.map(t => (
                                    <Badge
                                      key={t.key}
                                      variant="secondary"
                                      className="font-normal"
                                    >
                                      {t.label || t.key}{" "}
                                      {formatUsd(t.totalCostUsd)}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.callCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {formatTokens(row.inputTokens)} /{" "}
                                {formatTokens(row.outputTokens)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatUsd(row.totalCostUsd)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="day">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cost by day (UTC)</CardTitle>
                  <CardDescription>
                    Daily totals, reviews, average cost per review, and tools
                    that drove spend.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(summary?.byDay.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No daily spend yet.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Day</TableHead>
                            <TableHead className="text-right">
                              Reviews
                            </TableHead>
                            <TableHead className="text-right">Calls</TableHead>
                            <TableHead className="text-right">
                              Avg / review
                            </TableHead>
                            <TableHead>Top tools</TableHead>
                            <TableHead className="text-right">
                              Est. cost
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary!.byDay.map(row => (
                            <TableRow key={row.period}>
                              <TableCell className="font-medium tabular-nums">
                                {row.period}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.jobSheetsReviewed}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.callCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatUsd(row.avgCostPerJobSheetUsd)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-md">
                                  {row.byTool.slice(0, 3).map(t => (
                                    <Badge
                                      key={t.key}
                                      variant="outline"
                                      className="font-normal"
                                    >
                                      {t.label || t.key}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatUsd(row.totalCostUsd)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="month">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Cost by month (UTC)
                  </CardTitle>
                  <CardDescription>
                    Monthly rollups for budgeting and trend review.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(summary?.byMonth.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No monthly spend yet.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">
                              Reviews
                            </TableHead>
                            <TableHead className="text-right">Calls</TableHead>
                            <TableHead className="text-right">
                              Avg / review
                            </TableHead>
                            <TableHead>Top tools</TableHead>
                            <TableHead className="text-right">
                              Est. cost
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary!.byMonth.map(row => (
                            <TableRow key={row.period}>
                              <TableCell className="font-medium tabular-nums">
                                {row.period}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.jobSheetsReviewed}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.callCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatUsd(row.avgCostPerJobSheetUsd)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-md">
                                  {row.byTool.slice(0, 4).map(t => (
                                    <Badge
                                      key={t.key}
                                      variant="outline"
                                      className="font-normal"
                                    >
                                      {t.label || t.key}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatUsd(row.totalCostUsd)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="calls">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent calls</CardTitle>
                  <CardDescription>
                    Newest recorded LLM invocations in this window.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(summary?.recentEvents.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No API calls recorded yet.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>When</TableHead>
                            <TableHead>Review</TableHead>
                            <TableHead>AI tool</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-right">
                              Est. cost
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary!.recentEvents.map(event => (
                            <TableRow key={event.id}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {formatWhen(event.recordedAt)}
                              </TableCell>
                              <TableCell className="tabular-nums text-sm">
                                {event.jobSheetId != null
                                  ? `#${event.jobSheetId}`
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {event.tool.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {event.provider}/{event.model}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {formatTokens(event.inputTokens)} /{" "}
                                {formatTokens(event.outputTokens)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatUsd(event.estimatedCostUsd)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
