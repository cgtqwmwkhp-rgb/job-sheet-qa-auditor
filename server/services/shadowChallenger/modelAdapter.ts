/**
 * Shadow-only alternate judgment adapter.
 *
 * This path is gated by FEATURE_SHADOW_REAL_MODEL and intentionally avoids the
 * canonical analyzer entry point so a shadow model id can never bleed into the
 * served champion path.
 */

import type { AnalysisResult, Finding, GoldSpec } from "../analyzer";

const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `You are an expert Job Sheet QA Auditor. Analyze extracted OCR text against the Gold Standard specification.

Return strict JSON only. Do not include markdown.`;

function buildUserPrompt(
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): string {
  const rules = goldSpec.rules
    .map(
      rule =>
        `- ${rule.id}: ${rule.field} (${rule.type}, required=${rule.required}) - ${rule.description}` +
        `${rule.pattern ? ` pattern=${rule.pattern}` : ""}` +
        `${rule.format ? ` format=${rule.format}` : ""}`
    )
    .join("\n");

  return `Analyze this job sheet using the specification below.

Specification: ${goldSpec.name} v${goldSpec.version}
Rules:
${rules}

Extracted text (${pageCount} pages):
${extractedText}

Respond with JSON:
{
  "overallResult": "PASS" | "FAIL" | "REVIEW_QUEUE",
  "score": number,
  "findings": [{
    "ruleId": string,
    "fieldName": string,
    "severity": "S0" | "S1" | "S2" | "S3",
    "reasonCode": "MISSING_FIELD" | "UNREADABLE_FIELD" | "LOW_CONFIDENCE" | "INVALID_FORMAT" | "CONFLICT" | "OUT_OF_POLICY" | "INCOMPLETE_EVIDENCE" | "OCR_FAILURE" | "PIPELINE_ERROR" | "SPEC_GAP" | "SECURITY_RISK",
    "rawSnippet": string,
    "normalisedSnippet": string,
    "confidence": number,
    "pageNumber": number,
    "whyItMatters": string,
    "suggestedFix": string
  }],
  "extractedFields": {
    "Field Name": { "value": string, "confidence": number, "pageNumber": number }
  },
  "summary": string
}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeOutcome(value: unknown): AnalysisResult["overallResult"] {
  if (value === "PASS" || value === "FAIL" || value === "REVIEW_QUEUE") {
    return value;
  }
  throw new Error("Shadow real model returned invalid overallResult");
}

function normalizeSeverity(value: unknown): Finding["severity"] {
  if (value === "S0" || value === "S1" || value === "S2" || value === "S3") {
    return value;
  }
  return "S3";
}

function normalizeReasonCode(value: unknown): Finding["reasonCode"] {
  const allowed: Finding["reasonCode"][] = [
    "MISSING_FIELD",
    "UNREADABLE_FIELD",
    "LOW_CONFIDENCE",
    "INVALID_FORMAT",
    "CONFLICT",
    "OUT_OF_POLICY",
    "INCOMPLETE_EVIDENCE",
    "OCR_FAILURE",
    "PIPELINE_ERROR",
    "SPEC_GAP",
    "SECURITY_RISK",
  ];
  return allowed.includes(value as Finding["reasonCode"])
    ? (value as Finding["reasonCode"])
    : "LOW_CONFIDENCE";
}

function normalizeFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((finding, index) => ({
    ruleId: asString(finding.ruleId, "MODEL"),
    fieldName: asString(finding.fieldName, "Unknown Field"),
    severity: normalizeSeverity(finding.severity),
    reasonCode: normalizeReasonCode(finding.reasonCode),
    rawSnippet: asString(finding.rawSnippet),
    normalisedSnippet: asString(finding.normalisedSnippet),
    confidence: asNumber(finding.confidence),
    pageNumber: Math.max(1, Math.round(asNumber(finding.pageNumber, 1))),
    whyItMatters: asString(
      finding.whyItMatters,
      `Shadow model finding ${index + 1}`
    ),
    suggestedFix: asString(finding.suggestedFix, "Review this field manually."),
  }));
}

function normalizeExtractedFields(
  value: unknown
): AnalysisResult["extractedFields"] {
  if (!isRecord(value)) return {};

  const fields: AnalysisResult["extractedFields"] = {};
  for (const [fieldName, rawField] of Object.entries(value)) {
    if (!isRecord(rawField)) continue;
    fields[fieldName] = {
      value: asString(rawField.value),
      confidence: asNumber(rawField.confidence),
      pageNumber: Math.max(1, Math.round(asNumber(rawField.pageNumber, 1))),
    };
  }
  return fields;
}

function normalizeAnalysisResult(
  data: unknown,
  modelId: string,
  processingTimeMs: number
): AnalysisResult {
  if (!isRecord(data)) {
    throw new Error("Shadow real model returned non-object JSON");
  }

  return {
    success: true,
    overallResult: normalizeOutcome(data.overallResult),
    score: Math.max(0, Math.min(100, asNumber(data.score))),
    findings: normalizeFindings(data.findings),
    extractedFields: normalizeExtractedFields(data.extractedFields),
    summary: asString(data.summary, "Shadow real model analysis completed."),
    processingTimeMs,
    model: modelId,
    retryAttempts: 0,
  };
}

function mockAlternateModelResult(
  goldSpec: GoldSpec,
  modelId: string,
  processingTimeMs: number
): AnalysisResult {
  const extractedFields: AnalysisResult["extractedFields"] = {};
  for (const rule of goldSpec.rules.slice(0, 2)) {
    extractedFields[rule.field] = {
      value: `[mock alternate ${rule.field}]`,
      confidence: 88,
      pageNumber: 1,
    };
  }

  return {
    success: true,
    overallResult: "PASS",
    score: 88,
    findings: [],
    extractedFields,
    summary: "Mock alternate model analysis completed.",
    processingTimeMs,
    model: modelId,
    retryAttempts: 0,
  };
}

function extractGeminiText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    throw new Error("Shadow real model returned malformed Gemini response");
  }

  const candidate = data.candidates.find(isRecord);
  const content = isRecord(candidate?.content) ? candidate.content : null;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .filter(isRecord)
    .map(part => asString(part.text))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Shadow real model returned empty response");
  }
  return text;
}

export async function runShadowRealModelAnalysis(input: {
  extractedText: string;
  goldSpec: GoldSpec;
  pageCount: number;
  modelId: string;
}): Promise<AnalysisResult> {
  const start = Date.now();

  if (process.env.LLM_PROVIDER === "mock") {
    return mockAlternateModelResult(
      input.goldSpec,
      input.modelId,
      Date.now() - start
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Shadow real model unavailable: GEMINI_API_KEY is not set");
  }

  const response = await fetch(
    `${GEMINI_API_ENDPOINT}/${input.modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildUserPrompt(
                  input.extractedText,
                  input.goldSpec,
                  input.pageCount
                ),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Shadow real model failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const text = extractGeminiText(await response.json());
  return normalizeAnalysisResult(
    JSON.parse(text),
    input.modelId,
    Date.now() - start
  );
}
