/**
 * Wave-7: template learning-curve scorecard (cohorts 1–200).
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function TemplateLearningCurveCard() {
  const [templateIdInput, setTemplateIdInput] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);

  const { data, isLoading, error } =
    trpc.analytics.getTemplateLearningCurve.useQuery(
      { templateId: templateId ?? 0 },
      { enabled: templateId != null && templateId > 0 }
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Template learning curve</CardTitle>
        <CardDescription>
          Correction and memory-applied rates by audit cohort (first 200).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Label htmlFor="tmpl-learning-id">Template id</Label>
            <Input
              id="tmpl-learning-id"
              inputMode="numeric"
              placeholder="e.g. 12"
              value={templateIdInput}
              onChange={e => setTemplateIdInput(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const n = Number(templateIdInput);
              setTemplateId(Number.isFinite(n) && n > 0 ? n : null);
            }}
          >
            Load
          </Button>
        </div>

        {templateId == null && (
          <p className="text-sm text-muted-foreground">
            Enter a template id to load the cohort scorecard.
          </p>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading curve…
          </div>
        )}

        {error && (
          <p className="text-sm text-muted-foreground">
            Unable to load learning curve.
          </p>
        )}

        {data && !data.enabled && (
          <p className="text-sm text-muted-foreground">
            No lineage data for this template yet.
          </p>
        )}

        {data && data.enabled && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {data.totalAudits} audits · memory applied on{" "}
              {formatPercent(data.pctAuditsWithMemoryApplied)} · funnel{" "}
              {data.memoryFunnel.collecting}c / {data.memoryFunnel.shadow}s /{" "}
              {data.memoryFunnel.approved}a
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                ["1-50", "51-100", "101-200", "201+"] as const
              ).map(bucket => {
                const c = data.cohorts[bucket];
                return (
                  <div
                    key={bucket}
                    className="rounded border border-border p-2 text-xs"
                  >
                    <div className="font-medium mb-1">Audits {bucket}</div>
                    <div className="text-muted-foreground">
                      n={c.audits} · corr {c.correctionEvents} · mem{" "}
                      {c.memoryAppliedAudits} · rate{" "}
                      {formatPercent(c.fieldCorrectionRate)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
