/**
 * Health Check Endpoints for Container Orchestration
 *
 * /healthz - Liveness probe: Is the process alive?
 * /readyz  - Readiness probe: Is the service ready to accept traffic?
 *
 * Azure Container Apps and Kubernetes use these to manage container lifecycle.
 */

import type { Request, Response } from "express";
import { testDbConnection } from "../db";
import { checkStorageHealth } from "../storage";
import { getOCRConfig } from "../services/ocrAdapter/types";
import {
  geminiCircuitBreaker,
  mistralCircuitBreaker,
  type CircuitState,
} from "../utils/resilience";

export type AiCapabilityStatus = "configured" | "disabled" | "partial";
export type AiReadinessStatus = "ready" | "degraded" | "disabled";

interface AiProviderHealth {
  status: AiReadinessStatus;
  configured: boolean;
  circuitBreaker?: CircuitState;
  reason?: string;
}

export interface AiReadiness {
  status: AiReadinessStatus;
  ocr: AiProviderHealth & {
    provider: "azure" | "mistral" | "mock";
    failoverConfigured: boolean;
  };
  gemini?: AiProviderHealth;
  vlm?: AiProviderHealth;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  checks?: {
    database?: { status: "ok" | "error"; latencyMs?: number; error?: string };
    storage?: { status: "ok" | "error"; error?: string };
    /** Non-blocking AI capability probe — never fails readiness alone. */
    aiCapabilities?: {
      selectionMarks: AiCapabilityStatus;
      mistralOcr: AiCapabilityStatus;
      geminiJudgment: AiCapabilityStatus;
      vlmInk?: AiCapabilityStatus;
      geminiMultimodal?: AiCapabilityStatus;
      detail?: string;
    };
    /**
     * AI readiness based on the configured providers and their in-process
     * circuit breakers. No external provider call is made by this endpoint.
     */
    ai?: AiReadiness;
  };
  version?: {
    sha: string;
    platform: string;
    buildTime: string;
  };
}

function probeAiCapabilities(): NonNullable<
  HealthStatus["checks"]
>["aiCapabilities"] {
  const hasDi = Boolean(
    process.env.AZURE_DI_ENDPOINT && process.env.AZURE_DI_KEY
  );
  const selectionFlag = process.env.FEATURE_SELECTION_MARKS;
  const selectionForcedOff = selectionFlag === "false" || selectionFlag === "0";
  const selectionMarks: AiCapabilityStatus = selectionForcedOff
    ? "disabled"
    : hasDi
      ? "configured"
      : "disabled";

  const mistralOcr: AiCapabilityStatus = process.env.MISTRAL_API_KEY
    ? "configured"
    : "disabled";
  const geminiJudgment: AiCapabilityStatus = process.env.GEMINI_API_KEY
    ? "configured"
    : "disabled";

  const vlmOn = process.env.FEATURE_VLM_VERIFICATION === "true";
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const vlmInk: AiCapabilityStatus = !vlmOn
    ? "disabled"
    : hasAnthropic &&
        (process.env.VLM_PROVIDER || "").toLowerCase() === "anthropic"
      ? "configured"
      : vlmOn
        ? "partial"
        : "disabled";

  const multimodalFlag = process.env.FEATURE_GEMINI_MULTIMODAL;
  const multimodalForcedOff =
    multimodalFlag === "false" || multimodalFlag === "0";
  const geminiMultimodal: AiCapabilityStatus = multimodalForcedOff
    ? "disabled"
    : process.env.GEMINI_API_KEY
      ? "configured"
      : "disabled";

  const parts: string[] = [];
  if (selectionMarks === "configured") parts.push("selectionMarks");
  if (mistralOcr === "configured") parts.push("mistralOcr");
  if (geminiJudgment === "configured") parts.push("gemini");
  if (vlmInk === "configured") parts.push("vlmInk");
  if (geminiMultimodal === "configured") parts.push("geminiMultimodal");

  return {
    selectionMarks,
    mistralOcr,
    geminiJudgment,
    vlmInk,
    geminiMultimodal,
    detail: parts.length ? parts.join(",") : "no AI keys configured",
  };
}

function providerHealth(
  configured: boolean,
  circuitBreaker: CircuitState | undefined,
  required: boolean,
  providerName: string
): AiProviderHealth {
  if (!required) {
    return { status: "disabled", configured, circuitBreaker };
  }

  if (!configured) {
    return {
      status: "degraded",
      configured,
      circuitBreaker,
      reason: `${providerName} is required but not configured`,
    };
  }

  if (circuitBreaker === "OPEN") {
    return {
      status: "degraded",
      configured,
      circuitBreaker,
      reason: `${providerName} circuit breaker is open`,
    };
  }

  return { status: "ready", configured, circuitBreaker };
}

