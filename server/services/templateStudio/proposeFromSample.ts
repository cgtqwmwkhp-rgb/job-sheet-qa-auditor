/**
 * Template Studio — propose template fields/rules/ROI/tokens from a sample PDF.
 *
 * Live-engine unity (same split as documentProcessor production path):
 * 1. Live OCR text truth via extractTextFromDocument (Mistral primary by default)
 * 2. Azure DI layout geometry (+ selection marks) for ROI placement
 * 3. Heuristic seed from fallback/starter + live-OCR labels
 * 4. Optional Gemini structured propose (skipped cleanly when no API key)
 *
 * Authors must tune ROIs against the same text truth production audits read.
 * Never silently invents Fail/UNREADABLE without evidence — confidence + sources shown.
 */

import { extractTextFromDocument } from "../ocr";
import { extractLayoutSelectionMarks } from "../ocrAdapter/azureDocumentIntelligenceAdapter";
import {
  mapSelectionMarksToRows,
  type SelectionMarkRow,
} from "../selectionMarks";
import type {
  SpecJson,
  SelectionConfig,
  RoiConfig,
  FieldSpec,
  RuleSpec,
} from "../templateRegistry/types";
import { syncRoiFieldsIntoSpec } from "../templateRegistry/syncRoiFieldsIntoSpec";
import {
  createStudioStarterSelection,
  createStudioStarterSpec,
} from "./starterDraft";
import { getStudioSampleUrl } from "./sampleStore";
import {
  suggestRoiFromLayoutEvidence,
  type ProposedRoiRegion,
} from "./roiProposeFromLayout";

export type { ProposedRoiRegion } from "./roiProposeFromLayout";

/** Where field/token heuristics sourced their document text. */
export type StudioTextTruthSource =
  | "live-ocr"
  | "azure-layout-fallback"
  | "none";

export interface ProposedField {
  field: FieldSpec;
  confidence: number;
  source: string;
  why: string;
  accepted?: boolean;
}

export interface ProposedRule {
  rule: RuleSpec;
  confidence: number;
  source: string;
  why: string;
  accepted?: boolean;
}

export interface ProposalArtifact {
  versionId: number;
  layoutAvailable: boolean;
  layoutError?: string;
  /** Preview of the text truth used for field/token propose (live OCR preferred). */
  layoutTextPreview: string;
  /** Production-aligned text source for field/token heuristics. */
  textTruthSource: StudioTextTruthSource;
  /** Provider/model id when live OCR succeeded (e.g. mistral / model name). */
  textTruthProvider?: string;
  /** Geometry source used for ROI placement. */
  geometrySource: "azure-layout" | "none";
  selectionMarkRows: Array<{
    rowIndex: number;
    label?: string;
    choice: string;
    confidence: number;
  }>;
  hasChecklistGrid: boolean;
  fields: ProposedField[];
  rules: ProposedRule[];
  selectionTokens: {
    requiredTokensAny: string[];
    optionalTokens: string[];
    confidence: number;
    sources: string[];
  };
  roiRegions: ProposedRoiRegion[];
  geminiUsed: boolean;
  geminiError?: string;
  proposedSpec: SpecJson;
  proposedSelection: SelectionConfig;
  proposedRoi: RoiConfig;
}

