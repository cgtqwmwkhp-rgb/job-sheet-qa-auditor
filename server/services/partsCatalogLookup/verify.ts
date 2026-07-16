import type { Finding } from "../analyzer";
import { extractNamedSection } from "../jobSummaryConsistency";
import {
  isCompletePartsLine,
  parsePartsUsedLines,
} from "../partsAssessment/parsePartsUsedLines";
import type { PartsUsedLine } from "../partsAssessment/types";
import {
  buildPartsCatalogQuery,
  ExaClientError,
  searchExaPartsCatalog,
  type ExaFetch,
} from "./exaClient";
import { scorePartsCatalogMatch } from "./score";
import type {
  PartsCatalogLineVerifyResult,
  PartsCatalogPersistedLineResult,
  PartsCatalogVerifyOutcome,
  PartsCatalogVerifyResult,
  PartsCatalogVerifySignals,
} from "./types";

export const FEATURE_PARTS_WEB_VERIFY = "FEATURE_PARTS_WEB_VERIFY";
export const PARTS_CATALOG_RULE_PREFIX = "PARTS-C";
export const MAX_PARTS_CATALOG_LINES = 10;
export const MAX_PARTS_CATALOG_EVIDENCE_URLS = 5;

function extractEvidenceUrls(
  results: { url?: string }[] | undefined
): string[] {
  if (!Array.isArray(results)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const url = typeof result?.url === "string" ? result.url.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_PARTS_CATALOG_EVIDENCE_URLS) break;
  }
  return urls;
}

export function toPersistedPartsCatalogLineResults(
  lineResults: PartsCatalogLineVerifyResult[]
): PartsCatalogPersistedLineResult[] {
  return lineResults.slice(0, MAX_PARTS_CATALOG_LINES).map(r => ({
    partNumber: (r.line.partNumber ?? "").trim(),
    description: (r.line.description ?? "").trim(),
    outcome: r.outcome,
    evidenceUrls: Array.isArray(r.evidenceUrls)
      ? r.evidenceUrls.slice(0, MAX_PARTS_CATALOG_EVIDENCE_URLS)
      : [],
  }));
}

export function linesFromPersistedCatalogResults(
  persisted: unknown
): PartsUsedLine[] {
  if (!Array.isArray(persisted)) return [];
  const lines: PartsUsedLine[] = [];
  for (const raw of persisted.slice(0, MAX_PARTS_CATALOG_LINES)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const partNumber =
      typeof row.partNumber === "string" ? row.partNumber.trim() : "";
    const description =
      typeof row.description === "string" ? row.description.trim() : "";
    if (!partNumber || !description) continue;
    lines.push({
      partNumber,
      description,
      raw: `${partNumber} — ${description}`,
    });
  }
  return lines;
}

export function patchReportJsonPartsCatalog(
  reportJson: unknown,
  result: PartsCatalogVerifyResult
): Record<string, unknown> {
  const report =
    reportJson && typeof reportJson === "object"
      ? { ...(reportJson as Record<string, unknown>) }
      : {};
  report.partsCatalogSignals = result.signals;
  report.partsCatalogSummary = result.summary;
  report.partsCatalogLineResults =
    toPersistedPartsCatalogLineResults(result.lineResults);
  return report;
}

function isCatalogOutcome(value: unknown): value is PartsCatalogVerifyOutcome {
  return value === "match" || value === "mismatch" || value === "unavailable";
}

export function coercePersistedPartsCatalogLineResults(
  raw: unknown
): PartsCatalogPersistedLineResult[] {
  if (!Array.isArray(raw)) return [];
  const out: PartsCatalogPersistedLineResult[] = [];
  for (const item of raw.slice(0, MAX_PARTS_CATALOG_LINES)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const partNumber =
      typeof row.partNumber === "string" ? row.partNumber.trim() : "";
    const description =
      typeof row.description === "string" ? row.description.trim() : "";
    if (!partNumber || !description || !isCatalogOutcome(row.outcome)) continue;
    const evidenceUrls = Array.isArray(row.evidenceUrls)
      ? row.evidenceUrls
          .filter((u): u is string => typeof u === "string" && u.trim() !== "")
          .map(u => u.trim())
          .slice(0, MAX_PARTS_CATALOG_EVIDENCE_URLS)
      : [];
    out.push({ partNumber, description, outcome: row.outcome, evidenceUrls });
  }
  return out;
}