/**
 * Report the readiness of enabled AI features without making a billable or
 * rate-limited provider request. A closed circuit only means this process has
 * not observed a terminal provider failure; it is not an active provider probe.
 */
export function getAiReadiness(): AiReadiness {
  const ocrConfig = getOCRConfig();
  const azureConfigured = Boolean(
    ocrConfig.azureEndpoint?.trim() && ocrConfig.azureKey?.trim()
  );
  const mistralConfigured = Boolean(ocrConfig.apiKey?.trim());
  const ocrCircuitBreaker =
    ocrConfig.provider === "mistral"
      ? mistralCircuitBreaker.getState()
      : undefined;
  const ocrConfigured =
    ocrConfig.provider === "mock"
      ? true
      : ocrConfig.provider === "azure"
        ? azureConfigured
        : mistralConfigured;
  const ocr = {
    ...providerHealth(
      ocrConfigured,
      ocrCircuitBreaker,
      true,
      `${ocrConfig.provider} OCR`
    ),
    provider: ocrConfig.provider,
    failoverConfigured:
      ocrConfig.failoverEnabled &&
      ocrConfig.fallbackProvider !== ocrConfig.provider &&
      (ocrConfig.fallbackProvider === "azure"
        ? azureConfigured
        : ocrConfig.fallbackProvider === "mistral"
          ? mistralConfigured
          : true),
  };

  const geminiEnabled = process.env.ENABLE_GEMINI_INSIGHTS === "true";
  const gemini = providerHealth(
    Boolean(process.env.GEMINI_API_KEY?.trim()),
    geminiCircuitBreaker.getState(),
    geminiEnabled,
    "Gemini insights"
  );
  const vlmEnabled = process.env.FEATURE_VLM_VERIFICATION === "true";
  const vlm = providerHealth(
    Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    undefined,
    vlmEnabled,
    "Anthropic VLM"
  );
  const requiredProviders = [
    ocr,
    geminiEnabled ? gemini : undefined,
    vlmEnabled ? vlm : undefined,
  ];

  return {
    status: requiredProviders.some(provider => provider?.status === "degraded")
      ? "degraded"
      : "ready",
    ocr,
    gemini,
    vlm,
  };
}

/**
 * Liveness probe - /healthz
 * Always returns 200 if the process is running.
 * Used by orchestrator to detect hung processes.
 */
export function handleHealthz(_req: Request, res: Response): void {
  const response: HealthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(response);
}

/**
 * Readiness probe - /readyz
 * Returns 200 only if all required dependencies, including enabled AI/OCR
 * providers, are ready. /healthz remains the process-only liveness probe.
 * Used by orchestrator to route traffic only to ready instances.
 */
export async function handleReadyz(
  _req: Request,
  res: Response
): Promise<void> {
  const checks: HealthStatus["checks"] = {};
  let isReady = true;
  let hasCriticalDependencyFailure = false;

  // Check database connectivity with actual query
  try {
    const dbResult = await testDbConnection();

    if (dbResult.connected) {
      checks.database = {
        status: "ok",
        latencyMs: dbResult.latencyMs,
      };
    } else {
      checks.database = {
        status: "error",
        error: dbResult.error || "Database connection failed",
      };
      isReady = false;
      hasCriticalDependencyFailure = true;
    }
  } catch (error) {
    checks.database = {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown database error",
    };
    isReady = false;
    hasCriticalDependencyFailure = true;
  }

  // Check storage availability using the storage adapter
  try {
    const storageResult = await checkStorageHealth();

    if (storageResult.healthy) {
      checks.storage = { status: "ok" };
    } else {
      checks.storage = {
        status: "error",
        error: storageResult.error || "Storage health check failed",
      };
      isReady = false;
      hasCriticalDependencyFailure = true;
    }
  } catch (error) {
    checks.storage = {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown storage error",
    };
    isReady = false;
    hasCriticalDependencyFailure = true;
  }

  // Retain the existing config summary while adding a readiness signal that
  // includes the active OCR provider and in-process circuit breaker state.
  checks.aiCapabilities = probeAiCapabilities();
  checks.ai = getAiReadiness();
  if (checks.ai.status === "degraded") {
    isReady = false;
  }

  const response: HealthStatus = {
    status: isReady
      ? "ok"
      : hasCriticalDependencyFailure
        ? "unhealthy"
        : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    version: {
      sha: process.env.GIT_SHA || "unknown",
      platform: process.env.PLATFORM_VERSION || "unknown",
      buildTime: process.env.BUILD_TIME || "unknown",
    },
  };

  res.status(isReady ? 200 : 503).json(response);
}
