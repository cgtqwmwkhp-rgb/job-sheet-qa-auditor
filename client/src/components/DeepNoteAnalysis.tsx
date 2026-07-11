import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  MessageSquare,
  FileText,
} from "lucide-react";

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
}

export function DeepNoteAnalysis({
  analysis,
  className,
}: DeepNoteAnalysisProps) {
  if (!analysis) return null;

  return (
    <Card className={className ?? "bg-[#F9F9F9] border-[#EBE8E8]"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle className="text-base text-[#333030]">
              Deep Note Analysis
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="bg-[rgba(190,218,65,0.15)] text-[#333030] border-primary/40"
          >
            {analysis.recommendEscalate ? "Escalate suggested" : "AI advisory"}
          </Badge>
        </div>
        <CardDescription>
          Clinical evaluation of engineer notes — advisory only; Majors come
          from COMMENT-C rules.
          {analysis.provider ? ` (${analysis.provider})` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Completeness</span>
              <span>{analysis.completenessScore}%</span>
            </div>
            <Progress
              value={analysis.completenessScore}
              className="h-2 bg-[#EBE8E8]"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Tone & Professionalism</span>
              <span>{analysis.toneScore}%</span>
            </div>
            <Progress value={analysis.toneScore} className="h-2 bg-[#EBE8E8]" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Technical Clarity</span>
              <span>{analysis.clarityScore}%</span>
            </div>
            <Progress
              value={analysis.clarityScore}
              className="h-2 bg-[#EBE8E8]"
            />
          </div>
        </div>

        <div className="space-y-3 bg-white p-4 rounded-lg border border-[#EBE8E8]">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Key Findings
          </h4>
          <div className="space-y-2">
            {analysis.flags.map((flag, idx) => (
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
                <span className="text-slate-600">{flag.message}</span>
              </div>
            ))}
          </div>
        </div>

        {analysis.coachRewrite ? (
          <div className="bg-white p-3 rounded-md border border-[#EBE8E8]">
            <p className="text-xs font-medium text-slate-700 mb-1">
              Coach rewrite suggestion
            </p>
            <p className="text-sm text-slate-600">{analysis.coachRewrite}</p>
          </div>
        ) : null}

        <div className="bg-[rgba(190,218,65,0.12)] p-3 rounded-md border border-primary/30">
          <div className="flex gap-2">
            <MessageSquare className="h-4 w-4 text-[#706D6D] mt-0.5 shrink-0" />
            <p className="text-sm text-[#4A4646] italic">
              &ldquo;{analysis.summary}&rdquo;
            </p>
          </div>
        </div>
      </CardContent>
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
    flags: note.flags ?? [],
    summary: note.summary ?? "",
    coachRewrite: note.coachRewrite,
    gaps: note.gaps,
    recommendEscalate: note.recommendEscalate,
    provider: note.provider,
  };
}
