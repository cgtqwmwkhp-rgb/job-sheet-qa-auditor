/**
 * Multi-engine field voting (Wave-4 B2).
 *
 * Real majority / confidence-gap consensus across OCR engines. Honest abstain
 * when engines disagree without evidence — never invents high confidence.
 *
 * Challenge bar (eval): voted field exact-match F1 ≥ max(single-engine)+3pp
 * on disagreement slices (see contract tests).
 */

import {
  HANDWRITING_FIELD_IDS,
  FEATURE_FIELD_VOTE,
  type EngineFieldCandidate,
  type EvidenceStrength,
  type FieldVoteBatchResult,
  type FieldVoteResult,
  type VoteDecision,
  type VoteReasonCode,
} from "./types";

export { FEATURE_FIELD_VOTE };

/** Minimum engines for majority (2 of N). */
const MIN_MAJORITY = 2;
/** Confidence gap (0–1) that resolves a clear leader without majority. */
const CONFIDENCE_GAP = 0.15;
/** Soft boost when ≥2 engines agree (capped) — real agreement, not theater. */
const CONSENSUS_BOOST = 0.08;
const MAX_CONFIDENCE = 0.99;

export function isFieldVoteEnabled(): boolean {
  const raw = (process.env[FEATURE_FIELD_VOTE] ?? "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "on";
}

/**
 * Normalize field values so engines can agree on equivalent strings.
 * Digits-only for job refs; Present/Absent for signatures; case-fold text.
 */
export function normalizeVoteValue(
  fieldId: string,
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  let v = value.trim();
  if (!v) return null;

  if (isSignaturePresenceField(fieldId)) {
    if (/^(present|yes|signed|true)$/i.test(v)) return "Present";
    if (/^(absent|no|unsigned|missing|false|n\/?a)$/i.test(v)) return "Absent";
    if (/^[A-Za-z][A-Za-z\s.'-]{1,50}$/.test(v)) return "Present";
    return v;
  }

  if (
    fieldId === "jobReference" ||
    fieldId === "jobNumber" ||
    fieldId === "job_no"
  ) {
    // Keep alphanumeric identity — do not collapse J12345 vs X12345 to digits-only
    return v.toUpperCase().replace(/[\s_\-]/g, "");
  }

  if (
    fieldId === "date" ||
    fieldId === "dateOfService" ||
    fieldId === "expiryDate"
  ) {
    return v.replace(/[.\-/]/g, "/").toLowerCase();
  }

  return v.toLowerCase().replace(/\s+/g, " ");
}

export function isSignaturePresenceField(fieldId: string): boolean {
  return (
    fieldId === "engineerSignOff" ||
    fieldId === "customerSignature" ||
    fieldId === "technician_signature" ||
    fieldId === "customer_signature" ||
    fieldId === "signatureBlock"
  );
}

export function isHandwritingField(fieldId: string): boolean {
  return (
    HANDWRITING_FIELD_IDS.has(fieldId) || isSignaturePresenceField(fieldId)
  );
}

/**
 * Downgrade label-only signature "Present" theater: without ink/VLM evidence,
 * treat as weak so it cannot win a vote alone.
 */
export function classifySignatureEvidence(
  candidate: EngineFieldCandidate
): EvidenceStrength {
  if (candidate.evidenceStrength) return candidate.evidenceStrength;
  if (candidate.engine === "vlm") return "strong";
  if (candidate.engine === "crop") return "strong";
  const v = (candidate.value ?? "").trim();
  if (!v) return "none";
  if (/label_only|label found|no ink/i.test(candidate.evidence ?? "")) {
    return "label_only";
  }
  // Low-confidence Present from OCR is almost always label theater
  if (/^present$/i.test(v) && (candidate.confidence ?? 0) < 0.55) {
    return "label_only";
  }
  if (candidate.engine === "ensemble" || candidate.engine === "regex") {
    if (/^present$/i.test(v) && (candidate.confidence ?? 0) < 0.85) {
      return "label_only";
    }
  }
  return candidate.confidence >= 0.8 ? "strong" : "weak";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Vote a single field across engine candidates.
 */
export function voteField(
  fieldId: string,
  candidates: EngineFieldCandidate[]
): FieldVoteResult {
  const scoped = candidates
    .filter(c => c.fieldId === fieldId || !c.fieldId)
    .map(c => ({
      ...c,
      fieldId,
      confidence: clamp01(c.confidence),
      evidenceStrength: isSignaturePresenceField(fieldId)
        ? classifySignatureEvidence(c)
        : (c.evidenceStrength ??
          (c.confidence >= 0.8 ? "strong" : ("weak" as EvidenceStrength))),
    }));

  const usable = scoped.filter(c => {
    const norm = normalizeVoteValue(fieldId, c.value);
    if (!norm) return false;
    if (c.evidenceStrength === "none") return false;
    return true;
  });

  if (usable.length === 0) {
    return {
      fieldId,
      value: null,
      confidence: 0,
      decision: "abstain",
      reasonCode: "ABSTAIN",
      candidates: scoped,
      winningEngines: [],
      abstained: true,
    };
  }

  if (isSignaturePresenceField(fieldId)) {
    const strong = usable.filter(
      c => c.evidenceStrength === "strong" || c.engine === "vlm"
    );
    const labelOnly = usable.filter(c => c.evidenceStrength === "label_only");
    if (strong.length === 0 && labelOnly.length > 0) {
      const best = labelOnly.reduce((a, b) =>
        a.confidence >= b.confidence ? a : b
      );
      return {
        fieldId,
        value: null,
        confidence: Math.min(best.confidence * 0.5, 0.45),
        decision: "abstain",
        reasonCode: "LABEL_ONLY_NO_INK",
        candidates: scoped,
        winningEngines: [],
        conflictValues: Array.from(
          new Set(
            labelOnly
              .map(c => normalizeVoteValue(fieldId, c.value))
              .filter((v): v is string => !!v)
          )
        ),
        fallbackValue: best.value,
        fallbackEngine: String(best.engine),
        abstained: true,
      };
    }
    if (strong.length > 0) {
      return voteNormalized(fieldId, strong, scoped);
    }
  }

  return voteNormalized(fieldId, usable, scoped);
}

function voteNormalized(
  fieldId: string,
  usable: EngineFieldCandidate[],
  allCandidates: EngineFieldCandidate[]
): FieldVoteResult {
  const buckets = new Map<
    string,
    { count: number; engines: string[]; maxConf: number; display: string }
  >();

  for (const c of usable) {
    const key = normalizeVoteValue(fieldId, c.value)!;
    const display = (c.value ?? key).trim();
    const prev = buckets.get(key);
    if (!prev) {
      buckets.set(key, {
        count: 1,
        engines: [String(c.engine)],
        maxConf: c.confidence,
        display,
      });
    } else {
      prev.count += 1;
      prev.engines.push(String(c.engine));
      prev.maxConf = Math.max(prev.maxConf, c.confidence);
    }
  }

  const ranked = Array.from(buckets.entries()).sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].maxConf - a[1].maxConf;
  });

  const [topKey, top] = ranked[0];

  if (usable.length === 1 || (top.count === 1 && ranked.length === 1)) {
    const only = usable.reduce((a, b) =>
      a.confidence >= b.confidence ? a : b
    );
    return {
      fieldId,
      value: only.value,
      confidence: only.confidence,
      decision: "single",
      reasonCode: "SINGLE_ENGINE",
      candidates: allCandidates,
      winningEngines: [String(only.engine)],
      abstained: false,
    };
  }

  if (top.count >= MIN_MAJORITY) {
    const decision: VoteDecision =
      top.count === usable.length ? "consensus" : "majority";
    const reasonCode: VoteReasonCode =
      decision === "consensus" ? "AGREED" : "MAJORITY";
    const boost =
      decision === "consensus" ? CONSENSUS_BOOST : CONSENSUS_BOOST * 0.75;
    return {
      fieldId,
      value: top.display,
      confidence: Math.min(top.maxConf + boost, MAX_CONFIDENCE),
      decision,
      reasonCode,
      candidates: allCandidates,
      winningEngines: top.engines,
      abstained: false,
    };
  }

  const leaders = usable
    .filter(c => normalizeVoteValue(fieldId, c.value) === topKey)
    .sort((a, b) => b.confidence - a.confidence);
  const leader = leaders[0];
  const rival = usable
    .filter(c => normalizeVoteValue(fieldId, c.value) !== topKey)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (
    leader &&
    rival &&
    leader.confidence - rival.confidence >= CONFIDENCE_GAP &&
    (leader.evidenceStrength === "strong" || leader.confidence >= 0.85)
  ) {
    return {
      fieldId,
      value: leader.value,
      confidence: leader.confidence,
      decision: "confidence_gap",
      reasonCode: "CONFIDENCE_GAP",
      candidates: allCandidates,
      winningEngines: [String(leader.engine)],
      conflictValues: ranked.map(([, b]) => b.display),
      abstained: false,
    };
  }

  const conflictValues = ranked.map(([, b]) => b.display);
  return {
    fieldId,
    value: null,
    confidence: Math.min(top.maxConf * 0.55, 0.55),
    decision: "abstain",
    reasonCode: "ABSTAIN",
    candidates: allCandidates,
    winningEngines: [],
    conflictValues,
    fallbackValue: top.display,
    fallbackEngine: top.engines[0],
    abstained: true,
  };
}

/**
 * Vote a map of fieldId → candidates.
 */
export function voteFields(
  byField: Record<string, EngineFieldCandidate[]>
): FieldVoteBatchResult {
  const fields: Record<string, FieldVoteResult> = {};
  let consensus = 0;
  let majority = 0;
  let abstained = 0;
  let singleEngine = 0;
  let voted = 0;

  for (const [fieldId, candidates] of Object.entries(byField)) {
    const result = voteField(fieldId, candidates);
    fields[fieldId] = result;
    voted++;
    if (result.decision === "consensus") consensus++;
    else if (result.decision === "majority") majority++;
    else if (result.decision === "abstain") abstained++;
    else if (result.decision === "single") singleEngine++;
  }

  return {
    fields,
    summary: { voted, consensus, majority, abstained, singleEngine },
  };
}

/**
 * Build a PreExtractedField-shaped map from vote results.
 * Abstained fields are omitted (honest — do not promote fallback as truth).
 */
export function votedFieldsToPreExtracted(
  batch: FieldVoteBatchResult
): Record<string, { value: string; confidence: number; pageNumber: number }> {
  const out: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  > = {};
  for (const [fieldId, vote] of Object.entries(batch.fields)) {
    if (vote.abstained || !vote.value) continue;
    out[fieldId] = {
      value: vote.value,
      confidence: Math.round(vote.confidence * 100),
      pageNumber: 1,
    };
  }
  return out;
}

/**
 * Exact-match F1 helper for challenge-bar tests (disagreement slices).
 */
export function exactMatchF1(
  predictions: Array<string | null>,
  labels: Array<string | null>,
  fieldId = "jobReference"
): {
  precision: number;
  recall: number;
  f1: number;
  correct: number;
  n: number;
} {
  let tp = 0;
  let predPos = 0;
  let labelPos = 0;
  const n = Math.min(predictions.length, labels.length);
  for (let i = 0; i < n; i++) {
    const p = normalizeVoteValue(fieldId, predictions[i]);
    const l = normalizeVoteValue(fieldId, labels[i]);
    if (p) predPos++;
    if (l) labelPos++;
    if (p && l && p === l) tp++;
  }
  const precision = predPos === 0 ? 0 : tp / predPos;
  const recall = labelPos === 0 ? 0 : tp / labelPos;
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, correct: tp, n };
}

/**
 * Pick single-engine predictions (argmax confidence per row) for baseline F1.
 */
export function singleEngineArgmax(
  rows: EngineFieldCandidate[][]
): Array<string | null> {
  return rows.map(cands => {
    if (!cands.length) return null;
    const best = cands.reduce((a, b) =>
      a.confidence >= b.confidence ? a : b
    );
    return best.value;
  });
}
