'''
# Plantexpand Specification Pack

This directory contains the document specification pack for the client **Plantexpand**.

## `plantexpand-spec-pack.json`

This JSON file is the master specification for all Plantexpand document templates. It defines the rules, fields, validation logic, and LLM-based analysis required to process their job sheets. The pack is structured to be machine-readable and drive the QA automation process.

### Included Templates

The pack currently includes four distinct document templates:

| Template ID                      | Display Name                                       | Description                                                              |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `PE_LOLER_EXAM_V1`               | Plantexpand LOLER Thorough Examination Report v1   | LOLER certificate for lifting equipment thorough examination.            |
| `PE_JOB_SUMMARY_REPAIR_V1`       | Plantexpand Job Summary (Repair/VOR) v1            | Job summary for breakdown/repair events, with a focus on VOR status.     |
| `PE_JOB_SUMMARY_COMPLIANCE_V1`   | Plantexpand Job Summary (Compliance/Service) v1    | General compliance and service job summary with a color-coded checklist. |
| `PE_JOB_SUMMARY_PTO_V1`          | Plantexpand Job Summary (PTO Service) v1           | Job summary for PTO (Power Take-Off) service compliance events.          |
| `PE_JOB_SUMMARY_AZTEC_V1`        | Plantexpand Job Summary (Aztec Weighing) v1        | Compliance checklist for Aztec Onboard Weighing Systems.                 |

### Defaults and Governance

The pack defines global defaults for:
- Date formats and timezone
- Critical fields that must be present
- Triggers for manual review queues
- LLM personas for specialized analysis (Engineering Expert, Parts Specialist)
- A legend for color-coded checklist statuses (Green, Orange, Red, Yellow)

## `files/` Directory

This subdirectory contains sample PDF documents corresponding to the templates defined in the specification pack. These are used for parity testing and validation to ensure the system correctly interprets and validates real-world documents.

- `ComplianceReport-050F_470_20251110.pdf` (LOLER Exam)
- `RepairReport-3070_13_20251110.pdf` (Repair/VOR)
- `ComplianceReport-4231_283_20251110.pdf` (General Compliance)
- `ComplianceReport-YA73JBE_428_20251110.pdf` (PTO Service)
- `ComplianceReport-WX24UFM_28_20251110.pdf` (Aztec Weighing)

'''
