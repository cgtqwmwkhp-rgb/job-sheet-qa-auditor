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
  PartsContextPanel,
  partsContextIsActionable,
  type PartsAssessmentSignals,
  type PartsCatalogSignals,
} from "@/components/review/PartsContextPanel";
import {
  AttrContextPanel,
  attrContextIsActionable,
  type AttributionStamp,
} from "@/components/review/AttrContextPanel";
import {
  BeforeAfterComparePane,
  photoPairHasActionableFail,
  type PhotoPairCompareArtifact,
} from "@/components/review/BeforeAfterComparePane";
import {
  DeepNoteAnalysis,
  SheetSufficiencyAdvisoryPanel,
  type DeepNoteAnalysisData,
  type SheetSufficiencyAnalysisData,
} from "@/components/DeepNoteAnalysis";

export interface ClinicalContextStackProps {
  selectionTrace: SelectionTrace | null;
  selectionMarks: SelectionMarksView | null;
  failurePathSignals: FailurePathSignals | null;
  failurePathSignalSummary?: string | null;
  commentSignals: CommentQualitySignals | null;
  commentSummary?: string | null;
  partsAssessmentSignals?: PartsAssessmentSignals | null;
  partsCatalogSignals?: PartsCatalogSignals | null;
  partsAssessmentSummary?: string | null;
  partsCatalogSummary?: string | null;
  makeModel?: string | null;
  hasPartsFindings?: boolean;
  attribution?: AttributionStamp | null;
  hasAttrFindings?: boolean;
  photoPairCompare: PhotoPairCompareArtifact | null;
  deepNoteAnalysis: DeepNoteAnalysisData | null;
  sheetSufficiencyAnalysis?: SheetSufficiencyAnalysisData | null;
  documentUrl?: string;
  onConfirmPair?: (pairIndex: number) => void | Promise<boolean>;
  onOverridePair?: (pairIndex: number) => void | Promise<boolean>;
  onFocusPairPage?: (page: number) => void;
  onMarksRowClick?: (rowIndex: number, pageNumber: number) => void;
  className?: string;
}

export function buildClinicalContextSummary(
  props: Pick<
    ClinicalContextStackProps,
    | "failurePathSignals"
    | "commentSignals"
    | "partsAssessmentSignals"
    | "partsCatalogSignals"
    | "hasPartsFindings"
    | "attribution"
    | "hasAttrFindings"
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
  if (
    partsContextIsActionable(
      props.partsAssessmentSignals,
      props.partsCatalogSignals,
      props.hasPartsFindings
    )
  ) {
    parts.push("parts need review");
  }
  if (attrContextIsActionable(props.attribution, props.hasAttrFindings)) {
    parts.push("attribution gap");
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
  props: Pick<
    ClinicalContextStackProps,
    | "commentSignals"
    | "partsAssessmentSignals"
    | "partsCatalogSignals"
    | "hasPartsFindings"
    | "attribution"
    | "hasAttrFindings"
    | "photoPairCompare"
  >
): boolean {
  const commentsNeedCoach = Boolean(
    props.commentSignals?.onFailurePath && !props.commentSignals?.coherent
  );
  return (
    commentsNeedCoach ||
    partsContextIsActionable(
      props.partsAssessmentSignals,
      props.partsCatalogSignals,
      props.hasPartsFindings
    ) ||
    attrContextIsActionable(props.attribution, props.hasAttrFindings) ||
    photoPairHasActionableFail(props.photoPairCompare)
  );
}

export function ClinicalContextStack(props: ClinicalContextStackProps) {
  const commentOnFailurePath = Boolean(props.commentSignals?.onFailurePath);
  const actionable = hasActionableClinicalContext(props);
  const summary = buildClinicalContextSummary(props);

  const showPartsPanel = Boolean(
    props.hasPartsFindings ||
      props.partsAssessmentSignals ||
      props.partsCatalogSignals
  );
  const showAttrPanel = Boolean(props.hasAttrFindings || props.attribution);

  const hasAny =
    props.selectionTrace ||
    props.selectionMarks ||
    props.failurePathSignals ||
    commentOnFailurePath ||
    showPartsPanel ||
    showAttrPanel ||
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
      {showPartsPanel ? (
        <PartsContextPanel
          assessmentSignals={props.partsAssessmentSignals}
          catalogSignals={props.partsCatalogSignals}
          makeModel={props.makeModel}
          assessmentSummary={props.partsAssessmentSummary}
          catalogSummary={props.partsCatalogSummary}
          hasFindings={props.hasPartsFindings}
          defaultOpen={partsContextIsActionable(
            props.partsAssessmentSignals,
            props.partsCatalogSignals,
            props.hasPartsFindings
          )}
          className="shadow-none border-muted"
        />
      ) : null}
      {showAttrPanel ? (
        <AttrContextPanel
          attribution={props.attribution}
          hasFindings={props.hasAttrFindings}
          defaultOpen={attrContextIsActionable(
            props.attribution,
            props.hasAttrFindings
          )}
          className="shadow-none border-muted"
        />
      ) : null}
      <BeforeAfterComparePane
        artifact={props.photoPairCompare}
        documentUrl={props.documentUrl}
        defaultOpen={photoPairHasActionableFail(props.photoPairCompare)}
        className="shadow-none border-muted"
        onConfirmPair={props.onConfirmPair}
        onOverridePair={props.onOverridePair}
        onFocusPage={props.onFocusPairPage}
      />
      {props.deepNoteAnalysis ? (
        <DeepNoteAnalysis
          analysis={props.deepNoteAnalysis}
          defaultOpen={false}
          className="shadow-none border-muted"
        />
      ) : null}
      {props.sheetSufficiencyAnalysis ? (
        <SheetSufficiencyAdvisoryPanel
          analysis={props.sheetSufficiencyAnalysis}
          defaultOpen={false}
          className="shadow-none border-muted"
        />
      ) : null}
    </div>
  );
}
