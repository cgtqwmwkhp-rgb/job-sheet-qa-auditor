/**
 * Resilient OCR Adapter (PR-4)
 *
 * Wraps a primary OCR adapter with optional:
 * - Failover to a fallback provider when primary fails
 * - Cross-check sampling (advisory dual-run; never merges conflicting text)
 *
 * Enabled only when FEATURE_OCR_FAILOVER=true or
 * FEATURE_OCR_CROSS_CHECK=true (both default false).
 * Cross-check defaults to a 5% sample when enabled.
 *
 * Contract tests inject mock primary + mock Azure fallback; live staging uses
 * configured providers and fails soft when fallback credentials are absent.
 */

import { createHash } from "crypto";
import { createSafeLogger } from "../../utils/safeLogger";
import type {
  OCRAdapter,
  OCRResult,
  OCROptions,
  OCRProviderArtifact,
  OCRCrossCheckMetadata,
  OCRFailoverMetadata,
  OCRPage,
  OCRFieldCrossCheckSummary,
} from "./types";
import {
  scrapeCriticalFieldsFromPages,
  voteField,
  normalizeVoteValue,
} from "../fieldVoting";

const logger = createSafeLogger("ResilientOCR");

export interface ResilientOcrAdapterOptions {
  primary: OCRAdapter;
  fallback: OCRAdapter;
  /** When false, delegates to primary only (no failover / cross-check). */
  failoverEnabled: boolean;
  /** 0–1 fraction of successful primary runs that also invoke fallback. */
  crossCheckSampleRate: number;
  /** Optional display names for metadata (defaults to adapter.providerName). */
  primaryProviderName?: string;
  fallbackProviderName?: string;
  /** Injected RNG for deterministic tests (returns 0–1). */
  random?: () => number;
}

/**
 * Normalize page markdown for advisory comparison (no PII stored).
 */
