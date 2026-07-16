/**
 * PhotoEvidenceFindingsGroup — PHOTO-C012/C013 lines + sticky cost-risk actions.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Images,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import type { Finding } from "./ReviewWorkstationPane";
import {
  photoPairHasActionableFail,
  type PhotoPairCompareArtifact,
} from "./BeforeAfterComparePane";

export interface PhotoEvidenceFindingsGroupProps {
  findings: Finding[];
  activeBoxId: string | number | null;
  onFindingClick: (id: string | number) => void;
  photoPairCompare?: PhotoPairCompareArtifact | null;
  onConfirmPair?: (pairIndex: number) => void | Promise<boolean>;
  onOverridePair?: (pairIndex: number) => void | Promise<boolean>;
}

export function isPhotoPairFinding(finding: Finding): boolean {
  return finding.ruleId === "PHOTO-C012" || finding.ruleId === "PHOTO-C013";
}

export function PhotoEvidenceFindingsGroup({
  findings,
  activeBoxId,
  onFindingClick,
  photoPairCompare,
  onConfirmPair,
  onOverridePair,
}: PhotoEvidenceFindingsGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [decided, setDecided] = useState<Record<number, true>>({});

  if (findings.length === 0) return null;

  const actionable = photoPairHasActionableFail(photoPairCompare);
  const pairs = Array.isArray(photoPairCompare?.pairs)
    ? photoPairCompare!.pairs
    : [];

  const runPair = async (
    idx: number,
    handler?: (pairIndex: number) => void | Promise<boolean>
  ) => {
    if (!handler || decided[idx] || pendingIdx != null) return;
    setPendingIdx(idx);
    try {
      const ok = await Promise.resolve(handler(idx));
      if (ok !== false) setDecided(d => ({ ...d, [idx]: true }));
    } finally {
      setPendingIdx(null);
    }
  };

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30 overflow-hidden">
      {actionable && (onConfirmPair || onOverridePair) ? (
        <div className="px-3 py-2 border-b border-sky-200 bg-red-50/50 space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-red-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Cost risk — confirm or override before clearing queue
          </div>
          {pairs.map((pair, idx) => {
            if (
              pair.axes?.work_done !== "fail" &&
              pair.axes?.repaired_properly !== "fail"
            ) {
              return null;
            }
            return (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 text-[11px]"
              >
                <span className="text-muted-foreground truncate">
                  Pair {idx + 1}: p{pair.beforePage ?? "?"}→p
                  {pair.afterPage ?? "?"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 text-[10px] px-2"
                  disabled={!!decided[idx] || pendingIdx === idx}
                  onClick={() => void runPair(idx, onConfirmPair)}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2"
                  disabled={!!decided[idx] || pendingIdx === idx}
                  onClick={() => void runPair(idx, onOverridePair)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Override
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

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
          {actionable
            ? "Axes detail in Clinical context"
            : "Confirm / override in Clinical context"}
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
