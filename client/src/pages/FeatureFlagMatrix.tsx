/**
 * Feature Flag Matrix (admin / qa_lead) — read-only.
 *
 * Shows effective FEATURE_* values this process sees, plus the documented
 * staging ↔ production deploy contract for critical flags.
 */

import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  Flag,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { Link } from "wouter";

function ExpectationBadge({ value }: { value: string }) {
  const tone =
    value === "true"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : value === "false"
        ? "bg-rose-50 text-rose-800 border-rose-200"
        : value === "conditional"
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn("font-mono text-xs", tone)}>
      {value}
    </Badge>
  );
}

function TruthBadge({ truthy, raw }: { truthy: boolean; raw: string | null }) {
  if (raw === null) {
    return (
      <Badge
        variant="outline"
        className="font-mono text-xs text-muted-foreground"
      >
        unset
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-xs",
        truthy
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "bg-rose-50 text-rose-800 border-rose-200"
      )}
    >
      {raw}
    </Badge>
  );
}

export default function FeatureFlagMatrixPage() {
  const [filter, setFilter] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } =
    trpc.system.featureFlagMatrix.useQuery(undefined, {
      staleTime: 15_000,
    });

  const filteredFlags = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.flags.filter(f => {
      if (criticalOnly && !f.critical) return false;
      if (!q) return true;
      return (
        f.key.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q)
      );
    });
  }, [data, filter, criticalOnly]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="border-b border-border/50 pb-6">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/monitoring">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to monitoring
            </Link>
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-3xl font-bold tracking-tight text-foreground">
                <Flag className="h-7 w-7 text-primary" />
                Feature flag matrix
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Read-only view of effective{" "}
                <code className="text-sm">FEATURE_*</code> values this process
                sees, plus the staging/prod deploy contract.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading effective flags…
          </div>
        ) : null}

        {isError ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">
                Could not load flag matrix
              </CardTitle>
              <CardDescription>
                {error?.message ?? "Unknown error"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>This process</CardDescription>
                  <CardTitle className="font-mono text-xl">
                    {data.environment}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  NODE_ENV={data.nodeEnv}
                  <br />
                  Snapshot {new Date(data.timestamp).toLocaleString()}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Critical env-to-env match</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    {data.criticalParity.allCriticalMatchedOrDocumented ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        Documented
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        Review
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {data.criticalParity.matched.length} must-match ·{" "}
                  {data.criticalParity.intentionallyDivergent.length}{" "}
                  intentionally divergent
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Source</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4 text-primary" />
                    Read-only
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Effective: {data.source.effective}
                  <br />
                  Contract: {data.source.deployContract}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Deploy matrix (critical)</CardTitle>
                <CardDescription>
                  Documented staging ↔ production expectations from
                  azure-deploy.yml. FlagOps owns workflow edits; this view is
                  informational only.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flag</TableHead>
                      <TableHead>Staging</TableHead>
                      <TableHead>Production</TableHead>
                      <TableHead>Parity</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.deployMatrix.map(row => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="font-mono text-sm">{row.key}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ExpectationBadge value={row.staging} />
                        </TableCell>
                        <TableCell>
                          <ExpectationBadge value={row.production} />
                        </TableCell>
                        <TableCell>
                          {row.parity === "must_match" ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                row.stagingProdMatch
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-rose-200 bg-rose-50 text-rose-800"
                              )}
                            >
                              {row.stagingProdMatch ? "matched" : "mismatch"}
                            </Badge>
                          ) : row.parity === "intentionally_divergent" ? (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-xs text-amber-900"
                            >
                              divergent (ok)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              unspecified
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground">
                          {row.note ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <CardTitle>Effective flags (this process)</CardTitle>
                    <CardDescription>
                      Raw <code className="text-xs">process.env</code> values
                      seen by the running server — not a remote Azure query.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Filter flags…"
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      className="w-56"
                    />
                    <Button
                      variant={criticalOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCriticalOnly(v => !v)}
                    >
                      Critical only
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flag</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Default if unset</TableHead>
                      <TableHead>vs deploy contract</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFlags.map(flag => (
                      <TableRow key={flag.key}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">
                              {flag.key}
                            </span>
                            {flag.critical ? (
                              <Badge className="text-[10px]">critical</Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {flag.description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <TruthBadge truthy={flag.truthy} raw={flag.raw} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {flag.defaultWhenUnset}
                        </TableCell>
                        <TableCell>
                          {flag.matchesDeployContract === null ? (
                            <span className="text-xs text-muted-foreground">
                              n/a
                            </span>
                          ) : flag.matchesDeployContract ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-xs text-emerald-800"
                            >
                              matches {data.environment}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-rose-200 bg-rose-50 text-xs text-rose-800"
                            >
                              drift vs {data.environment}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredFlags.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No flags match the current filter.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key environment</CardTitle>
                <CardDescription>
                  Non-secret values shown in full; API keys show configured /
                  missing only.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variable</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.keyEnv.map(env => (
                      <TableRow key={env.key}>
                        <TableCell>
                          <div className="font-mono text-sm">{env.key}</div>
                          <div className="text-xs text-muted-foreground">
                            {env.description}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {env.configured !== undefined
                            ? env.configured
                              ? "configured"
                              : "missing"
                            : (env.raw ?? "unset")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {data.uncatalogued.length > 0 ? (
              <Card className="border-amber-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Uncatalogued FEATURE_* in process.env
                  </CardTitle>
                  <CardDescription>
                    Present on this process but not in the FlagMatrix catalog —
                    add them if intentional.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 font-mono text-sm">
                  {data.uncatalogued.map(u => (
                    <div key={u.key}>
                      {u.key}={u.raw}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
