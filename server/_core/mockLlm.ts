/**
 * Mock LLM provider for CI / overnight runs.
 * Deterministic InvokeResult from fixture JSON — never calls the network.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { InvokeParams, InvokeResult } from "./llm";

const FIXTURE_PATH = join(
  process.cwd(),
  "server/tests/fixtures/gemini/judgment-pass.json"
);

const DEFAULT_MODEL = "mock-gemini-3.1-pro";

let shouldFail = false;
let customContent: string | null = null;

function loadDefaultFixtureContent(): string {
  try {
    const raw = readFileSync(FIXTURE_PATH, "utf-8");
    // Re-serialize to ensure compact valid JSON string for message.content
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return JSON.stringify({
      overallResult: "PASS",
      score: 90,
      findings: [],
      extractedFields: {},
      summary: "Mock judgment fallback (fixture missing).",
    });
  }
}

/**
 * Force the next mock invoke(s) to throw (error-path tests).
 */
export function setMockLlmShouldFail(fail: boolean): void {
  shouldFail = fail;
}

/**
 * Override the mock response body (JSON string or plain text).
 */
export function setMockLlmResponse(content: string | null): void {
  customContent = content;
}

/**
 * Reset mock state to defaults.
 */
export function resetMockLlm(): void {
  shouldFail = false;
  customContent = null;
}

/**
 * Build a deterministic InvokeResult matching the public llm.ts shape.
 */
export function getMockLlmResponse(_params: InvokeParams): InvokeResult {
  if (shouldFail) {
    throw new Error("Mock LLM failure for testing");
  }

  const content = customContent ?? loadDefaultFixtureContent();
  const model = process.env.JUDGMENT_MODEL?.trim() || DEFAULT_MODEL;

  return {
    id: "mock-llm-judgment",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