export function normalizeOcrTextForCompare(pages: OCRPage[]): string {
  return (
    pages
      .map(p => p.markdown)
      .join("\n")
      .toLowerCase()
      // Strip common markdown / punctuation so engines can agree on content
      .replace(/[#*_`>~()[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function hashNormalizedText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Cheap similarity: 1 when hashes match; else token Jaccard on short tokens.
 * Returns 0–1. Does not store raw text.
 */
export function computeTextSimilarity(
  primaryPages: OCRPage[],
  fallbackPages: OCRPage[]
): {
  similarityScore: number;
  pageCountMatch: boolean;
  primaryHash: string;
  fallbackHash: string;
} {
  const a = normalizeOcrTextForCompare(primaryPages);
  const b = normalizeOcrTextForCompare(fallbackPages);
  const pageCountMatch = primaryPages.length === fallbackPages.length;
  const primaryHash = hashNormalizedText(a);
  const fallbackHash = hashNormalizedText(b);

  if (a === b) {
    return { similarityScore: 1, pageCountMatch, primaryHash, fallbackHash };
  }

  const tokensA = new Set(a.split(" ").filter(t => t.length > 1));
  const tokensB = new Set(b.split(" ").filter(t => t.length > 1));
  if (tokensA.size === 0 && tokensB.size === 0) {
    return { similarityScore: 1, pageCountMatch, primaryHash, fallbackHash };
  }
  let intersection = 0;
  for (const t of Array.from(tokensA)) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  const similarityScore = union === 0 ? 0 : intersection / union;
  return { similarityScore, pageCountMatch, primaryHash, fallbackHash };
}

const AGREEMENT_THRESHOLD = 0.85;

function hashFieldValue(fieldId: string, value: string): string {
  const norm = normalizeVoteValue(fieldId, value) ?? value;
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

/**
 * Field-level vote between primary and fallback OCR scrapes (Wave-4 B2).
 * Does not alter canonical pages — advisory metadata only.
 */
export function buildFieldCrossCheckVotes(
  primaryPages: OCRPage[],
  fallbackPages: OCRPage[]
): {
  fieldVotes: OCRFieldCrossCheckSummary[];
  fieldsAgreed: number;
  fieldsAbstained: number;
} {
  const primaryFields = scrapeCriticalFieldsFromPages(primaryPages);
  const fallbackFields = scrapeCriticalFieldsFromPages(fallbackPages);
  const fieldIds = new Set([
    ...primaryFields.map(f => f.fieldId),
    ...fallbackFields.map(f => f.fieldId),
  ]);

  const fieldVotes: OCRFieldCrossCheckSummary[] = [];
  let fieldsAgreed = 0;
  let fieldsAbstained = 0;

  for (const fieldId of Array.from(fieldIds)) {
    const p = primaryFields.find(f => f.fieldId === fieldId);
    const f = fallbackFields.find(f => f.fieldId === fieldId);
    const candidates = [
      ...(p
        ? [
            {
              engine: "primary" as const,
              fieldId,
              value: p.value,
              confidence: p.confidence,
              evidence: p.evidence,
              evidenceStrength: /label_only/i.test(p.evidence)
                ? ("label_only" as const)
                : ("weak" as const),
            },
          ]
        : []),
      ...(f
        ? [
            {
              engine: "fallback" as const,
              fieldId,
              value: f.value,
              confidence: f.confidence,
              evidence: f.evidence,
              evidenceStrength: /label_only/i.test(f.evidence)
                ? ("label_only" as const)
                : ("weak" as const),
            },
          ]
        : []),
    ];
    const vote = voteField(fieldId, candidates);
    const summary: OCRFieldCrossCheckSummary = {
      fieldId,
      agreement: !vote.abstained && vote.winningEngines.length >= 2,
      decision: vote.decision,
      reasonCode: vote.reasonCode,
      ...(vote.value ? { valueHash: hashFieldValue(fieldId, vote.value) } : {}),
    };
    fieldVotes.push(summary);
    if (vote.abstained) fieldsAbstained++;
    else if (summary.agreement) fieldsAgreed++;
  }

  return { fieldVotes, fieldsAgreed, fieldsAbstained };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function errorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim() !== "") return code;
  }
  return fallback;
}

export function buildCrossCheckMetadata(
  primary: OCRResult,
  fallback: OCRResult,
  primaryProvider: string,
  fallbackProvider: string
): OCRCrossCheckMetadata {
  if (!fallback.success) {
    return {
      sampled: true,
      agreement: false,
      primaryProvider,
      fallbackProvider,
      disagreementReason: "FALLBACK_FAILED",
    };
  }

  const { similarityScore, pageCountMatch } = computeTextSimilarity(
    primary.pages,
    fallback.pages
  );

  const agreement = pageCountMatch && similarityScore >= AGREEMENT_THRESHOLD;

  const fieldVote =
    primary.pages.length > 0 && fallback.pages.length > 0
      ? buildFieldCrossCheckVotes(primary.pages, fallback.pages)
      : null;

  return {
    sampled: true,
    agreement,
    primaryProvider,
    fallbackProvider,
    similarityScore,
    pageCountMatch,
    ...(agreement
      ? {}
      : {
          disagreementReason: !pageCountMatch
            ? "PAGE_COUNT_MISMATCH"
            : "TEXT_DIVERGENCE",
        }),
    ...(fieldVote
      ? {
          fieldVotes: fieldVote.fieldVotes,
          fieldsAgreed: fieldVote.fieldsAgreed,
          fieldsAbstained: fieldVote.fieldsAbstained,
        }
      : {}),
  };
}

export class ResilientOCRAdapter implements OCRAdapter {
  readonly providerName: string;
  private readonly primary: OCRAdapter;
  private readonly fallback: OCRAdapter;
  private readonly failoverEnabled: boolean;
  private readonly crossCheckSampleRate: number;
  private readonly primaryProviderName?: string;
  private readonly fallbackProviderName?: string;
  private readonly random: () => number;

  constructor(options: ResilientOcrAdapterOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.failoverEnabled = options.failoverEnabled;
    this.crossCheckSampleRate = options.crossCheckSampleRate;
    this.primaryProviderName = options.primaryProviderName;
    this.fallbackProviderName = options.fallbackProviderName;
    this.random = options.random ?? Math.random;
    this.providerName =
      options.failoverEnabled || options.crossCheckSampleRate > 0
        ? `resilient(${options.primary.providerName}+${options.fallback.providerName})`
        : options.primary.providerName;
  }

  get modelId(): string {
    return this.primary.modelId;
  }

  private shouldSampleCrossCheck(): boolean {
    if (this.crossCheckSampleRate <= 0) return false;
    if (this.crossCheckSampleRate >= 1) return true;
    return this.random() < this.crossCheckSampleRate;
  }

  private async runWithResilience(
    invoke: (adapter: OCRAdapter) => Promise<OCRResult>
  ): Promise<OCRResult> {
    if (!this.failoverEnabled && this.crossCheckSampleRate <= 0) {
      return invoke(this.primary);
    }

    const primaryProvider =
      this.primaryProviderName || this.primary.providerName;
    const fallbackProvider =
      this.fallbackProviderName || this.fallback.providerName;

    let primaryResult: OCRResult;
    try {
      primaryResult = await invoke(this.primary);
    } catch (error) {
      if (!this.failoverEnabled) {
        throw error;
      }
      primaryResult = {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.primary.modelId,
        provider: primaryProvider,
        error: errorMessage(error, "Primary OCR threw before returning"),
        errorCode: errorCode(error, "PRIMARY_OCR_ERROR"),
      };
    }

    if (
      this.failoverEnabled &&
      (!primaryResult.success || primaryResult.pages.length === 0)
    ) {
      logger.info("Primary OCR failed; attempting fallback", {
        primaryProvider,
        fallbackProvider,
        primaryErrorCode: primaryResult.errorCode,
      });

      let fallbackResult: OCRResult;
      try {
        fallbackResult = await invoke(this.fallback);
      } catch (error) {
        logger.warn("Fallback OCR failed; keeping primary failure", {
          primaryProvider,
          fallbackProvider,
          fallbackErrorCode: errorCode(error, "FALLBACK_OCR_ERROR"),
        });
        return {
          success: false,
          pages: [],
          totalPages: 0,
          model: primaryResult.model || this.primary.modelId,
          provider: primaryProvider,
          error: primaryResult.error || "Primary OCR failed before fallback",
          errorCode: primaryResult.errorCode || "PRIMARY_OCR_ERROR",
          failover: {
            used: true,
            primaryProvider,
            fallbackProvider,
            primaryErrorCode: primaryResult.errorCode,
            primaryError: primaryResult.error,
            fallbackErrorCode: errorCode(error, "FALLBACK_OCR_ERROR"),
            fallbackError: errorMessage(error, "Fallback OCR failed"),
          },
          processingTimeMs: primaryResult.processingTimeMs || 0,
        };
      }
      const failover: OCRFailoverMetadata = {
        used: true,
        primaryProvider,
        fallbackProvider,
        primaryErrorCode: primaryResult.errorCode,
        primaryError: primaryResult.error,
        fallbackErrorCode: fallbackResult.errorCode,
        fallbackError: fallbackResult.error,
      };

      if (fallbackResult.success && fallbackResult.pages.length > 0) {
        return {
          ...fallbackResult,
          provider: fallbackProvider,
          failover,
          processingTimeMs:
            (primaryResult.processingTimeMs || 0) +
            (fallbackResult.processingTimeMs || 0),
        };
      }

      // Both failed — return primary error shape
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: primaryResult.model || this.primary.modelId,
        provider: primaryProvider,
        error: primaryResult.error || "Primary and fallback OCR failed",
        errorCode: primaryResult.errorCode || "OCR_FAILOVER_EXHAUSTED",
        failover: {
          ...failover,
          used: true,
        },
        processingTimeMs:
          (primaryResult.processingTimeMs || 0) +
          (fallbackResult.processingTimeMs || 0),
      };
    }

    // Primary succeeded — optional advisory cross-check
    if (this.shouldSampleCrossCheck()) {
      try {
        const fallbackResult = await invoke(this.fallback);
        const crossCheck = buildCrossCheckMetadata(
          primaryResult,
          fallbackResult,
          primaryProvider,
          fallbackProvider
        );
        logger.info("OCR cross-check sampled", {
          agreement: crossCheck.agreement,
          similarityScore: crossCheck.similarityScore,
          primaryProvider,
          fallbackProvider,
        });
        return {
          ...primaryResult,
          provider: primaryProvider,
          crossCheck,
        };
      } catch {
        return {
          ...primaryResult,
          provider: primaryProvider,
          crossCheck: {
            sampled: true,
            agreement: false,
            primaryProvider,
            fallbackProvider,
            disagreementReason: "CROSS_CHECK_ERROR",
          },
        };
      }
    }

    return {
      ...primaryResult,
      provider: primaryProvider,
    };
  }

  async extractFromUrl(
    documentUrl: string,
    options?: OCROptions
  ): Promise<OCRResult> {
    return this.runWithResilience(adapter =>
      adapter.extractFromUrl(documentUrl, options)
    );
  }

  async extractFromBase64(
    base64Data: string,
    mimeType: string,
    options?: OCROptions
  ): Promise<OCRResult> {
    return this.runWithResilience(adapter =>
      adapter.extractFromBase64(base64Data, mimeType, options)
    );
  }

  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    return this.primary.validateApiKey();
  }

  getProviderArtifact(
    result: OCRResult,
    options?: OCROptions
  ): OCRProviderArtifact {
    const source =
      result.failover?.used === true ? this.fallback : this.primary;
    return source.getProviderArtifact(result, options);
  }
}

export function createResilientOcrAdapter(
  primary: OCRAdapter,
  fallback: OCRAdapter,
  config: {
    failoverEnabled?: boolean;
    crossCheckSampleRate?: number;
    primaryProviderName?: string;
    fallbackProviderName?: string;
  } = {}
): ResilientOCRAdapter {
  return new ResilientOCRAdapter({
    primary,
    fallback,
    failoverEnabled: config.failoverEnabled ?? true,
    crossCheckSampleRate: config.crossCheckSampleRate ?? 0,
    primaryProviderName: config.primaryProviderName,
    fallbackProviderName: config.fallbackProviderName,
  });
}

/** Alias matching PR-4 brief naming. */
export function wrapWithResilience(
  primary: OCRAdapter,
  fallback: OCRAdapter,
  config?: {
    failoverEnabled?: boolean;
    crossCheckSampleRate?: number;
    primaryProviderName?: string;
    fallbackProviderName?: string;
  }
): ResilientOCRAdapter {
  return createResilientOcrAdapter(primary, fallback, config);
}
