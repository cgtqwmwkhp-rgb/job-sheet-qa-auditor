import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeepNoteFlag {
  type: "warning" | "error" | "success";
  message: string;
}

export interface DeepNoteAnalysisData {
  completenessScore: number;
  toneScore: number;
  clarityScore: number;
  flags: DeepNoteFlag[];
  summary: string;
  coachRewrite?: string;
  gaps?: string[];
  recommendEscalate?: boolean;
  provider?: string;
}

export interface DeepNoteAnalysisProps {
  analysis?: DeepNoteAnalysisData | null;
  className?: string;
  /** Default closed — advisory, not primary triage. */
  defaultOpen?: boolean;
}

export function DeepNoteAnalysis({
  analysis,
  className,
  defaultOpen = false,
}: DeepNoteAnalysisProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!analysis) return null;

  const flags = Array.isArray(analysis.flags) ? analysis.flags : [];

  return (
    <Card className={cn("shadow-none", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-2 px-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-1 h-7 hover:bg-transparent"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Deep Note Analysis
              </CardTitle>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 ml-auto bg-[rgba(190,218,65,0.15)] text-[#333030] border-primary/40"
              >
                {analysis.recommendEscalate
                  ? "Escalate suggested"
                  : "AI advisory"}
              </Badge>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-4">
            <CardDescription className="text-[11px]">
              Clinical evaluation of engineer notes — advisory only; Majors come
              from COMMENT-C rules.
              {analysis.provider ? ` (${analysis.provider})` : ""}
            </CardDescription>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-slate-600">
                  <span>Completeness</span>
                  <span>{analysis.completenessScore}%</span>
                </div>
                <Progress
                  value={analysis.completenessScore}
                  className="h-2 bg-[#EBE8E8]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-slate-600">
                  <span>Tone</span>
                  <span>{analysis.toneScore}%</span>
                </div>
                <Progress
                  value={analysis.toneScore}
                  className="h-2 bg-[#EBE8E8]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-slate-600">
                  <span>Clarity</span>
                  <span>{analysis.clarityScore}%</span>
                </div>
                <Progress
                  value={analysis.clarityScore}
                  className="h-2 bg-[#EBE8E8]"
                />
              </div>
            </div>

            {flags.length > 0 && (
              <div className="space-y-2 bg-white p-3 rounded-lg border border-[#EBE8E8]">
                <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Key Findings
                </h4>
                <div className="space-y-2">
                  {flags.map((flag, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      {flag.type === "success" && (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      )}
                      {flag.type === "warning" && (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      {flag.type === "error" && (
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <span className="text-slate-600 text-xs">
                        {flag.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.coachRewrite ? (
              <div className="bg-white p-3 rounded-md border border-[#EBE8E8]">
                <p className="text-xs font-medium text-slate-700 mb-1">
                  Coach rewrite suggestion
                </p>
                <p className="text-sm text-slate-600">
                  {analysis.coachRewrite}
                </p>
              </div>
            ) : null}

            {analysis.summary ? (
              <div className="bg-[rgba(190,218,65,0.12)] p-3 rounded-md border border-primary/30">
                <div className="flex gap-2">
                  <MessageSquare className="h-4 w-4 text-[#706D6D] mt-0.5 shrink-0" />
                  <p className="text-sm text-[#4A4646] italic">
                    &ldquo;{analysis.summary}&rdquo;
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function mapDeepNoteFromReport(
  reportJson: unknown
): DeepNoteAnalysisData | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const report = reportJson as Record<string, unknown>;
  const note = report.commentDeepNote as
    | {
        completenessScore?: number;
        toneScore?: number;
        clarityScore?: number;
        flags?: DeepNoteFlag[];
        summary?: string;
        coachRewrite?: string;
        gaps?: string[];
        recommendEscalate?: boolean;
        provider?: string;
        enabled?: boolean;
      }
    | undefined;
  if (!note || note.enabled === false) return null;
  return {
    completenessScore: note.completenessScore ?? 0,
    toneScore: note.toneScore ?? 0,
    clarityScore: note.clarityScore ?? 0,
    flags: Array.isArray(note.flags) ? note.flags : [],
    summary: note.summary ?? "",
    coachRewrite: note.coachRewrite,
    gaps: Array.isArray(note.gaps) ? note.gaps : undefined,
    recommendEscalate: note.recommendEscalate,
    provider: note.provider,
  };
}
