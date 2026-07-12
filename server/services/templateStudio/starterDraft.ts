/**
 * Template Studio — starter draft artifacts that satisfy activation critical fields.
 */

import type {
  SpecJson,
  SelectionConfig,
  RoiConfig,
} from "../templateRegistry/types";
import { createStandardJobSheetRoi } from "../templateRegistry/roiValidator";

export function createStudioStarterSpec(
  name: string,
  version = "0.1.0"
): SpecJson {
  return {
    name,
    version,
    fields: [
      {
        field: "jobReference",
        label: "Job Reference",
        type: "string",
        required: true,
        extractionHints: [
          "job number",
          "job no",
          "job ref",
          "work order",
          "reference",
        ],
        aliases: ["Job No", "Work Order", "WO#"],
      },
      {
        field: "assetId",
        label: "Asset ID",
        type: "string",
        required: true,
        extractionHints: ["asset", "serial", "plant no", "equipment"],
        aliases: ["Serial Number", "Asset No", "Plant No"],
      },
      {
        field: "date",
        label: "Date of Service",
        type: "date",
        required: true,
        extractionHints: ["date", "service date", "completed on", "visit date"],
        aliases: ["Service Date", "Date"],
      },
      {
        field: "engineerSignOff",
        label: "Engineer Sign-Off",
        type: "string",
        required: true,
        extractionHints: [
          "engineer signature",
          "technician sign",
          "signed by",
          "completed by",
        ],
        aliases: ["Engineer Signature", "Technician Signature"],
      },
      {
        field: "expiryDate",
        label: "Expiry Date",
        type: "date",
        required: false,
        extractionHints: ["expiry", "valid until", "next due"],
        aliases: ["Valid Until", "Next Due"],
      },
      {
        field: "complianceTickboxes",
        label: "Compliance Checklist",
        type: "list",
        required: false,
        extractionHints: ["ok", "adv", "fail", "n/a", "checklist"],
        aliases: ["Checklist", "Tickboxes"],
      },
      {
        field: "customerSignature",
        label: "Customer Signature",
        type: "string",
        required: false,
        extractionHints: [
          "customer signature",
          "customer sign-off",
          "authorized by",
        ],
        aliases: ["Customer Sign-off"],
      },
    ],
    rules: [
      {
        ruleId: "R-JOB-REF",
        field: "jobReference",
        description: "Job reference must be present",
        severity: "critical",
        type: "required",
        enabled: true,
        tags: ["studio", "critical"],
      },
      {
        ruleId: "R-ASSET",
        field: "assetId",
        description: "Asset ID must be present",
        severity: "critical",
        type: "required",
        enabled: true,
        tags: ["studio", "critical"],
      },
      {
        ruleId: "R-DATE",
        field: "date",
        description: "Service date must be present",
        severity: "critical",
        type: "required",
        enabled: true,
        tags: ["studio", "critical"],
      },
      {
        ruleId: "R-ENG-SIG",
        field: "engineerSignOff",
        description: "Engineer sign-off must be present",
        severity: "critical",
        type: "required",
        enabled: true,
        tags: ["studio", "critical"],
      },
    ],
    metadata: {
      source: "template-studio",
      createdVia: "createDraft",
    },
  };
}

export function createStudioStarterSelection(
  tokens: string[] = ["job", "sheet"]
): SelectionConfig {
  return {
    requiredTokensAll: [],
    requiredTokensAny: tokens.length ? tokens : ["job"],
    optionalTokens: ["plantexpand", "compliance", "checklist"],
    tokenWeights: {},
  };
}

export function createStudioStarterRoi(): RoiConfig {
  return createStandardJobSheetRoi();
}
