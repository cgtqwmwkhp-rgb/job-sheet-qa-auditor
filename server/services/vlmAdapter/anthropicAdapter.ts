/**
 * Anthropic Messages API VLM adapter for ROI crop verification.
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

    const prompt =
      input.checkType === "signature_present"
        ? `Does this crop show a handwritten signature or clear mark of signing? Reply JSON only: {"present":boolean,"confidence":0-1,"reasoning":"short"}`
        : `Does this crop show one or more tickboxes that are checked/ticked? Reply JSON only: {"present":boolean,"confidence":0-1,"reasoning":"short"}`;

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
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: input.cropImage.mediaType,
                    data: input.cropImage.data,
                  },
                },
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
      };
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
