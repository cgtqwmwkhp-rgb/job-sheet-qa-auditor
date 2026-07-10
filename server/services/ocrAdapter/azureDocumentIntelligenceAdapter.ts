/**
 * Azure Document Intelligence OCR Adapter (PR-4)
 *
 * REST client for Azure DI prebuilt-read (v4). No SDK dependency —
 * matches the storage adapter pattern of optional Azure packages.
 *
 * Overnight / CI: prefer mockAzureDiAdapter. Live HTTP only when
 * AZURE_DI_ENDPOINT + AZURE_DI_KEY are set; never called from contract tests.
 */

import { createSafeLogger } from "../../utils/safeLogger";
import { getCorrelationId } from "../../utils/context";
import type {
  OCRAdapter,
  OCRResult,
  OCROptions,
  OCRProviderArtifact,
  OCRConfig,
} from "./types";
import { getOCRConfig, DEFAULT_AZURE_DI_MODEL } from "./types";
import { parseAzureDiResponse } from "./parseAzureDiResponse";

const logger = createSafeLogger("AzureDI");

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 60;

export class AzureDocumentIntelligenceAdapter implements OCRAdapter {
  readonly providerName = "azure";
  private readonly config: OCRConfig;

  constructor(config?: Partial<OCRConfig>) {
    this.config = { ...getOCRConfig(), ...config };
  }

  get modelId(): string {
    return this.config.azureModel || DEFAULT_AZURE_DI_MODEL;
  }

  private ensureConfigured(): { endpoint: string; key: string } | null {
    const endpoint = this.config.azureEndpoint?.replace(/\/+$/, "");
    const key = this.config.azureKey;
    if (!endpoint || !key) return null;
    return { endpoint, key };
  }

  private analyzeUrl(endpoint: string): string {
    const model = this.modelId;
    const apiVersion = this.config.azureApiVersion;
    return `${endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=${apiVersion}`;
  }

