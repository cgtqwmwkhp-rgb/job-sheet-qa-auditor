import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Search, 
  MessageSquare, 
  FileText 
} from "lucide-react";

interface AnalysisResult {
  completenessScore: number;
  toneScore: number;
  clarityScore: number;
  flags: {
    type: "warning" | "error" | "success";
    message: string;
  }[];
  summary: string;
}

const MOCK_ANALYSIS: AnalysisResult = {
  completenessScore: 85,
  toneScore: 92,
  clarityScore: 78,
  flags: [
    { type: "success", message: "Clear root cause identified: 'Pump failure due to scale buildup'." },
    { type: "warning", message: "Missing part number for the replacement seal." },
    { type: "warning", message: "Vague timeline: 'Will return soon' - specific date recommended." }
  ],
  summary: "The engineer provides a good technical diagnosis but lacks specific inventory details for the follow-up visit. Tone is professional."
};

export function DeepNoteAnalysis() {
  return (
    <Card className="bg-slate-50 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-base text-indigo-900">Deep Note Analysis</CardTitle>
          </div>
          <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-200">
            AI Audit Active
          </Badge>
        </div>
        <CardDescription>
          Automated evaluation of engineer notes for quality and completeness.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scores */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Completeness</span>
              <span>{MOCK_ANALYSIS.completenessScore}%</span>
            </div>
            <Progress value={MOCK_ANALYSIS.completenessScore} className="h-2 bg-slate-200" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Tone & Professionalism</span>
              <span>{MOCK_ANALYSIS.toneScore}%</span>
            </div>
            <Progress value={MOCK_ANALYSIS.toneScore} className="h-2 bg-slate-200" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Technical Clarity</span>
              <span>{MOCK_ANALYSIS.clarityScore}%</span>
            </div>
            <Progress value={MOCK_ANALYSIS.clarityScore} className="h-2 bg-slate-200" />
          </div>
        </div>

        {/* Findings */}
        <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-200">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Key Findings
          </h4>
          <div className="space-y-2">
            {MOCK_ANALYSIS.flags.map((flag, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                {flag.type === "success" && <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />}
                {flag.type === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                {flag.type === "error" && <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                <span className="text-slate-600">{flag.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        <div className="bg-indigo-50 p-3 rounded-md border border-indigo-100">
          <div className="flex gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
            <p className="text-sm text-indigo-800 italic">
              "{MOCK_ANALYSIS.summary}"
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
