import type { ExaSearchResult } from "./types";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "part",
  "parts",
  "qty",
  "each",
  "new",
  "used",
]);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePartNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function descriptionTokens(description: string): string[] {
  return description
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

function resultCorpus(result: ExaSearchResult): string {
  const chunks = [
    result.title ?? "",
    result.text ?? "",
    ...(result.highlights ?? []),
  ];
  return chunks.join(" ");
}

export function scorePartsCatalogMatch(
  partNumber: string,
  description: string,
  results: ExaSearchResult[]
): {
  outcome: "match" | "mismatch" | "unavailable";
  score: number;
  matchedResultCount: number;
  reason: string;
} {
  if (!results.length) {
    return {
      outcome: "unavailable",
      score: 0,
      matchedResultCount: 0,
      reason: "No Exa search results returned",
    };
  }

  const normalizedPn = normalizePartNumber(partNumber);
  const descTokens = descriptionTokens(description);
  if (!normalizedPn || descTokens.length === 0) {
    return {
      outcome: "unavailable",
      score: 0,
      matchedResultCount: 0,
      reason: "Part number or description too weak to verify",
    };
  }

  let matchedResultCount = 0;
  let bestScore = 0;

  for (const result of results) {
    const corpus = normalizeToken(resultCorpus(result));
    if (!corpus) continue;

    const pnMatch = corpus.includes(normalizeToken(normalizedPn));
    const descMatches = descTokens.filter(token => corpus.includes(token));
    const descMatch = descMatches.length > 0;

    if (pnMatch && descMatch) {
      matchedResultCount += 1;
      const score =
        0.55 +
        Math.min(0.35, descMatches.length * 0.1) +
        (result.title &&
        normalizeToken(result.title).includes(normalizeToken(normalizedPn))
          ? 0.1
          : 0);
      bestScore = Math.max(bestScore, score);
    }
  }

  if (matchedResultCount > 0) {
    return {
      outcome: "match",
      score: Math.min(1, Math.round(bestScore * 100) / 100),
      matchedResultCount,
      reason: `${matchedResultCount} catalog result(s) corroborate part number and description`,
    };
  }

  return {
    outcome: "mismatch",
    score: 0.15,
    matchedResultCount: 0,
    reason:
      "Catalog results did not corroborate the recorded part number and description",
  };
}
