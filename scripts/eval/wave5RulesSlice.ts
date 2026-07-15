/**
 * Wave-5/6 deterministic rule slice evaluator (FAULT, PARTS L1, ATTR, fitment).
 *
 * Fixtures only — no live OCR, DB, or network (Exa mocked when fitment module exists).
 */

import * as fs from "fs";
import * as path from "path";
import { evaluateFaultReasonPlaceholder } from "../../server/services/commentQuality/faultReason";
import { evaluatePartsUsed } from "../../server/services/partsAssessment";
import { evaluateEngineerAttribution } from "../../server/services/engineerAttributionFindings";
import type { ExaSearchResponse } from "../../server/services/partsCatalogLookup/exaClient";
import type { ExaFetch } from "../../server/services/partsCatalogLookup/exaClient";

export type EvaluatorKind =
  | "faultReason"
  | "partsUsed"
  | "engineerAttribution"
  | "partsAssetFitment";

export interface Wave5RulesCase {
  id: string;
  evaluator: EvaluatorKind;
  fixture: string;
  input?: { faultReason?: string };
  expectedRuleIds: string[];
  flags?: Record<string, string>;
  mockExa?: ExaSearchResponse;
}

export interface Wave5RulesManifest {
  version: string;
  description?: string;
  cases: Wave5RulesCase[];
}

export type CaseStatus = "pass" | "fail" | "unavailable";

export interface Wave5RulesCaseResult {
  id: string;
  evaluator: EvaluatorKind;
  status: CaseStatus;
  expectedRuleIds: string[];
  actualRuleIds: string[];
  note?: string;
}

export interface Wave5RulesSliceReport {
  version: string;
  runId: string;
  timestamp: string;
  status: "pass" | "fail" | "unavailable";
  fitmentModuleAvailable: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    unavailable: number;
  };
  cases: Wave5RulesCaseResult[];
  blockers: string[];
}

export interface RunWave5RulesSliceOptions {
  manifestPath: string;
  fixturesDir?: string;
}

type PartsAssetFitmentEvaluator = (
  text: string,
  deps?: {
    fetchFn?: ExaFetch;
    apiKey?: string;
    timeoutMs?: number;
    makeModel?: string;
    make_model?: string;
  }
) => Promise<{ findings: Array<{ ruleId: string }> }>;

let runIdCounter = 0;

export function generateWave5RulesRunId(): string {
  const timestamp = Date.now().toString(36);
  runIdCounter = (runIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  const counter = runIdCounter.toString(36).padStart(4, "0");
  return `wave5-rules-${timestamp}-${counter}`;
}

export function loadWave5RulesManifest(
  manifestPath: string
): Wave5RulesManifest {
  return JSON.parse(
    fs.readFileSync(manifestPath, "utf-8")
  ) as Wave5RulesManifest;
}

function ruleIdsMatch(
  expected: string[],
  actual: string[]
): { pass: boolean; missing: string[] } {
  const actualSet = new Set(actual);
  const missing = expected.filter(ruleId => !actualSet.has(ruleId));
  return { pass: missing.length === 0, missing };
}

function createMockExaFetch(mockExa: ExaSearchResponse): ExaFetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      json: async () => mockExa,
    }) as Response;
}

async function loadFitmentEvaluator(): Promise<{
  available: boolean;
  evaluate?: PartsAssetFitmentEvaluator;
}> {
  try {
    const mod = await import("../../server/services/partsAssetFitment");
    return { available: true, evaluate: mod.evaluatePartsAssetFitment };
  } catch {
    return { available: false };
  }
}

