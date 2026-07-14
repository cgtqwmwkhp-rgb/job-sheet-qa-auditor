/**
 * Keep specJson.fields in lockstep with ROI region names / region.fields.
 * Drawing a standard label must create the matching extractable field —
 * otherwise activation correctly (but confusingly) reports ORPHAN_ROI.
 */

import type { FieldSpec, RoiConfig, SpecJson } from "./types";

/** ROI names that are geometry-only and should not become field ids */
const STRUCTURAL_ROI_NAMES = new Set([
  "header",
  "signatureBlock",
  "completionDetails",
]);

const CRITICAL_FIELD_IDS = new Set([
  "jobReference",
  "assetId",
  "date",
  "engineerSignOff",
]);

/** Canonical field ids implied by an ROI tool name (Studio aliases). */
function fieldsForRoiName(name: string): string[] {
  if (name === "tickboxBlock" || name === "complianceTickboxes") {
    return ["complianceTickboxes"];
  }
  if (name === "signatureBlock") {
    return ["engineerSignOff", "customerSignature"];
  }
  if (name === "engineerSignature") return ["engineerSignOff"];
  if (name === "nextServiceDate") return ["nextServiceDate", "expiryDate"];
  if (name === "expiryDate") return ["expiryDate", "nextServiceDate"];
  return [name];
}

function humanizeFieldId(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function inferFieldType(id: string): FieldSpec["type"] {
  if (/date|due|expir/i.test(id)) return "date";
  if (
    /torque|pressure|psi|duration|travel|mileage|hours|tread|depth|nm\b/i.test(
      id
    )
  ) {
    return "number";
  }
  if (
    /completed|needed|used|safe|overtime|signOff|signature/i.test(id) &&
    !/customerName|engineerName/i.test(id)
  ) {
    return "boolean";
  }
  if (/tickbox|checklist|complianceTickboxes/i.test(id)) return "list";
  return "string";
}

/**
 * Ensure every ROI-linked field id exists on the spec.
 * Returns a new spec when fields were added; otherwise the same reference.
 */
export function syncRoiFieldsIntoSpec(
  spec: SpecJson,
  roiJson: RoiConfig | null | undefined
): SpecJson {
  if (!roiJson?.regions?.length) return spec;

  const fields = [...(spec.fields ?? [])];
  const have = new Set(
    fields
      .map(f => (typeof f.field === "string" ? f.field : ""))
      .filter(Boolean)
  );
  let changed = false;

  for (const region of roiJson.regions) {
    if (!region?.name) continue;
    if ((region as { enabled?: boolean }).enabled === false) continue;

    const linked = new Set<string>();
    for (const f of region.fields ?? []) {
      if (f) linked.add(f);
    }
    for (const f of fieldsForRoiName(region.name)) {
      if (f) linked.add(f);
    }
    if (!STRUCTURAL_ROI_NAMES.has(region.name)) {
      linked.add(region.name);
    }

    for (const fieldId of Array.from(linked)) {
      if (!fieldId || STRUCTURAL_ROI_NAMES.has(fieldId) || have.has(fieldId)) {
        continue;
      }
      // tickboxBlock is structural for naming; field is complianceTickboxes
      if (fieldId === "tickboxBlock") continue;
      fields.push({
        field: fieldId,
        label: humanizeFieldId(fieldId),
        type: inferFieldType(fieldId),
        required: CRITICAL_FIELD_IDS.has(fieldId),
      });
      have.add(fieldId);
      changed = true;
    }
  }

  return changed ? { ...spec, fields } : spec;
}
