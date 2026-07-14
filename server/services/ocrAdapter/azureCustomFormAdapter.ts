/**
 * Azure DI Custom Neural Form Adapter (PR-AI-06 / FormModel)
 *
 * Leaf OCR adapter for a PlantExpand JSR–trained Azure Document Intelligence
 * custom neural model. Extracts structured documents[].fields (key fields +
 * selection marks / selection groups) for the selectionMarks voter path.
 *
 * Gating (all required for live calls):
 * - FEATURE_AZURE_DI_CUSTOM_JSR=true|1
 * - AZURE_DI_CUSTOM_JSR_MODEL_ID=<trained model id>
 * - AZURE_DI_ENDPOINT + AZURE_DI_KEY (shared with layout / prebuilt-read)
 *
 * Default OFF — production path unchanged until a model id is provisioned.
 * Scaffold field names live in parseAzureDiCustomForm (PLANTEXPAND_JSR_FIELD_MAP).
 *
 * Fail-soft: never throws; returns success:false when gated off / misconfigured.
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
import { getOCRConfig } from "./types";
import {
  parseAzureDiCustomForm,
  customFieldsToPreExtracted,
  customChecklistFieldsToChoices,
  type AzureCustomFormField,
  type ParsedAzureCustomFormResult,
} from "./parseAzureDiCustomForm";
import type { AzureSelectionMark, AzureTextLine } from "./parseAzureDiResponse";

const logger = createSafeLogger("AzureDICustomJSR");

export const FEATURE_AZURE_DI_CUSTOM_JSR = "FEATURE_AZURE_DI_CUSTOM_JSR";
export const ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID = "AZURE_DI_CUSTOM_JSR_MODEL_ID";

/** Scaffold placeholder — replace with the trained PlantExpand JSR model id. */
export const PLANTEXPAND_JSR_MODEL_ID_PLACEHOLDER = "plantexpand-jsr-custom-v1";

const POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_POLL_MS = 45_000;

export interface AzureCustomFormExtractResult {
  success: boolean;
  model: string;
  docType?: string;
  documentConfidence?: number;
  fields: AzureCustomFormField[];
  /** GoldSpec-shaped fields for preExtractedFields merge. */
  preExtractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  checklistChoices: ReturnType<typeof customChecklistFieldsToChoices>;
  selectionMarks: AzureSelectionMark[];
  lines: AzureTextLine[];
  pages: OCRResult["pages"];
  layoutText?: string;
  processingTimeMs: number;
  error?: string;
  errorCode?: string;
}

function resolveBoolEnv(
  raw: string | undefined,
  defaultValue: boolean
): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const value = raw.toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return defaultValue;
}

/**
 * True when the custom JSR path is explicitly enabled AND a model id is set.
 * Endpoint/key absence still fails soft at call time.
 */
export function isAzureCustomJsrEnabled(): boolean {
  if (!resolveBoolEnv(process.env[FEATURE_AZURE_DI_CUSTOM_JSR], false)) {
    return false;
  }
  const modelId = getAzureCustomJsrModelId();
  return Boolean(modelId);
}

export function getAzureCustomJsrModelId(): string | undefined {
  const raw = process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID]?.trim();
  return raw || undefined;
}

function maxPollAttempts(): number {
  const raw = process.env.AZURE_DI_CUSTOM_JSR_MAX_POLL_MS;
  const n = raw ? Number(raw) : DEFAULT_MAX_POLL_MS;
  const maxMs = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_POLL_MS;
  return Math.max(1, Math.ceil(maxMs / POLL_INTERVAL_MS));
}

export class AzureCustomFormAdapter implements OCRAdapter {
  readonly providerName = "azure-custom-jsr";
  private readonly config: OCRConfig;
  private readonly modelOverride?: string;

  constructor(config?: Partial<OCRConfig>, options?: { modelId?: string }) {
    this.config = { ...getOCRConfig(), ...config };
    this.modelOverride = options?.modelId;
  }

  get modelId(): string {
    return (
      this.modelOverride ||
      getAzureCustomJsrModelId() ||
      PLANTEXPAND_JSR_MODEL_ID_PLACEHOLDER
    );
  }

  private ensureConfigured(): { endpoint: string; key: string } | null {
    const endpoint = this.config.azureEndpoint?.replace(/\/+$/, "");
    const key = this.config.azureKey;
    if (!endpoint || !key) return null;
    return { endpoint, key };
  }

  private analyzeUrl(endpoint: string): string {
    const apiVersion = this.config.azureApiVersion;
    return `${endpoint}/documentintelligence/documentModels/${this.modelId}:analyze?api-version=${apiVersion}`;
  }

