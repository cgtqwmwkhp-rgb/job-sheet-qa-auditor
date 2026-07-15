import type { Finding } from "../analyzer";
import {
  extractMakeModelFromText,
  sanitizeMakeModelValue,
} from "../findingHygiene";
import { extractNamedSection } from "../jobSummaryConsistency";
import {
  isCompletePartsLine,
  parsePartsUsedLines,
} from "../partsAssessment/parsePartsUsedLines";
import type { PartsUsedLine } from "../partsAssessment/types";
import {
  buildPartsCatalogQuery,
  ExaClientError,
  PARTS_OEM_ALLOWLIST_DOMAINS,
  searchExaPartsCatalog,
  type ExaFetch,
} from "../partsCatalogLookup/exaClient";
import { scorePartsAssetFitmentMatch } from "./score";
import type {
  PartsAssetFitmentLineResult,
  PartsAssetFitmentResult,
  PartsAssetFitmentSignals,
} from "./types";

export const FEATURE_PARTS_ASSET_FITMENT = "FEATURE_PARTS_ASSET_FITMENT";
export const FEATURE_PARTS_WEB_OEM_ALLOWLIST =
  "FEATURE_PARTS_WEB_OEM_ALLOWLIST";
export const PARTS_ASSET_FITMENT_RULE_PREFIX = "PARTS-C";
export const MAX_PARTS_ASSET_FITMENT_LINES = 10;

export function isPartsAssetFitmentEnabled(): boolean {
  return process.env[FEATURE_PARTS_ASSET_FITMENT] === "true";
}

export function isPartsWebOemAllowlistEnabled(): boolean {
  return process.env[FEATURE_PARTS_WEB_OEM_ALLOWLIST] === "true";
}

function issue(
  ruleId: string,
  severity: Finding["severity"],
  reasonCode: Finding["reasonCode"],
  message: string,
  why: string,
  fix: string,
  raw: string,
  confidence = 85
): Finding {
  return {
    ruleId,
    fieldName: "Parts Used",
    severity,
    reasonCode,
    rawSnippet: raw.slice(0, 300),
    normalisedSnippet: message,
    confidence,
    pageNumber: 1,
    whyItMatters: why,
    suggestedFix: fix,
  };
}

function emptySignals(enabled: boolean): PartsAssetFitmentSignals {
  return {
    enabled,
    lineCount: 0,
    verifiedCount: 0,
    matchCount: 0,
    conflictCount: 0,
    unavailableCount: 0,
    missingAssetContext: false,
    capped: false,
  };
}

function completeLinesFromText(text: string): PartsUsedLine[] {
  const partsUsedBody = extractNamedSection(text, "Parts Used");
  return parsePartsUsedLines(partsUsedBody).filter(isCompletePartsLine);
}

function resolveMakeModel(
  text: string,
  deps?: { makeModel?: string; make_model?: string }
): string | undefined {
  return (
    sanitizeMakeModelValue(deps?.makeModel) ??
    sanitizeMakeModelValue(deps?.make_model) ??
    extractMakeModelFromText(text)
  );
}

