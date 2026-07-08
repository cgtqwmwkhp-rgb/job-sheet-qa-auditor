/**
 * Mock LLM provider for CI / overnight runs.
 * Deterministic InvokeResult from fixture JSON — never calls the network.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { InvokeParams, InvokeResult } from "./llm";

const FIXTURE_DIR = join(process.cwd(), "server/tests/fixtures/gemini");
const JUDGMENT_FIXTURE_PATH = join(FIXTURE_DIR, "judgment-pass.json");
const FIELD_EXTRACTION_FIXTURE_PATH = join(
  FIXTURE_DIR,
  "field-extraction-pass.json"
);

const DEFAULT_MODEL = "mock-gemini-3.1-pro";

let shouldFail = false;
let customContent: string | null = null;

function loadFixtureContent(path: string, fallback: unknown): string {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return JSON.stringify(fallback);
  }
}

function loadDefaultFixtureContent(): string {
  return loadFixtureContent(JUDGMENT_FIXTURE_PATH, {
    overallResult: "PASS",
    score: 90,
    findings: [],
    extractedFields: {},
    summary: "Mock judgment fallback (fixture missing).",
  });
}

function loadFieldExtractionFixtureContent(): string {
  return loadFixtureContent(FIELD_EXTRACTION_FIXTURE_PATH, {
    value: "JS-12345",
    confidence: 88,
    evidence: "Mock field extraction fallback",
  });
}

function extractUserPrompt(params: InvokeParams): string {
  const messages = params.messages ?? [];
  for (const msg of messages) {
    if (msg.role === "user") {
      const content = msg.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map(part =>
            typeof part === "string"
              ? part
              : part && typeof part === "object" && "text" in part
                ? String((part as { text?: string }).text ?? "")
                : ""
          )
          .join("\n");
      }
    }
  }
  return "";
}

/**
 * Field-extraction prompts from advancedExtraction.extractWithLlm
 * use a distinct shape from judgment analysis.
 */
export function isFieldExtractionPrompt(params: InvokeParams): boolean {
  const prompt = extractUserPrompt(params);
  return (
    prompt.includes("Extract the following field") ||
    prompt.includes('"value": "extracted value or null"')
  );
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
export function getMockLlmResponse(params: InvokeParams): InvokeResult {
  if (shouldFail) {
    throw new Error("Mock LLM failure for testing");
  }

  const content =
    customContent ??
    (isFieldExtractionPrompt(params)
      ? loadFieldExtractionFixtureContent()
      : loadDefaultFixtureContent());
  const model = process.env.JUDGMENT_MODEL?.trim() || DEFAULT_MODEL;

  return {
    id: isFieldExtractionPrompt(params)
      ? "mock-llm-field-extraction"
      : "mock-llm-judgment",
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
