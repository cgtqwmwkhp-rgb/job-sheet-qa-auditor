import type { ExaSearchResult } from "../partsCatalogLookup/types";

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

function makeModelTokens(makeModel: string): string[] {
  return makeModel
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

function resultCorpus(result: ExaSearchResult): string {
  const chunks = [
    result.title ?? "",
    result.text ?? "",
    ...(result.highlights ?? []),
  ];
  return chunks.join(" ");
}

export function scorePartsAssetFitmentMatch(
  partNumber: string,
  description: string,
  makeModel: string,
  results: ExaSearchResult[]
): {
  outcome: "match" | "conflict" | "unavailable";
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
  const assetTokens = makeModelTokens(makeModel);

  if (!normalizedPn || descTokens.length === 0 || assetTokens.length === 0) {
    return {
      outcome: "unavailable",
      score: 0,
      matchedResultCount: 0,
      reason: "Part number, description, or make/model too weak to verify",
    };
  }

  let matchedResultCount = 0;
  let bestScore = 0;
  let pnDescOnlyCount = 0;

  for (const result of results) {
    const corpus = normalizeToken(resultCorpus(result));
    if (!corpus) continue;

    const pnMatch = corpus.includes(normalizeToken(normalizedPn));
    const descMatches = descTokens.filter(token => corpus.includes(token));
    const descMatch = descMatches.length > 0;
    const assetMatches = assetTokens.filter(token => corpus.includes(token));
    const assetMatch = assetMatches.length > 0;

    if (pnMatch && descMatch && assetMatch) {
      matchedResultCount += 1;
      const score =
        0.5 +
        Math.min(0.25, descMatches.length * 0.08) +
        Math.min(0.25, assetMatches.length * 0.1) +
        (result.title &&
        normalizeToken(result.title).includes(normalizeToken(normalizedPn))
          ? 0.1
          : 0);
      bestScore = Math.max(bestScore, score);
    } else if (pnMatch && descMatch) {
      pnDescOnlyCount += 1;
    }
  }

  if (matchedResultCount > 0) {
    return {
      outcome: "match",
      score: Math.min(1, Math.round(bestScore * 100) / 100),
      matchedResultCount,
      reason: `${matchedResultCount} catalog result(s) corroborate part number, description, and make/model`,
    };
  }

  if (pnDescOnlyCount > 0) {
    return {
      outcome: "conflict",
      score: 0.2,
      matchedResultCount: 0,
      reason:
        "Catalog results corroborate part number and description but not the recorded make/model",
    };
  }

  return {
    outcome: "conflict",
    score: 0.15,
    matchedResultCount: 0,
    reason:
      "Catalog results did not corroborate fitment for the recorded make/model",
  };
}
