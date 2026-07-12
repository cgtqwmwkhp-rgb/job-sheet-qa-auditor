/**
 * Auto-scaffold minimal fixture cases from sample OCR text + expected outcomes.
 */

import {
  createFixturePack,
  type FixtureCase,
  type FixturePack,
} from "../templateRegistry/fixtureRunner";
import type { SpecJson } from "../templateRegistry/types";

export function scaffoldFixturesFromSample(input: {
  versionId: number;
  sampleText: string;
  specJson: SpecJson;
  createdBy: number;
}): FixturePack {
  const text =
    input.sampleText.trim() ||
    "Job Reference JOB-1001 Asset ID ASSET-99 Date 01/01/2026 Engineer Sign-Off Jane Doe";

  const cases: FixtureCase[] = [
    {
      caseId: "studio-pass-sample",
      description: "Sample OCR text should pass critical field heuristics",
      inputText: text,
      expectedOutcome: "pass",
      required: true,
      expectedFields: Object.fromEntries(
        input.specJson.fields
          .filter(f => f.required)
          .slice(0, 4)
          .map(f => [f.field, `extracted-${f.field}`])
      ),
    },
    {
      caseId: "studio-fail-empty",
      description: "Empty document should fail critical required fields",
      inputText: "blank page no fields",
      expectedOutcome: "fail",
      expectedReasonCodes: ["MISSING_FIELD"],
      required: true,
    },
  ];

  return createFixturePack(input.versionId, cases, input.createdBy);
}