export async function evaluatePartsAssetFitment(
  text: string,
  deps?: {
    fetchFn?: ExaFetch;
    apiKey?: string;
    timeoutMs?: number;
    lines?: PartsUsedLine[];
    makeModel?: string;
    make_model?: string;
  }
): Promise<PartsAssetFitmentResult> {
  if (!isPartsAssetFitmentEnabled()) {
    return {
      signals: emptySignals(false),
      findings: [],
      lineResults: [],
      summary:
        "Parts asset fitment disabled (FEATURE_PARTS_ASSET_FITMENT off).",
    };
  }

  const allCompleteLines = deps?.lines ?? completeLinesFromText(text);
  const capped = allCompleteLines.length > MAX_PARTS_ASSET_FITMENT_LINES;
  const lines = allCompleteLines.slice(0, MAX_PARTS_ASSET_FITMENT_LINES);

  if (lines.length === 0) {
    return {
      signals: emptySignals(true),
      findings: [],
      lineResults: [],
      summary: "No L1-complete Parts Used lines; asset fitment skipped.",
    };
  }

  const makeModel = resolveMakeModel(text, deps);
  if (!makeModel) {
    const findings = [
      issue(
        `${PARTS_ASSET_FITMENT_RULE_PREFIX}030`,
        "S2",
        "CONFLICT",
        "Asset make/model missing — cannot verify part fitment for this asset.",
        "Without make/model context auditors cannot determine whether fitted parts are correct for this asset.",
        "Record make/model on the job sheet (e.g. Make/Model: Ford Transit) before parts fitment can be verified.",
        lines[0].raw,
        82
      ),
    ];

    return {
      signals: {
        enabled: true,
        lineCount: allCompleteLines.length,
        verifiedCount: 0,
        matchCount: 0,
        conflictCount: 0,
        unavailableCount: 0,
        missingAssetContext: true,
        capped,
      },
      findings,
      lineResults: [],
      summary: `MissingAssetContext=1 | Lines=${allCompleteLines.length}${
        capped ? ` | CappedAt=${MAX_PARTS_ASSET_FITMENT_LINES}` : ""
      }`,
    };
  }

  const searchDeps = {
    fetchFn: deps?.fetchFn,
    apiKey: deps?.apiKey,
    timeoutMs: deps?.timeoutMs,
    includeDomains: isPartsWebOemAllowlistEnabled()
      ? PARTS_OEM_ALLOWLIST_DOMAINS
      : undefined,
  };

  const lineResults: PartsAssetFitmentLineResult[] = [];
  const findings: Finding[] = [];

  for (const line of lines) {
    const partNumber = line.partNumber!.trim();
    const description = line.description!.trim();
    const query = buildPartsCatalogQuery(partNumber, description, makeModel);

    try {
      const response = await searchExaPartsCatalog(query, searchDeps);
      const scored = scorePartsAssetFitmentMatch(
        partNumber,
        description,
        makeModel,
        response.results
      );

      lineResults.push({
        line,
        outcome: scored.outcome,
        query,
        score: scored.score,
        matchedResultCount: scored.matchedResultCount,
        reason: scored.reason,
      });

      if (scored.outcome === "match") {
        findings.push(
          issue(
            `${PARTS_ASSET_FITMENT_RULE_PREFIX}032`,
            "S3",
            "LOW_CONFIDENCE",
            `Catalog search corroborates ${partNumber} — ${description} for ${makeModel}.`,
            "External catalog corroboration supports that the fitted part aligns with this asset make/model.",
            "No action required — part number, description, and make/model align with catalog evidence.",
            line.raw,
            Math.round(scored.score * 100)
          )
        );
      } else if (scored.outcome === "conflict") {
        findings.push(
          issue(
            `${PARTS_ASSET_FITMENT_RULE_PREFIX}031`,
            "S2",
            "CONFLICT",
            `Catalog search did not corroborate ${partNumber} — ${description} for ${makeModel}.`,
            "A part that does not match the recorded make/model risks incorrect fitment, warranty disputes, and rework.",
            `Confirm the part is correct for ${makeModel}, e.g. ${partNumber} — [correct description] — qty.`,
            line.raw,
            78
          )
        );
      } else {
        findings.push(
          issue(
            `${PARTS_ASSET_FITMENT_RULE_PREFIX}033`,
            "S2",
            "LOW_CONFIDENCE",
            `Asset fitment verification unavailable for ${partNumber} — ${description} (${makeModel}).`,
            "When catalog evidence cannot be retrieved, auditors cannot corroborate part fitment for this asset — this is not a pass.",
            `Re-check the part against the supplier catalogue for ${makeModel}.`,
            line.raw,
            70
          )
        );
      }
    } catch (error) {
      const reason =
        error instanceof ExaClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Asset fitment search failed";

      lineResults.push({
        line,
        outcome: "unavailable",
        query,
        score: 0,
        matchedResultCount: 0,
        reason,
      });

      findings.push(
        issue(
          `${PARTS_ASSET_FITMENT_RULE_PREFIX}033`,
          "S2",
          "LOW_CONFIDENCE",
          `Asset fitment verification unavailable for ${partNumber} — ${description} (${makeModel}; ${reason}).`,
          "When catalog evidence cannot be retrieved, auditors cannot corroborate part fitment for this asset — this is not a pass.",
          `Re-check the part against the supplier catalogue for ${makeModel}.`,
          line.raw,
          68
        )
      );
    }
  }

  const signals: PartsAssetFitmentSignals = {
    enabled: true,
    makeModel,
    lineCount: allCompleteLines.length,
    verifiedCount: lineResults.length,
    matchCount: lineResults.filter(r => r.outcome === "match").length,
    conflictCount: lineResults.filter(r => r.outcome === "conflict").length,
    unavailableCount: lineResults.filter(r => r.outcome === "unavailable")
      .length,
    missingAssetContext: false,
    capped,
  };

  const summaryParts = [
    `Verified=${signals.verifiedCount}`,
    `Match=${signals.matchCount}`,
    `Conflict=${signals.conflictCount}`,
    `Unavailable=${signals.unavailableCount}`,
    `MakeModel=${makeModel}`,
  ];
  if (capped) summaryParts.push(`CappedAt=${MAX_PARTS_ASSET_FITMENT_LINES}`);

  return {
    signals,
    findings,
    lineResults,
    summary: summaryParts.join(" | "),
  };
}
