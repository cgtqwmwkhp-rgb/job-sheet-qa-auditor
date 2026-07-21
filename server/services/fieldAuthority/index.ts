/**
 * FieldAuthority — one ranked field map for the whole pipeline (Wave A
 * PR-A / PX-111, closes PX-106).
 *
 * Root cause: documentProcessor re-derived a slightly different Gemini ∪
 * ensemble ∪ text-layer merge at every consumption site (finding hygiene,
 * deterministic validation, ATTR, persist). A fix to one merge never
 * reached the others, so the UI (persist) and the validator could disagree
 * about the same document. Build the map exactly once per document and feed
 * every downstream stage from that same object.
 *
 * Rank order for digital header fields (assetId, jobReference, date, …):
 * nonempty text-layer > roiSpatial/field-vote > ensemble > Gemini. This is a
 * ranked override, not a confidence tie-break — a high-confidence-but-wrong
 * Gemini value never survives over grounded text-layer evidence (PX-111).
 *
 * Wave B: textLayerAbstain — fields text-layer examined and rejected (bleed)
 * must not be re-filled from lower-trust sources.
 */

import {
  stripEmptyExtractedFields,
  aliasCanonicalExtractedFields,
} from "../ensembleExtraction";
import type { PreExtractedFieldMap } from "../roiSpatialExtraction";

export type FieldAuthorityFieldMap = PreExtractedFieldMap;

export interface FieldAuthorityInput {
  /** Text-layer label-anchored headers (PX-100/106) — highest-trust grounded source. */
  textLayer?: FieldAuthorityFieldMap;
  /**
   * ROI spatial box extraction merged with multi-engine field vote — already
   * text-layer-preferring by the time it reaches here (PX-112: validation
   * must see the same evidence the UI does).
   */
  roiSpatial?: FieldAuthorityFieldMap;
  /** Multi-engine ensemble consensus. */
  ensemble?: FieldAuthorityFieldMap;
  /** Gemini analyzer extractedFields — weakest-trust, last resort. */
  gemini?: FieldAuthorityFieldMap;
  /**
   * Field ids text-layer rejected (e.g. date+label bleed). After ranking,
   * these keys (and their canonical aliases) are removed so Gemini cannot
   * re-inject junk the grounded path already refused (Wave B PX-112).
   */
  textLayerAbstain?: Iterable<string>;
}

export interface FieldAuthority {
  /**
   * Single merged, aliased, empty-stripped field map. Feed every downstream
   * stage (finding hygiene, deterministic validation, ATTR, persist) from
   * this — never re-derive a bespoke merge per stage.
   */
  fields: FieldAuthorityFieldMap;
}

/** Lowest-rank first — each later (higher-rank) nonempty source overrides. */
export const FIELD_AUTHORITY_RANK_LOW_TO_HIGH: ReadonlyArray<
  keyof Omit<FieldAuthorityInput, "textLayerAbstain">
> = ["gemini", "ensemble", "roiSpatial", "textLayer"];

const ABSTAIN_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["jobReference", "jobNumber"],
  ["assetId", "serialNumber"],
  ["date", "dateOfService"],
];

function expandAbstainIds(ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  Array.from(ids).forEach(id => {
    out.add(id);
    ABSTAIN_ALIAS_GROUPS.forEach(group => {
      if (group.includes(id)) {
        group.forEach(alias => out.add(alias));
      }
    });
  });
  return out;
}

/**
 * Build the one authoritative field map for a document. Each source is
 * empty-stripped before ranking so a blank value from a higher-rank source
 * never masks a real value from a lower-rank one, then aliasing
 * (jobNumber↔jobReference, assetId↔serialNumber, date↔dateOfService) is
 * applied exactly once to the final result.
 */
export function buildFieldAuthority(
  input: FieldAuthorityInput
): FieldAuthority {
  let merged: FieldAuthorityFieldMap = {};
  for (const source of FIELD_AUTHORITY_RANK_LOW_TO_HIGH) {
    merged = {
      ...merged,
      ...stripEmptyExtractedFields(input[source] ?? {}),
    };
  }
  const fields = aliasCanonicalExtractedFields(merged);
  const abstain = expandAbstainIds(input.textLayerAbstain ?? []);
  if (abstain.size > 0) {
    Array.from(abstain).forEach(id => {
      delete fields[id];
    });
  }
  return { fields };
}
