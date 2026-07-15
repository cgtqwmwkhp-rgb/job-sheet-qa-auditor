/**
 * Wave-7 eval slice: template memory apply (H2/H4) on fixture findings.
 * No DB — pure apply helpers. Optional golden growth stays behind UI.
 */

import {
  applyValueMemoryToFields,
  filterFindingsWithRuleMemory,
  TEMPLATE_MEMORY_AGREE_THRESHOLD,
  canAutoShadow,
  memoryKindForReason,
} from "../../server/services/templateMemory";

export interface TemplateMemorySliceReport {
  version: string;
  timestamp: string;
  status: "pass" | "fail";
  agreeThreshold: number;
  cases: Array<{ id: string; status: "pass" | "fail"; note?: string }>;
}

export function runTemplateMemorySlice(): TemplateMemorySliceReport {
  const cases: TemplateMemorySliceReport["cases"] = [];

  const aliasMemory = [
    {
      id: 1,
      templateId: 1,
      templateVersionId: 1,
      memoryKind: "value_alias" as const,
      fieldKey: "job_number",
      ruleId: "",
      payloadJson: { from: "123", to: "0123" },
      payloadHash: "x",
      evidenceCount: 3,
      agreeCount: 3,
      disagreeCount: 0,
      promotionStatus: "shadow" as const,
      promotedToVersionId: null,
      createdFromCorrectionId: null,
      lastEvidenceAt: null,
      createdBy: null,
      approvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const { fields, applied } = applyValueMemoryToFields(
    [{ field: "job_number", value: "123" }],
    aliasMemory
  );
  cases.push({
    id: "h2-value-alias",
    status: fields[0]?.value === "0123" && applied.length === 1 ? "pass" : "fail",
  });

  const suppressMemory = [
    {
      ...aliasMemory[0],
      id: 2,
      memoryKind: "suppress_rule" as const,
      fieldKey: "date",
      ruleId: "RULE-FP",
      payloadJson: { ruleId: "RULE-FP" },
      promotionStatus: "approved" as const,
    },
  ];
  const { findings, applied: suppressed } = filterFindingsWithRuleMemory(
    [
      { ruleId: "RULE-FP", severity: "S2" },
      { ruleId: "RULE-FP", severity: "S0" },
    ],
    suppressMemory
  );
  cases.push({
    id: "h4-soft-suppress-keeps-s0",
    status:
      findings.length === 1 &&
      findings[0].severity === "S0" &&
      suppressed.length === 1
        ? "pass"
        : "fail",
  });

  cases.push({
    id: "true-defect-no-memory-kind",
    status:
      memoryKindForReason("true_defect", "override") === null ? "pass" : "fail",
  });

  cases.push({
    id: "roi-never-auto-shadow",
    status: canAutoShadow("roi_adjust") === false ? "pass" : "fail",
  });

  const failed = cases.filter(c => c.status === "fail").length;
  return {
    version: "wave7-template-memory-1",
    timestamp: new Date().toISOString(),
    status: failed === 0 ? "pass" : "fail",
    agreeThreshold: TEMPLATE_MEMORY_AGREE_THRESHOLD,
    cases,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runTemplateMemorySlice();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "pass" ? 0 : 1);
}
