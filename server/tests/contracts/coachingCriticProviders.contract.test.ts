/**
 * Multi-provider coaching critic routing + verifier pairing.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  resolveCoachingVerifierProvider,
  resolveCoachingWriterProvider,
} from "../../services/engineerAnalytics/coachingCriticProviders";

const ENV_KEYS = [
  "COACHING_CRITIC_PROVIDER",
  "COACHING_VERIFIER_PROVIDER",
  "FEATURE_COACHING_VERIFIER",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
] as const;

const snapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

function rememberEnv() {
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearKeys() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("coachingCriticProviders", () => {
  rememberEnv();
  afterEach(() => {
    restoreEnv();
  });

  it("auto writer prefers Anthropic over OpenAI over Gemini", () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.GEMINI_API_KEY = "gemini";
    expect(resolveCoachingWriterProvider()).toBe("anthropic");

    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveCoachingWriterProvider()).toBe("openai");

    delete process.env.OPENAI_API_KEY;
    expect(resolveCoachingWriterProvider()).toBe("gemini");

    delete process.env.GEMINI_API_KEY;
    expect(resolveCoachingWriterProvider()).toBe("none");
  });

  it("honours explicit COACHING_CRITIC_PROVIDER", () => {
    clearKeys();
    process.env.COACHING_CRITIC_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "gemini";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    expect(resolveCoachingWriterProvider()).toBe("gemini");
  });

  it("pairs verifier on a different provider (Claude writer → OpenAI)", () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(resolveCoachingVerifierProvider("anthropic")).toBe("openai");
  });

  it("pairs Claude verifier when writer is Gemini", () => {
    clearKeys();
    process.env.GEMINI_API_KEY = "gemini";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    expect(resolveCoachingVerifierProvider("gemini")).toBe("anthropic");
  });

  it("disables verifier when FEATURE_COACHING_VERIFIER=false", () => {
    clearKeys();
    process.env.FEATURE_COACHING_VERIFIER = "false";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(resolveCoachingVerifierProvider("anthropic")).toBe("none");
  });

  it("never returns the same provider as writer", () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.COACHING_VERIFIER_PROVIDER = "anthropic";
    expect(resolveCoachingVerifierProvider("anthropic")).toBe("none");
  });
});
