/**
 * Hover guidance for Template Studio "Draw labels" palette.
 * Answers: what is this, what to look for, and how to box it (label+value vs value only).
 */

export interface RoiDrawGuidance {
  /** Short purpose of this ROI */
  summary: string;
  /** Printed words / layout cues on the PDF */
  lookFor: string;
  /** How to draw the box — include printed label or value-only */
  howToDraw: string;
}

const IDENTITY_VALUE: Pick<RoiDrawGuidance, "howToDraw"> = {
  howToDraw:
    "Box the printed field label and the value together in one tight rectangle (e.g. Job ID: J-4521). Do not take the whole header strip.",
};

const VALUE_AREA: Pick<RoiDrawGuidance, "howToDraw"> = {
  howToDraw:
    "Box the value / writing area itself. A little of the printed label edge is fine; avoid huge overlapping zones.",
};

const MEASUREMENT: Pick<RoiDrawGuidance, "howToDraw"> = {
  howToDraw:
    "Box the printed unit label and the number together (e.g. Wheel Nut Torque (NM): 115). Enable Measurement check only for these fields.",
};

/** Canonical guidance keyed by ROI / field id */
export const ROI_DRAW_GUIDANCE: Record<string, RoiDrawGuidance> = {
  header: {
    summary: "Document title / branding band at the top of the page.",
    lookFor: "Company logo, form title (e.g. Job Summary Report), top banner.",
    howToDraw:
      "Draw one wide box across the top banner only — not the job/asset fields below it.",
  },
  jobReference: {
    summary: "Unique job / work-order identifier used to match audits.",
    lookFor: 'Labels like "Job ID", "Job No.", "Job Ref", "WO", "Works Order".',
    ...IDENTITY_VALUE,
  },
  assetId: {
    summary: "Plant / asset / equipment identity on the job.",
    lookFor: 'Labels like "Asset ID", "Plant No.", "Equipment ID", "Fleet No.".',
    ...IDENTITY_VALUE,
  },
  date: {
    summary: "Visit / inspection / job date on the form.",
    lookFor: 'Printed "Date", "Job Date", "Inspection Date" next to a handwritten or stamped date.',
    howToDraw:
      "Box the Date label and the date value together. Prefer the job date, not expiry.",
  },
  expiryDate: {
    summary: "Certificate / next-due / expiry date when the form has one.",
    lookFor: 'Labels like "Expiry", "Valid Until", "Next Due", "Retest Due".',
    howToDraw:
      "Box Expiry (or equivalent) label + date value together. Keep separate from the job Date ROI.",
  },
  tickboxBlock: {
    summary: "Compliance checklist grid (Ok / Adv / Fail / N/A style).",
    lookFor:
      "Requirement rows on the left and four tick columns with headers Ok / Adv / Fail / N/A (or similar).",
    howToDraw:
      "One block for the whole grid: row requirement text + all four columns + column headers. Never one ROI per column or per tick.",
  },
  complianceTickboxes: {
    summary: "Same as Tickbox Block — the compliance grid evidence.",
    lookFor: "Full checklist grid with row text and outcome columns.",
    howToDraw:
      "Draw a single tickboxBlock covering row text + all columns + headers.",
  },
  signatureBlock: {
    summary: "Whole sign-off area when engineer and customer share one band.",
    lookFor: "Bottom signature section with name, signature, and date lines.",
    howToDraw:
      "Box the entire sign-off band in one region if both parties sit together. Prefer separate engineer/customer ROIs when they are side-by-side.",
  },
  engineerSignature: {
    summary: "Engineer / technician sign-off (presence proves engineerSignOff).",
    lookFor: '"Engineer", "Technician", "Operative" signature / print name / date.',
    ...VALUE_AREA,
  },
  engineerSignOff: {
    summary: "Engineer sign-off evidence (critical completeness).",
    lookFor: "Engineer signature stroke, printed name, or sign-off tick.",
    ...VALUE_AREA,
  },
  customerSignature: {
    summary: "Customer / client acceptance signature.",
    lookFor: '"Customer", "Client", "Site Contact" signature / print name.',
    ...VALUE_AREA,
  },
  workDescription: {
    summary: "Narrative of work done / findings / comments.",
    lookFor:
      'Sections titled "Work Description", "Comments", "Findings", "Details of Work".',
    howToDraw:
      "Box the whole writing area for that section (heading + handwritten/typed body). Keep signatures out of this box.",
  },
  makeModel: {
    summary: "Make and model of the asset under test.",
    lookFor: '"Make", "Model", "Make/Model", manufacturer + type lines.',
    ...IDENTITY_VALUE,
  },
  customerName: {
    summary: "Customer / client organisation or person name.",
    lookFor: '"Customer", "Client", "Account", "Company Name".',
    ...IDENTITY_VALUE,
  },
  customer: {
    summary: "Customer / client identity on the form.",
    lookFor: '"Customer", "Client", "Account".',
    ...IDENTITY_VALUE,
  },
  siteAddress: {
    summary: "Site location where the work was done.",
    lookFor: '"Site", "Address", "Location", postcode block.',
    howToDraw:
      "Box the Site/Address label and the full address block together.",
  },
  siteAddressContact: {
    summary: "Site address and on-site contact details when printed as one block.",
    lookFor: '"Site Address", "Contact", phone/email under the address.',
    howToDraw:
      "Box the whole Site Address / Contact block (heading + address + contact lines) in one ROI if they share a panel.",
  },
  siteContact: {
    summary: "On-site contact name / phone.",
    lookFor: '"Site Contact", "Contact Name", "Tel", "Mobile".',
    ...IDENTITY_VALUE,
  },
  serialNumber: {
    summary: "Serial / chassis / unit number.",
    lookFor: '"Serial", "S/N", "Chassis", "Unit No.".',
    ...IDENTITY_VALUE,
  },
  engineerName: {
    summary: "Printed engineer / technician name (not the signature stroke).",
    lookFor: '"Engineer", "Technician", "Operative", "Completed by" name line.',
    ...IDENTITY_VALUE,
  },
  mileageHours: {
    summary: "Odometer / hour-meter reading on the visit.",
    lookFor: '"Mileage", "Hours", "Odometer", "Hour Meter", "Km".',
    ...MEASUREMENT,
  },
  status: {
    summary: "Job / asset outcome status (e.g. VOR, Pass, Fail, Complete).",
    lookFor: '"Status", "Outcome", "Result", "VOR", Pass/Fail markers.',
    ...IDENTITY_VALUE,
  },
  partsUsed: {
    summary: "Parts fitted / used on this visit.",
    lookFor: '"Parts Used", "Parts Fitted", parts table or list.',
    howToDraw:
      "Box the Parts Used heading and the list/table body. Keep Parts Required separate.",
  },
  partsRequired: {
    summary: "Parts still required / outstanding.",
    lookFor: '"Parts Required", "Parts Still Required", outstanding parts list.',
    howToDraw:
      "Box the Parts Required heading and the outstanding list/table together.",
  },
  recommendations: {
    summary: "Follow-up recommendations / advice to the customer.",
    lookFor: '"Recommendations", "Advice", "Further Action".',
    howToDraw:
      "Box the recommendations heading and writing area. Keep signatures out.",
  },
  notes: {
    summary: "Free-text notes / comments block.",
    lookFor: '"Notes", "Comments", "Additional Information".',
    howToDraw:
      "Box the notes heading and body. Prefer workDescription for the main work narrative.",
  },
  tyreTreadDepth: {
    summary: "Tyre tread depth readings (OSF/OSR/NSF/NSR and extra axles).",
    lookFor:
      '"Tyre Tread Depth", OSF/OSR/NSF/NSR rows, values in mm, "Please select".',
    howToDraw:
      "Box the whole tread-depth block (all wheel-position rows + mm values) in one ROI. Enable Measurement check if you add per-row threshold rules.",
  },
  wheelPressures: {
    summary: "Set tyre / wheel pressures (PSI) on the form.",
    lookFor:
      '"Tyre Size and Set Pressure", "PSI", "Pressure", size + PSI on one line.',
    howToDraw:
      "Box the pressure label and PSI value together (e.g. PSI: 95). Include Size on the same line if they share one printed row.",
  },
  wheelNutTorque: {
    summary: "Wheel nut torque reading in NM.",
    lookFor: '"Wheel Nut Torque (NM)", handwritten or typed NM value.',
    ...MEASUREMENT,
  },
  hubNutTorque: {
    summary: "Hub nut torque reading in NM.",
    lookFor: '"Hub Nut Torque (NM)", handwritten or typed NM value.',
    ...MEASUREMENT,
  },
};

