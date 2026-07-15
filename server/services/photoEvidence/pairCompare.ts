/**
 * Multimodal before/after pair compare.
 *
 * Gated by FEATURE_PHOTO_PAIR_COMPARE. Fail-soft: never throws; returns
 * inconclusive artifact when VLM unavailable (no medium-confidence heuristic pass).
 *
 * Axes: work_done | repaired_properly | clean | residual_risk
 * Confidence bands: high (≥0.8) → Issue, medium → queue nudge, low → info
 *
 * VLM path (optional): when documentPdfBase64 is present and
 * FEATURE_VLM_VERIFICATION or PHOTO_PAIR_USE_VLM is true, tryVlmPairAxes
 * runs first. Gemini path when FEATURE_PHOTO_PAIR_GEMINI is true.
 * On failure falls back to honest inconclusive heuristic (PHOTO-C014).
 */

import { invokeLLM, isLLMConfigured } from "../../_core/llm";
import { getVlmConfig } from "../vlmAdapter/types";
import { createSafeLogger } from "../../utils/safeLogger";

const logger = createSafeLogger("PhotoPairCompare");

export const FEATURE_PHOTO_PAIR_COMPARE = "FEATURE_PHOTO_PAIR_COMPARE";
export const FEATURE_PHOTO_PAIR_GEMINI = "FEATURE_PHOTO_PAIR_GEMINI";
export const PHOTO_PAIR_USE_VLM = "PHOTO_PAIR_USE_VLM";

export function isPhotoPairCompareEnabled(): boolean {
  return process.env[FEATURE_PHOTO_PAIR_COMPARE] === "true";
}

/** VLM pair path when FEATURE_VLM_VERIFICATION or PHOTO_PAIR_USE_VLM. */
export function isPhotoPairVlmEnabled(): boolean {
  return (
    process.env.FEATURE_VLM_VERIFICATION === "true" ||
    process.env[PHOTO_PAIR_USE_VLM] === "true"
  );
}

/** Gemini pair-axes path when FEATURE_PHOTO_PAIR_GEMINI is true. */
export function isPhotoPairGeminiEnabled(): boolean {
  return process.env[FEATURE_PHOTO_PAIR_GEMINI] === "true";
}

export type AxisVerdict = "pass" | "fail" | "inconclusive";
export type ConfidenceBand = "high" | "medium" | "low";

export interface PhotoPairAxes {
  work_done: AxisVerdict;
  repaired_properly: AxisVerdict;
  clean: AxisVerdict;
  residual_risk: AxisVerdict;
}

export interface PhotoPairResult {
  beforePage: number | null;
  afterPage: number | null;
  axes: PhotoPairAxes;
  confidence: number;
  confidenceBand: ConfidenceBand;
  reasoning: string;
}

export interface PhotoPairCompareArtifact {
  enabled: boolean;
  provider: "heuristic" | "vlm" | "mock" | "gemini";
  model: string;
  pairs: PhotoPairResult[];
  pageRoles: Array<{
    page: number;
    role: "before" | "after" | "form" | "unknown";
  }>;
  summary: string;
  processingTimeMs: number;
}

export interface PairCompareInput {
  text: string;
  totalPages?: number | null;
  /** Optional base64 PDF for VLM path. */
  documentPdfBase64?: string | null;
  partsUsedSnippet?: string;
  repairsSnippet?: string;
  /** Force mock fail axes for tests. */
  mockMode?: "pass" | "fail_work" | "fail_clean" | "inconclusive";
}

export interface VlmPairAxesResult {
  success: boolean;
  axes?: PhotoPairAxes;
  confidence?: number;
  reasoning?: string;
  provider: "vlm" | "mock" | "gemini";
  model: string;
  error?: string;
}

function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}

const AXIS_KEYS = [
  "work_done",
  "repaired_properly",
  "clean",
  "residual_risk",
] as const;

