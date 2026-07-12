/**
 * Human-readable AI tool labels for FinOps dashboards.
 */

const TOOL_LABELS: Record<string, string> = {
  gemini_judgment: "Gemini Judgment",
  gemini_coaching: "Gemini Coaching",
  gemini_hybrid: "Gemini Hybrid Summary",
  gemini_extraction: "Gemini Field Extraction",
  anthropic_coaching: "Anthropic Coaching",
  anthropic_vlm: "Anthropic VLM",
  openai_coaching: "OpenAI Coaching",
  mistral_ocr: "Mistral OCR",
  azure_ocr: "Azure Document Intelligence",
  unknown: "Unknown AI tool",
};

/**
 * Derive a stable tool id from stage + provider when callers omit `tool`.
 */
export function deriveToolId(input: {
  tool?: string;
  stage?: string;
  provider?: string;
}): string {
  const explicit = input.tool?.trim();
  if (explicit) return explicit;

  const stage = (input.stage || "unknown").trim().toLowerCase();
  const provider = (input.provider || "unknown").trim().toLowerCase();

  if (stage === "judgment" || stage === "analysis") {
    return `${provider}_judgment`;
  }
  if (stage === "coaching" || stage.includes("coach")) {
    return `${provider}_coaching`;
  }
  if (stage === "vlm" || stage.includes("vlm") || stage.includes("ink")) {
    return `${provider}_vlm`;
  }
  if (stage === "ocr" || stage.includes("ocr")) {
    return `${provider}_ocr`;
  }
  if (stage === "hybrid" || stage.includes("hybrid")) {
    return `${provider}_hybrid`;
  }
  if (stage === "extraction" || stage.includes("extract")) {
    return `${provider}_extraction`;
  }
  return `${provider}_${stage}`;
}

export function toolDisplayLabel(toolId: string): string {
  if (TOOL_LABELS[toolId]) return TOOL_LABELS[toolId];
  // gemini_judgment → Gemini judgment
  return toolId
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
