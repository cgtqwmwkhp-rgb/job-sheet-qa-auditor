/**
 * Apply multi-engine field vote to pipeline pre-extracted maps (Wave-4 B2).
 *
 * Pure assembly — documentProcessor passes engine maps; we vote and return
 * honest preExtracted overlays (abstain omits field).
 */

import { buildCandidateMap, type PreExtractedLike } from "./buildCandidates";
import { aliasPreExtractedForVote } from "./aliasFields";
import {
  isFieldVoteEnabled,
  voteFields,
  votedFieldsToPreExtracted,
} from "./voteField";
import { voteHandwritingField } from "./handwriting";
import type { FieldVoteBatchResult } from "./types";

export interface ApplyFieldVoteInput {
  primary?: PreExtractedLike;
  fallback?: PreExtractedLike;
  crop?: PreExtractedLike;
  ensemble?: PreExtractedLike;
  selectionMarks?: PreExtractedLike;
  multimodalRoi?: PreExtractedLike;
  /** VLM ink hint for technician / customer signatures. */
  vlmHint?: {
    value: string;
    confidence: number;
    pageNumber?: number;
  } | null;
  /** When true, force vote even if FEATURE_FIELD_VOTE unset (tests). */
  force?: boolean;
}

export interface ApplyFieldVoteResult {
  enabled: boolean;
  batch: FieldVoteBatchResult | null;
  /** Voted overlays to merge into preExtracted (0–100 confidence). */
  votedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  /** Signature vote detail for artifacts. */
  handwritingVotes: Record<string, ReturnType<typeof voteHandwritingField>>;
}

/**
 * Run multi-engine vote + handwriting/VLM signature path.
 */
export function applyFieldVote(
  input: ApplyFieldVoteInput
): ApplyFieldVoteResult {
  const enabled = input.force === true || isFieldVoteEnabled();
  if (!enabled) {
    return {
      enabled: false,
      batch: null,
      votedFields: {},
      handwritingVotes: {},
    };
  }

  // Alias job/asset/date before vote so ensemble jobNumber fuses with crop jobReference
  const primary = aliasPreExtractedForVote(input.primary);
  const fallback = aliasPreExtractedForVote(input.fallback);
  const crop = aliasPreExtractedForVote(input.crop);
  const ensemble = aliasPreExtractedForVote(input.ensemble);
  const selectionMarks = aliasPreExtractedForVote(input.selectionMarks);
  const multimodalRoi = aliasPreExtractedForVote(input.multimodalRoi);

  const engines = [
    ...(primary ? [{ engine: "primary", fields: primary }] : []),
    ...(fallback ? [{ engine: "fallback", fields: fallback }] : []),
    ...(crop
      ? [
          {
            engine: "crop",
            fields: crop,
            evidenceStrength: "strong" as const,
          },
        ]
      : []),
    ...(ensemble ? [{ engine: "ensemble", fields: ensemble }] : []),
    ...(selectionMarks
      ? [{ engine: "azure_custom", fields: selectionMarks }]
      : []),
    ...(multimodalRoi
      ? [
          {
            engine: "vlm",
            fields: multimodalRoi,
            evidenceStrength: "strong" as const,
          },
        ]
      : []),
  ];

  const byField = buildCandidateMap(engines);
  const batch = voteFields(byField);
  const votedFields = votedFieldsToPreExtracted(batch);

  const handwritingVotes: ApplyFieldVoteResult["handwritingVotes"] = {};
  for (const sigField of ["engineerSignOff", "customerSignature"] as const) {
    const ocrCands = byField[sigField] ?? [];
    const hw = voteHandwritingField({
      fieldId: sigField,
      ocrCandidates: ocrCands,
      vlm: input.vlmHint
        ? {
            present: /^present$/i.test(input.vlmHint.value),
            confidence:
              input.vlmHint.confidence > 1
                ? input.vlmHint.confidence / 100
                : input.vlmHint.confidence,
          }
        : null,
      crop: crop?.[sigField]
        ? {
            value: crop[sigField]!.value,
            confidence:
              crop[sigField]!.confidence > 1
                ? crop[sigField]!.confidence / 100
                : crop[sigField]!.confidence,
          }
        : null,
    });
    handwritingVotes[sigField] = hw;
    if (!hw.abstained && hw.value) {
      votedFields[sigField] = {
        value: hw.value,
        confidence: Math.round(hw.confidence * 100),
        pageNumber: input.vlmHint?.pageNumber ?? 1,
      };
    } else {
      delete votedFields[sigField];
    }
  }

  return { enabled: true, batch, votedFields, handwritingVotes };
}
