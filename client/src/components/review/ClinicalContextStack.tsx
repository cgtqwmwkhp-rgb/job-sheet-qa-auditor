/**
 * ClinicalContextStack — Template / Checklist / What we read / Comments /
 * Before-after / Deep Note. Used as a findings-rail tab so PDF height is never stolen.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SelectionTracePanel,
  type SelectionTrace,
} from "@/components/audit/SelectionTracePanel";
import { SelectionMarksPanel } from "@/components/review/SelectionMarksPanel";
import type { SelectionMarksView } from "@/components/review/mapSelectionMarks";
import {
  FailurePathSignalsPanel,
  type FailurePathSignals,
} from "@/components/review/FailurePathSignalsPanel";
import {
  CommentQualityPanel,
  type CommentQualitySignals,
} from "@/components/review/CommentQualityPanel";
import {
  BeforeAfterComparePane,
  photoPairHasActionableFail,
  type PhotoPairCompareArtifact,
} from "@/components/review/BeforeAfterComparePane";
import {
  DeepNoteAnalysis,
  type DeepNoteAnalysisData,
} from "@/components/DeepNoteAnalysis";

export interface ClinicalContextStackProps {
  selectionTrace: SelectionTrace | null;
  selectionMarks: SelectionMarksView | null;
  failurePathSignals: FailurePathSignals | null;
  failurePathSignalSummary?: string | null;
  commentSignals: CommentQualitySignals | null;
  commentSummary?: string | null;
  photoPairCompare: PhotoPairCompareArtifact | null;
  deepNoteAnalysis: DeepNoteAnalysisData | null;
  documentUrl?: string;
  onConfirmPair?: (pairIndex: number) => void;
  onOverridePair?: (pairIndex: number) => void;
  onMarksRowClick?: (rowIndex: number, pageNumber: number) => void;
  className?: string;
}

export function buildClinicalContextSummary(
  props: Pick<
    ClinicalContextStackProps,
    | "failurePathSignals"
    | "commentSignals"
    | "photoPairCompare"
    | "deepNoteAnalysis"
  >
): string {
  const parts: string[] = [];
  if (props.failurePathSignals?.onFailurePath) parts.push("Failure path");
  if (
    props.commentSignals?.onFailurePath &&
    props.commentSignals &&
    !props.commentSignals.coherent
  ) {
    parts.push("comments need coach");
  }
  const pairCount = props.photoPairCompare?.pairs?.length ?? 0;
  if (photoPairHasActionableFail(props.photoPairCompare)) {
    parts.push(
      `${pairCount} photo pair${pairCount === 1 ? "" : "s"} need review`
    );
  } else if (pairCount > 0) {
    parts.push(`${pairCount} photo pair${pairCount === 1 ? "" : "s"}`);
  }
  if (props.deepNoteAnalysis) parts.push("Deep Note");
  if (parts.length === 0) return "Signals & evidence";
  return parts.join(" · ");
}

export function hasActionableClinicalContext(
  props: Pick<ClinicalContextStackProps, "commentSignals" | "photoPairCompare">
): boolean {
  const commentsNeedCoach = Boolean(
    props.commentSignals?.onFailurePath && !props.commentSignals?.coherent
  );
  return (
    commentsNeedCoach || photoPairHasActionableFail(props.photoPairCompare)
  );
}

export function ClinicalContextStack(props: ClinicalContextStackProps) {
  const commentOnFailurePath = Boolean(props.commentSignals?.onFailurePath);
  const actionable = hasActionableClinicalContext(props);
  const summary = buildClinicalContextSummary(props);

  const hasAny =
    props.selectionTrace ||
    props.selectionMarks ||
    props.failurePathSignals ||
    commentOnFailurePath ||
    (props.photoPairCompare &&
      Array.isArray(props.photoPairCompare.pairs) &&
      props.photoPairCompare.pairs.length > 0) ||
    props.deepNoteAnalysis;

  if (!hasAny) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        No clinical context on this sheet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2 p-3", props.className)}>
      <div className="flex items-start gap-2 px-0.5 pb-1">
        <p className="text-[11px] text-muted-foreground leading-snug flex-1">
          {summary}
        </p>
        {actionable && (
          <Badge variant="destructive" className="text-[10px] px-1.5 shrink-0">
            Action needed
          </Badge>
        )}
      </div>
      <SelectionTracePanel
        trace={props.selectionTrace}
        defaultOpen={false}
        className="shadow-none border-muted"
      />
      <SelectionMarksPanel
        marks={props.selectionMarks}
        defaultOpen={false}
        className="shadow-none border-muted"
        onRowClick={props.onMarksRowClick}
      />
      <FailurePathSignalsPanel
        signals={props.failurePathSignals}
        signalSummary={props.failurePathSignalSummary}
        defaultOpen={Boolean(props.failurePathSignals?.onFailurePath)}
        hideEngineerCommentsChip={commentOnFailurePath}
        className="shadow-none border-muted"
      />
      <CommentQualityPanel
        signals={props.commentSignals}
        summary={props.commentSummary}
        defaultOpen={Boolean(
          props.commentSignals?.onFailurePath && !props.commentSignals?.coherent
        )}
        className="shadow-none border-muted"
      />
      <BeforeAfterComparePane
        artifact={props.photoPairCompare}
        documentUrl={props.documentUrl}
        defaultOpen={photoPairHasActionableFail(props.photoPairCompare)}
        className="shadow-none border-muted"
        onConfirmPair={props.onConfirmPair}
        onOverridePair={props.onOverridePair}
      />
      {props.deepNoteAnalysis ? (
        <DeepNoteAnalysis
          analysis={props.deepNoteAnalysis}
          defaultOpen={false}
          className="shadow-none border-muted"
        />
      ) : null}
    </div>
  );
}
