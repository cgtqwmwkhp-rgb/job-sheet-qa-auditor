import { TIMEOUT_CONFIG, TimeoutError, withTimeout } from "../../utils/timeout";
import type { ExaSearchResponse } from "./types";

export const EXA_API_KEY_ENV = "EXA_API_KEY";
export const EXA_SEARCH_URL = "https://api.exa.ai/search";
export const EXA_SEARCH_TIMEOUT_MS = parseInt(
  process.env.PARTS_CATALOG_EXA_TIMEOUT_MS ||
    String(TIMEOUT_CONFIG.EXTERNAL_API),
  10
);

export type ExaFetch = typeof fetch;

export class ExaClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ExaClientError";
  }
}

export const PARTS_OEM_ALLOWLIST_DOMAINS = [
  "parts.ford.com",
  "mbparts.mbusa.com",
  "parts.volvotrucks.com",
  "parts.volvocars.com",
  "parts.toyota.com",
  "parts.nissanusa.com",
  "parts.honda.com",
  "parts.gm.com",
  "moparparts.com",
  "parts.bmw.com",
  "parts.mercedes-benz.com",
  "parts.jcb.com",
  "shop.deere.com",
  "parts.caterpillar.com",
];

export function buildPartsCatalogQuery(
  partNumber: string,
  description: string,
  makeModel?: string
): string {
  const pn = partNumber.trim();
  const desc = description.trim();
  const mm = makeModel?.trim();
  if (mm) {
    return `"${pn}" "${desc}" "${mm}" automotive parts`;
  }
  return `"${pn}" "${desc}" automotive parts`;
}

export async function searchExaPartsCatalog(
  query: string,
  deps?: {
    fetchFn?: ExaFetch;
    apiKey?: string;
    timeoutMs?: number;
    includeDomains?: string[];
  }
): Promise<ExaSearchResponse> {
  const apiKey = deps?.apiKey ?? process.env[EXA_API_KEY_ENV]?.trim();
  if (!apiKey) {
    throw new ExaClientError("EXA_API_KEY is not configured");
  }

  const fetchFn = deps?.fetchFn ?? fetch;
  const timeoutMs = deps?.timeoutMs ?? EXA_SEARCH_TIMEOUT_MS;

  const request = () =>
    fetchFn(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 5,
        ...(deps?.includeDomains?.length
          ? { includeDomains: deps.includeDomains }
          : {}),
        contents: {
          highlights: true,
        },
      }),
    });

  let response: Response;
  try {
    response = await withTimeout(
      request(),
      timeoutMs,
      "Exa parts catalog search"
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new ExaClientError(`Exa search timed out after ${timeoutMs}ms`);
    }
    throw error;
  }

  if (!response.ok) {
    throw new ExaClientError(
      `Exa search failed with status ${response.status}`,
      response.status
    );
  }

  const json = (await response.json()) as ExaSearchResponse;
  return {
    results: Array.isArray(json.results) ? json.results : [],
  };
}
