import type { AuditPolicy } from "./types";

/**
 * Seed defaults for Wasted Journey + Job Summary (VOR).
 * Admins override via Settings → Audit Policy; pipeline uses DB ?? these defaults.
 */
export const DEFAULT_AUDIT_POLICY: AuditPolicy = {
  version: 1,
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
      ],
    },
  },
};

export const AUDIT_POLICY_SETTING_KEY = "auditPolicy";
