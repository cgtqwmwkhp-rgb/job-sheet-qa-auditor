/**
 * AttrFindingsGroup — clusters ATTR-C* engineer attribution findings.
 */

import { useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageSquare,
  Pencil,
  UserRound,
} from "lucide-react";
import type { Finding } from "./ReviewWorkstationPane";

export interface AttrFindingsGroupProps {
  findings: Finding[];
  activeBoxId: string | number | null;
  extractedName?: string | null;
  onFindingClick: (id: string | number) => void;
  onReportIssue: (finding: Finding, e: MouseEvent) => void;
  onOverride: (finding: Finding, e: MouseEvent) => void;
  onCorrect: (finding: Finding, e: MouseEvent) => void;
}

export function isAttrFinding(finding: Finding): boolean {
  return Boolean(finding.ruleId?.startsWith("ATTR-C"));
}

export function AttrFindingsGroup({
  findings,
  activeBoxId,
  extractedName,
  onFindingClick,
  onReportIssue,
  onOverride,
  onCorrect,
}: AttrFindingsGroupProps) {
  const [expanded, setExpanded] = useState(true);

  if (findings.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-violet-50/60 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-violet-700 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-violet-700 shrink-0" />
        )}
        <UserRound className="w-4 h-4 text-violet-700 shrink-0" />
        <span className="text-xs font-semibold text-violet-800">
          Engineer attribution
        </span>
        {extractedName ? (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 bg-white/70 text-violet-900 border-violet-200 truncate max-w-[140px]"
            title={extractedName}
          >
            {extractedName}
          </Badge>
        ) : null}
        <Badge
          variant="secondary"
          className="ml-auto text-[10px] px-1.5 bg-violet-100 text-violet-800 border-violet-200"
        >
          {findings.length}
        </Badge>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {findings.map(finding => (
            <div
              key={finding.id}
              id={`finding-${finding.id}`}
              className={`p-3 rounded-md border cursor-pointer transition-all ${
                activeBoxId === finding.id
                  ? "ring-2 ring-primary border-primary bg-primary/5"
                  : "hover:bg-white/80"
              } ${
                finding.status === "missing"
                  ? "bg-red-50/60 border-red-200"
                  : finding.status === "warning"
                    ? "bg-orange-50/60 border-orange-200"
                    : "bg-green-50/60 border-green-200"
              }`}
              onClick={() => onFindingClick(finding.id)}
            >
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {finding.status === "missing" ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  ) : finding.status === "warning" ? (
                    <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  )}
                  <h4 className="font-medium text-xs truncate">
                    {finding.field}
                  </h4>
                  {finding.failClass === "major" && (
                    <Badge
                      variant="destructive"
                      className="text-[10px] px-1 shrink-0"
                    >
                      Major
                    </Badge>
                  )}
                  {finding.failClass === "minor" && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1 shrink-0"
                    >
                      Minor
                    </Badge>
                  )}
                </div>
                {finding.ruleId && (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] px-1.5 shrink-0"
                    title={
                      finding.reasonCode
                        ? `${finding.ruleId} — ${finding.reasonCode}`
                        : finding.ruleId
                    }
                  >
                    {finding.ruleId}
                  </Badge>
                )}
              </div>

              {finding.message && (
                <p className="text-xs leading-snug text-violet-950/80">
                  {finding.message}
                </p>
              )}

              {finding.whyItMatters && (
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {finding.whyItMatters}
                </p>
              )}

              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5"
                  onClick={e => {
                    e.stopPropagation();
                    onFindingClick(finding.id);
                  }}
                >
                  <Eye className="w-3 h-3 mr-0.5" /> View
                </Button>
                {finding.status !== "passed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-1.5 hover:text-destructive"
                    onClick={e => onOverride(finding, e)}
                  >
                    Override
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5"
                  onClick={e => onCorrect(finding, e)}
                >
                  <Pencil className="w-3 h-3 mr-0.5" /> Correct
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-primary ml-auto"
                  onClick={e => onReportIssue(finding, e)}
                >
                  <MessageSquare className="w-3 h-3 mr-0.5" /> Report
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