const LABEL_TO_FIELD: Array<{
  re: RegExp;
  field: string;
  label: string;
  type: FieldSpec["type"];
  required: boolean;
}> = [
  {
    re: /job\s*(id|no|number|ref|reference)|work\s*order|wo\s*#/i,
    field: "jobReference",
    label: "Job Reference",
    type: "string",
    required: true,
  },
  {
    re: /asset(\s*(id|no|number))?|serial\s*(no|number)?|plant\s*no|equipment/i,
    field: "assetId",
    label: "Asset ID",
    type: "string",
    required: true,
  },
  {
    re: /\bdate\b|service\s*date|visit\s*date|completed\s*on/i,
    field: "date",
    label: "Date of Service",
    type: "date",
    required: true,
  },
  {
    re: /expir|valid\s*until|next\s*due/i,
    field: "expiryDate",
    label: "Expiry Date",
    type: "date",
    required: false,
  },
  {
    re: /engineer\s*(sign|sig)|technician\s*(sign|sig)|signed\s*by/i,
    field: "engineerSignOff",
    label: "Engineer Sign-Off",
    type: "string",
    required: true,
  },
  {
    re: /customer\s*(sign|sig)|client\s*(sign|sig)/i,
    field: "customerSignature",
    label: "Customer Signature",
    type: "string",
    required: false,
  },
  {
    re: /\bok\b|\badv\b|\bfail\b|n\/?a|checklist|compliance/i,
    field: "complianceTickboxes",
    label: "Compliance Checklist",
    type: "list",
    required: false,
  },
  {
    re: /tyre\s*tread\s*depth|tread\s*depth/i,
    field: "tyreTreadDepth",
    label: "Tyre Tread Depth",
    type: "number",
    required: false,
  },
  {
    re: /set\s*pressure|wheel\s*pressure|tyre\s*pressure|\bpsi\b/i,
    field: "wheelPressures",
    label: "Wheel Pressures (PSI)",
    type: "number",
    required: false,
  },
  {
    re: /wheel\s*nut\s*torque/i,
    field: "wheelNutTorque",
    label: "Wheel Nut Torque",
    type: "number",
    required: false,
  },
  {
    re: /hub\s*nut\s*torque/i,
    field: "hubNutTorque",
    label: "Hub Nut Torque",
    type: "number",
    required: false,
  },
  {
    re: /next\s*service\s*date/i,
    field: "nextServiceDate",
    label: "Next Service Date",
    type: "date",
    required: false,
  },
  {
    re: /compliance\s*type/i,
    field: "complianceType",
    label: "Compliance Type",
    type: "string",
    required: false,
  },
  {
    re: /compliance\s*title/i,
    field: "complianceTitle",
    label: "Compliance Title",
    type: "string",
    required: false,
  },
  {
    re: /service\s*completed/i,
    field: "serviceCompleted",
    label: "Service Completed?",
    type: "boolean",
    required: false,
  },
  {
    re: /all\s*works?\s*completed/i,
    field: "allWorksCompleted",
    label: "All Works Completed?",
    type: "boolean",
    required: false,
  },
  {
    re: /consumables?\s*used/i,
    field: "consumablesUsed",
    label: "Consumables Used?",
    type: "boolean",
    required: false,
  },
  {
    re: /additional\s*tasks?\s*complete/i,
    field: "additionalTasksComplete",
    label: "Additional Tasks Complete?",
    type: "boolean",
    required: false,
  },
  {
    re: /return\s*visit\s*(needed|required)/i,
    field: "returnVisitNeeded",
    label: "Return Visit Needed?",
    type: "boolean",
    required: false,
  },
  {
    re: /asset\s*safe\s*to\s*use/i,
    field: "assetSafeToUse",
    label: "Asset Safe To Use?",
    type: "boolean",
    required: false,
  },
  {
    re: /job\s*duration/i,
    field: "jobDuration",
    label: "Job Duration",
    type: "number",
    required: false,
  },
  {
    re: /\bovertime\b/i,
    field: "overtime",
    label: "Overtime",
    type: "boolean",
    required: false,
  },
  {
    re: /\btravel\b/i,
    field: "travel",
    label: "Travel",
    type: "number",
    required: false,
  },
];

function extractTokensFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const candidates = [
    "plantexpand",
    "plant expand",
    "job sheet",
    "service report",
    "inspection",
    "maintenance",
    "generator",
    "compliance",
    "checklist",
    "mobilisation",
    "swng",
  ];
  return candidates.filter(t => lower.includes(t.replace(/\s+/g, " ")));
}

function ensureCriticalFields(fields: ProposedField[]): ProposedField[] {
  const starter = createStudioStarterSpec("propose");
  const have = new Set(fields.map(f => f.field.field));
  for (const f of starter.fields) {
    if (!have.has(f.field) && f.required) {
      fields.push({
        field: f,
        confidence: 0.55,
        source: "starter-critical",
        why: "Critical activation field required by registry gates",
        accepted: true,
      });
    }
  }
  return fields;
}

function buildRulesFromFields(fields: ProposedField[]): ProposedRule[] {
  return fields
    .filter(f => f.field.required)
    .map(f => ({
      rule: {
        ruleId: `R-${f.field.field.toUpperCase()}`,
        field: f.field.field,
        description: `${f.field.label} must be present`,
        severity: "critical" as const,
        type: "required" as const,
        enabled: true,
        tags: ["studio", "propose"],
      },
      confidence: f.confidence,
      source: f.source,
      why: `Required rule derived from field ${f.field.field}`,
      accepted: true,
    }));
}