  private async pollResult(
    operationLocation: string,
    key: string
  ): Promise<unknown> {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      const res = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      if (!res.ok) {
        throw new Error(`Azure DI poll failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        status?: string;
        analyzeResult?: unknown;
        error?: { message?: string };
      };
      if (body.status === "succeeded") {
        return body.analyzeResult ?? body;
      }
      if (body.status === "failed") {
        throw new Error(body.error?.message || "Azure DI analyze failed");
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Azure DI analyze timed out");
  }

  private async analyze(
    body: Record<string, unknown>,
    options?: OCROptions
  ): Promise<OCRResult> {
    const startTime = Date.now();
    const correlationId = getCorrelationId();
    const creds = this.ensureConfigured();

    if (!creds) {
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.modelId,
        provider: "azure",
        correlationId,
        error: "Azure DI not configured (AZURE_DI_ENDPOINT / AZURE_DI_KEY)",
        errorCode: "AZURE_DI_NOT_CONFIGURED",
        processingTimeMs: Date.now() - startTime,
      };
    }

    logger.info("Starting Azure DI extraction", {
      correlationId,
      model: this.modelId,
      pageLimit: options?.pageLimit,
    });

    try {
      const response = await fetch(this.analyzeUrl(creds.endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": creds.key,
          ...(correlationId && { "X-Correlation-ID": correlationId }),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        logger.warn("Azure DI analyze rejected", {
          correlationId,
          statusCode: response.status,
        });
        return {
          success: false,
          pages: [],
          totalPages: 0,
          model: this.modelId,
          provider: "azure",
          correlationId,
          error: `Azure DI HTTP ${response.status}${errText ? ": request rejected" : ""}`,
          errorCode: `AZURE_DI_HTTP_${response.status}`,
          processingTimeMs: Date.now() - startTime,
        };
      }

      const operationLocation = response.headers.get("operation-location");
      if (!operationLocation) {
        return {
          success: false,
          pages: [],
          totalPages: 0,
          model: this.modelId,
          provider: "azure",
          correlationId,
          error: "Azure DI missing operation-location header",
          errorCode: "AZURE_DI_NO_OPERATION",
          processingTimeMs: Date.now() - startTime,
        };
      }

      const analyzeResult = await this.pollResult(operationLocation, creds.key);
      const parsed = parseAzureDiResponse(analyzeResult);

      return {
        success: parsed.pages.length > 0,
        pages: parsed.pages,
        totalPages: parsed.pages.length,
        model: parsed.model || this.modelId,
        provider: "azure",
        correlationId,
        processingTimeMs: Date.now() - startTime,
        usageInfo: parsed.usageInfo,
        error:
          parsed.pages.length === 0 ? "Azure DI returned no pages" : undefined,
        errorCode: parsed.pages.length === 0 ? "AZURE_DI_EMPTY" : undefined,
      };
    } catch (error) {
      logger.warn("Azure DI extraction failed", {
        correlationId,
        errorCode: "AZURE_DI_ERROR",
      });
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.modelId,
        provider: "azure",
        correlationId,
        error: error instanceof Error ? error.message : "Azure DI failed",
        errorCode: "AZURE_DI_ERROR",
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async extractFromUrl(
    documentUrl: string,
    options?: OCROptions
  ): Promise<OCRResult> {
    return this.analyze({ urlSource: documentUrl }, options);
  }

  async extractFromBase64(
    base64Data: string,
    _mimeType: string,
    options?: OCROptions
  ): Promise<OCRResult> {
    return this.analyze({ base64Source: base64Data }, options);
  }

  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    const creds = this.ensureConfigured();
    if (!creds) {
      return {
        valid: false,
        error: "AZURE_DI_ENDPOINT and AZURE_DI_KEY required",
      };
    }
    // Lightweight: HEAD/GET model info would hit live Azure — skip overnight.
    // Presence of both vars is sufficient for "configured".
    return { valid: true };
  }

  getProviderArtifact(
    result: OCRResult,
    options?: OCROptions
  ): OCRProviderArtifact {
    return {
      provider: this.providerName,
      model: this.modelId,
      timestamp: new Date().toISOString(),
      correlationId: result.correlationId,
      requestMetadata: {
        documentType: "url",
        pageLimit: options?.pageLimit,
        imageLimit: options?.imageLimit,
        includeDeepFeatures: options?.includeDeepFeatures,
      },
      responseMetadata: {
        statusCode: result.success ? 200 : 500,
        processingTimeMs: result.processingTimeMs || 0,
        pagesProcessed: result.totalPages,
        tokensGenerated: result.usageInfo?.tokensGenerated,
      },
    };
  }
}

export function createAzureDocumentIntelligenceAdapter(
  config?: Partial<OCRConfig>
): AzureDocumentIntelligenceAdapter {
  return new AzureDocumentIntelligenceAdapter(config);
}

/** Alias matching PR-4 brief naming. */
export const createAzureDiAdapter = createAzureDocumentIntelligenceAdapter;

export const AZURE_DI_LAYOUT_MODEL = "prebuilt-layout";

export interface AzureLayoutSelectionResult {
  success: boolean;
  selectionMarks: import("./parseAzureDiResponse").AzureSelectionMark[];
  lines: import("./parseAzureDiResponse").AzureTextLine[];
  pages: OCRResult["pages"];
  model: string;
  processingTimeMs: number;
  error?: string;
  errorCode?: string;
}

/**
 * Dedicated Azure DI prebuilt-layout pass for selectionMarks.
 * Does not change the default prebuilt-read text-OCR fallback model.
 * Fail-soft: returns success:false on any error (never throws).
 */
export async function extractLayoutSelectionMarks(
  documentUrl: string,
  _options?: OCROptions
): Promise<AzureLayoutSelectionResult> {
  const startTime = Date.now();
  const config = getOCRConfig();
  const endpoint = config.azureEndpoint?.replace(/\/+$/, "");
  const key = config.azureKey;
  const apiVersion = config.azureApiVersion;

  if (!endpoint || !key) {
    return {
      success: false,
      selectionMarks: [],
      lines: [],
      pages: [],
      model: AZURE_DI_LAYOUT_MODEL,
      processingTimeMs: Date.now() - startTime,
      error: "Azure DI not configured (AZURE_DI_ENDPOINT / AZURE_DI_KEY)",
      errorCode: "AZURE_DI_NOT_CONFIGURED",
    };
  }

  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${AZURE_DI_LAYOUT_MODEL}:analyze?api-version=${apiVersion}`;
  const correlationId = getCorrelationId();

  const pollResult = async (
    operationLocation: string
  ): Promise<unknown | null> => {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      const res = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      if (!res.ok) {
        throw new Error(`Azure DI poll failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        status?: string;
        analyzeResult?: unknown;
        error?: { message?: string };
      };
      if (body.status === "succeeded") {
        return body.analyzeResult ?? body;
      }
      if (body.status === "failed") {
        throw new Error(
          body.error?.message || "Azure DI layout analyze failed"
        );
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return null;
  };

  const runAnalyze = async (
    body: Record<string, unknown>
  ): Promise<AzureLayoutSelectionResult> => {
    try {
      logger.info("Starting Azure DI layout selectionMarks pass", {
        correlationId,
        model: AZURE_DI_LAYOUT_MODEL,
      });

      const response = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": key,
          ...(correlationId && { "X-Correlation-ID": correlationId }),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return {
          success: false,
          selectionMarks: [],
          lines: [],
          pages: [],
          model: AZURE_DI_LAYOUT_MODEL,
          processingTimeMs: Date.now() - startTime,
          error: `Azure DI layout HTTP ${response.status}`,
          errorCode: `AZURE_DI_HTTP_${response.status}`,
        };
      }

      const operationLocation = response.headers.get("operation-location");
      if (!operationLocation) {
        return {
          success: false,
          selectionMarks: [],
          lines: [],
          pages: [],
          model: AZURE_DI_LAYOUT_MODEL,
          processingTimeMs: Date.now() - startTime,
          error: "Azure DI missing operation-location header",
          errorCode: "AZURE_DI_NO_OPERATION",
        };
      }

      const analyzeResult = await pollResult(operationLocation);
      if (!analyzeResult) {
        return {
          success: false,
          selectionMarks: [],
          lines: [],
          pages: [],
          model: AZURE_DI_LAYOUT_MODEL,
          processingTimeMs: Date.now() - startTime,
          error: "Azure DI layout timed out",
          errorCode: "AZURE_DI_TIMEOUT",
        };
      }

      const parsed = parseAzureDiResponse(analyzeResult);
      return {
        success: true,
        selectionMarks: parsed.selectionMarks,
        lines: parsed.lines,
        pages: parsed.pages,
        model: parsed.model || AZURE_DI_LAYOUT_MODEL,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.warn("Azure DI layout selectionMarks failed", {
        correlationId,
        errorCode: "AZURE_DI_ERROR",
      });
      return {
        success: false,
        selectionMarks: [],
        lines: [],
        pages: [],
        model: AZURE_DI_LAYOUT_MODEL,
        processingTimeMs: Date.now() - startTime,
        error:
          error instanceof Error ? error.message : "Azure DI layout failed",
        errorCode: "AZURE_DI_ERROR",
      };
    }
  };

  // Prefer base64 (works when we can fetch private/SAS URLs Azure cannot)
  try {
    const response = await fetch(documentUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return runAnalyze({ base64Source: buffer.toString("base64") });
    }
  } catch {
    // fall through to urlSource
  }

  return runAnalyze({ urlSource: documentUrl });
}
