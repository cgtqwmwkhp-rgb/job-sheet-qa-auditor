import { ENV } from "./env";
import { getMockLlmResponse } from "./mockLlm";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const contentPartToText = (part: MessageContent): string => {
  if (typeof part === "string") {
    return part;
  }
  if (part.type === "text") {
    return part.text;
  }
  if (part.type === "image_url") {
    return `[image: ${part.image_url.url}]`;
  }
  if (part.type === "file_url") {
    return `[file: ${part.file_url.url}]`;
  }
  return JSON.stringify(part);
};

const messageToText = (message: Message): string =>
  ensureArray(message.content).map(contentPartToText).join("\n");

/**
 * Custom error for missing LLM API key configuration.
 * This allows callers to gracefully degrade when LLM is not available.
 */
export class LLMNotConfiguredError extends Error {
  constructor() {
    super("LLM API key not configured (GEMINI_API_KEY)");
    this.name = "LLMNotConfiguredError";
  }
}

/**
 * Check if LLM (judgment) is configured and available.
 * Reads process.env live so tests can toggle the key without module reload.
 */
export function isLLMConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

const assertApiKey = () => {
  if (process.env.LLM_PROVIDER === "mock") {
    return;
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new LLMNotConfiguredError();
  }
};

function resolveJudgmentModel(): string {
  return (
    process.env.JUDGMENT_MODEL?.trim() || ENV.judgmentModel || "gemini-2.5-pro"
  );
}

function resolveGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || ENV.geminiApiKey || "";
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

/**
 * Strip OpenAI-style JSON Schema keywords Gemini responseSchema rejects.
 */
function sanitizeSchemaForGemini(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const obj = node as Record<string, unknown>;
    delete obj.$schema;
    delete obj.additionalProperties;
    delete obj.strict;
    for (const value of Object.values(obj)) {
      walk(value);
    }
  };

  walk(clone);
  return clone;
}

function buildGeminiContents(messages: Message[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
} {
  const systemParts: string[] = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(messageToText(message));
      continue;
    }

    // Gemini uses "user" | "model" (not "assistant")
    const role = message.role === "assistant" ? "model" : "user";

    contents.push({
      role,
      parts: [{ text: messageToText(message) }],
    });
  }

  return {
    systemInstruction:
      systemParts.length > 0
        ? { parts: [{ text: systemParts.join("\n\n") }] }
        : undefined,
    contents,
  };
}

function buildGenerationConfig(
  params: InvokeParams,
  normalizedFormat:
    | { type: "json_schema"; json_schema: JsonSchema }
    | { type: "text" }
    | { type: "json_object" }
    | undefined
): Record<string, unknown> {
  const maxTokens = params.maxTokens ?? params.max_tokens ?? 32768;
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: maxTokens,
    temperature: 0.2,
  };

  if (normalizedFormat?.type === "json_schema") {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = sanitizeSchemaForGemini(
      normalizedFormat.json_schema.schema
    );
  } else if (normalizedFormat?.type === "json_object") {
    generationConfig.responseMimeType = "application/json";
  }

  return generationConfig;
}

function mapGeminiResponseToInvokeResult(
  data: Record<string, unknown>,
  model: string
): InvokeResult {
  const candidates = data.candidates as
    | Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>
    | undefined;
  const text =
    candidates?.[0]?.content?.parts
      ?.map(p => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  const usageMetadata = data.usageMetadata as
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;

  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: candidates?.[0]?.finishReason?.toLowerCase() ?? "stop",
      },
    ],
    usage: usageMetadata
      ? {
          prompt_tokens: usageMetadata.promptTokenCount ?? 0,
          completion_tokens: usageMetadata.candidatesTokenCount ?? 0,
          total_tokens: usageMetadata.totalTokenCount ?? 0,
        }
      : undefined,
  };
}

async function invokeGeminiDirect(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const model = resolveJudgmentModel();
  const apiKey = resolveGeminiApiKey();
  const url = `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${apiKey}`;

  const normalizedFormat = normalizeResponseFormat(params);
  const { systemInstruction, contents } = buildGeminiContents(params.messages);

  if (contents.length === 0) {
    throw new Error("invokeLLM requires at least one non-system message");
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: buildGenerationConfig(params, normalizedFormat),
  };

  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  // Tools are not used by current judgment callers; ignore if present.
  void params.tools;
  void params.toolChoice;
  void params.tool_choice;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return mapGeminiResponseToInvokeResult(data, model);
}

/**
 * Invoke the judgment LLM.
 * - LLM_PROVIDER=mock → deterministic fixture (no network)
 * - otherwise → direct Google Gemini generateContent
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (process.env.LLM_PROVIDER === "mock") {
    return getMockLlmResponse(params);
  }

  return invokeGeminiDirect(params);
}
