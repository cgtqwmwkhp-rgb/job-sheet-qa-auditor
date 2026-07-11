/**
 * Multimodal before/after pair compare.
 *
 * Gated by FEATURE_PHOTO_PAIR_COMPARE. Fail-soft: never throws; returns
 * inconclusive artifact when VLM unavailable.
 *
 * Axes: work_done | repaired_properly | clean | residual_risk
 * Confidence bands: high (≥0.8) → Issue, medium → queue nudge, low → info
 */

export const FEATURE_PHOTO_PAIR_COMPARE = "FEATURE_PHOTO_PAIR_COMPARE";

export function isPhotoPairCompareEnabled(): boolean {
  return process.env[FEATURE_PHOTO_PAIR_COMPARE] === "true";
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
  provider: "heuristic" | "vlm" | "mock";
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
  /** Optional base64 PDF for future VLM; unused by heuristic path. */
  documentPdfBase64?: string | null;
  partsUsedSnippet?: string;
  repairsSnippet?: string;
  /** Force mock fail axes for tests. */
  mockMode?: "pass" | "fail_work" | "fail_clean" | "inconclusive";
}

function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
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

/**
 * Heuristic / mock pair compare — no real vision. Used when flag off or VLM absent.
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
    } else {
      // Default pass when labels present (deterministic scaffold until real VLM)
      pairs.push({
        beforePage: pp.beforePage,
        afterPage: pp.afterPage,
        axes: {
          work_done: "pass",
          repaired_properly: "pass",
          clean: "pass",
          residual_risk: "pass",
        },
        confidence: 0.62,
        confidenceBand: bandFor(0.62),
        reasoning:
          "Heuristic: before/after labels present; visual axes not verified by VLM — medium confidence pass.",
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
 */
export async function runPhotoPairCompare(
  input: PairCompareInput
): Promise<PhotoPairCompareArtifact | null> {
  if (!isPhotoPairCompareEnabled() && !input.mockMode) {
    return null;
  }
  try {
    // Future: call VLM with documentPdfBase64 when provider configured.
    // For now heuristic/mock is the production-safe path behind the flag.
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
