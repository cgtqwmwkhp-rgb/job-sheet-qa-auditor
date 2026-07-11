/**
 * PhotoEvidenceFindingsGroup — compact PHOTO-C012/C013 lines when
 * BeforeAfterComparePane already owns Confirm/Override.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Images, AlertCircle } from "lucide-react";
import type { Finding } from "./ReviewWorkstationPane";

export interface PhotoEvidenceFindingsGroupProps {
  findings: Finding[];
  activeBoxId: string | number | null;
  onFindingClick: (id: string | number) => void;
}

export function isPhotoPairFinding(finding: Finding): boolean {
  return finding.ruleId === "PHOTO-C012" || finding.ruleId === "PHOTO-C013";
}

export function PhotoEvidenceFindingsGroup({
  findings,
  activeBoxId,
  onFindingClick,
}: PhotoEvidenceFindingsGroupProps) {
  const [expanded, setExpanded] = useState(false);

  if (findings.length === 0) return null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30 overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-sky-50/60 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-sky-700 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-sky-700 shrink-0" />
        )}
        <Images className="w-4 h-4 text-sky-700 shrink-0" />
        <span className="text-xs font-semibold text-sky-800">
          Photo evidence
        </span>
        <span className="text-[11px] text-sky-700/80 truncate">
          Confirm / override in Clinical context
        </span>
        <Badge
          variant="secondary"
          className="ml-auto text-[10px] px-1.5 bg-sky-100 text-sky-800 border-sky-200 shrink-0"
        >
          {findings.length}
        </Badge>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {findings.map(finding => (
            <button
              key={finding.id}
              type="button"
              id={`finding-${finding.id}`}
              className={`w-full text-left px-2 py-1.5 rounded-md border text-xs flex items-center gap-2 transition-all ${
                activeBoxId === finding.id
                  ? "ring-2 ring-primary border-primary bg-primary/5"
                  : "hover:bg-white/80 border-sky-100 bg-white/40"
              }`}
              onClick={() => onFindingClick(finding.id)}
            >
              <AlertCircle className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="font-medium truncate">{finding.field}</span>
              {finding.failClass === "major" && (
                <Badge variant="destructive" className="text-[10px] px-1">
                  Major
                </Badge>
              )}
              {finding.ruleId && (
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] px-1 ml-auto shrink-0"
                >
                  {finding.ruleId}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
