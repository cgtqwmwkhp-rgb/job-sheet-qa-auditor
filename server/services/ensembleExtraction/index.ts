/**
 * Ensemble Extraction Adapter (PR-8)
 *
 * Thin fail-soft wrapper around advancedExtraction → GoldSpec field names.
 * Does NOT call pipelineIntegrator / criticalFieldExtractor.
 *
 * Feature flag: FEATURE_ENSEMBLE_EXTRACTION
 * - unset / "true" → enabled (default on)
 * - "false" / "0" → disabled
 */

import * as advancedExtraction from "../advancedExtraction";
import type {
  DocumentExtractionResult,
  FieldExtraction,
  ProcessingOptions as AdvancedProcessingOptions,
} from "../advancedExtraction";
import type { ProcessingSettingsConfig } from "../../db";
import type { Finding } from "../analyzer";

export const ENGINE_VERSION = advancedExtraction.ENGINE_VERSION;

/** advancedExtraction snake_case → GoldSpec camelCase */
export const ENSEMBLE_TO_GOLDSPEC: Record<string, string> = {
  job_no: "jobNumber",
  asset_no: "serialNumber",
  customer_name: "customerName",
  engineer_name: "technicianName",
  date: "dateOfService",
  // Do NOT map technician_signature → customerSignature (caused Present|assetId
  // conflicts to surface under Customer Signature). Keep unmapped for artifact.
  engineer_comments: "workDescription",
  make_model: "makeModel",
  mileage_hours: "mileageHours",
  // safe_to_use, serial_no, technician_signature — artifact-only
};

export const FEATURE_FLAG = "FEATURE_ENSEMBLE_EXTRACTION";

/**
 * Default: enabled when unset.
 * Set FEATURE_ENSEMBLE_EXTRACTION=false to disable without revert.
 */
export function isEnsembleExtractionEnabled(): boolean {
  const raw = process.env[FEATURE_FLAG];
  if (raw === undefined || raw === "") return true;
  return raw !== "false" && raw !== "0";
}

export interface EnsembleFieldArtifact {
  value: string | null;
  confidence: number;
  pageNumber: number;
  consensusCount?: number;
  strategy: string;
  evidence: string;
  sourceName: string;
  displayName: string;
  required: boolean;
  reasonCode?: "CONFLICT" | "LOW_CONFIDENCE" | null;
  conflictValues?: string[];
}

export interface EnsembleReviewSignals {
  lowConfidenceFields: string[];
  missingRequired: string[];
  conflictFields: string[];
  averageConfidence: number;
  /** Required GoldSpec-mapped fields with CONFLICT or low confidence */
  reviewRequired: boolean;
}

export interface EnsembleExtractionArtifact {
  engineVersion: string;
  averageConfidence: number;
  consensusSummary: {
    fieldsWithConsensus: number;
    fieldsWithConflict: number;
    requiredExtracted: number;
    requiredTotal: number;
  };
  fieldDetails: Record<string, EnsembleFieldArtifact>;
  /** Unmapped advancedExtraction fields kept for audit */
  unmappedFieldDetails: Record<string, FieldExtraction>;
  reviewSignals: EnsembleReviewSignals;
  status: DocumentExtractionResult["status"];
  processingTimeMs: number;
}

export interface EnsembleAdapterResult {
  artifact: EnsembleExtractionArtifact;
  /** GoldSpec-keyed fields for merging into reportJson.extractedFields */
  ensembleExtractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  reviewSignals: EnsembleReviewSignals;
}

export interface RunEnsembleOptions {
  filename?: string;
  settings?: ProcessingSettingsConfig;
  useLlm?: boolean;
  extractionMethod?: AdvancedProcessingOptions["extractionMethod"];
  /** Override confidence threshold for review signals (defaults to settings) */
  llmConfidenceThreshold?: number;
}

