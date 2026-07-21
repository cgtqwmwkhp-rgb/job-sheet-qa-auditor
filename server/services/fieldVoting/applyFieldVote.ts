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
import {
  filterGroundedDateCandidates,
  gateDateVotes,
  isDateFieldId,
} from "./groundedDateGate";
import type { FieldVoteBatchResult } from "./types";

export interface ApplyFieldVoteInput {
  primary?: PreExtractedLike;
  fallback?: PreExtractedLike;
  /** Separate Azure DI prebuilt-layout/read OCR candidates. */
  azure?: PreExtractedLike;
  /** Structured candidates from a provisioned Azure DI custom JSR model. */
  azureCustom?: PreExtractedLike;
  crop?: PreExtractedLike;
  ensemble?: PreExtractedLike;
  /** Text-layer label-anchored candidates (PR1) — preferred for headers. */
  textLayer?: PreExtractedLike;
  /** @deprecated Use azureCustom for Azure DI custom-model candidates. */
  selectionMarks?: PreExtractedLike;
  multimodalRoi?: PreExtractedLike;
  /** VLM ink hint for technician / customer signatures. */
  vlmHint?: {
    value: string;
    confidence: number;
    pageNumber?: number;
  } | null;
  /**
   * Source text for PX-103 grounded date gate (text-layer and/or OCR markdown).
   * When set, date/dateOfService votes abstain unless value is label-anchored.
   */
  sourceText?: string;
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
  const azure = aliasPreExtractedForVote(input.azure);
  const azureCustom = aliasPreExtractedForVote(input.azureCustom);
  const crop = aliasPreExtractedForVote(input.crop);
  const ensemble = aliasPreExtractedForVote(input.ensemble);
  const textLayer = aliasPreExtractedForVote(input.textLayer);
  const selectionMarks = aliasPreExtractedForVote(input.selectionMarks);
  const multimodalRoi = aliasPreExtractedForVote(input.multimodalRoi);
  const sourceText = input.sourceText ?? "";

  const engines = [
    ...(textLayer
      ? [
          {
            engine: "text_layer",
            fields: textLayer,
            evidenceStrength: "strong" as const,
            evidence: "text_layer_label_anchor",
          },
        ]
      : []),
    ...(primary ? [{ engine: "primary", fields: primary }] : []),
    ...(fallback ? [{ engine: "fallback", fields: fallback }] : []),
    ...(azure ? [{ engine: "azure", fields: azure }] : []),
    ...(azureCustom ? [{ engine: "azure_custom", fields: azureCustom }] : []),
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

  const byFieldRaw = buildCandidateMap(engines);
  // PX-103: drop ungrounded date candidates before vote when source text known
  const byField: typeof byFieldRaw = {};
  for (const [fieldId, cands] of Object.entries(byFieldRaw)) {
    byField[fieldId] =
      sourceText.trim() && isDateFieldId(fieldId)
        ? filterGroundedDateCandidates(fieldId, cands, sourceText)
        : cands;
  }

  let batch = voteFields(byField);
  if (sourceText.trim()) {
    const gated = gateDateVotes(batch.fields, sourceText);
    let abstained = 0;
    let consensus = 0;
    let majority = 0;
    let singleEngine = 0;
    for (const v of Object.values(gated)) {
      if (v.decision === "abstain") abstained++;
      else if (v.decision === "consensus") consensus++;
      else if (v.decision === "majority") majority++;
      else if (v.decision === "single") singleEngine++;
    }
    batch = {
      fields: gated,
      summary: {
        voted: Object.keys(gated).length,
        consensus,
        majority,
        abstained,
        singleEngine,
      },
    };
  }
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
