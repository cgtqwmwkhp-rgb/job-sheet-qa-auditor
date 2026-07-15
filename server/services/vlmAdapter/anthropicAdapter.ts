/**
 * Anthropic Messages API VLM adapter for ROI crop / PDF ink verification.
 * Fail-soft: network/API errors return success:false; caller keeps heuristic.
 */

import { createSafeLogger } from "../../utils/safeLogger";
import type {
  VlmAdapter,
  VlmConfig,
  VlmVerifyInput,
  VlmVerificationResult,
} from "./types";
import { getVlmConfig } from "./types";

const logger = createSafeLogger("AnthropicVlm");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

type AnthropicContentPart =
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    }
  | {
      type: "document";
      source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
      };
    }
  | { type: "text"; text: string };

export class AnthropicVlmAdapter implements VlmAdapter {
  readonly providerName = "anthropic" as const;
  private readonly config: VlmConfig;

  constructor(config?: Partial<VlmConfig>) {
    this.config = { ...getVlmConfig(), ...config, provider: "anthropic" };
  }

  get modelId(): string {
    return this.config.model;
  }

  async verify(input: VlmVerifyInput): Promise<VlmVerificationResult> {
    const start = Date.now();
    if (!this.config.apiKey) {
      return {
        success: false,
        present: false,
        confidence: 0,
        reasoning: "ANTHROPIC_API_KEY not configured",
        provider: "anthropic",
        model: this.modelId,
        processingTimeMs: Date.now() - start,
        error: "MISSING_API_KEY",
      };
    }

    if (!input.cropImage && !input.documentPdf) {
      return {
        success: false,
        present: false,
        confidence: 0,
        reasoning: "No crop image or PDF document provided",
        provider: "anthropic",
        model: this.modelId,
        processingTimeMs: Date.now() - start,
        error: "MISSING_MEDIA",
      };
    }

    const prompt =
      input.checkType === "signature_present"
        ? input.cropImage
          ? `This image is a cropped signature ROI. Does it show handwritten ink (signature or clear mark of signing)? Ignore printed labels like "Signature" or "Sign here". Reply JSON only: {"present":boolean,"confidence":0-1,"reasoning":"short"}`
          : `Look at the Technician / Customer / Engineer Signature area on this job sheet PDF. Does it show handwritten ink (signature or clear mark of signing)? Reply JSON only: {"present":boolean,"confidence":0-1,"reasoning":"short"}`
        : `Does this crop show one or more tickboxes that are checked/ticked? Reply JSON only: {"present":boolean,"confidence":0-1,"reasoning":"short"}`;

    const mediaParts: AnthropicContentPart[] = [];
    if (input.cropImage) {
      mediaParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.cropImage.mediaType,
          data: input.cropImage.data,
        },
      });
    } else if (input.documentPdf) {
      mediaParts.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: input.documentPdf.data,
        },
      });
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.modelId,
          max_tokens: 256,
          messages: [
            {
              role: "user",
              content: [
                ...mediaParts,
                {
                  type: "text",
                  text: `${prompt}\nField: ${input.fieldId}\nDispute: ${input.disputeReason || "none"}`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.warn("Anthropic VLM HTTP error", {
          status: response.status,
          bodyPreview: body.slice(0, 120),
        });
        return {
          success: false,
          present: false,
          confidence: 0,
          reasoning: `HTTP ${response.status}`,
          provider: "anthropic",
          model: this.modelId,
          processingTimeMs: Date.now() - start,
          error: "HTTP_ERROR",
        };
      }

      const json = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      // Attribute successful VLM responses to FinOps without delaying verification.
      void import("../finOps")
        .then(({ recordApiCost }) => {
          recordApiCost({
            provider: "anthropic",
            model: this.modelId,
            stage: "vlm",
            inputTokens: json.usage?.input_tokens ?? 0,
            outputTokens: json.usage?.output_tokens ?? 0,
            latencyMs: Date.now() - start,
          });
        })
        .catch(() => {
          /* FinOps must never block VLM verification */
        });
      const text =
        json.content?.find(c => c.type === "text")?.text?.trim() || "";
      const parsed = parseVlmJson(text);

      return {
        success: true,
        present: parsed.present,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        provider: "anthropic",
        model: this.modelId,
        processingTimeMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      logger.warn("Anthropic VLM failed soft", { message });
      return {
        success: false,
        present: false,
        confidence: 0,
        reasoning: message,
        provider: "anthropic",
        model: this.modelId,
        processingTimeMs: Date.now() - start,
        error: "NETWORK_OR_PARSE",
      };
    }
  }
}

function parseVlmJson(text: string): {
  present: boolean;
  confidence: number;
  reasoning: string;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      present: false,
      confidence: 0,
      reasoning: "unparseable model response",
    };
  }
  try {
    const obj = JSON.parse(match[0]) as {
      present?: boolean;
      confidence?: number;
      reasoning?: string;
    };
    return {
      present: Boolean(obj.present),
      confidence: Math.min(1, Math.max(0, Number(obj.confidence) || 0)),
      reasoning: String(obj.reasoning || ""),
    };
  } catch {
    return {
      present: false,
      confidence: 0,
      reasoning: "json parse failed",
    };
  }
}

export function createAnthropicVlmAdapter(
  config?: Partial<VlmConfig>
): AnthropicVlmAdapter {
  return new AnthropicVlmAdapter(config);
}