function mapFieldDetails(
  result: DocumentExtractionResult,
  llmThreshold: number
): {
  fieldDetails: Record<string, EnsembleFieldArtifact>;
  unmappedFieldDetails: Record<string, FieldExtraction>;
  ensembleExtractedFields: EnsembleAdapterResult["ensembleExtractedFields"];
  conflictFields: string[];
  lowConfidenceMapped: string[];
  missingRequiredMapped: string[];
} {
  const fieldDetails: Record<string, EnsembleFieldArtifact> = {};
  const unmappedFieldDetails: Record<string, FieldExtraction> = {};
  const ensembleExtractedFields: EnsembleAdapterResult["ensembleExtractedFields"] =
    {};
  const conflictFields: string[] = [];
  const lowConfidenceMapped: string[] = [];
  const missingRequiredMapped: string[] = [];

  for (const [sourceName, detail] of Object.entries(result.fieldDetails)) {
    const goldField = ENSEMBLE_TO_GOLDSPEC[sourceName];
    const artifact: EnsembleFieldArtifact = {
      value: detail.value,
      confidence: detail.confidence,
      pageNumber: 1,
      consensusCount: detail.consensusCount,
      strategy: detail.strategy,
      evidence: detail.evidence,
      sourceName,
      displayName: detail.displayName,
      required: detail.required,
      reasonCode: detail.reasonCode ?? null,
      conflictValues: detail.conflictValues,
    };

    if (goldField) {
      fieldDetails[goldField] = artifact;
      if (detail.value) {
        ensembleExtractedFields[goldField] = {
          value: detail.value,
          confidence: detail.confidence,
          pageNumber: 1,
        };
      }
      if (detail.reasonCode === "CONFLICT") {
        conflictFields.push(goldField);
      }
      if (
        detail.required &&
        detail.confidence > 0 &&
        detail.confidence < llmThreshold
      ) {
        lowConfidenceMapped.push(goldField);
      }
      if (detail.required && !detail.value) {
        missingRequiredMapped.push(goldField);
      }
    } else {
      unmappedFieldDetails[sourceName] = detail;
      const isBlankPlaceholder =
        !detail.value ||
        /^(null|n\/a|none|nil|-|—|–|\.+)$/i.test((detail.value ?? "").trim());
      if (
        detail.reasonCode === "CONFLICT" &&
        !(detail.required === false && isBlankPlaceholder)
      ) {
        conflictFields.push(sourceName);
      }
      // Safe remap: technician signature Present → customerSignature hint for Gemini
      // (handwritten ink is invisible to OCR; label presence is the best text signal).
      // Do NOT remap Absent/CONFLICT/asset bleed.
      if (
        sourceName === "technician_signature" &&
        detail.value === "Present" &&
        detail.reasonCode !== "CONFLICT"
      ) {
        fieldDetails.customerSignature = {
          ...artifact,
          displayName: "Technician Signature",
        };
        ensembleExtractedFields.customerSignature = {
          value: "Present",
          confidence: Math.max(detail.confidence, 70),
          pageNumber: 1,
        };
      }
    }
  }

  return {
    fieldDetails,
    unmappedFieldDetails,
    ensembleExtractedFields,
    conflictFields,
    lowConfidenceMapped,
    missingRequiredMapped,
  };
}

/**
 * Run ensemble extraction and map to GoldSpec fields.
 * Returns null on any failure (fail-soft).
 */
export async function runEnsembleExtraction(
  text: string,
  options: RunEnsembleOptions = {}
): Promise<EnsembleAdapterResult | null> {
  if (!isEnsembleExtractionEnabled()) {
    return null;
  }

  try {
    const settings = options.settings;
    const llmThreshold =
      options.llmConfidenceThreshold ?? settings?.llmConfidenceThreshold ?? 70;

    const result = await advancedExtraction.processDocument(
      text,
      options.filename ?? "pipeline-document",
      {
        useLlm: options.useLlm ?? settings?.llmFallbackEnabled ?? true,
        extractionMethod: options.extractionMethod ?? "OCR",
        settings,
      }
    );

    const mapped = mapFieldDetails(result, llmThreshold);
    const reviewRequired =
      mapped.conflictFields.length > 0 ||
      mapped.lowConfidenceMapped.length > 0 ||
      mapped.missingRequiredMapped.length > 0;

    const reviewSignals: EnsembleReviewSignals = {
      lowConfidenceFields: mapped.lowConfidenceMapped,
      missingRequired: mapped.missingRequiredMapped,
      conflictFields: mapped.conflictFields,
      averageConfidence: result.averageConfidence,
      reviewRequired,
    };

    const fieldsWithConsensus = Object.values(result.fieldDetails).filter(
      d => (d.consensusCount ?? 0) >= 2 && d.reasonCode !== "CONFLICT"
    ).length;
    const fieldsWithConflict = Object.values(result.fieldDetails).filter(
      d => d.reasonCode === "CONFLICT"
    ).length;

    const artifact: EnsembleExtractionArtifact = {
      engineVersion: ENGINE_VERSION,
      averageConfidence: result.averageConfidence,
      consensusSummary: {
        fieldsWithConsensus,
        fieldsWithConflict,
        requiredExtracted: result.requiredExtracted,
        requiredTotal: result.requiredTotal,
      },
      fieldDetails: mapped.fieldDetails,
      unmappedFieldDetails: mapped.unmappedFieldDetails,
      reviewSignals,
      status: result.status,
      processingTimeMs: result.processingTimeMs,
    };

    return {
      artifact,
      ensembleExtractedFields: mapped.ensembleExtractedFields,
      reviewSignals,
    };
  } catch (error) {
    console.warn("[EnsembleExtraction] fail-soft:", error);
    return null;
  }
}

/**
 * Build supplemental findings for CONFLICT / low-confidence required fields.
 * Never sets PASS — only elevates review routing.
 */
