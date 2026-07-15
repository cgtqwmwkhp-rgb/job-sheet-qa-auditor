/**
 * Exa parts catalog verify contracts (Wave-5 P2 L2).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";
import {
  buildPartsCatalogQuery,
  FEATURE_PARTS_WEB_VERIFY,
  isPartsWebVerifyEnabled,
  MAX_PARTS_CATALOG_LINES,
  scorePartsCatalogMatch,
  searchExaPartsCatalog,
  verifyPartsCatalogWeb,
} from "../../services/partsCatalogLookup";
import type { ExaSearchResponse } from "../../services/partsCatalogLookup";

const COMPLETE_PARTS = `
Job Summary Report
Repairs Required: Replace wheel bearing
Parts Used
WT158 — wheel — 1
Technician Signature
`;

const MANY_LINES = `
Job Summary Report
Repairs Required: Replace multiple items
Parts Used
WT001 — wheel — 1
WT002 — wheel — 1
WT003 — wheel — 1
WT004 — wheel — 1
WT005 — wheel — 1
WT006 — wheel — 1
WT007 — wheel — 1
WT008 — wheel — 1
WT009 — wheel — 1
WT010 — wheel — 1
WT011 — wheel — 1
WT012 — wheel — 1
Technician Signature
`;

function mockFetchResponse(body: ExaSearchResponse, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe("buildPartsCatalogQuery", () => {
  it("formats quoted PN + description with automotive parts suffix", () => {
    expect(buildPartsCatalogQuery("WT158", "wheel")).toBe(
      '"WT158" "wheel" automotive parts'
    );
  });
});

describe("scorePartsCatalogMatch", () => {
  it("returns match when PN and description appear in results", () => {
    const scored = scorePartsCatalogMatch("WT158", "wheel", [
      {
        title: "WT158 wheel bearing kit",
        highlights: ["Automotive wheel replacement part WT158"],
      },
    ]);
    expect(scored.outcome).toBe("match");
    expect(scored.matchedResultCount).toBeGreaterThan(0);
  });

  it("returns mismatch when results do not corroborate PN/description", () => {
    const scored = scorePartsCatalogMatch("WT158", "wheel", [
      {
        title: "Brake pad catalogue",
        highlights: ["Front brake disc replacement guide"],
      },
    ]);
    expect(scored.outcome).toBe("mismatch");
  });

  it("returns unavailable when search returns no results", () => {
    const scored = scorePartsCatalogMatch("WT158", "wheel", []);
    expect(scored.outcome).toBe("unavailable");
  });
});

describe("searchExaPartsCatalog", () => {
  it("posts the expected query to Exa with API key header", async () => {
    const fetchFn = mockFetchResponse({
      results: [{ title: "WT158 wheel", highlights: ["wheel part WT158"] }],
    });

    await searchExaPartsCatalog('"WT158" "wheel" automotive parts', {
      fetchFn,
      apiKey: "test-key",
      timeoutMs: 5_000,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.exa.ai/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-api-key": "test-key",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: '"WT158" "wheel" automotive parts',
      numResults: 5,
      contents: { highlights: true },
    });
  });

  it("throws when API key is missing", async () => {
    await expect(
      searchExaPartsCatalog("query", { fetchFn: vi.fn(), apiKey: "" })
    ).rejects.toThrow(/EXA_API_KEY/);
  });
});

describe("verifyPartsCatalogWeb", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_PARTS_WEB_VERIFY];
    delete process.env.EXA_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("is disabled unless FEATURE_PARTS_WEB_VERIFY is true", () => {
    expect(isPartsWebVerifyEnabled()).toBe(false);
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    expect(isPartsWebVerifyEnabled()).toBe(true);
  });

  it("returns no findings when flag is off", async () => {
    const result = await verifyPartsCatalogWeb(COMPLETE_PARTS, {
      fetchFn: mockFetchResponse({ results: [] }),
      apiKey: "test-key",
    });
    expect(result.findings).toHaveLength(0);
    expect(result.signals.enabled).toBe(false);
  });

  it("emits PARTS-C021 on catalog match", async () => {
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    const result = await verifyPartsCatalogWeb(COMPLETE_PARTS, {
      fetchFn: mockFetchResponse({
        results: [
          {
            title: "WT158 wheel catalogue entry",
            highlights: ["WT158 wheel replacement automotive parts"],
          },
        ],
      }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C021")).toBe(true);
    expect(result.findings[0].severity).toBe("S3");
    expect(result.lineResults[0].query).toBe(
      '"WT158" "wheel" automotive parts'
    );
  });

  it("emits PARTS-C020 on catalog mismatch", async () => {
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    const result = await verifyPartsCatalogWeb(COMPLETE_PARTS, {
      fetchFn: mockFetchResponse({
        results: [
          {
            title: "Brake disc catalogue",
            highlights: ["Front brake replacement guide"],
          },
        ],
      }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C020")).toBe(true);
    expect(result.findings[0].severity).toBe("S2");
  });

  it("emits PARTS-C022 when search is unavailable (not a fake pass)", async () => {
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    const result = await verifyPartsCatalogWeb(COMPLETE_PARTS, {
      fetchFn: mockFetchResponse({ results: [] }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C022")).toBe(true);
    expect(result.findings.every(f => f.ruleId !== "PARTS-C021")).toBe(true);
    expect(result.findings[0].severity).toBe("S3");
  });

  it("emits PARTS-C022 on API failure or timeout", async () => {
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await verifyPartsCatalogWeb(COMPLETE_PARTS, {
      fetchFn,
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C022")).toBe(true);
    expect(result.lineResults[0].outcome).toBe("unavailable");
  });

  it(`caps verification at ${MAX_PARTS_CATALOG_LINES} L1-complete lines`, async () => {
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    const fetchFn = mockFetchResponse({
      results: [{ title: "WT001 wheel", highlights: ["wheel WT001"] }],
    });

    const result = await verifyPartsCatalogWeb(MANY_LINES, {
      fetchFn,
      apiKey: "test-key",
    });

    expect(result.signals.lineCount).toBe(12);
    expect(result.signals.verifiedCount).toBe(MAX_PARTS_CATALOG_LINES);
    expect(result.signals.capped).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(MAX_PARTS_CATALOG_LINES);
  });

  it("skips lines that did not pass L1 pairing", async () => {
    process.env[FEATURE_PARTS_WEB_VERIFY] = "true";
    const fetchFn = mockFetchResponse({
      results: [{ title: "WT158 wheel", highlights: ["wheel WT158"] }],
    });

    const text = `
Job Summary Report
Parts Used
WT158
wheel — 1
WT158 — wheel — 1
Technician Signature
`;

    const result = await verifyPartsCatalogWeb(text, {
      fetchFn,
      apiKey: "test-key",
    });

    expect(result.signals.verifiedCount).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("policy seeds for parts catalog verify", () => {
  it("includes PARTS-C020–C022 with correct failClass", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    expect(rules.find(r => r.ruleId === "PARTS-C020")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C021")!.failClass).toBe(
      "informational"
    );
    expect(rules.find(r => r.ruleId === "PARTS-C022")!.failClass).toBe(
      "informational"
    );
  });
});

describe("documentProcessor wiring", () => {
  it("wires parts catalog verify after parts assessment", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("verifyPartsCatalogWeb");
    expect(src).toContain("[PARTS_CATALOG_VERIFY]");
    expect(src.indexOf("evaluatePartsUsed")).toBeLessThan(
      src.indexOf("verifyPartsCatalogWeb")
    );
  });
});
