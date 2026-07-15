/**
 * Apply multi-engine field vote to pipeline pre-extracted maps (Wave-4 B2).
 *
 * Pure assembly — documentProcessor passes engine maps; we vote and return
 * honest preExtracted overlays (abstain omits field).
 */

import { buildCandidateMap, type PreExtractedLike } from "./buildCandidates";
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

  const engines = [
    ...(input.primary ? [{ engine: "primary", fields: input.primary }] : []),
    ...(input.fallback
      ? [{ engine: "fallback", fields: input.fallback }]
      : []),
    ...(input.crop
      ? [
          {
            engine: "crop",
            fields: input.crop,
            evidenceStrength: "strong" as const,
          },
        ]
      : []),
    ...(input.ensemble
      ? [{ engine: "ensemble", fields: input.ensemble }]
      : []),
    ...(input.selectionMarks
      ? [{ engine: "azure_custom", fields: input.selectionMarks }]
      : []),
    ...(input.multimodalRoi
      ? [
          {
            engine: "vlm",
            fields: input.multimodalRoi,
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
      crop: input.crop?.[sigField]
        ? {
            value: input.crop[sigField]!.value,
            confidence:
              input.crop[sigField]!.confidence > 1
                ? input.crop[sigField]!.confidence / 100
                : input.crop[sigField]!.confidence,
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