export function buildEnsembleReviewFindings(
  signals: EnsembleReviewSignals,
  fieldDetails: Record<string, EnsembleFieldArtifact>,
  llmThreshold: number
): Finding[] {
  const findings: Finding[] = [];

  for (const field of signals.conflictFields) {
    const detail = fieldDetails[field];
    findings.push({
      ruleId: "ENSEMBLE",
      fieldName: detail?.displayName ?? field,
      severity: "S1",
      reasonCode: "CONFLICT",
      rawSnippet: detail?.evidence ?? "",
      normalisedSnippet: detail?.conflictValues?.join(" | ") ?? "",
      confidence: detail?.confidence ?? 0,
      pageNumber: 1,
      whyItMatters: `Ensemble strategies disagreed on ${field}. Manual resolution required.`,
      suggestedFix:
        "Review conflicting values and confirm the correct field value.",
    });
  }

  for (const field of signals.lowConfidenceFields) {
    if (signals.conflictFields.includes(field)) continue;
    const detail = fieldDetails[field];
    findings.push({
      ruleId: "ENSEMBLE",
      fieldName: detail?.displayName ?? field,
      severity: "S2",
      reasonCode: "LOW_CONFIDENCE",
      rawSnippet: detail?.evidence ?? "",
      normalisedSnippet: detail?.value ?? "",
      confidence: detail?.confidence ?? 0,
      pageNumber: 1,
      whyItMatters: `Ensemble consensus confidence for ${field} is below threshold ${llmThreshold}.`,
      suggestedFix: "Verify the field value against the source document.",
    });
  }

  for (const field of signals.missingRequired) {
    findings.push({
      ruleId: "ENSEMBLE",
      fieldName: fieldDetails[field]?.displayName ?? field,
      severity: "S1",
      reasonCode: "MISSING_FIELD",
      rawSnippet: "",
      normalisedSnippet: "",
      confidence: 0,
      pageNumber: 1,
      whyItMatters: `Required field ${field} was not extracted by ensemble consensus.`,
      suggestedFix: "Locate and enter the missing required field.",
    });
  }

  return findings;
}

/**
 * Merge analyzer extractedFields with ensemble (ensemble wins on confidence tie / higher).
 */
export function mergeExtractedFields(
  analyzerFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >,
  ensembleFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >
): Record<string, { value: string; confidence: number; pageNumber: number }> {
  const merged = { ...analyzerFields };
  for (const [key, ens] of Object.entries(ensembleFields)) {
    const existing = merged[key];
    if (!existing || ens.confidence >= existing.confidence) {
      merged[key] = ens;
    }
  }
  return merged;
}

/**
 * Bridge legacy GoldSpec field names ↔ activation-canonical IDs.
 * Job Summary / mobilisation templates use jobReference/assetId/date/engineerSignOff;
 * ensemble still emits jobNumber/serialNumber/dateOfService/customerSignature.
 */
export function aliasCanonicalExtractedFields(
  fields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >
): Record<string, { value: string; confidence: number; pageNumber: number }> {
  const out = { ...fields };
  const copyIfMissing = (from: string, to: string) => {
    if (out[from] && !out[to]) {
      out[to] = out[from];
    }
  };
  copyIfMissing("jobNumber", "jobReference");
  copyIfMissing("jobReference", "jobNumber");
  copyIfMissing("serialNumber", "assetId");
  copyIfMissing("assetId", "serialNumber");
  copyIfMissing("dateOfService", "date");
  copyIfMissing("date", "dateOfService");
  copyIfMissing("customerSignature", "engineerSignOff");
  copyIfMissing("engineerSignOff", "customerSignature");
  copyIfMissing("technicianName", "engineerSignOff");
  return out;
}

/**
 * Format ensemble consensus for Gemini advisory prompt injection.
 */
export function formatPreExtractedHints(
  ensembleExtractedFields: EnsembleAdapterResult["ensembleExtractedFields"],
  fieldDetails?: Record<string, EnsembleFieldArtifact>
): string {
  const entries = Object.entries(ensembleExtractedFields);
  if (entries.length === 0) return "";

  const lines = entries.map(([field, data]) => {
    const detail = fieldDetails?.[field];
    const meta: string[] = [`confidence=${data.confidence}`];
    if (detail?.strategy) meta.push(`strategy=${detail.strategy}`);
    if (detail?.conflictValues?.length) {
      meta.push(`conflicts=${detail.conflictValues.join("|")}`);
    }
    return `- ${field}: "${data.value}" (${meta.join(", ")})`;
  });

  return `## Pre-extracted Fields (ensemble consensus — advisory)
Use these as starting hypotheses. Validate against the raw text.
Do NOT emit MISSING_FIELD when a high-confidence (≥70) pre-extraction exists unless the text clearly contradicts it.
Do NOT treat asset/registration IDs as signature values.

${lines.join("\n")}`;
}
