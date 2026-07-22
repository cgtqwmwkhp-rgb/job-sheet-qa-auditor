/**
 * Pack v1 date compliance — next examination / next service due.
 *
 * DATE-C020 (LOLER): Next Examination Due missing or overdue vs exam date
 *   (default 6-month TE interval) → S1 major.
 * DATE-C010 (job-summary inspection): Next Service / expiryDate missing or
 *   past → S3 informational shadow (no FAIL alone).
 */

import type { Finding } from "../analyzer";
import { extractField } from "../extraction/criticalFieldExtractor";

export const DATE_RULE_PREFIX = "DATE-C";

const LOLER_DEFAULT_MONTHS = 6;

export interface DateComplianceInput {
  text: string;
  templateSlug?: string | null;
  /** Prefer pipeline-extracted values when present. */
  expiryDate?: string | null;
  examinationDate?: string | null;
  now?: Date;
}

export interface DateComplianceResult {
  findings: Finding[];
  summary: string;
  signals: {
    nextExamDue: string | null;
    examinationDate: string | null;
    nextServiceDue: string | null;
    lolerScope: boolean;
    inspectionScope: boolean;
  };
}

function parseFlexibleDate(raw: string | null | undefined): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  // ISO yyyy-mm-dd (unambiguous)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (isoMatch) {
    const d = new Date(
      Date.UTC(
        Number(isoMatch[1]),
        Number(isoMatch[2]) - 1,
        Number(isoMatch[3])
      )
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // UK plant ops: DD/MM/YYYY — never Date.parse slash dates (US MM/DD trap).
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

type DateReasonCode = Finding["reasonCode"];

function issue(
  ruleId: string,
  fieldName: string,
  severity: "S1" | "S2" | "S3",
  reasonCode: DateReasonCode,
  why: string,
  fix: string,
  snippet: string
): Finding {
  return {
    ruleId,
    fieldName,
    severity,
    reasonCode,
    rawSnippet: snippet.slice(0, 200),
    normalisedSnippet: snippet.slice(0, 200),
    confidence: 80,
    pageNumber: 1,
    whyItMatters: why,
    suggestedFix: fix,
  };
}

function isLolerSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return /loler/i.test(slug);
}

function isInspectionJobSummary(slug: string | null | undefined): boolean {
  if (!slug) return true;
  return (
    slug === "job-summary-v1" ||
    slug === "job-summary" ||
    slug === "standard-maintenance-v1"
  );
}

function extractNextExamFromText(text: string): string | null {
  const patterns = [
    /next\s*examination\s*due[:.\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
    /next\s*exam(?:ination)?\s*(?:due|date)?[:.\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
    /examination\s*due[:.\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Evaluate Pack v1 date gates.
 */
export function evaluateDateCompliance(
  input: DateComplianceInput
): DateComplianceResult {
  const now = input.now ?? new Date();
  const findings: Finding[] = [];
  const lolerScope = isLolerSlug(input.templateSlug);
  const inspectionScope =
    !lolerScope && isInspectionJobSummary(input.templateSlug);

  const examRaw =
    input.examinationDate?.trim() ||
    extractField("date", input.text)?.value ||
    null;
  const examDate = parseFlexibleDate(examRaw);

  let nextExamRaw =
    (lolerScope ? input.expiryDate?.trim() : null) ||
    extractNextExamFromText(input.text);
  if (lolerScope && !nextExamRaw && input.expiryDate) {
    nextExamRaw = input.expiryDate;
  }
  // Prefer criticalFieldExtractor for next service when not LOLER
  const nextServiceExtract = extractField("expiryDate", input.text);
  const nextServiceRaw =
    (!lolerScope ? input.expiryDate?.trim() : null) ||
    nextServiceExtract?.value ||
    null;

  const signals = {
    nextExamDue: nextExamRaw,
    examinationDate: examRaw,
    nextServiceDue: nextServiceRaw,
    lolerScope,
    inspectionScope,
  };

  if (lolerScope) {
    const dueDate = parseFlexibleDate(nextExamRaw);
    if (!dueDate) {
      // Missing next-exam: also treat as overdue when exam+6m has already passed
      const intervalLapsed =
        examDate != null &&
        now.getTime() > addMonths(examDate, LOLER_DEFAULT_MONTHS).getTime();
      findings.push(
        issue(
          "DATE-C020",
          "Next Examination Due",
          "S1",
          intervalLapsed ? "OUT_OF_POLICY" : "MISSING_FIELD",
          intervalLapsed
            ? `Next Examination Due is missing and the default ${LOLER_DEFAULT_MONTHS}-month TE interval from the examination date has lapsed.`
            : "LOLER thorough examinations require a next examination due date (statutory).",
          "Record Next Examination Due on the thorough examination report.",
          nextExamRaw || "Next Examination Due: (missing)"
        )
      );
    } else if (dueDate.getTime() < now.getTime()) {
      findings.push(
        issue(
          "DATE-C020",
          "Next Examination Due",
          "S1",
          "OUT_OF_POLICY",
          "Next Examination Due is in the past — examination interval has lapsed.",
          "Schedule / record a current next examination due date.",
          `Next Examination Due: ${nextExamRaw}`
        )
      );
    }
  }

  if (inspectionScope) {
    // Shadow: only emit when the sheet appears to have a next-service field
    // (label present) or an extracted expiryDate — avoid noise on plain JSR.
    const hasNextServiceLabel =
      /next\s*(?:service|test|inspection)\s*date/i.test(input.text) ||
      /expir(?:y|es)/i.test(input.text) ||
      Boolean(input.expiryDate?.trim());
    if (hasNextServiceLabel) {
      const due = parseFlexibleDate(nextServiceRaw);
      if (!due) {
        findings.push(
          issue(
            "DATE-C010",
            "Next Service Due",
            "S3",
            "MISSING_FIELD",
            "Next service / test date is expected on this inspection sheet (shadow advisory).",
            "Record Next Service Date when the template provides the field.",
            nextServiceRaw || "Next Service Date: (missing)"
          )
        );
      } else if (due.getTime() < now.getTime()) {
        findings.push(
          issue(
            "DATE-C010",
            "Next Service Due",
            "S3",
            "OUT_OF_POLICY",
            "Next service / test date is in the past (shadow advisory).",
            "Update the next service date after the visit.",
            `Next Service Date: ${nextServiceRaw}`
          )
        );
      }
    }
  }

  const summary =
    findings.length === 0
      ? "Date compliance: OK"
      : `Date compliance: ${findings.map(f => f.ruleId).join(", ")}`;

  return { findings, summary, signals };
}
