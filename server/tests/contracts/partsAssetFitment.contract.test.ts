/**
 * Parts asset fitment verify contracts (Wave-6 P2 L3).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";
import {
  buildPartsCatalogQuery,
  PARTS_OEM_ALLOWLIST_DOMAINS,
  searchExaPartsCatalog,
} from "../../services/partsCatalogLookup";
import type { ExaSearchResponse } from "../../services/partsCatalogLookup";
import {
  evaluatePartsAssetFitment,
  FEATURE_PARTS_ASSET_FITMENT,
  FEATURE_PARTS_WEB_OEM_ALLOWLIST,
  isPartsAssetFitmentEnabled,
  isPartsWebOemAllowlistEnabled,
  MAX_PARTS_ASSET_FITMENT_LINES,
  scorePartsAssetFitmentMatch,
} from "../../services/partsAssetFitment";

const COMPLETE_PARTS_WITH_MAKE = `
Job Summary Report
Make/Model: Ford Transit
Repairs Required: Replace wheel bearing
Parts Used
WT158 — wheel — 1
Technician Signature
`;

const COMPLETE_PARTS_NO_MAKE = `
Job Summary Report
Repairs Required: Replace wheel bearing
Parts Used
WT158 — wheel — 1
Technician Signature
`;

const MANY_LINES = `
Job Summary Report
Make/Model: Ford Transit
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

describe("buildPartsCatalogQuery with makeModel", () => {
  it("keeps L2 query shape when makeModel is omitted", () => {
    expect(buildPartsCatalogQuery("WT158", "wheel")).toBe(
      '"WT158" "wheel" automotive parts'
    );
  });

  it("includes make/model when provided", () => {
    expect(buildPartsCatalogQuery("WT158", "wheel", "Ford Transit")).toBe(
      '"WT158" "wheel" "Ford Transit" automotive parts'
    );
  });
});

describe("scorePartsAssetFitmentMatch", () => {
  it("returns match when PN, description, and make/model appear in results", () => {
    const scored = scorePartsAssetFitmentMatch(
      "WT158",
      "wheel",
      "Ford Transit",
      [
        {
          title: "WT158 wheel for Ford Transit",
          highlights: ["Ford Transit wheel replacement part WT158"],
        },
      ]
    );
    expect(scored.outcome).toBe("match");
    expect(scored.matchedResultCount).toBeGreaterThan(0);
  });

  it("returns conflict when PN+desc match but make/model does not", () => {
    const scored = scorePartsAssetFitmentMatch(
      "WT158",
      "wheel",
      "Ford Transit",
      [
        {
          title: "WT158 wheel bearing kit",
          highlights: ["Automotive wheel replacement part WT158"],
        },
      ]
    );
    expect(scored.outcome).toBe("conflict");
  });

  it("returns conflict when results do not corroborate fitment", () => {
    const scored = scorePartsAssetFitmentMatch(
      "WT158",
      "wheel",
      "Ford Transit",
      [
        {
          title: "Brake pad catalogue",
          highlights: ["Front brake disc replacement guide"],
        },
      ]
    );
    expect(scored.outcome).toBe("conflict");
  });

  it("returns unavailable when search returns no results", () => {
    const scored = scorePartsAssetFitmentMatch(
      "WT158",
      "wheel",
      "Ford Transit",
      []
    );
    expect(scored.outcome).toBe("unavailable");
  });
});

describe("searchExaPartsCatalog OEM allowlist", () => {
  it("passes includeDomains when requested", async () => {
    const fetchFn = mockFetchResponse({
      results: [{ title: "WT158 wheel", highlights: ["wheel WT158"] }],
    });

    await searchExaPartsCatalog('"WT158" "wheel" automotive parts', {
      fetchFn,
      apiKey: "test-key",
      timeoutMs: 5_000,
      includeDomains: PARTS_OEM_ALLOWLIST_DOMAINS,
    });

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      includeDomains: PARTS_OEM_ALLOWLIST_DOMAINS,
    });
  });
});

describe("evaluatePartsAssetFitment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_PARTS_ASSET_FITMENT];
    delete process.env[FEATURE_PARTS_WEB_OEM_ALLOWLIST];
    delete process.env.EXA_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("is disabled unless FEATURE_PARTS_ASSET_FITMENT is true", () => {
    expect(isPartsAssetFitmentEnabled()).toBe(false);
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    expect(isPartsAssetFitmentEnabled()).toBe(true);
  });

  it("OEM allowlist flag is off unless explicitly true", () => {
    expect(isPartsWebOemAllowlistEnabled()).toBe(false);
    process.env[FEATURE_PARTS_WEB_OEM_ALLOWLIST] = "true";
    expect(isPartsWebOemAllowlistEnabled()).toBe(true);
  });

  it("returns no findings when flag is off", async () => {
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_WITH_MAKE, {
      fetchFn: mockFetchResponse({ results: [] }),
      apiKey: "test-key",
    });
    expect(result.findings).toHaveLength(0);
    expect(result.signals.enabled).toBe(false);
  });

  it("emits PARTS-C030 when make/model is missing", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_NO_MAKE, {
      fetchFn: mockFetchResponse({ results: [] }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C030")).toBe(true);
    expect(result.findings[0].severity).toBe("S2");
    expect(result.signals.missingAssetContext).toBe(true);
    expect(result.signals.verifiedCount).toBe(0);
  });

  it("accepts makeModel from deps options", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_NO_MAKE, {
      makeModel: "Ford Transit",
      fetchFn: mockFetchResponse({
        results: [
          {
            title: "WT158 wheel for Ford Transit",
            highlights: ["Ford Transit wheel replacement part WT158"],
          },
        ],
      }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C032")).toBe(true);
    expect(result.signals.makeModel).toBe("Ford Transit");
  });

  it("accepts make_model alias from deps options", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_NO_MAKE, {
      make_model: "Ford Transit",
      fetchFn: mockFetchResponse({
        results: [
          {
            title: "WT158 wheel for Ford Transit",
            highlights: ["Ford Transit wheel replacement part WT158"],
          },
        ],
      }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C032")).toBe(true);
  });

  it("emits PARTS-C032 on fitment corroboration", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_WITH_MAKE, {
      fetchFn: mockFetchResponse({
        results: [
          {
            title: "WT158 wheel for Ford Transit",
            highlights: ["Ford Transit wheel replacement part WT158"],
          },
        ],
      }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C032")).toBe(true);
    expect(result.findings[0].severity).toBe("S3");
    expect(result.lineResults[0].query).toBe(
      '"WT158" "wheel" "Ford Transit" automotive parts'
    );
  });

  it("emits PARTS-C031 on fitment conflict", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_WITH_MAKE, {
      fetchFn: mockFetchResponse({
        results: [
          {
            title: "WT158 wheel bearing kit",
            highlights: ["Automotive wheel replacement part WT158"],
          },
        ],
      }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C031")).toBe(true);
    expect(result.findings[0].severity).toBe("S2");
  });

  it("emits PARTS-C033 when search is unavailable (not a fake pass)", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_WITH_MAKE, {
      fetchFn: mockFetchResponse({ results: [] }),
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C033")).toBe(true);
    expect(result.findings.every(f => f.ruleId !== "PARTS-C032")).toBe(true);
    expect(result.findings[0].severity).toBe("S2");
  });

  it("emits PARTS-C033 on API failure", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await evaluatePartsAssetFitment(COMPLETE_PARTS_WITH_MAKE, {
      fetchFn,
      apiKey: "test-key",
    });

    expect(result.findings.some(f => f.ruleId === "PARTS-C033")).toBe(true);
    expect(result.lineResults[0].outcome).toBe("unavailable");
  });

  it(`caps verification at ${MAX_PARTS_ASSET_FITMENT_LINES} L1-complete lines`, async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const fetchFn = mockFetchResponse({
      results: [
        {
          title: "WT001 wheel for Ford Transit",
          highlights: ["Ford Transit wheel WT001"],
        },
      ],
    });

    const result = await evaluatePartsAssetFitment(MANY_LINES, {
      fetchFn,
      apiKey: "test-key",
    });

    expect(result.signals.lineCount).toBe(12);
    expect(result.signals.verifiedCount).toBe(MAX_PARTS_ASSET_FITMENT_LINES);
    expect(result.signals.capped).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(MAX_PARTS_ASSET_FITMENT_LINES);
  });

  it("skips lines that did not pass L1 pairing", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    const fetchFn = mockFetchResponse({
      results: [
        {
          title: "WT158 wheel for Ford Transit",
          highlights: ["Ford Transit wheel WT158"],
        },
      ],
    });

    const text = `
Job Summary Report
Make/Model: Ford Transit
Parts Used
WT158
wheel — 1
WT158 — wheel — 1
Technician Signature
`;

    const result = await evaluatePartsAssetFitment(text, {
      fetchFn,
      apiKey: "test-key",
    });

    expect(result.signals.verifiedCount).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("passes OEM allowlist domains when flag is on", async () => {
    process.env[FEATURE_PARTS_ASSET_FITMENT] = "true";
    process.env[FEATURE_PARTS_WEB_OEM_ALLOWLIST] = "true";
    const fetchFn = mockFetchResponse({
      results: [
        {
          title: "WT158 wheel for Ford Transit",
          highlights: ["Ford Transit wheel WT158"],
        },
      ],
    });

    await evaluatePartsAssetFitment(COMPLETE_PARTS_WITH_MAKE, {
      fetchFn,
      apiKey: "test-key",
    });

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      includeDomains: PARTS_OEM_ALLOWLIST_DOMAINS,
    });
  });
});

describe("policy seeds for parts asset fitment", () => {
  it("includes PARTS-C030–C033 with correct failClass", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    expect(rules.find(r => r.ruleId === "PARTS-C030")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C031")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C032")!.failClass).toBe(
      "informational"
    );
    expect(rules.find(r => r.ruleId === "PARTS-C033")!.failClass).toBe("minor");
  });
});

describe("documentProcessor wiring", () => {
  it("wires parts asset fitment after parts catalog verify", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("evaluatePartsAssetFitment");
    expect(src).toContain("[PARTS_ASSET_FITMENT]");
    expect(src.indexOf("verifyPartsCatalogWeb")).toBeLessThan(
      src.indexOf("evaluatePartsAssetFitment")
    );
    expect(src.indexOf("evaluatePartsUsed")).toBeLessThan(
      src.indexOf("evaluatePartsAssetFitment")
    );
  });
});

describe("finOps tool label", () => {
  it("includes exa_parts label", async () => {
    const { toolDisplayLabel } = await import(
      "../../services/finOps/toolLabels"
    );
    expect(toolDisplayLabel("exa_parts")).toBe("Exa Parts Search");
  });
});
