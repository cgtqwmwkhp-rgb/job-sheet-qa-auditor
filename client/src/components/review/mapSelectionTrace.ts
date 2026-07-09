/**
 * Map audit reportJson.selectionResult (+ selectionCohort) onto the
 * SelectionTracePanel view model. Returns null when no selection data exists.
 */

import type {
  ConfidenceBand,
  SelectionTrace,
  TemplateCandidate,
} from "@/components/audit/SelectionTracePanel";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function mapConfidenceBand(value: unknown): ConfidenceBand {
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") {
    return value;
  }
  if (value === "NONE") return "NONE";
  return "NONE";
}

function mapCandidate(raw: Record<string, unknown>): TemplateCandidate {
  const templateId =
    asString(raw.templateSlug) ??
    (raw.templateId != null ? String(raw.templateId) : "unknown");
  const matched = Array.isArray(raw.matchedTokens)
    ? raw.matchedTokens.filter((t): t is string => typeof t === "string")
    : [];
  const missing = Array.isArray(raw.missingRequired)
    ? raw.missingRequired.filter((t): t is string => typeof t === "string")
    : Array.isArray(raw.missingTokens)
      ? raw.missingTokens.filter((t): t is string => typeof t === "string")
      : [];

  return {
    templateId,
    templateName: asString(raw.templateName) ?? templateId,
    version:
      asString(raw.version) ??
      (raw.versionId != null ? String(raw.versionId) : "—"),
    score: asNumber(raw.score) ?? 0,
    matchedTokens: matched,
    missingTokens: missing,
  };
}

/**
 * Build a SelectionTrace from persisted audit reportJson, or null if absent.
 */
export function mapSelectionTraceFromReport(
  reportJson: unknown
): SelectionTrace | null {
  const report = asRecord(reportJson);
  if (!report) return null;

  const selection = asRecord(report.selectionResult);
  const cohort = asRecord(report.selectionCohort);

  if (!selection && !cohort) return null;

  const rawCandidates = Array.isArray(selection?.candidates)
    ? selection!.candidates
    : [];
  const candidates: TemplateCandidate[] = rawCandidates
    .map(c => asRecord(c))
    .filter((c): c is Record<string, unknown> => c != null)
    .map(mapCandidate);

  const selectedId =
    selection?.templateId != null ? String(selection.templateId) : null;
  const selectedSlug =
    asString(cohort?.templateSlug) ??
    candidates.find(c => c.templateId === selectedId)?.templateId ??
    candidates[0]?.templateId;

  const selectedVersion =
    selection?.versionId != null
      ? String(selection.versionId)
      : cohort?.versionId != null
        ? String(cohort.versionId)
        : (candidates[0]?.version ?? "—");

  const selected =
    selection?.selected === true || selectedSlug
      ? {
          templateId: selectedSlug ?? selectedId ?? "unknown",
          templateName:
            asString(cohort?.templateSlug) ??
            candidates.find(c => c.templateId === selectedSlug)?.templateName ??
            selectedSlug ??
            "Selected template",
          version: selectedVersion ?? "—",
        }
      : null;

  const tokenSample = Array.isArray(selection?.matchedTokens)
    ? selection!.matchedTokens.filter((t): t is string => typeof t === "string")
    : [];

  const confidenceBand = mapConfidenceBand(
    selection?.confidenceBand ?? cohort?.confidenceBand
  );

  const runnerUpDelta =
    asNumber(selection?.scoreGap) ?? asNumber(cohort?.scoreGap) ?? 0;

  return {
    inputSignals: {
      tokens: tokenSample,
      documentType: asString(cohort?.workType) ?? asString(cohort?.assetType),
      customerId: asString(cohort?.client),
    },
    candidates,
    selected: selection?.selected === false ? null : selected,
    blockReason: asString(selection?.blockReason),
    confidenceBand,
    runnerUpDelta,
    timestamp:
      asString(report.timestamp) ??
      asString(selection?.timestamp) ??
      new Date().toISOString(),
  };
}
