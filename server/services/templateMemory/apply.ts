import type { MemoryAppliedEntry } from "./types";
import { isTemplateMemoryApplyEnabled } from "./types";
import { loadApplicableMemory } from "./store";

export interface ExtractedFieldLike {
  field: string;
  value: string;
  confidence?: number;
  pageNumber?: number;
}

/**
 * H2: apply value_alias / ocr_hint memory to extracted fields (in-place copy).
 */
export function applyValueMemoryToFields(
  fields: ExtractedFieldLike[],
  memory: Awaited<ReturnType<typeof loadApplicableMemory>>
): { fields: ExtractedFieldLike[]; applied: MemoryAppliedEntry[] } {
  const applied: MemoryAppliedEntry[] = [];
  if (!memory.length) return { fields, applied };

  const aliases = memory.filter(
    m => m.memoryKind === "value_alias" || m.memoryKind === "ocr_hint"
  );
  if (!aliases.length) return { fields, applied };

  const next = fields.map(f => {
    for (const m of aliases) {
      if (m.fieldKey !== f.field) continue;
      const payload = m.payloadJson as {
        from?: string | null;
        to?: string | null;
      };
      if (
        payload?.to &&
        payload.from != null &&
        String(f.value).trim() === String(payload.from).trim()
      ) {
        applied.push({
          candidateId: m.id,
          memoryKind: m.memoryKind,
          fieldKey: m.fieldKey,
          ruleId: m.ruleId ?? null,
          effect: `alias:${payload.from}->${payload.to}`,
          promotionStatus: m.promotionStatus,
        });
        return { ...f, value: String(payload.to) };
      }
    }
    return f;
  });

  return { fields: next, applied };
}

/**
 * H4: soft-suppress findings whose ruleId is in suppress_rule memory.
 * Never drops S0; caller passes severity.
 */
export function filterFindingsWithRuleMemory<
  T extends { ruleId?: string | null; severity?: string },
>(
  findings: T[],
  memory: Awaited<ReturnType<typeof loadApplicableMemory>>
): { findings: T[]; applied: MemoryAppliedEntry[] } {
  const applied: MemoryAppliedEntry[] = [];
  const suppress = memory.filter(m => m.memoryKind === "suppress_rule");
  if (!suppress.length) return { findings, applied };

  const suppressRules = new Set(
    suppress.map(m => m.ruleId).filter((r): r is string => Boolean(r))
  );
  if (!suppressRules.size) return { findings, applied };

  const kept: T[] = [];
  for (const f of findings) {
    const ruleId = f.ruleId ?? null;
    if (ruleId && suppressRules.has(ruleId) && f.severity !== "S0") {
      const m = suppress.find(x => x.ruleId === ruleId)!;
      applied.push({
        candidateId: m.id,
        memoryKind: "suppress_rule",
        fieldKey: m.fieldKey,
        ruleId,
        effect: "soft_suppress_finding",
        promotionStatus: m.promotionStatus,
      });
      continue;
    }
    kept.push(f);
  }
  return { findings: kept, applied };
}

export async function loadMemoryForPipeline(templateId: number | null) {
  if (!isTemplateMemoryApplyEnabled()) return [];
  if (templateId == null) return [];
  return loadApplicableMemory(templateId);
}