export function isPartsWebVerifyEnabled(): boolean {
  return process.env[FEATURE_PARTS_WEB_VERIFY] === "true";
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

function emptySignals(enabled: boolean): PartsCatalogVerifySignals {
  return {
    enabled,
    lineCount: 0,
    verifiedCount: 0,
    matchCount: 0,
    mismatchCount: 0,
    unavailableCount: 0,
    capped: false,
  };
}

function completeLinesFromText(text: string): PartsUsedLine[] {
  const partsUsedBody = extractNamedSection(text, "Parts Used");
  return parsePartsUsedLines(partsUsedBody).filter(isCompletePartsLine);
}

export async function verifyPartsCatalogWeb(
  text: string,
  deps?: {
    fetchFn?: ExaFetch;
    apiKey?: string;
    timeoutMs?: number;
    lines?: PartsUsedLine[];
  }
): Promise<PartsCatalogVerifyResult> {
  if (!isPartsWebVerifyEnabled()) {
    // Honesty: never invent match when disabled. If callers pass lines
    // (re-check), keep PN/desc as unavailable so a later enable can retry.
    const provided = (deps?.lines ?? []).slice(0, MAX_PARTS_CATALOG_LINES);
    const unavailableResults: PartsCatalogLineVerifyResult[] = provided.map(
      line => ({
        line,
        outcome: "unavailable" as const,
        query: "",
        score: 0,
        matchedResultCount: 0,
        reason: "FEATURE_PARTS_WEB_VERIFY off",
        evidenceUrls: [],
      })
    );
    return {
      signals: {
        ...emptySignals(false),
        lineCount: provided.length,
        unavailableCount: unavailableResults.length,
      },
      findings: [],
      lineResults: unavailableResults,
      summary:
        "Parts catalog web verify disabled (FEATURE_PARTS_WEB_VERIFY off).",
    };
  }

  const allCompleteLines = deps?.lines ?? completeLinesFromText(text);
  const capped = allCompleteLines.length > MAX_PARTS_CATALOG_LINES;
  const lines = allCompleteLines.slice(0, MAX_PARTS_CATALOG_LINES);

  if (lines.length === 0) {
    return {
      signals: emptySignals(true),
      findings: [],
      lineResults: [],
      summary: "No L1-complete Parts Used lines; catalog web verify skipped.",
    };
  }

  const lineResults: PartsCatalogLineVerifyResult[] = [];
  const findings: Finding[] = [];

  for (const line of lines) {
    const partNumber = line.partNumber!.trim();
    const description = line.description!.trim();
    const query = buildPartsCatalogQuery(partNumber, description);

    try {
      const response = await searchExaPartsCatalog(query, deps);
      const scored = scorePartsCatalogMatch(
        partNumber,
        description,
        response.results
      );
      const evidenceUrls = extractEvidenceUrls(response.results);

      lineResults.push({
        line,
        outcome: scored.outcome,
        query,
        score: scored.score,
        matchedResultCount: scored.matchedResultCount,
        reason: scored.reason,
        evidenceUrls,
      });

      if (scored.outcome === "match") {
        findings.push(
          issue(
            `${PARTS_CATALOG_RULE_PREFIX}021`,
            "S3",
            "LOW_CONFIDENCE",
            `Catalog search corroborates ${partNumber} — ${description}.`,
            "External catalog corroboration supports procurement reconciliation for fitted parts.",
            "No action required — part number and description align with catalog evidence.",
            line.raw,
            Math.round(scored.score * 100)
          )
        );
      } else if (scored.outcome === "mismatch") {
        findings.push(
          issue(
            `${PARTS_CATALOG_RULE_PREFIX}020`,
            "S2",
            "CONFLICT",
            `Catalog search did not corroborate ${partNumber} — ${description}.`,
            "A part number that does not match its description in catalog sources risks incorrect procurement and warranty disputes.",
            `Confirm the part number and description against the supplier catalogue, e.g. ${partNumber} — [correct description] — qty.`,
            line.raw,
            78
          )
        );
      } else {
        findings.push(
          issue(
            `${PARTS_CATALOG_RULE_PREFIX}022`,
            "S2",
            "INCOMPLETE_EVIDENCE",
            `Catalog verification unavailable for ${partNumber} — ${description}.`,
            "When catalog evidence cannot be retrieved, auditors cannot corroborate PN vs description — this is not a pass and blocks AUTO_PASS.",
            "Re-check the part number and description manually against the supplier catalogue.",
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
            : "Catalog search failed";

      lineResults.push({
        line,
        outcome: "unavailable",
        query,
        score: 0,
        matchedResultCount: 0,
        reason,
        evidenceUrls: [],
      });

      findings.push(
        issue(
          `${PARTS_CATALOG_RULE_PREFIX}022`,
          "S2",
          "INCOMPLETE_EVIDENCE",
          `Catalog verification unavailable for ${partNumber} — ${description} (${reason}).`,
          "When catalog evidence cannot be retrieved, auditors cannot corroborate PN vs description — this is not a pass and blocks AUTO_PASS.",
          "Re-check the part number and description manually against the supplier catalogue.",
          line.raw,
          68
        )
      );
    }
  }

  const signals: PartsCatalogVerifySignals = {
    enabled: true,
    lineCount: allCompleteLines.length,
    verifiedCount: lineResults.length,
    matchCount: lineResults.filter(r => r.outcome === "match").length,
    mismatchCount: lineResults.filter(r => r.outcome === "mismatch").length,
    unavailableCount: lineResults.filter(r => r.outcome === "unavailable")
      .length,
    capped,
  };

  const summaryParts = [
    `Verified=${signals.verifiedCount}`,
    `Match=${signals.matchCount}`,
    `Mismatch=${signals.mismatchCount}`,
    `Unavailable=${signals.unavailableCount}`,
  ];
  if (capped) summaryParts.push(`CappedAt=${MAX_PARTS_CATALOG_LINES}`);

  return {
    signals,
    findings,
    lineResults,
    summary: summaryParts.join(" | "),
  };
}
