/**
 * Field correction diff types (Phase 3.x)
 *
 * Pure before/after field comparison — no documentProcessor coupling.
 */

export interface FieldDiff {
  fieldKey: string;
  before: string;
  after: string;
  changed: boolean;
}
