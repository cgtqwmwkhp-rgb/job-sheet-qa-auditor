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
import { Textarea } from "@/components/ui/textarea";
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
  CheckCircle2,
  Loader2,
  Printer,
} from "lucide-react";
import { Link, useRoute, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "review_queue":
      return "Needs review";
    case "waived":
      return "Waived";
    default:
      return "—";
  }
}

function trendLabel(trend: string): string {
  if (trend === "increasing") return "up vs prior";
  if (trend === "decreasing") return "down vs prior";
  return "stable vs prior";
}

type PackData = NonNullable<
  ReturnType<typeof trpc.analytics.getEngineerCoachingPack.useQuery>["data"]
>["pack"];
type SessionData = NonNullable<
  ReturnType<typeof trpc.analytics.getEngineerCoachingPack.useQuery>["data"]
>["session"];

function CoachingPackView({
  pack,
  session,
  onMarkCompleted,
  markPending,
}: {
  pack: NonNullable<PackData>;
  session: SessionData;
  onMarkCompleted: (input: {
    qaLeadNote: string;
    narrativeOpening: string;
    coachingAsks: string[];
  }) => void;
  markPending: boolean;
}) {
  const [opening, setOpening] = useState(pack.draftNarrative.opening);
  const [strengthsText, setStrengthsText] = useState(
    pack.draftNarrative.strengths.join("\n\n")
  );
  const [themesText, setThemesText] = useState(
    pack.draftNarrative.themesSummary
  );
  const [developmentText, setDevelopmentText] = useState(
    pack.draftNarrative.development.join("\n\n")
  );
  const [asksText, setAsksText] = useState(
    pack.draftNarrative.coachingAsks.join("\n")
  );
  const [qaNote, setQaNote] = useState(session?.qaLeadNote ?? "");

  const periodLabel = useMemo(() => {
    const s = new Date(pack.period.start).toLocaleDateString("en-GB");
    const e = new Date(pack.period.end).toLocaleDateString("en-GB");
    return `${s} – ${e}`;
  }, [pack.period.start, pack.period.end]);

  const m = pack.summaryMetrics;

  return (
    <AnalyticsLayout
      title={`Coaching pack — ${pack.engineerName}`}
      description={`Analytical feedback for ${periodLabel}. Narrative first; numbers support the conversation.`}
    >
      <div className="space-y-8 coaching-pack-print">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/analytics/technicians">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to technicians
            </Button>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={markPending || !!session}
              onClick={() =>
                onMarkCompleted({
                  qaLeadNote: qaNote,
                  narrativeOpening: opening,
                  coachingAsks: asksText
                    .split("\n")
                    .map(s => s.trim())
                    .filter(Boolean),
                })
              }
            >
              {session ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Session completed
                </>
              ) : (
                "Mark coaching completed"
              )}
            </Button>
          </div>
        </div>

        <section className="space-y-5 print:break-after-page">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Page 1 · One-page summary
            </p>
            <h2 className="text-2xl font-heading font-semibold mt-1">
              {pack.engineerName}
            </h2>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm border-b border-border/60 pb-4">
            <span>
              <strong>{m.cardsAssessed}</strong> cards
            </span>
            <span>
              Pass {m.passCount} · Review {m.reviewCount} · Fail {m.failCount}
            </span>
            <span>
              Doc% avg {m.avgDocPercent != null ? `${m.avgDocPercent}%` : "—"}
            </span>
            <span>
              Majors <strong>{m.majorCount}</strong>
            </span>
            <span>Peer p{m.peerPercentile}</span>
            <Badge variant="outline" className="capitalize">
              {pack.scoreCard.trend}
            </Badge>
          </div>

          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Opening</CardTitle>
              <CardDescription>
                Edit before sharing — you own this feedback.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={opening}
                onChange={e => setOpening(e.target.value)}
                className="min-h-[100px] text-base leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What went well</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={strengthsText}
                onChange={e => setStrengthsText(e.target.value)}
                className="min-h-[90px] leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Themes this period</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={themesText}
                onChange={e => setThemesText(e.target.value)}
                className="min-h-[80px] leading-relaxed"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {pack.themes.map(t => (
                  <div
                    key={t.themeId}
                    className="rounded-md border border-border/70 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{t.title}</p>
                      <Badge variant="secondary" className="text-xs">
                        {trendLabel(t.trend)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      {t.findingCount} findings · {t.majorCount} major ·{" "}
                      {t.percentageOfIssues}% of issues · e.g.{" "}
                      {t.exampleJobSheetIds.map(id => `JS-${id}`).join(", ") ||
                        "—"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Priority development areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={developmentText}
                onChange={e => setDevelopmentText(e.target.value)}
                className="min-h-[110px] leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Coaching ask</CardTitle>
              <CardDescription>
                One ask per line for the next period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={asksText}
                onChange={e => setAsksText(e.target.value)}
                className="min-h-[90px] leading-relaxed"
              />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Pages 2–3 · Coaching session pack
            </p>
            <h2 className="text-xl font-heading font-semibold mt-1">
              Job cards & worked examples
            </h2>
          </div>

          <Card className="print:shadow-none print:border">
            <CardHeader>
              <CardTitle className="text-base">Job cards in scope</CardTitle>
              <CardDescription>
                {pack.jobCards.length} card
                {pack.jobCards.length === 1 ? "" : "s"} attributed in period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pack.jobCards.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cards.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Doc%</TableHead>
                      <TableHead>Theme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pack.jobCards.map(row => (
                      <TableRow key={row.jobSheetId}>
                        <TableCell>
                          <Link href={`/audits?id=${row.jobSheetId}`}>
                            <a className="text-primary hover:underline font-medium">
                              {row.referenceNumber || `JS-${row.jobSheetId}`}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(row.processedAt).toLocaleDateString(
                            "en-GB"
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">
                          {row.siteInfo || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {outcomeLabel(row.outcome)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.docPercent != null ? `${row.docPercent}%` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.primaryTheme || "—"}
                          {row.primaryRuleId ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {row.primaryRuleId}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border">
            <CardHeader>
              <CardTitle className="text-base">Theme deep-dive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pack.developmentAreas.map(t => (
                <div
                  key={t.themeId}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{t.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {t.findingCount} findings · {t.sheetCount} cards · prior{" "}
                      {t.priorFindingCount}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t.definition}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Good looks like: </span>
                    {t.goodLooksLike}
                  </p>
                  {t.exampleRuleIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Rules: {t.exampleRuleIds.join(", ")}
                    </p>
                  )}
                </div>
              ))}
              {pack.developmentAreas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No priority development themes this period.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border">
            <CardHeader>
              <CardTitle className="text-base">Worked examples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pack.workedExamples.map(ex => (
                <div
                  key={`${ex.jobSheetId}-${ex.ruleId}-${ex.fieldName}`}
                  className="border rounded-lg p-4 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/audits?id=${ex.jobSheetId}`}>
                      <a className="font-medium text-primary hover:underline">
                        {ex.referenceNumber || `JS-${ex.jobSheetId}`}
                      </a>
                    </Link>
                    <Badge variant="outline">{ex.severity}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {ex.themeTitle}
                      {ex.ruleId ? ` · ${ex.ruleId}` : ""}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">What went wrong: </span>
                    {ex.whatWentWrong}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Correct approach: </span>
                    {ex.correctApproach}
                  </p>
                </div>
              ))}
              {pack.workedExamples.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No worked examples — few or no findings in period.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="print:shadow-none print:border print:hidden">
            <CardHeader>
              <CardTitle className="text-base">Session record</CardTitle>
              <CardDescription>
                QA Lead notes stored when you mark the session completed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={qaNote}
                onChange={e => setQaNote(e.target.value)}
                placeholder="Agreed actions, engineer comments, follow-ups…"
                className="min-h-[100px]"
                disabled={!!session}
              />
              {session && (
                <p className="text-sm text-muted-foreground">
                  Completed{" "}
                  {new Date(session.completedAt).toLocaleString("en-GB")} by
                  user #{session.qaLeadUserId}.
                </p>
              )}
            </CardContent>
          </Card>

          {(pack.evidenceRoi.totalEvidenceFindings > 0 ||
            (pack.fixPack && pack.fixPack.summary.totalIssues > 0)) && (
            <Card className="print:shadow-none print:border">
              <CardHeader>
                <CardTitle className="text-base">
                  Evidence signal & fix pack
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Evidence findings: COMMENT {pack.evidenceRoi.commentFailCount}{" "}
                  · PHOTO {pack.evidenceRoi.photoFailCount} · EVIDENCE{" "}
                  {pack.evidenceRoi.coherenceFailCount}
                </p>
                {pack.fixPack && pack.fixPack.summary.focusAreas.length > 0 && (
                  <p className="text-muted-foreground">
                    Fix-pack focus: {pack.fixPack.summary.focusAreas.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      <style>{`
        @media print {
          nav, aside, header, .print\\:hidden { display: none !important; }
          body { background: white; }
          .coaching-pack-print { padding: 0; }
        }
      `}</style>
    </AnalyticsLayout>
  );
}

export default function EngineerCoachingPackPage() {
  const [, params] = useRoute("/analytics/technicians/:engineerId/coaching");
  const search = useSearch();
  const engineerId = params?.engineerId ?? "";
  const { startDate, endDate, site } = useAnalyticsFilters();

  const queryDates = useMemo(() => {
    const qs = new URLSearchParams(search);
    return {
      startDate: qs.get("start") || startDate,
      endDate: qs.get("end") || endDate,
    };
  }, [search, startDate, endDate]);

  const { data, isLoading, error, refetch } =
    trpc.analytics.getEngineerCoachingPack.useQuery(
      {
        engineerId,
        startDate: queryDates.startDate,
        endDate: queryDates.endDate,
        site,
      },
      { enabled: !!engineerId }
    );

  const markCompleted = trpc.analytics.markCoachingCompleted.useMutation({
    onSuccess: () => {
      toast.success("Coaching session marked completed");
      void refetch();
    },
    onError: err => toast.error(err.message),
  });

  const pack = data?.pack ?? null;
  const session = data?.session ?? null;

  if (!engineerId) {
    return (
      <AnalyticsLayout
        title="Coaching pack"
        description="Select a technician to open their analytical coaching pack."
      >
        <Card className="p-8 text-center text-muted-foreground">
          Missing engineer id.{" "}
          <Link href="/analytics/technicians">
            <a className="text-primary underline">Back to technicians</a>
          </Link>
        </Card>
      </AnalyticsLayout>
    );
  }

  if (isLoading) {
    return (
      <AnalyticsLayout
        title="Coaching pack"
        description="Building analytical feedback for this period."
      >
        <div className="flex items-center justify-center h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AnalyticsLayout>
    );
  }

  if (error) {
    return (
      <AnalyticsLayout
        title="Coaching pack"
        description="Building analytical feedback for this period."
      >
        <div className="flex flex-col items-center justify-center h-[40vh]">
          <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </AnalyticsLayout>
    );
  }

  if (!pack) {
    return (
      <AnalyticsLayout
        title="Coaching pack"
        description="Building analytical feedback for this period."
      >
        <Card className="p-8 space-y-3">
          <p className="text-muted-foreground">
            No attributed job cards for this technician in the selected period.
          </p>
          <Link href="/analytics/technicians">
            <a className="text-primary underline text-sm">
              Back to technicians
            </a>
          </Link>
        </Card>
      </AnalyticsLayout>
    );
  }

  return (
    <CoachingPackView
      key={`${pack.engineerId}-${pack.period.start}-${pack.period.end}-${session?.id ?? "open"}`}
      pack={pack}
      session={session}
      markPending={markCompleted.isPending}
      onMarkCompleted={input =>
        markCompleted.mutate({
          engineerId: pack.engineerId,
          engineerName: pack.engineerName,
          periodStart: pack.period.start,
          periodEnd: pack.period.end,
          ...input,
        })
      }
    />
  );
}
