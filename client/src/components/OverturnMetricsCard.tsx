/**
 * OverturnMetricsCard — read-only summary of override/waive/correction rates.
 *
 * Visible only when VITE_FEATURE_OVERTURN_METRICS=true.
 * Queries analytics.getOverturnMetricsSummary which itself gates on the
 * server-side FEATURE_OVERTURN_METRICS env var.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, ShieldCheck, FileEdit } from "lucide-react";
import { trpc } from "@/lib/trpc";

const FEATURE_ENABLED =
  import.meta.env.VITE_FEATURE_OVERTURN_METRICS === "true";

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function RateIndicator({
  label,
  rate,
  icon: Icon,
  color,
}: {
  label: string;
  rate: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${color}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-lg font-bold ${color}`}>
        {formatPercent(rate)}
      </span>
    </div>
  );
}

export default function OverturnMetricsCard() {
  if (!FEATURE_ENABLED) return null;

  const { data, isLoading, error } =
    trpc.analytics.getOverturnMetricsSummary.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading overturn metrics...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Unable to load overturn metrics.
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.enabled) {
    return null;
  }

  const { totalActions, agreements, overturns, fieldCorrections } = data;

  if (totalActions === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Trust Calibration</CardTitle>
          <CardDescription>Override & correction rates</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground text-center py-4">
          No finding-level review actions recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">AI Trust Calibration</CardTitle>
            <CardDescription>Override & correction rates</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {totalActions} actions
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <RateIndicator
          label="Agreement"
          rate={data.agreementRate}
          icon={ShieldCheck}
          color="text-green-600"
        />
        <RateIndicator
          label="Overturns"
          rate={data.overturnRate}
          icon={ShieldAlert}
          color="text-amber-600"
        />
        <RateIndicator
          label="Corrections"
          rate={data.correctionRate}
          icon={FileEdit}
          color="text-blue-600"
        />

        {data.breakdown.length > 0 && (
          <div className="pt-2 border-t mt-3">
            <p className="text-xs text-muted-foreground mb-2">Breakdown</p>
            <div className="flex flex-wrap gap-2">
              {data.breakdown.map(b => (
                <Badge key={b.category} variant="secondary" className="text-xs">
                  {b.category.replace("_", " ")}: {b.count} (
                  {formatPercent(b.rate)})
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2">
          {agreements} agreed · {overturns} overturned · {fieldCorrections}{" "}
          corrected
        </p>
      </CardContent>
    </Card>
  );
}
