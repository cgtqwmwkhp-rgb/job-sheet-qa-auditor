/**
 * USD → GBP mid-market rate for FinOps display conversion.
 * Provider list prices are USD; UI may show GBP using a cached live rate.
 */

export type UsdGbpRate = {
  /** Multiply USD amounts by this to get GBP. */
  usdToGbp: number;
  /** ISO timestamp when the rate was fetched / refreshed. */
  asOf: string;
  /** frankfurter | fallback | env */
  source: "frankfurter" | "fallback" | "env";
};

const FALLBACK_USD_TO_GBP = 0.746;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cached: { rate: UsdGbpRate; expiresAt: number } | null = null;

function envOverride(): number | null {
  const raw = process.env.FINOPS_USD_TO_GBP?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchFrankfurterRate(): Promise<UsdGbpRate | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=GBP",
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      date?: string;
      rates?: { GBP?: number };
    };
    const gbp = json.rates?.GBP;
    if (typeof gbp !== "number" || !(gbp > 0)) return null;
    return {
      usdToGbp: Math.round(gbp * 1_000_000) / 1_000_000,
      asOf: json.date ? `${json.date}T12:00:00.000Z` : new Date().toISOString(),
      source: "frankfurter",
    };
  } catch {
    return null;
  }
}

function fallbackRate(): UsdGbpRate {
  return {
    usdToGbp: FALLBACK_USD_TO_GBP,
    asOf: new Date().toISOString(),
    source: "fallback",
  };
}

/**
 * Resolve USD→GBP rate (env override → cached Frankfurter → fallback).
 */
export async function getUsdToGbpRate(opts?: {
  forceRefresh?: boolean;
}): Promise<UsdGbpRate> {
  const override = envOverride();
  if (override !== null) {
    return {
      usdToGbp: override,
      asOf: new Date().toISOString(),
      source: "env",
    };
  }

  const now = Date.now();
  if (
    !opts?.forceRefresh &&
    cached &&
    cached.expiresAt > now &&
    cached.rate.usdToGbp > 0
  ) {
    return cached.rate;
  }

  const live = await fetchFrankfurterRate();
  const rate = live ?? cached?.rate ?? fallbackRate();
  cached = { rate, expiresAt: now + CACHE_TTL_MS };
  return rate;
}

/** Test helper. */
export function clearUsdGbpRateCache(): void {
  cached = null;
}

export function convertUsdToDisplay(
  amountUsd: number,
  currency: "USD" | "GBP",
  usdToGbp: number
): number {
  if (currency === "USD") return amountUsd;
  return Math.round(amountUsd * usdToGbp * 1_000_000) / 1_000_000;
}