function joinLiveOcrPages(
  pages: Array<{ pageNumber: number; markdown: string }>
): string {
  return pages
    .map(page => `--- Page ${page.pageNumber} ---\n${page.markdown}`)
    .join("\n\n");
}

async function callGeminiPropose(input: {
  layoutText: string;
  rows: SelectionMarkRow[];
  seedSpec: SpecJson;
}): Promise<{
  fields?: Array<{
    field: string;
    label: string;
    type: string;
    required: boolean;
    why?: string;
    confidence?: number;
  }>;
  tokens?: string[];
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "GEMINI_API_KEY not configured" };
  }

  const model =
    process.env.GEMINI_STUDIO_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `You propose a job-sheet QA template from OCR layout text.
Return ONLY JSON with shape:
{
  "fields": [{"field":"camelCase","label":"...","type":"string|date|list|number|boolean","required":true,"confidence":0.0-1.0,"why":"..."}],
  "tokens": ["token1","token2"]
}
Rules:
- Prefer universal fields: jobReference, assetId, date, engineerSignOff, expiryDate, complianceTickboxes, customerSignature
- Do NOT invent Fail or UNREADABLE findings — only propose fields/tokens with OCR evidence
- Keep confidence low (<0.5) when evidence is weak
- Seed fields already known: ${input.seedSpec.fields.map(f => f.field).join(", ")}
Selection mark rows: ${JSON.stringify(input.rows.slice(0, 40).map(r => ({ label: r.label, choice: r.choice })))}
OCR text (truncated):
${input.layoutText.slice(0, 8000)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      return { error: `Gemini HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { error: "Empty Gemini response" };
    const parsed = JSON.parse(text) as {
      fields?: Array<{
        field: string;
        label: string;
        type: string;
        required: boolean;
        why?: string;
        confidence?: number;
      }>;
      tokens?: string[];
    };
    return parsed;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Gemini propose failed",
    };
  }
}

function appendLayoutError(current: string | undefined, next: string): string {
  return current ? `${current} · ${next}` : next;
}

