/**
 * RelationshipFindingsGroup
 *
 * Clusters findings whose fieldName contains "↔" under an
 * "Outcome consistency" collapsible group so auditors can review
 * clinical cross-field relationships together.
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
  Link2,
  MessageSquare,
  Pencil,
} from "lucide-react";
import type { Finding } from "./ReviewWorkstationPane";

export interface RelationshipFindingsGroupProps {
  findings: Finding[];
  activeBoxId: string | number | null;
  onFindingClick: (id: string | number) => void;
  onReportIssue: (finding: Finding, e: MouseEvent) => void;
  onOverride: (finding: Finding, e: MouseEvent) => void;
  onCorrect: (finding: Finding, e: MouseEvent) => void;
}

export function isRelationshipFinding(finding: Finding): boolean {
  return finding.field.includes("↔");
}

export function RelationshipFindingsGroup({
  findings,
  activeBoxId,
  onFindingClick,
  onReportIssue,
  onOverride,
  onCorrect,
}: RelationshipFindingsGroupProps) {
  const [expanded, setExpanded] = useState(true);

  if (findings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/30 overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-amber-50/60 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-amber-700 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
        )}
        <Link2 className="w-4 h-4 text-amber-700 shrink-0" />
        <span className="text-xs font-semibold text-amber-800">
          Outcome consistency
        </span>
        <Badge
          variant="secondary"
          className="ml-auto text-[10px] px-1.5 bg-amber-100 text-amber-800 border-amber-200"
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
              role="button"
              tabIndex={0}
              aria-label={`View finding: ${finding.field}`}
              className={`p-3 rounded-md border cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-primary ${
                activeBoxId === finding.id
                  ? "ring-2 ring-primary border-primary bg-primary/5"
                  : "hover:bg-background/80"
              } ${
                finding.status === "missing"
                  ? "bg-red-50/60 border-red-200"
                  : finding.status === "warning"
                    ? "bg-orange-50/60 border-orange-200"
                    : "bg-green-50/60 border-green-200"
              }`}
              onClick={() => onFindingClick(finding.id)}
              onKeyDown={e => {
                if (e.currentTarget !== e.target) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFindingClick(finding.id);
                }
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
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
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 bg-background/50 shrink-0"
                >
                  {(finding.confidence * 100).toFixed(0)}%
                </Badge>
              </div>

              {finding.message && (
                <p
                  className={`text-xs leading-snug ${
                    finding.status === "missing"
                      ? "text-red-700"
                      : finding.status === "warning"
                        ? "text-orange-700"
                        : "text-emerald-800"
                  }`}
                >
                  {finding.message}
                </p>
              )}

              {finding.suggestedFix && finding.status !== "passed" && (
                <p className="mt-1 text-[11px] text-slate-600 leading-snug">
                  Fix: {finding.suggestedFix}
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