function parseAxisVerdict(v: unknown): AxisVerdict {
  if (v === "pass" || v === "fail" || v === "inconclusive") return v;
  return "inconclusive";
}

/**
 * Parse axes JSON from model text (raw JSON or embedded in reasoning).
 */
export function parsePairAxesFromText(text: string): {
  axes: PhotoPairAxes;
  confidence: number;
  reasoning: string;
} | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const axesRaw = (obj.axes as Record<string, unknown> | undefined) ?? obj;
    const axes: PhotoPairAxes = {
      work_done: parseAxisVerdict(axesRaw.work_done),
      repaired_properly: parseAxisVerdict(axesRaw.repaired_properly),
      clean: parseAxisVerdict(axesRaw.clean),
      residual_risk: parseAxisVerdict(axesRaw.residual_risk),
    };
    // Require at least one explicit axis key in the JSON
    const hasAxis = AXIS_KEYS.some(k => k in axesRaw);
    if (!hasAxis) return null;
    const confidence = Math.min(1, Math.max(0, Number(obj.confidence) || 0.7));
    const reasoning = String(obj.reasoning || "VLM pair axes");
    return { axes, confidence, reasoning };
  } catch {
    return null;
  }
}

/**
 * Classify pages from OCR/layout text labels (Before / After / Photo N).
 */