export async function proposeFromSample(input: {
  versionId: number;
  templateName?: string;
}): Promise<ProposalArtifact> {
  const sample = await getStudioSampleUrl(input.versionId);
  let liveOcrText = "";
  let liveOcrProvider: string | undefined;
  let azureLayoutText = "";
  let layoutAvailable = false;
  let layoutError: string | undefined;
  let selectionMarkRows: SelectionMarkRow[] = [];
  let layoutLines: import("../ocrAdapter/parseAzureDiResponse").AzureTextLine[] =
    [];
  let lines: string[] = [];
  let geometrySource: ProposalArtifact["geometrySource"] = "none";

  if (!sample) {
    layoutError = "No sample attached — using starter proposal only";
  } else {
    // Same dual-engine split as live audits: primary OCR text + Azure geometry.
    const [ocrResult, layout] = await Promise.all([
      extractTextFromDocument(sample.url).catch(err => ({
        success: false as const,
        pages: [] as Array<{ pageNumber: number; markdown: string }>,
        totalPages: 0,
        model: "unknown",
        provider: undefined as string | undefined,
        error: err instanceof Error ? err.message : "Live OCR failed",
      })),
      extractLayoutSelectionMarks(sample.url),
    ]);

    if (ocrResult.success && ocrResult.pages.length > 0) {
      liveOcrText = joinLiveOcrPages(ocrResult.pages);
      liveOcrProvider =
        (typeof ocrResult.provider === "string" && ocrResult.provider) ||
        ocrResult.model ||
        "live-ocr";
    } else {
      layoutError = appendLayoutError(
        layoutError,
        ocrResult.error ||
          "Live OCR returned no pages — field proposals may not match production text truth"
      );
    }

    if (!layout.success) {
      layoutError = appendLayoutError(
        layoutError,
        layout.error || "Azure DI layout failed"
      );
    } else {
      layoutAvailable = true;
      layoutLines = layout.lines ?? [];
      lines = layoutLines.map(l => l.content || "");
      azureLayoutText =
        layout.layoutText?.trim() || lines.filter(Boolean).join("\n");
      selectionMarkRows = mapSelectionMarksToRows(layout.selectionMarks ?? [], {
        lines: layout.lines,
      });
      if (layoutLines.length === 0) {
        layoutError = appendLayoutError(
          layoutError,
          "Azure DI layout returned no text geometry (0 lines/words with polygons). Cannot place accurate ROIs — draw manually or re-attach sample and retry Suggest fields."
        );
        // Keep layoutAvailable for token heuristics fallback, but ROI path needs geometry
      } else {
        geometrySource = "azure-layout";
      }
    }
  }

  const textTruthSource: StudioTextTruthSource = liveOcrText
    ? "live-ocr"
    : azureLayoutText || lines.length
      ? "azure-layout-fallback"
      : "none";

  if (textTruthSource === "azure-layout-fallback") {
    layoutError = appendLayoutError(
      layoutError,
      "Live OCR unavailable — field/token proposals used Azure layout text (not production text truth)"
    );
  }

  // Prefer live OCR (production text truth); Azure layout text is geometry-only fallback.
  const searchText = liveOcrText || azureLayoutText || lines.join("\n");

  const hasChecklistGrid =
    selectionMarkRows.length >= 3 ||
    /\bok\b.*\badv\b.*\bfail\b/i.test(searchText) ||
    /\bok\b[\s|/]+adv[\s|/]+fail/i.test(searchText);

  const name = input.templateName || "Studio Proposal";
  const starter = createStudioStarterSpec(name);
  const proposedFields: ProposedField[] = [];

  // Seed from starter with moderate confidence
  for (const f of starter.fields) {
    proposedFields.push({
      field: f,
      confidence: f.required ? 0.6 : 0.45,
      source: "starter",
      why: "Universal job-sheet field from studio starter",
      accepted: true,
    });
  }

  // Boost / add from label heuristics against live text truth
  const labelSource =
    textTruthSource === "live-ocr" ? "live-ocr-label" : "ocr-label";
  for (const mapping of LABEL_TO_FIELD) {
    if (!mapping.re.test(searchText)) continue;
    const existing = proposedFields.find(p => p.field.field === mapping.field);
    if (existing) {
      existing.confidence = Math.min(0.95, existing.confidence + 0.25);
      existing.source = labelSource;
      existing.why = `Live text truth matched /${mapping.re.source}/ (${textTruthSource})`;
    } else {
      proposedFields.push({
        field: {
          field: mapping.field,
          label: mapping.label,
          type: mapping.type,
          required: mapping.required,
          extractionHints: [mapping.label.toLowerCase()],
        },
        confidence: 0.8,
        source: labelSource,
        why: `Live text truth matched /${mapping.re.source}/ (${textTruthSource})`,
        accepted: true,
      });
    }
  }

  if (hasChecklistGrid) {
    const tick = proposedFields.find(
      p => p.field.field === "complianceTickboxes"
    );
    if (tick) {
      tick.confidence = Math.max(tick.confidence, 0.85);
      tick.source = "selection-marks";
      tick.why = `Checklist grid detected (${selectionMarkRows.length} rows)`;
    }
  }

  ensureCriticalFields(proposedFields);

  let geminiUsed = false;
  let geminiError: string | undefined;
  const gemini = await callGeminiPropose({
    layoutText: searchText,
    rows: selectionMarkRows,
    seedSpec: starter,
  });
  if (gemini.error) {
    geminiError = gemini.error;
  } else if (gemini.fields?.length) {
    geminiUsed = true;
    for (const gf of gemini.fields) {
      const allowedTypes = new Set([
        "string",
        "number",
        "date",
        "boolean",
        "currency",
        "list",
      ]);
      const type = allowedTypes.has(gf.type)
        ? (gf.type as FieldSpec["type"])
        : "string";
      const conf =
        typeof gf.confidence === "number"
          ? Math.max(0, Math.min(1, gf.confidence))
          : 0.65;
      // Guard: do not accept invented Fail/UNREADABLE as fields
      if (/unreadable|fail\s*finding/i.test(gf.field)) continue;

      const existing = proposedFields.find(p => p.field.field === gf.field);
      if (existing) {
        if (conf > existing.confidence) {
          existing.confidence = conf;
          existing.source = "gemini";
          existing.why = gf.why || "Gemini structured propose";
        }
      } else if (conf >= 0.5) {
        proposedFields.push({
          field: {
            field: gf.field,
            label: gf.label || gf.field,
            type,
            required: Boolean(gf.required),
            extractionHints: [gf.label || gf.field],
          },
          confidence: conf,
          source: "gemini",
          why: gf.why || "Gemini structured propose",
          accepted: conf >= 0.6,
        });
      }
    }
  }

  const proposedRules = buildRulesFromFields(
    proposedFields.filter(f => f.accepted !== false)
  );

  const ocrTokens = extractTokensFromText(searchText);
  const geminiTokens = (gemini.tokens ?? []).map(t => t.toLowerCase().trim());
  const tokenSet = Array.from(
    new Set([...ocrTokens, ...geminiTokens].filter(Boolean))
  );
  const requiredTokensAny =
    tokenSet.length > 0 ? tokenSet.slice(0, 4) : ["job", "sheet"];
  const optionalTokens = [
    ...tokenSet.slice(4),
    "plantexpand",
    "compliance",
  ].filter((t, i, arr) => arr.indexOf(t) === i);

  const roiGeometryAvailable = layoutAvailable && layoutLines.length > 0;
  const roiRegions = suggestRoiFromLayoutEvidence({
    lines: layoutLines,
    selectionRows: selectionMarkRows,
    hasChecklist: hasChecklistGrid,
    layoutAvailable: roiGeometryAvailable,
    // Gate ROI field placement on production text truth when available
    textTruth: liveOcrText || undefined,
  });
  if (
    layoutAvailable &&
    !roiGeometryAvailable &&
    !layoutError?.includes("no text geometry")
  ) {
    layoutError = appendLayoutError(
      layoutError,
      "OCR layout had no usable line geometry for ROI placement"
    );
  }
  if (roiGeometryAvailable && roiRegions.length === 0) {
    layoutError = appendLayoutError(
      layoutError,
      "OCR geometry present but no field labels matched live text truth — draw ROIs manually using Draw labels tooltips."
    );
  }

  const acceptedFields = proposedFields
    .filter(f => f.accepted !== false)
    .map(f => f.field);
  const acceptedRules = proposedRules
    .filter(r => r.accepted !== false)
    .map(r => r.rule);
  const acceptedRoi: RoiConfig = {
    regions: roiRegions
      .filter(r => r.accepted !== false)
      .map(({ name: n, page, bounds, fields }) => ({
        name: n,
        page,
        bounds,
        fields,
      })),
  };

  const proposedSpec: SpecJson = syncRoiFieldsIntoSpec(
    {
      name,
      version: "0.1.0",
      fields: acceptedFields,
      rules: acceptedRules,
      metadata: {
        source: "template-studio-propose",
        layoutAvailable,
        geminiUsed,
        hasChecklistGrid,
        textTruthSource,
        textTruthProvider: liveOcrProvider,
        geometrySource,
      },
    },
    acceptedRoi
  );

  const proposedSelection = createStudioStarterSelection(requiredTokensAny);
  proposedSelection.optionalTokens = optionalTokens;

  const tokenSources = [
    ...(ocrTokens.length
      ? [textTruthSource === "live-ocr" ? "live-ocr" : "ocr"]
      : []),
    ...(geminiUsed ? ["gemini"] : []),
    "starter",
  ];

  return {
    versionId: input.versionId,
    layoutAvailable,
    layoutError,
    layoutTextPreview: searchText.slice(0, 2000),
    textTruthSource,
    textTruthProvider: liveOcrProvider,
    geometrySource,
    selectionMarkRows: selectionMarkRows.map(r => ({
      rowIndex: r.rowIndex,
      label: r.label,
      choice: r.choice,
      confidence: r.confidence,
    })),
    hasChecklistGrid,
    fields: proposedFields,
    rules: proposedRules,
    selectionTokens: {
      requiredTokensAny,
      optionalTokens,
      confidence: tokenSet.length ? 0.75 : 0.5,
      sources: tokenSources,
    },
    roiRegions,
    geminiUsed,
    geminiError,
    proposedSpec,
    proposedSelection,
    proposedRoi: acceptedRoi,
  };
}