function applyCaseFlags(
  flags: Record<string, string> | undefined,
  savedEnv: Record<string, string | undefined>
): void {
  if (!flags) return;
  for (const [key, value] of Object.entries(flags)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
}

function restoreCaseFlags(savedEnv: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function evaluateCase(
  testCase: Wave5RulesCase,
  fixturesDir: string,
  fitment: { available: boolean; evaluate?: PartsAssetFitmentEvaluator }
): Promise<Wave5RulesCaseResult> {
  const savedEnv: Record<string, string | undefined> = {};
  applyCaseFlags(testCase.flags, savedEnv);

  try {
    const fixturePath = path.join(fixturesDir, testCase.fixture);

    if (testCase.evaluator === "partsAssetFitment" && !fitment.available) {
      return {
        id: testCase.id,
        evaluator: testCase.evaluator,
        status: "unavailable",
        expectedRuleIds: testCase.expectedRuleIds,
        actualRuleIds: [],
        note: "partsAssetFitment module not merged — fitment slice unavailable",
      };
    }

    let actualRuleIds: string[] = [];

    switch (testCase.evaluator) {
      case "faultReason": {
        const faultReason =
          testCase.input?.faultReason ??
          fs.readFileSync(fixturePath, "utf-8").trim();
        actualRuleIds = evaluateFaultReasonPlaceholder(faultReason).map(
          f => f.ruleId
        );
        break;
      }
      case "partsUsed": {
        const text = fs.readFileSync(fixturePath, "utf-8");
        actualRuleIds = evaluatePartsUsed(text).findings.map(f => f.ruleId);
        break;
      }
      case "engineerAttribution": {
        const payload = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
          report: Parameters<typeof evaluateEngineerAttribution>[0]["report"];
          candidates?: Parameters<
            typeof evaluateEngineerAttribution
          >[0]["candidates"];
        };
        actualRuleIds = evaluateEngineerAttribution({
          report: payload.report,
          candidates: payload.candidates,
        }).findings.map(f => f.ruleId);
        break;
      }
      case "partsAssetFitment": {
        const text = fs.readFileSync(fixturePath, "utf-8");
        const fetchFn = createMockExaFetch(testCase.mockExa ?? { results: [] });
        const result = await fitment.evaluate!(text, {
          fetchFn,
          apiKey: "test-key",
        });
        actualRuleIds = result.findings.map(f => f.ruleId);
        break;
      }
    }

    const { pass, missing } = ruleIdsMatch(
      testCase.expectedRuleIds,
      actualRuleIds
    );

    return {
      id: testCase.id,
      evaluator: testCase.evaluator,
      status: pass ? "pass" : "fail",
      expectedRuleIds: testCase.expectedRuleIds,
      actualRuleIds,
      note: pass ? undefined : `Missing expected rules: ${missing.join(", ")}`,
    };
  } finally {
    restoreCaseFlags(savedEnv);
  }
}

export async function runWave5RulesSlice(
  options: RunWave5RulesSliceOptions
): Promise<Wave5RulesSliceReport> {
  const manifest = loadWave5RulesManifest(options.manifestPath);
  const fixturesDir = options.fixturesDir ?? path.dirname(options.manifestPath);

  const fitment = await loadFitmentEvaluator();
  const caseResults: Wave5RulesCaseResult[] = [];

  for (const testCase of manifest.cases) {
    caseResults.push(await evaluateCase(testCase, fixturesDir, fitment));
  }

  const passed = caseResults.filter(c => c.status === "pass").length;
  const failed = caseResults.filter(c => c.status === "fail").length;
  const unavailable = caseResults.filter(
    c => c.status === "unavailable"
  ).length;

  const blockers: string[] = [];
  for (const result of caseResults) {
    if (result.status === "fail") {
      blockers.push(
        `${result.id}: expected [${result.expectedRuleIds.join(", ")}], got [${result.actualRuleIds.join(", ")}]`
      );
    }
    if (result.status === "unavailable" && result.note) {
      blockers.push(`${result.id}: ${result.note}`);
    }
  }

  let status: Wave5RulesSliceReport["status"];
  if (failed > 0) {
    status = "fail";
  } else if (unavailable > 0) {
    status = "unavailable";
  } else {
    status = "pass";
  }

  return {
    version: manifest.version,
    runId: generateWave5RulesRunId(),
    timestamp: new Date().toISOString(),
    status,
    fitmentModuleAvailable: fitment.available,
    summary: {
      total: caseResults.length,
      passed,
      failed,
      unavailable,
    },
    cases: caseResults,
    blockers,
  };
}

export function exitCodeForReport(report: Wave5RulesSliceReport): number {
  if (report.status === "pass") return 0;
  if (report.status === "unavailable") return 2;
  return 1;
}