  private async pollResult(
    operationLocation: string,
    key: string
  ): Promise<unknown | null> {
    const attempts = maxPollAttempts();
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Azure DI custom poll failed: HTTP ${res.status}`);
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
          body.error?.message || "Azure DI custom analyze failed"
        );
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return null;
  }

  private toOcrResult(
    parsed: ParsedAzureCustomFormResult,
    startTime: number,
    correlationId: string | undefined,
    error?: string,
    errorCode?: string
  ): OCRResult {
    return {
      success: !error && parsed.pages.length > 0,
      pages: parsed.pages,
      totalPages: parsed.pages.length,
      model: parsed.model || this.modelId,
      provider: this.providerName,
      correlationId,
      processingTimeMs: Date.now() - startTime,
      usageInfo: parsed.usageInfo,
      error:
        error ||
        (parsed.pages.length === 0
          ? "Azure DI custom returned no pages"
          : undefined),
      errorCode:
        errorCode ||
        (parsed.pages.length === 0 ? "AZURE_DI_CUSTOM_EMPTY" : undefined),
    };
  }

  private async analyze(
    body: Record<string, unknown>,
    options?: OCROptions
  ): Promise<OCRResult> {
    const startTime = Date.now();
    const correlationId = getCorrelationId();

    if (!isAzureCustomJsrEnabled()) {
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.modelId,
        provider: this.providerName,
        correlationId,
        error:
          "Azure DI custom JSR gated off (FEATURE_AZURE_DI_CUSTOM_JSR + AZURE_DI_CUSTOM_JSR_MODEL_ID)",
        errorCode: "AZURE_DI_CUSTOM_GATED",
        processingTimeMs: Date.now() - startTime,
      };
    }

    const creds = this.ensureConfigured();
    if (!creds) {
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.modelId,
        provider: this.providerName,
        correlationId,
        error: "Azure DI not configured (AZURE_DI_ENDPOINT / AZURE_DI_KEY)",
        errorCode: "AZURE_DI_NOT_CONFIGURED",
        processingTimeMs: Date.now() - startTime,
      };
    }

    logger.info("Starting Azure DI custom JSR extraction", {
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
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          pages: [],
          totalPages: 0,
          model: this.modelId,
          provider: this.providerName,
          correlationId,
          error: `Azure DI custom HTTP ${response.status}`,
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
          provider: this.providerName,
          correlationId,
          error: "Azure DI missing operation-location header",
          errorCode: "AZURE_DI_NO_OPERATION",
          processingTimeMs: Date.now() - startTime,
        };
      }

      const analyzeResult = await this.pollResult(operationLocation, creds.key);
      if (!analyzeResult) {
        return {
          success: false,
          pages: [],
          totalPages: 0,
          model: this.modelId,
          provider: this.providerName,
          correlationId,
          error: "Azure DI custom timed out",
          errorCode: "AZURE_DI_TIMEOUT",
          processingTimeMs: Date.now() - startTime,
        };
      }

      const parsed = parseAzureDiCustomForm(analyzeResult);
      return this.toOcrResult(parsed, startTime, correlationId);
    } catch (error) {
      logger.warn("Azure DI custom JSR extraction failed", {
        correlationId,
        errorCode: "AZURE_DI_CUSTOM_ERROR",
      });
      return {
        success: false,
        pages: [],
        totalPages: 0,
        model: this.modelId,
        provider: this.providerName,
        correlationId,
        error:
          error instanceof Error ? error.message : "Azure DI custom failed",
        errorCode: "AZURE_DI_CUSTOM_ERROR",
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
    if (!isAzureCustomJsrEnabled()) {
      return {
        valid: false,
        error:
          "FEATURE_AZURE_DI_CUSTOM_JSR and AZURE_DI_CUSTOM_JSR_MODEL_ID required",
      };
    }
    const creds = this.ensureConfigured();
    if (!creds) {
      return {
        valid: false,
        error: "AZURE_DI_ENDPOINT and AZURE_DI_KEY required",
      };
    }
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

export function createAzureCustomFormAdapter(
  config?: Partial<OCRConfig>,
  options?: { modelId?: string }
): AzureCustomFormAdapter {
  return new AzureCustomFormAdapter(config, options);
}

function parsedToExtractResult(
  parsed: ParsedAzureCustomFormResult,
  startTime: number,
  error?: string,
  errorCode?: string
): AzureCustomFormExtractResult {
  const layoutPageText = parsed.pages
    .map(p => `--- Page ${p.pageNumber} ---\n${p.markdown}`)
    .join("\n\n");
  return {
    success: !error && (parsed.fields.length > 0 || parsed.pages.length > 0),
    model:
      parsed.model ||
      getAzureCustomJsrModelId() ||
      PLANTEXPAND_JSR_MODEL_ID_PLACEHOLDER,
    docType: parsed.docType,
    documentConfidence: parsed.documentConfidence,
    fields: parsed.fields,
    preExtractedFields: customFieldsToPreExtracted(parsed.fields),
    checklistChoices: customChecklistFieldsToChoices(parsed.fields),
    selectionMarks: parsed.selectionMarks,
    lines: parsed.lines,
    pages: parsed.pages,
    layoutText: layoutPageText.trim() || undefined,
    processingTimeMs: Date.now() - startTime,
    error,
    errorCode,
  };
}

/**
 * Dedicated custom-model pass for PlantExpand JSR structured fields + marks.
 * Used by the selectionMarks voter. Fail-soft; never throws.
 */
export async function extractCustomJsrForm(
  documentUrl: string,
  _options?: OCROptions
): Promise<AzureCustomFormExtractResult> {
  const startTime = Date.now();
  const modelId =
    getAzureCustomJsrModelId() || PLANTEXPAND_JSR_MODEL_ID_PLACEHOLDER;

  if (!isAzureCustomJsrEnabled()) {
    return {
      success: false,
      model: modelId,
      fields: [],
      preExtractedFields: {},
      checklistChoices: [],
      selectionMarks: [],
      lines: [],
      pages: [],
      processingTimeMs: Date.now() - startTime,
      error:
        "Azure DI custom JSR gated off (FEATURE_AZURE_DI_CUSTOM_JSR + AZURE_DI_CUSTOM_JSR_MODEL_ID)",
      errorCode: "AZURE_DI_CUSTOM_GATED",
    };
  }

  const config = getOCRConfig();
  const endpoint = config.azureEndpoint?.replace(/\/+$/, "");
  const key = config.azureKey;
  const apiVersion = config.azureApiVersion;
  const correlationId = getCorrelationId();

  if (!endpoint || !key) {
    return {
      success: false,
      model: modelId,
      fields: [],
      preExtractedFields: {},
      checklistChoices: [],
      selectionMarks: [],
      lines: [],
      pages: [],
      processingTimeMs: Date.now() - startTime,
      error: "Azure DI not configured (AZURE_DI_ENDPOINT / AZURE_DI_KEY)",
      errorCode: "AZURE_DI_NOT_CONFIGURED",
    };
  }

  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${apiVersion}`;
  const attempts = maxPollAttempts();

  const pollResult = async (
    operationLocation: string
  ): Promise<unknown | null> => {
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Azure DI custom poll failed: HTTP ${res.status}`);
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
          body.error?.message || "Azure DI custom analyze failed"
        );
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return null;
  };

  const runAnalyze = async (
    body: Record<string, unknown>
  ): Promise<AzureCustomFormExtractResult> => {
    try {
      logger.info("Starting Azure DI custom JSR form pass", {
        correlationId,
        model: modelId,
      });

      const response = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": key,
          ...(correlationId && { "X-Correlation-ID": correlationId }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          model: modelId,
          fields: [],
          preExtractedFields: {},
          checklistChoices: [],
          selectionMarks: [],
          lines: [],
          pages: [],
          processingTimeMs: Date.now() - startTime,
          error: `Azure DI custom HTTP ${response.status}`,
          errorCode: `AZURE_DI_HTTP_${response.status}`,
        };
      }

      const operationLocation = response.headers.get("operation-location");
      if (!operationLocation) {
        return {
          success: false,
          model: modelId,
          fields: [],
          preExtractedFields: {},
          checklistChoices: [],
          selectionMarks: [],
          lines: [],
          pages: [],
          processingTimeMs: Date.now() - startTime,
          error: "Azure DI missing operation-location header",
          errorCode: "AZURE_DI_NO_OPERATION",
        };
      }

      const analyzeResult = await pollResult(operationLocation);
      if (!analyzeResult) {
        return {
          success: false,
          model: modelId,
          fields: [],
          preExtractedFields: {},
          checklistChoices: [],
          selectionMarks: [],
          lines: [],
          pages: [],
          processingTimeMs: Date.now() - startTime,
          error: "Azure DI custom timed out",
          errorCode: "AZURE_DI_TIMEOUT",
        };
      }

      return parsedToExtractResult(
        parseAzureDiCustomForm(analyzeResult),
        startTime
      );
    } catch (error) {
      logger.warn("Azure DI custom JSR form pass failed", {
        correlationId,
        errorCode: "AZURE_DI_CUSTOM_ERROR",
      });
      return {
        success: false,
        model: modelId,
        fields: [],
        preExtractedFields: {},
        checklistChoices: [],
        selectionMarks: [],
        lines: [],
        pages: [],
        processingTimeMs: Date.now() - startTime,
        error:
          error instanceof Error ? error.message : "Azure DI custom failed",
        errorCode: "AZURE_DI_CUSTOM_ERROR",
      };
    }
  };

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

/**
 * Build an extract result from a raw analyzeResult (tests / offline fixtures).
 */
export function extractCustomJsrFormFromAnalyzeResult(
  analyzeResult: unknown
): AzureCustomFormExtractResult {
  return parsedToExtractResult(
    parseAzureDiCustomForm(analyzeResult),
    Date.now()
  );
}
