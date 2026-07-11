/**
 * PlantExpand extraction hygiene contracts — VOR trailer 249200123 / Job ID 87.
 *
 * Covers three false-positive fixes:
 * 1. Job ID : 87 extracts job_no 87 without CONFLICT
 * 2. Serial No null/empty with Asset No present → no serial CONFLICT
 * 3. Technician Name Richard.Newton + letterhead noise → engineer_name kept, no CONFLICT
 */

import { describe, it, expect } from "vitest";
import {
  ensembleExtract,
  FIELD_DEFINITIONS,
  isLetterheadNoise,
  isUsernameShaped,
} from "../../services/advancedExtraction";

function fieldDef(name: string) {
  const def = FIELD_DEFINITIONS.find(f => f.name === name);
  if (!def) throw new Error(`Unknown field: ${name}`);
  return def;
}

// ---------------------------------------------------------------------------
// 1. Job ID : 87 → job_no = "87", no CONFLICT
// ---------------------------------------------------------------------------

const JOB_ID_TEXT = `
Job Summary Report
PlantExpand
This Vehicle is marked as VOR
Asset No: 249200123
Make/Model: Trailer
Job ID : 87
Date: 10/07/2026
Technician Name: Richard.Newton
Technician Signature
`;

describe("Job ID extraction (PlantExpand Job Summary)", () => {
  it("extracts job_no = 87 from 'Job ID : 87' without CONFLICT", async () => {
    const result = await ensembleExtract(JOB_ID_TEXT, fieldDef("job_no"));
    expect(result.value).toBe("87");
    expect(result.reasonCode).not.toBe("CONFLICT");
  });

  it("digit-normalizes matching values so no CONFLICT arises", async () => {
    const text = `
Job Summary Report
Job ID : 87
Job No: 87
Reference: 87
`;
    const result = await ensembleExtract(text, fieldDef("job_no"));
    expect(result.value).toBe("87");
    expect(result.reasonCode).not.toBe("CONFLICT");
  });
});

// ---------------------------------------------------------------------------
// 2. Serial No null / empty with Asset No present → no serial CONFLICT
// ---------------------------------------------------------------------------

const SERIAL_NULL_TEXT = `
Job Summary Report
Asset No: 249200123
Serial No:
Make/Model: Trailer
`;

describe("Serial No blank/null handling", () => {
  it("returns null value with no CONFLICT when serial is blank", async () => {
    const result = await ensembleExtract(
      SERIAL_NULL_TEXT,
      fieldDef("serial_no")
    );
    expect(result.reasonCode).not.toBe("CONFLICT");
  });

  it("does not treat field label words as serial values", async () => {
    const text = `
Serial No: N/A
Asset No: 249200123
`;
    const result = await ensembleExtract(text, fieldDef("serial_no"));
    expect(result.reasonCode).not.toBe("CONFLICT");
  });
});

// ---------------------------------------------------------------------------
// 3. Technician Name Richard.Newton vs letterhead → keep username, no CONFLICT
// ---------------------------------------------------------------------------

const ENGINEER_NAME_TEXT = `
Job Summary Report
Technician Name: Richard.Newton
www.plantexpand.com
01onal 0800 123 4567
Engineer: Richard.Newton
`;

describe("Technician Name vs letterhead noise", () => {
  it("extracts Richard.Newton without CONFLICT with letterhead", async () => {
    const result = await ensembleExtract(
      ENGINEER_NAME_TEXT,
      fieldDef("engineer_name")
    );
    expect(result.value).toBeTruthy();
    expect(result.value!.toLowerCase()).toContain("richard");
    expect(result.reasonCode).not.toBe("CONFLICT");
  });

  it("isLetterheadNoise rejects www. / .com / phone / plantexpand", () => {
    expect(isLetterheadNoise("www.plantexpand.com")).toBe(true);
    expect(isLetterheadNoise("info@plantexpand.com")).toBe(true);
    expect(isLetterheadNoise("0800 123 45678")).toBe(true);
    expect(isLetterheadNoise("PlantExpand Ltd")).toBe(true);
    expect(isLetterheadNoise("Richard.Newton")).toBe(false);
  });

  it("isUsernameShaped accepts firstname.lastname", () => {
    expect(isUsernameShaped("Richard.Newton")).toBe(true);
    expect(isUsernameShaped("john.smith")).toBe(true);
    expect(isUsernameShaped("www.plantexpand.com")).toBe(false);
    expect(isUsernameShaped("Some Long Name With Spaces")).toBe(false);
  });
});
