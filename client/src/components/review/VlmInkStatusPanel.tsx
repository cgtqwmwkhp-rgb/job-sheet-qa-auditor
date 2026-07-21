/**
 * Thin trust chip for reportJson.vlmInkVerification (Wave B).
 * Surfaces whether Anthropic ink verification actually ran — reviewers
 * previously had no UI signal for vlmUsed despite it driving sign-off honesty.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface VlmInkStatus {
  vlmUsed: boolean;
  passed?: boolean | null;
  confidence?: number | null;
  mediaMode?: string | null;
  /** Present when ink path did not run or VLM was fail-soft skipped (PX-116). */
  skippedReason?: string | null;
  ran?: boolean | null;
  enabled?: boolean | null;
}

export function mapVlmInkFromReport(reportJson: unknown): VlmInkStatus | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const raw = (reportJson as Record<string, unknown>).vlmInkVerification;
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  return {
    vlmUsed: Boolean(v.vlmUsed),
    passed: typeof v.passed === "boolean" ? v.passed : null,
    confidence: typeof v.confidence === "number" ? v.confidence : null,
    mediaMode: typeof v.mediaMode === "string" ? v.mediaMode : null,
    skippedReason: typeof v.skippedReason === "string" ? v.skippedReason : null,
    ran: typeof v.ran === "boolean" ? v.ran : null,
    enabled: typeof v.enabled === "boolean" ? v.enabled : null,
  };
}

export interface VlmInkStatusPanelProps {
  status: VlmInkStatus | null | undefined;
  className?: string;
}

export function VlmInkStatusPanel({
  status,
  className,
}: VlmInkStatusPanelProps) {
  if (!status) return null;

  const label = status.vlmUsed
    ? status.passed === true
      ? "Ink verified"
      : status.passed === false
        ? "Ink absent / fail"
        : "Ink checked"
    : status.skippedReason
      ? `Ink skipped: ${status.skippedReason}`
      : "Ink not verified (honesty demote)";

  const variant = status.vlmUsed
    ? status.passed === false
      ? "destructive"
      : "secondary"
    : "outline";

  const detail = [
    status.vlmUsed ? "vlmUsed:true" : "vlmUsed:false",
    status.skippedReason ? `skip:${status.skippedReason}` : null,
    status.ran === false ? "ran:false" : null,
    status.enabled === false ? "enabled:false" : null,
    status.confidence != null
      ? `conf ${(status.confidence * 100).toFixed(0)}%`
      : null,
    status.mediaMode ? `media:${status.mediaMode}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className={cn("shadow-none", className)}>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-2">
          Signature ink (VLM)
          <Badge variant={variant} className="text-[10px] font-normal">
            {label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0">
        <p className="text-[11px] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