const MEASUREMENT_HINT =
  /torque|pressure|psi|bar|nm\b|mm\b|reading|voltage|amp|temp|weight|load|height|width|depth/i;

/**
 * Resolve draw guidance for a palette tool id (standard, spec field, or custom).
 */
export function getRoiDrawGuidance(
  id: string,
  opts?: { label?: string; fieldType?: string }
): RoiDrawGuidance {
  const direct = ROI_DRAW_GUIDANCE[id];
  if (direct) return direct;

  const label = opts?.label ?? id;
  const type = (opts?.fieldType ?? "").toLowerCase();

  if (type === "boolean" || /sign|tick|check|pass.?fail/i.test(label)) {
    return {
      summary: `${label} — capture the mark or signature evidence.`,
      lookFor: `The printed ${label} control and any tick / signature stroke next to it.`,
      ...VALUE_AREA,
    };
  }

  if (
    type === "number" ||
    MEASUREMENT_HINT.test(id) ||
    MEASUREMENT_HINT.test(label)
  ) {
    return {
      summary: `${label} — numeric reading used for thresholds.`,
      lookFor: `Printed ${label} (with unit if shown) and the handwritten/typed number.`,
      ...MEASUREMENT,
    };
  }

  if (type === "date" || /date|due|expiry/i.test(label)) {
    return {
      summary: `${label} — date value on the form.`,
      lookFor: `Printed "${label}" next to a date.`,
      howToDraw:
        "Box the printed label and the date value together in one tight rectangle.",
    };
  }

  return {
    summary: `${label} — extract this field from the page.`,
    lookFor: `The printed heading/label for "${label}" and the filled-in value beside or under it.`,
    ...IDENTITY_VALUE,
  };
}

/** Plain-text title attribute fallback */
export function formatRoiDrawGuidanceTitle(g: RoiDrawGuidance): string {
  return `${g.summary}\n\nLook for: ${g.lookFor}\n\nHow to draw: ${g.howToDraw}`;
}
