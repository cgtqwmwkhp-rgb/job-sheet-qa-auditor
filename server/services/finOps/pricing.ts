/**
 * Approximate provider token pricing (USD per 1M tokens).
 * Used for estimated API cost tracking — not billing-grade invoices.
 */

export type TokenPricing = { inputPer1M: number; outputPer1M: number };

const DEFAULT_PRICING: TokenPricing = { inputPer1M: 0.5, outputPer1M: 1.5 };

/** Provider/model → rates. More specific model keys win via longest-prefix match. */
const PRICING_TABLE: Array<{ match: RegExp; rates: TokenPricing }> = [
  // Gemini
  {
    match: /gemini-2\.5-pro|gemini-2\.0-pro|gemini-1\.5-pro/i,
    rates: { inputPer1M: 1.25, outputPer1M: 10 },
  },
  {
    match:
      /gemini-2\.5-flash|gemini-2\.0-flash|gemini-1\.5-flash|gemini-flash/i,
    rates: { inputPer1M: 0.15, outputPer1M: 0.6 },
  },
  {
    match: /gemini/i,
    rates: { inputPer1M: 0.15, outputPer1M: 0.6 },
  },
  // Anthropic
  {
    match: /claude-opus|claude-3-opus/i,
    rates: { inputPer1M: 15, outputPer1M: 75 },
  },
  {
    match: /claude-sonnet|claude-3-5-sonnet|claude-3\.5-sonnet|claude-4/i,
    rates: { inputPer1M: 3, outputPer1M: 15 },
  },
  {
    match: /claude-haiku|claude-3-haiku/i,
    rates: { inputPer1M: 0.8, outputPer1M: 4 },
  },
  {
    match: /claude|anthropic/i,
    rates: { inputPer1M: 3, outputPer1M: 15 },
  },
  // OpenAI
  {
    match: /gpt-4o-mini|o4-mini/i,
    rates: { inputPer1M: 0.15, outputPer1M: 0.6 },
  },
  {
    match: /gpt-4o|gpt-4\.1|o3|o1/i,
    rates: { inputPer1M: 2.5, outputPer1M: 10 },
  },
  {
    match: /gpt-4|openai/i,
    rates: { inputPer1M: 2.5, outputPer1M: 10 },
  },
  // Mistral OCR / chat
  {
    match: /mistral|pixtral/i,
    rates: { inputPer1M: 0.15, outputPer1M: 0.15 },
  },
];

export function resolveTokenPricing(
  provider: string,
  model: string
): TokenPricing {
  const haystack = `${provider} ${model}`.trim();
  for (const entry of PRICING_TABLE) {
    if (entry.match.test(haystack)) {
      return entry.rates;
    }
  }
  return DEFAULT_PRICING;
}

/**
 * Estimate USD cost from token counts using approximate published rates.
 */
export function estimateTokenCostUsd(input: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const rates = resolveTokenPricing(input.provider, input.model);
  const cost =
    (Math.max(0, input.inputTokens) * rates.inputPer1M +
      Math.max(0, input.outputTokens) * rates.outputPer1M) /
    1_000_000;
  // Keep sub-cent precision for dashboards without float noise.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
