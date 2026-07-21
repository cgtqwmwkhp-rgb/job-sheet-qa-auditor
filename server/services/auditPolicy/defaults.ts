import type { AuditPolicy } from "./types";

/**
 * Seed defaults for Wasted Journey + Job Summary (VOR).
 * Admins override via Settings → Audit Policy; pipeline uses DB ?? these defaults.
 */
export const DEFAULT_AUDIT_POLICY: AuditPolicy = {
  version: "1.0.0",
  weights: {
    major: 25,
    minor: 15,
    informational: 0,
  },
  forms: {
    "wasted-journey-v1": {
      label: "Wasted Journey",
      rules: [
        {
          ruleId: "WJ-C010",
          label: "Wasted Journey Reason",
          description: "Abort/no-show reason must be recorded",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Wasted Journey Reason", "wastedJourneyReason"],
        },
        {
          ruleId: "WJ-C020",
          label: "Scheduling Team Contacted",
          description: "Scheduling / control room contact must be Yes",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Scheduling Team Contacted",
            "schedulingContacted",
            "SchedulingContacted",
          ],
        },
        {
          ruleId: "WJ-C030",
          label: "Booking Site Contact Confirmed",
          description: "Booking site contact must be Yes",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Booking Site Contact Confirmed",
            "siteContactConfirmed",
            "SiteContactConfirmed",
          ],
        },
        {
          ruleId: "WJ-C040",
          label: "Technician Signature",
          description: "Technician name/signature required",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Technician Signature",
            "engineerSignOff",
            "customerSignature",
          ],
        },
        {
          ruleId: "WJ-C050",
          label: "Asset Number / Date",
          description: "Asset Number and date identify the wasted visit",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Asset Number / Date",
            "assetId",
            "Asset Number",
            "Asset No",
            "date",
          ],
        },
        {
          ruleId: "WJ-R007",
          label: "Asset Number format",
          description: "Asset Number pattern niggle (alphanumeric style)",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["assetId pattern"],
        },
      ],
    },
    "job-summary-v1": {
      label: "Job Summary (VOR)",
      rules: [
        {
          ruleId: "JSR-C010",
          label: "VOR ↔ Safe to Use (conflict)",
          description: "VOR marked but also marked safe to use",
          failClass: "major",
          enabled: true,
          fieldAliases: ["VOR ↔ Safe to Use"],
        },
        {
          ruleId: "JSR-C011",
          label: "VOR ↔ Safe to Use (incomplete)",
          description: "VOR marked but safe-to-use not answered No",
          failClass: "major",
          enabled: true,
          fieldAliases: ["VOR ↔ Safe to Use"],
        },
        {
          ruleId: "JSR-C020",
          label: "Unsafe ↔ VOR",
          description: "Unsafe without VOR banner",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Unsafe ↔ VOR"],
        },
        {
          ruleId: "JSR-C030",
          label: "Return Visit Required (conflict)",
          description: "Critical outcome but return visit marked No",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Return Visit Required"],
        },
        {
          ruleId: "JSR-C031",
          label: "Return Visit Required (incomplete)",
          description: "Critical outcome but return visit not Yes",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Return Visit Required"],
        },
        {
          ruleId: "JSR-C040",
          label: "Works Completion",
          description: "Failure/repairs signals but works marked complete",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Works Completion"],
        },
        {
          ruleId: "JSR-C050",
          label: "Incomplete ↔ Return Visit (conflict)",
          description: "Incomplete works but return visit No",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Incomplete ↔ Return Visit"],
        },
        {
          ruleId: "JSR-C051",
          label: "Incomplete ↔ Return Visit (incomplete)",
          description: "Incomplete works but return visit not Yes",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Incomplete ↔ Return Visit"],
        },
        {
          ruleId: "JSR-C060",
          label: "Fail Column ↔ Safe to Use",
          description: "Fail marks contradict safe-to-use Yes",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Fail Column ↔ Safe to Use"],
        },
        {
          ruleId: "JSR-C070",
          label: "Repairs ↔ Return Visit",
          description: "Repairs path but return visit No",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Repairs ↔ Return Visit"],
        },
        {
          ruleId: "JSR-C080",
          label: "Engineer Comments (Failure Path)",
          description: "Failure path without substantive engineer comments",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Engineer Comments (Failure Path)",
            "engineer_comments",
            "Engineer Comments",
          ],
        },
        {
          ruleId: "JSR-C090",
          label: "Parts Still Required ↔ Return Visit (conflict)",
          description:
            "Parts Still Required has content but return visit is marked No",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Parts Still Required ↔ Return Visit"],
        },
        {
          ruleId: "JSR-C093",
          label: "Parts Still Required ↔ Return Visit (incomplete)",
          description:
            "Parts Still Required has content but return visit not confirmed Yes",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Parts Still Required ↔ Return Visit"],
        },
        {
          ruleId: "JSR-C091",
          label: "Parts Still Required ↔ Works Completion",
          description:
            "Parts Still Required has content but works marked fully completed",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Parts Still Required ↔ Works Completion"],
        },
        {
          ruleId: "PHOTO-C010",
          label: "Photo Evidence (missing hints)",
          description:
            "Parts or repairs recorded but no before/after / Photo-N hints found",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Photo Evidence"],
        },
        {
          ruleId: "PHOTO-C011",
          label: "Photo Evidence Hints",
          description: "Before/after or Photo-N hints detected in the pack",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Photo Evidence Hints", "Photo Evidence"],
        },
        {
          ruleId: "PHOTO-C012",
          label: "Before/After Pair Compare",
          description:
            "Multimodal pair compare failed work_done or repaired_properly",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Before/After Pair Compare", "Photo Evidence"],
        },
        {
          ruleId: "PHOTO-C013",
          label: "Before/After Cleanliness",
          description: "After photo cleanliness axis failed",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Before/After Cleanliness", "Photo Evidence"],
        },
        {
          ruleId: "PHOTO-C014",
          label: "Before/After Inconclusive",
          description: "Pair compare inconclusive or unverified without VLM",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Before/After Pair Compare", "Photo Evidence"],
        },
        {
          ruleId: "PHOTO-C015",
          label: "Photo Evidence (Duplicate)",
          description: "Evidence pack file hash matches a prior upload",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Photo Evidence (Duplicate)", "Photo Evidence"],
        },
        {
          ruleId: "COMMENT-C010",
          label: "Engineer Comments (Clinical Presence)",
          description: "Failure path without substantive clinical narrative",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Engineer Comments (Clinical)",
            "Engineer Comments (Failure Path)",
            "engineer_comments",
            "Engineer Comments",
          ],
        },
        {
          ruleId: "COMMENT-C020",
          label: "Engineer Comments (Sufficiency)",
          description:
            "Narrative missing what-failed and next-action/parts stance",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Engineer Comments (Sufficiency)",
            "Engineer Comments",
          ],
        },
        {
          ruleId: "COMMENT-C030",
          label: "Engineer Comments (Clarity)",
          description: "Vague-only or too-thin engineer comments",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Engineer Comments (Clarity)", "Engineer Comments"],
        },
        {
          ruleId: "COMMENT-C040",
          label: "Engineer Comments (Actionable)",
          description:
            "Return visit / parts still required without actionable next step",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Engineer Comments (Actionable)", "Engineer Comments"],
        },
        {
          ruleId: "COMMENT-C050",
          label: "Engineer Comments (Cross-field)",
          description:
            "Parts Still Required content not referenced in comments",
          failClass: "minor",
          enabled: true,
          fieldAliases: [
            "Engineer Comments (Cross-field)",
            "Engineer Comments",
          ],
        },
        {
          ruleId: "COMMENT-C041",
          label: "Engineer Comments (Coherent)",
          description: "Coherent clinical narrative on failure path",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Engineer Comments (Clinical)", "Engineer Comments"],
        },
        {
          ruleId: "COMMENT-C042",
          label: "Engineer Comments (Fault Clarity)",
          description:
            "Comments lack defect/root-cause clarity (work-done list only)",
          failClass: "minor",
          enabled: true,
          fieldAliases: [
            "Engineer Comments (Fault Clarity)",
            "Engineer Comments",
          ],
        },
        {
          ruleId: "FAULT-C010",
          label: "Fault Reason (Placeholder)",
          description:
            "Fault Reason is a form label/placeholder (e.g. Reason), not a real category",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Fault Reason", "fault_reason"],
        },
        {
          ruleId: "PARTS-C010",
          label: "Parts Used (Missing Description)",
          description:
            "Part number recorded without description on a Parts Used line",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Assessment"],
        },
        {
          ruleId: "PARTS-C011",
          label: "Parts Used (Missing Part Number)",
          description:
            "Description recorded without part number on a Parts Used line",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Assessment"],
        },
        {
          ruleId: "PARTS-C012",
          label: "Parts Used (Incomplete Listing)",
          description:
            "Parts implied but no complete part number + description lines",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Assessment"],
        },
        {
          ruleId: "PARTS-C013",
          label: "Parts Used (Complete)",
          description:
            "All Parts Used lines include part number and description",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Assessment"],
        },
        {
          ruleId: "PARTS-C014",
          label: "Parts Used (Soft Implication, Unconfirmed)",
          description:
            "Parts Used empty/None with only repairs and/or Consumables Used=Yes — weak implication (consumables are not itemised); not a confirmed parts-listing defect",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Assessment"],
        },
        {
          ruleId: "ATTR-C010",
          label: "Engineer Attribution (Missing Name)",
          description: "No usable extracted engineer/technician name",
          failClass: "minor",
          enabled: true,
          fieldAliases: [
            "Engineer Attribution",
            "Technician Name",
            "technicianName",
            "engineer_name",
          ],
        },
        {
          ruleId: "ATTR-C011",
          label: "Engineer Attribution (Unmatched)",
          description: "Engineer name extracted but no user match",
          failClass: "minor",
          enabled: true,
          fieldAliases: [
            "Engineer Attribution (Unmatched)",
            "Engineer Attribution",
            "Technician Name",
          ],
        },
        {
          ruleId: "ATTR-C012",
          label: "Engineer Attribution (Matched)",
          description: "Extracted engineer name matched to technician user",
          failClass: "informational",
          enabled: true,
          fieldAliases: [
            "Engineer Attribution (Matched)",
            "Engineer Attribution",
          ],
        },
        {
          ruleId: "PARTS-C020",
          label: "Parts Used (Catalog Mismatch)",
          description:
            "Exa catalog search did not corroborate part number vs description",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Catalog Verify"],
        },
        {
          ruleId: "PARTS-C021",
          label: "Parts Used (Catalog Match)",
          description:
            "Exa catalog search corroborates part number and description",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Catalog Verify"],
        },
        {
          ruleId: "PARTS-C022",
          label: "Parts Used (Catalog Unavailable)",
          description:
            "Exa catalog verification unavailable — not a pass; blocks AUTO_PASS",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Catalog Verify"],
        },
        {
          ruleId: "PARTS-C030",
          label: "Parts Used (Missing Asset Context)",
          description:
            "Make/model missing — cannot verify part fitment for this asset",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Asset Fitment"],
        },
        {
          ruleId: "PARTS-C031",
          label: "Parts Used (Fitment Conflict)",
          description:
            "Exa catalog search did not corroborate part fitment for make/model",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Asset Fitment"],
        },
        {
          ruleId: "PARTS-C032",
          label: "Parts Used (Fitment Corroborated)",
          description:
            "Exa catalog search corroborates part fitment for make/model",
          failClass: "informational",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Asset Fitment"],
        },
        {
          ruleId: "PARTS-C033",
          label: "Parts Used (Fitment Unavailable)",
          description:
            "Exa asset fitment verification unavailable — not a pass",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Parts Used", "Parts Asset Fitment"],
        },
        {
          ruleId: "EVIDENCE-C010",
          label: "Evidence Coherence",
          description:
            "Narrative claims repair complete but photo pair axes contradict",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Evidence Coherence",
            "Evidence Coherence (Safe vs Photos)",
          ],
        },
        {
          ruleId: "CHECK-C010",
          label: "Checklist Completion",
          description:
            'Compliance checklist field(s) still show placeholder "Please select" — checklist incomplete',
          failClass: "minor",
          enabled: true,
          fieldAliases: ["Checklist Completion", "Checklist Incomplete"],
        },
        {
          ruleId: "TYRE-C010",
          label: "Tyre Tread Depth",
          description: "Recorded tread depth below PlantExpand 2mm minimum",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Tyre Tread Depth", "Tread Depth"],
        },
        {
          ruleId: "TYRE-C020",
          label: "Tyre PSI",
          description:
            "Recorded PSI outside acceptable band for tyre size (195/50R13C: 90–95 PSI)",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Tyre PSI", "Tyre Inflation", "Tyre Pressure"],
        },
        {
          ruleId: "TYRE-C030",
          label: "Tyre DOT Age",
          description:
            "Tyre age exceeds 8-year maximum per PlantExpand checklist (DOT date code)",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Tyre DOT Age", "Tyre Age", "DOT Age"],
        },
      ],
    },
    /**
     * Catch-all for templates that don't map to a known form family.
     * Mirrors the most safety-critical job-summary rules so unknown
     * templates still get major/minor classification instead of
     * falling through to unmapped→minor for everything.
     */
    default: {
      label: "Default (catch-all)",
      rules: [
        {
          ruleId: "DEF-C010",
          label: "VOR ↔ Safe to Use (conflict)",
          description:
            "VOR / unsafe status contradicts safe-to-use — applies to any form",
          failClass: "major",
          enabled: true,
          fieldAliases: ["VOR ↔ Safe to Use", "vorSafeConflict"],
        },
        {
          ruleId: "DEF-C020",
          label: "Works Completion",
          description:
            "Failure/repairs signals but works marked complete — generic catch-all",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Works Completion", "worksCompletion"],
        },
        {
          ruleId: "DEF-C030",
          label: "Return Visit Required",
          description:
            "Critical outcome but return visit not marked Yes — generic catch-all",
          failClass: "major",
          enabled: true,
          fieldAliases: ["Return Visit Required", "returnVisitRequired"],
        },
        {
          ruleId: "DEF-C040",
          label: "Engineer Signature / Sign-off",
          description: "Technician name or signature must be present",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Engineer Signature / Sign-off",
            "Technician Signature",
            "engineerSignOff",
            "customerSignature",
          ],
        },
        {
          ruleId: "DEF-C050",
          label: "Engineer Comments (Failure Path)",
          description:
            "Failure path without substantive engineer comments — generic catch-all",
          failClass: "major",
          enabled: true,
          fieldAliases: [
            "Engineer Comments (Failure Path)",
            "engineer_comments",
            "Engineer Comments",
          ],
        },
        {
          ruleId: "DEF-R010",
          label: "Date / Asset Number format",
          description: "Date or asset-number pattern niggle",
          failClass: "minor",
          enabled: true,
          fieldAliases: ["assetId pattern", "Asset Number", "Asset No", "date"],
        },
      ],
    },
  },
};

export const AUDIT_POLICY_SETTING_KEY = "auditPolicy";

export { SAFETY_CRITICAL_RULE_IDS } from "@shared/const";