export function classifyPageRoles(
  text: string,
  totalPages?: number | null
): Array<{ page: number; role: "before" | "after" | "form" | "unknown" }> {
  // Split on form-feed or "Page N" markers when present
  const chunks = text.split(/\f|(?=Page\s+\d+)/i);
  const pages =
    typeof totalPages === "number" && totalPages > 0
      ? totalPages
      : Math.max(1, chunks.length);

  const roles: Array<{
    page: number;
    role: "before" | "after" | "form" | "unknown";
  }> = Array.from({ length: pages }, (_, i) => ({
    page: i + 1,
    role: "unknown",
  }));

  const clampPage = (n: number) => Math.min(pages, Math.max(1, n));

  // Explicit "Photo N Before/After" wins — photo number maps to page when possible.
  // This handles OCR blobs that put both labels on the first chunk (with Page 2/3 later).
  for (const m of Array.from(
    text.matchAll(/\bPhoto\s*#?\s*(\d+)\s*(Before|After)\b/gi)
  )) {
    const n = Number.parseInt(m[1], 10);
    const tag = m[2].toLowerCase() as "before" | "after";
    const page = clampPage(Number.isFinite(n) ? n : 1);
    roles[page - 1] = { page, role: tag };
  }

  for (const m of Array.from(
    text.matchAll(
      /\b(Before|After)\s*(?:photo|image|pic(?:ture)?)?\s*#?\s*(\d+)\b/gi
    )
  )) {
    const tag = m[1].toLowerCase() as "before" | "after";
    const n = Number.parseInt(m[2], 10);
    const page = clampPage(Number.isFinite(n) ? n : 1);
    if (roles[page - 1].role === "unknown") {
      roles[page - 1] = { page, role: tag };
    }
  }

  for (let i = 0; i < pages; i++) {
    if (roles[i].role !== "unknown") continue;
    const chunk = chunks[i] ?? "";
    const pageNum = i + 1;
    if (/\bbefore\b/i.test(chunk) && !/\bafter\b/i.test(chunk)) {
      roles[i] = { page: pageNum, role: "before" };
    } else if (/\bafter\b/i.test(chunk) && !/\bbefore\b/i.test(chunk)) {
      roles[i] = { page: pageNum, role: "after" };
    } else if (/\bPhoto\s*#?\s*\d+\b/i.test(chunk)) {
      // Odd photo numbers → before, even → after (heuristic)
      const m = chunk.match(/\bPhoto\s*#?\s*(\d+)\b/i);
      const n = m ? Number.parseInt(m[1], 10) : pageNum;
      roles[i] = {
        page: pageNum,
        role: n % 2 === 1 ? "before" : "after",
      };
    } else if (
      /\b(job\s+summary|technician\s+signature|asset\s+details|compliance)\b/i.test(
        chunk
      )
    ) {
      roles[i] = { page: pageNum, role: "form" };
    }
  }

  return roles;
}

function pairFromRoles(
  roles: Array<{ page: number; role: string }>
): Array<{ beforePage: number; afterPage: number }> {
  const befores = roles.filter(r => r.role === "before").map(r => r.page);
  const afters = roles.filter(r => r.role === "after").map(r => r.page);
  const pairs: Array<{ beforePage: number; afterPage: number }> = [];
  const n = Math.min(befores.length, afters.length);
  for (let i = 0; i < n; i++) {
    pairs.push({ beforePage: befores[i], afterPage: afters[i] });
  }
  return pairs;
}

const PAIR_AXES_PROMPT = `Compare before/after photos on this job sheet PDF (pages noted in context).
Judge these axes only: work_done, repaired_properly, clean, residual_risk.
Each axis must be "pass", "fail", or "inconclusive".
Reply JSON only:
{"axes":{"work_done":"...","repaired_properly":"...","clean":"...","residual_risk":"..."},"confidence":0-1,"reasoning":"short"}`;

/**
 * Structured mock or Anthropic document verify for pair axes.
 * Fail-soft: returns success:false on errors (caller falls back to heuristic).
 */
export async function tryVlmPairAxes(input: {
  documentPdfBase64: string;
  beforePage: number;
  afterPage: number;
  partsUsedSnippet?: string;
  repairsSnippet?: string;
}): Promise<VlmPairAxesResult> {
  const config = getVlmConfig();
  const providerEnv = (
    process.env.VLM_PROVIDER ||
    config.provider ||
    "mock"
  ).toLowerCase();

  if (providerEnv !== "anthropic") {
    // Deterministic structured mock axes JSON (CI / local, no network).
    const mockJson = JSON.stringify({
      axes: {
        work_done: "pass",
        repaired_properly: "pass",
        clean: "pass",
        residual_risk: "pass",
      },
      confidence: 0.84,
      reasoning: `mock VLM pair axes pages ${input.beforePage}->${input.afterPage}`,
    });
    const parsed = parsePairAxesFromText(mockJson);
    if (!parsed) {
      return {
        success: false,
        provider: "mock",
        model: "mock-vlm-pair-v1",
        error: "MOCK_PARSE_FAILED",
      };
    }
    return {
      success: true,
      axes: parsed.axes,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      provider: "mock",
      model: "mock-vlm-pair-v1",
    };
  }

  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = config.model || "claude-3-5-sonnet-20241022";
  if (!apiKey) {
    return {
      success: false,
      provider: "vlm",
      model,
      error: "MISSING_API_KEY",
      reasoning: "ANTHROPIC_API_KEY not configured",
    };
  }

  const context = [
    `Before page: ${input.beforePage}`,
    `After page: ${input.afterPage}`,
    input.partsUsedSnippet ? `Parts used: ${input.partsUsedSnippet}` : "",
    input.repairsSnippet ? `Repairs: ${input.repairsSnippet}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 384,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: input.documentPdfBase64,
                },
              },
              {
                type: "text",
                text: `${PAIR_AXES_PROMPT}\n${context}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn("VLM pair axes HTTP error", {
        status: response.status,
        bodyPreview: body.slice(0, 120),
      });
      return {
        success: false,
        provider: "vlm",
        model,
        error: "HTTP_ERROR",
        reasoning: `HTTP ${response.status}`,
      };
    }

    const json = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find(c => c.type === "text")?.text?.trim() || "";
    const parsed = parsePairAxesFromText(text);
    if (!parsed) {
      return {
        success: false,
        provider: "vlm",
        model,
        error: "UNPARSEABLE",
        reasoning: text.slice(0, 200) || "unparseable model response",
      };
    }

    return {
      success: true,
      axes: parsed.axes,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      provider: "vlm",
      model,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logger.warn("VLM pair axes failed soft", { message });
    return {
      success: false,
      provider: "vlm",
      model,
      error: "NETWORK_OR_PARSE",
      reasoning: message,
    };
  }
}

function buildMockGeminiPairAxesJson(
  beforePage: number,
  afterPage: number
): string {
  return JSON.stringify({
    axes: {
      work_done: "pass",
      repaired_properly: "pass",
      clean: "pass",
      residual_risk: "pass",
    },
    confidence: 0.84,
    reasoning: `mock Gemini pair axes pages ${beforePage}->${afterPage}`,
  });
}

/**
 * Gemini multimodal pair-axes via invokeLLM (PDF document).
 * Fail-soft: returns success:false on errors (caller falls back to inconclusive heuristic).
 */
export async function tryGeminiPairAxes(input: {
  documentPdfBase64: string;
  beforePage: number;
  afterPage: number;
  partsUsedSnippet?: string;
  repairsSnippet?: string;
}): Promise<VlmPairAxesResult> {
  const model =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.JUDGMENT_MODEL?.trim() ||
    "gemini-2.5-pro";

  if (process.env.LLM_PROVIDER === "mock" || !isLLMConfigured()) {
    if (process.env.LLM_PROVIDER !== "mock") {
      return {
        success: false,
        provider: "gemini",
        model,
        error: "MISSING_API_KEY",
        reasoning: "GEMINI_API_KEY not configured",
      };
    }
    const parsed = parsePairAxesFromText(
      buildMockGeminiPairAxesJson(input.beforePage, input.afterPage)
    );
    if (!parsed) {
      return {
        success: false,
        provider: "mock",
        model: "mock-gemini-pair-v1",
        error: "MOCK_PARSE_FAILED",
      };
    }
    return {
      success: true,
      axes: parsed.axes,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      provider: "mock",
      model: "mock-gemini-pair-v1",
    };
  }

  const context = [
    `Before page: ${input.beforePage}`,
    `After page: ${input.afterPage}`,
    input.partsUsedSnippet ? `Parts used: ${input.partsUsedSnippet}` : "",
    input.repairsSnippet ? `Repairs: ${input.repairsSnippet}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You compare before/after job-sheet photos. Reply with JSON only for the requested axes.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `${PAIR_AXES_PROMPT}\n${context}` },
            {
              type: "file_url",
              file_url: {
                url: `data:application/pdf;base64,${input.documentPdfBase64}`,
                mime_type: "application/pdf",
              },
            },
          ],
        },
      ],
      maxTokens: 384,
      costMeta: {
        stage: "photo_pair_compare",
        provider: "gemini",
        tool: "gemini_photo_pair_axes",
      },
    });

    const text =
      typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
        : "";
    const parsed = parsePairAxesFromText(text);
    if (!parsed) {
      return {
        success: false,
        provider: "gemini",
        model: response.model || model,
        error: "UNPARSEABLE",
        reasoning: text.slice(0, 200) || "unparseable model response",
      };
    }

    return {
      success: true,
      axes: parsed.axes,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      provider: "gemini",
      model: response.model || model,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logger.warn("Gemini pair axes failed soft", { message });
    return {
      success: false,
      provider: "gemini",
      model,
      error: "NETWORK_OR_PARSE",
      reasoning: message,
    };
  }
}

/**
 * Run VLM pair compare for all detected before/after pairs.
 * Returns null when VLM cannot produce results (caller falls back to heuristic).
 */
export async function runVlmPairCompare(
  input: PairCompareInput
): Promise<PhotoPairCompareArtifact | null> {
  if (!input.documentPdfBase64) return null;

  const started = Date.now();
  const roles = classifyPageRoles(input.text, input.totalPages);
  const pagePairs = pairFromRoles(roles);
  if (pagePairs.length === 0) return null;

  const pairs: PhotoPairResult[] = [];
  let model = "vlm-pair-v1";
  let provider: "vlm" | "mock" = "vlm";

  for (const pp of pagePairs) {
    const r = await tryVlmPairAxes({
      documentPdfBase64: input.documentPdfBase64,
      beforePage: pp.beforePage,
      afterPage: pp.afterPage,
      partsUsedSnippet: input.partsUsedSnippet,
      repairsSnippet: input.repairsSnippet,
    });
    if (!r.success || !r.axes) {
      return null;
    }
    model = r.model;
    provider = r.provider;
    const confidence = r.confidence ?? 0.7;
    pairs.push({
      beforePage: pp.beforePage,
      afterPage: pp.afterPage,
      axes: r.axes,
      confidence,
      confidenceBand: bandFor(confidence),
      reasoning: r.reasoning || "VLM pair compare",
    });
  }

  return {
    enabled: isPhotoPairCompareEnabled(),
    provider,
    model,
    pairs,
    pageRoles: roles,
    summary: `VLM paired ${pairs.length} before/after page set(s).`,
    processingTimeMs: Date.now() - started,
  };
}

/**
 * Run Gemini pair compare for all detected before/after pairs.
 * Returns null when Gemini cannot produce results (caller falls back to inconclusive heuristic).
 */
export async function runGeminiPairCompare(
  input: PairCompareInput
): Promise<PhotoPairCompareArtifact | null> {
  if (!input.documentPdfBase64) return null;

  const started = Date.now();
  const roles = classifyPageRoles(input.text, input.totalPages);
  const pagePairs = pairFromRoles(roles);
  if (pagePairs.length === 0) return null;

  const pairs: PhotoPairResult[] = [];
  let model = "gemini-pair-v1";
  let provider: "gemini" | "mock" = "gemini";

  for (const pp of pagePairs) {
    const r = await tryGeminiPairAxes({
      documentPdfBase64: input.documentPdfBase64,
      beforePage: pp.beforePage,
      afterPage: pp.afterPage,
      partsUsedSnippet: input.partsUsedSnippet,
      repairsSnippet: input.repairsSnippet,
    });
    if (!r.success || !r.axes) {
      return null;
    }
    model = r.model;
    provider = r.provider === "mock" ? "mock" : "gemini";
    const confidence = r.confidence ?? 0.7;
    pairs.push({
      beforePage: pp.beforePage,
      afterPage: pp.afterPage,
      axes: r.axes,
      confidence,
      confidenceBand: bandFor(confidence),
      reasoning: r.reasoning || "Gemini pair compare",
    });
  }

  return {
    enabled: isPhotoPairCompareEnabled(),
    provider,
    model,
    pairs,
    pageRoles: roles,
    summary: `Gemini paired ${pairs.length} before/after page set(s).`,
    processingTimeMs: Date.now() - started,
  };
}

/**
 * Heuristic / mock pair compare — no real vision. Used when flag off or VLM absent.
 * Default (no mockMode): inconclusive — visual axes are not verified without VLM/Gemini.
 */
export function runHeuristicPairCompare(
  input: PairCompareInput
): PhotoPairCompareArtifact {
  const started = Date.now();
  const roles = classifyPageRoles(input.text, input.totalPages);
  const pagePairs = pairFromRoles(roles);

  const mock = input.mockMode;
  const pairs: PhotoPairResult[] = [];

  if (pagePairs.length === 0) {
    return {
      enabled: isPhotoPairCompareEnabled(),
      provider: "heuristic",
      model: "heuristic-page-roles-v1",
      pairs: [],
      pageRoles: roles,
      summary: "No before/after page pairs detected from labels.",
      processingTimeMs: Date.now() - started,
    };
  }

  for (const pp of pagePairs) {
    if (mock === "fail_work") {
      pairs.push({
        beforePage: pp.beforePage,
        afterPage: pp.afterPage,
        axes: {
          work_done: "fail",
          repaired_properly: "fail",
          clean: "pass",
          residual_risk: "inconclusive",
        },
        confidence: 0.88,
        confidenceBand: "high",
        reasoning:
          "Mock: after image indistinguishable from before — work_done fail.",
      });
    } else if (mock === "fail_clean") {
      pairs.push({
        beforePage: pp.beforePage,
        afterPage: pp.afterPage,
        axes: {
          work_done: "pass",
          repaired_properly: "pass",
          clean: "fail",
          residual_risk: "pass",
        },
        confidence: 0.86,
        confidenceBand: "high",
        reasoning: "Mock: after photo shows debris / unfinished mess.",
      });
    } else if (mock === "inconclusive") {
      pairs.push({
        beforePage: pp.beforePage,
        afterPage: pp.afterPage,
        axes: {
          work_done: "inconclusive",
          repaired_properly: "inconclusive",
          clean: "inconclusive",
          residual_risk: "inconclusive",
        },
        confidence: 0.35,
        confidenceBand: "low",
        reasoning: "Mock: inconclusive lighting / framing.",
      });
    } else if (mock === "pass") {
      pairs.push({
        beforePage: pp.beforePage,
        afterPage: pp.afterPage,
        axes: {
          work_done: "pass",
          repaired_properly: "pass",
          clean: "pass",
          residual_risk: "pass",
        },
        confidence: 0.84,
        confidenceBand: "high",
        reasoning: "Mock: VLM-verified pass axes.",
      });
    } else {
      // Honest inconclusive when labels present but no VLM/Gemini verification ran.
      pairs.push({
        beforePage: pp.beforePage,
        afterPage: pp.afterPage,
        axes: {
          work_done: "inconclusive",
          repaired_properly: "inconclusive",
          clean: "inconclusive",
          residual_risk: "inconclusive",
        },
        confidence: 0.4,
        confidenceBand: "low",
        reasoning:
          "Heuristic: before/after labels present; visual axes not verified by VLM — inconclusive.",
      });
    }
  }

  return {
    enabled: isPhotoPairCompareEnabled(),
    provider: mock ? "mock" : "heuristic",
    model: mock ? `mock-${mock}` : "heuristic-page-roles-v1",
    pairs,
    pageRoles: roles,
    summary: `Paired ${pairs.length} before/after page set(s).`,
    processingTimeMs: Date.now() - started,
  };
}

/**
 * Run pair compare when feature flag is on. Fail-soft.
 * Prefer VLM/Gemini when configured + PDF present; fall back to inconclusive heuristic.
 */
export async function runPhotoPairCompare(
  input: PairCompareInput
): Promise<PhotoPairCompareArtifact | null> {
  if (!isPhotoPairCompareEnabled() && !input.mockMode) {
    return null;
  }
  try {
    // Explicit mockMode keeps deterministic test path (skip VLM/Gemini).
    if (!input.mockMode && isPhotoPairVlmEnabled() && input.documentPdfBase64) {
      try {
        const vlmArt = await runVlmPairCompare(input);
        if (vlmArt) return vlmArt;
      } catch (err) {
        logger.warn(
          "VLM pair compare failed soft; using inconclusive heuristic",
          {
            message: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }
    if (
      !input.mockMode &&
      isPhotoPairGeminiEnabled() &&
      input.documentPdfBase64
    ) {
      try {
        const geminiArt = await runGeminiPairCompare(input);
        if (geminiArt) return geminiArt;
      } catch (err) {
        logger.warn(
          "Gemini pair compare failed soft; using inconclusive heuristic",
          {
            message: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }
    return runHeuristicPairCompare(input);
  } catch (err) {
    return {
      enabled: true,
      provider: "heuristic",
      model: "error-fallback",
      pairs: [],
      pageRoles: [],
      summary: `Pair compare failed soft: ${err instanceof Error ? err.message : String(err)}`,
      processingTimeMs: 0,
    };
  }
}
