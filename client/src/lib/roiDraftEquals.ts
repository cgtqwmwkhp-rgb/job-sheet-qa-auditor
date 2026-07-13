/**
 * Structural equality for ROI drafts.
 * Used to skip setState when RoiEditor notifies with an equivalent payload,
 * preventing React error #185 (maximum update depth exceeded).
 */
export function roiDraftEquals(
  a:
    | {
        regions: Array<{
          name: string;
          page: number;
          bounds: { x: number; y: number; width: number; height: number };
          fields?: string[];
          enabled?: boolean;
        }>;
      }
    | null
    | undefined,
  b:
    | {
        regions: Array<{
          name: string;
          page: number;
          bounds: { x: number; y: number; width: number; height: number };
          fields?: string[];
          enabled?: boolean;
        }>;
      }
    | null
    | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.regions.length !== b.regions.length) return false;
  for (let i = 0; i < a.regions.length; i++) {
    const ra = a.regions[i];
    const rb = b.regions[i];
    if (
      ra.name !== rb.name ||
      ra.page !== rb.page ||
      ra.enabled !== rb.enabled ||
      ra.bounds.x !== rb.bounds.x ||
      ra.bounds.y !== rb.bounds.y ||
      ra.bounds.width !== rb.bounds.width ||
      ra.bounds.height !== rb.bounds.height
    ) {
      return false;
    }
    const fa = ra.fields ?? [];
    const fb = rb.fields ?? [];
    if (fa.length !== fb.length) return false;
    for (let j = 0; j < fa.length; j++) {
      if (fa[j] !== fb[j]) return false;
    }
  }
  return true;
}
