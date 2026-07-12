/**
 * Coaching critic LLM providers — Anthropic / OpenAI / Gemini text calls.
 * Fetch-based (no extra SDKs). Fail-soft callers handle errors.
 */

export type CoachingLlmProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "mock"
  | "none";

export interface CoachingLlmCallResult {
  ok: boolean;
  provider: CoachingLlmProvider;
  model: string;
  text: string;
  error?: string;
}

function hasKey(envName: string): boolean {
  return Boolean(process.env[envName]?.trim());
}

export function isAnthropicConfigured(): boolean {
  return hasKey("ANTHROPIC_API_KEY");
}

export function isOpenAiConfigured(): boolean {
  return hasKey("OPENAI_API_KEY");
}

export function isGeminiConfigured(): boolean {
  return hasKey("GEMINI_API_KEY");
}

/** Any critic-capable key present. */
export function isAnyCoachingLlmConfigured(): boolean {
  return (
    isAnthropicConfigured() || isOpenAiConfigured() || isGeminiConfigured()
  );
}

/**
 * Writer selection.
 * COACHING_CRITIC_PROVIDER=auto|anthropic|openai|gemini|mock
 * Auto preference: Claude (faithful critique) → OpenAI → Gemini.
 */
export function resolveCoachingWriterProvider(): CoachingLlmProvider {
  const raw = (process.env.COACHING_CRITIC_PROVIDER || "auto")
    .toLowerCase()
    .trim();
  if (raw === "mock") return "mock";
  if (raw === "anthropic") {
    return isAnthropicConfigured() ? "anthropic" : "none";
  }
  if (raw === "openai") {
    return isOpenAiConfigured() ? "openai" : "none";
  }
  if (raw === "gemini") {
    return isGeminiConfigured() ? "gemini" : "none";
  }
  // auto
  if (isAnthropicConfigured()) return "anthropic";
  if (isOpenAiConfigured()) return "openai";
  if (isGeminiConfigured()) return "gemini";
  return "none";
}

/**
 * Verifier selection — must differ from writer when possible.
 * COACHING_VERIFIER_PROVIDER=auto|anthropic|openai|gemini|none
 * FEATURE_COACHING_VERIFIER=false disables.
 */
export function resolveCoachingVerifierProvider(
  writer: CoachingLlmProvider
): CoachingLlmProvider {
  const flag = process.env.FEATURE_COACHING_VERIFIER;
  if (flag === "false" || flag === "0") return "none";

  const raw = (process.env.COACHING_VERIFIER_PROVIDER || "auto")
    .toLowerCase()
    .trim();
  if (raw === "none" || raw === "off") return "none";

  const pick = (p: CoachingLlmProvider): CoachingLlmProvider => {
    if (p === writer) return "none";
    if (p === "anthropic" && isAnthropicConfigured()) return "anthropic";
    if (p === "openai" && isOpenAiConfigured()) return "openai";
    if (p === "gemini" && isGeminiConfigured()) return "gemini";
    return "none";
  };

  if (raw === "anthropic" || raw === "openai" || raw === "gemini") {
    return pick(raw);
  }

  // auto: prefer a different strong verifier
  // Writer Claude → OpenAI verifier; Writer GPT → Claude; Writer Gemini → Claude then OpenAI
  if (writer === "anthropic") {
    const o = pick("openai");
    if (o !== "none") return o;
    return pick("gemini");
  }
  if (writer === "openai") {
    const a = pick("anthropic");
    if (a !== "none") return a;
    return pick("gemini");
  }
  if (writer === "gemini") {
    const a = pick("anthropic");
    if (a !== "none") return a;
    return pick("openai");
  }
  return "none";
}

export function modelForProvider(provider: CoachingLlmProvider): string {
  if (provider === "anthropic") {
    return (
      process.env.COACHING_ANTHROPIC_MODEL?.trim() ||
      process.env.ANTHROPIC_COACHING_MODEL?.trim() ||
      process.env.ANTHROPIC_VLM_MODEL?.trim() ||
      "claude-sonnet-4-20250514"
    );
  }
  if (provider === "openai") {
    return (
      process.env.COACHING_OPENAI_MODEL?.trim() ||
      process.env.OPENAI_COACHING_MODEL?.trim() ||
      "gpt-4.1-mini"
    );
  }
  if (provider === "gemini") {
    return (
      process.env.COACHING_GEMINI_MODEL?.trim() ||
      process.env.JUDGMENT_MODEL?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-2.5-pro"
    );
  }
  if (provider === "mock") return "mock-coaching-critic";
  return "none";
}

function extractTextFromUnknown(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
}

async function callAnthropic(input: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<CoachingLlmCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";
  const model = modelForProvider("anthropic");
  if (!apiKey) {
    return {
      ok: false,
      provider: "anthropic",
      model,
      text: "",
      error: "MISSING_API_KEY",
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      provider: "anthropic",
      model,
      text: "",
      error: `HTTP_${response.status}:${body.slice(0, 160)}`,
    };
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    json.content
      ?.filter(c => c.type === "text")
      .map(c => c.text || "")
      .join("") || "";
  return { ok: true, provider: "anthropic", model, text };
}

async function callOpenAi(input: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<CoachingLlmCallResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const model = modelForProvider("openai");
  if (!apiKey) {
    return {
      ok: false,
      provider: "openai",
      model,
      text: "",
      error: "MISSING_API_KEY",
    };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      provider: "openai",
      model,
      text: "",
      error: `HTTP_${response.status}:${body.slice(0, 160)}`,
    };
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = extractTextFromUnknown(json.choices?.[0]?.message?.content);
  return { ok: true, provider: "openai", model, text };
}

async function callGemini(input: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<CoachingLlmCallResult> {
  // Reuse shared Gemini judgment path for consistency with the rest of the app.
  const { invokeLLM } = await import("../../_core/llm");
  const model = modelForProvider("gemini");
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      maxTokens: input.maxTokens,
      responseFormat: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content;
    const text = extractTextFromUnknown(content);
    return { ok: Boolean(text), provider: "gemini", model, text };
  } catch (error) {
    return {
      ok: false,
      provider: "gemini",
      model,
      text: "",
      error: error instanceof Error ? error.message : "GEMINI_FAILED",
    };
  }
}

/**
 * Invoke a coaching critic/verifier LLM. Fail-soft result object (never throws).
 */
export async function invokeCoachingLlm(input: {
  provider: CoachingLlmProvider;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<CoachingLlmCallResult> {
  const maxTokens = input.maxTokens ?? 2500;
  if (input.provider === "none") {
    return {
      ok: false,
      provider: "none",
      model: "none",
      text: "",
      error: "NO_PROVIDER",
    };
  }
  if (input.provider === "mock") {
    return {
      ok: true,
      provider: "mock",
      model: modelForProvider("mock"),
      text: "",
    };
  }

  try {
    if (input.provider === "anthropic") {
      return await callAnthropic({ ...input, maxTokens });
    }
    if (input.provider === "openai") {
      return await callOpenAi({ ...input, maxTokens });
    }
    if (input.provider === "gemini") {
      return await callGemini({ ...input, maxTokens });
    }
  } catch (error) {
    return {
      ok: false,
      provider: input.provider,
      model: modelForProvider(input.provider),
      text: "",
      error: error instanceof Error ? error.message : "PROVIDER_ERROR",
    };
  }

  return {
    ok: false,
    provider: input.provider,
    model: modelForProvider(input.provider),
    text: "",
    error: "UNKNOWN_PROVIDER",
  };
}
