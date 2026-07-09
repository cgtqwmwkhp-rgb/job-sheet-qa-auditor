/**
 * Model Registry (PR-9)
 *
 * Env-driven snapshot of pinned models for OCR, judgment, and interpreter
 * roles. Mocks-only overnight — no live provider catalog / currency API calls.
 */

import {
  DEFAULT_AZURE_DI_MODEL,
  DEFAULT_OCR_MODEL,
  getOCRConfig,
} from "../ocrAdapter/types";
import { getInterpreterConfig } from "../interpreterAdapter/types";
import { getVlmConfig } from "../vlmAdapter/types";
import type { ModelRegistry, ModelRoleEntry } from "./types";

export type {
  ModelCurrencyMeta,
  ModelCurrencySource,
  ModelRegistry,
  ModelRole,
  ModelRoleEntry,
} from "./types";

const DEFAULT_JUDGMENT_MODEL = "gemini-3.1-pro";
const DEFAULT_JUDGMENT_PROVIDER = "gemini";

function judgmentModelFromEnv(): string {
  return process.env.JUDGMENT_MODEL?.trim() || DEFAULT_JUDGMENT_MODEL;
}

function fallbackOcrEntry(
  fallbackProvider: string,
  azureModel: string
): ModelRoleEntry {
  const provider = fallbackProvider;
  // Azure DI uses its own model id; mock/mistral reuse OCR model pin when selected.
  const model =
    provider === "azure"
      ? azureModel || DEFAULT_AZURE_DI_MODEL
      : process.env.MISTRAL_OCR_MODEL || DEFAULT_OCR_MODEL;

  return {
    role: "fallback_ocr",
    provider,
    model,
  };
}

/**
 * Return the current model registry from environment / shared config helpers.
 * Does not call external APIs. Safe to expose (no secrets).
 */
export function getModelRegistry(now: Date = new Date()): ModelRegistry {
  const ocr = getOCRConfig();
  const interpreter = getInterpreterConfig();
  const vlm = getVlmConfig();

  const roles: ModelRegistry["roles"] = {
    ocr: {
      role: "ocr",
      provider: ocr.provider,
      model: ocr.model || DEFAULT_OCR_MODEL,
    },
    judgment: {
      role: "judgment",
      provider: DEFAULT_JUDGMENT_PROVIDER,
      model: judgmentModelFromEnv(),
    },
    interpreter: {
      role: "interpreter",
      provider: "gemini",
      model: interpreter.model,
    },
  };

  if (ocr.fallbackProvider) {
    roles.fallback_ocr = fallbackOcrEntry(ocr.fallbackProvider, ocr.azureModel);
  }
  roles.vlm_verification = {
    role: "vlm_verification",
    provider: vlm.provider,
    model: vlm.model,
  };

  return {
    roles,
    currency: {
      lastChecked: now.toISOString(),
      source: "env",
    },
  };
}

/**
 * Compact role → model map for stamping into audit reportJson (no secrets).
 */
export function modelRegistryStamp(
  registry: ModelRegistry = getModelRegistry()
): Record<string, string> {
  const stamp: Record<string, string> = {
    ocr: `${registry.roles.ocr.provider}/${registry.roles.ocr.model}`,
    judgment: `${registry.roles.judgment.provider}/${registry.roles.judgment.model}`,
    interpreter: `${registry.roles.interpreter.provider}/${registry.roles.interpreter.model}`,
  };
  if (registry.roles.fallback_ocr) {
    stamp.fallback_ocr = `${registry.roles.fallback_ocr.provider}/${registry.roles.fallback_ocr.model}`;
  }
  if (registry.roles.vlm_verification) {
    stamp.vlm_verification = `${registry.roles.vlm_verification.provider}/${registry.roles.vlm_verification.model}`;
  }
  return stamp;
}
