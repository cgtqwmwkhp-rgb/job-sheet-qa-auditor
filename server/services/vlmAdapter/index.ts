/**
 * VLM Adapter module — Anthropic (prod) + mock (CI).
 * Gated by FEATURE_VLM_VERIFICATION (default off).
 */

export * from "./types";
export * from "./mockAdapter";
export * from "./anthropicAdapter";

import type { VlmAdapter } from "./types";
import { getVlmConfig, isVlmVerificationEnabled } from "./types";
import { createAnthropicVlmAdapter } from "./anthropicAdapter";
import { getMockVlmAdapter } from "./mockAdapter";

export { isVlmVerificationEnabled };

export function getVlmAdapter(): VlmAdapter {
  const config = getVlmConfig();
  if (config.provider === "anthropic" && config.apiKey) {
    return createAnthropicVlmAdapter(config);
  }
  return getMockVlmAdapter();
}
