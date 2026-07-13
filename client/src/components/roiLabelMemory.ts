/**
 * Cross-template memory for custom Draw labels.
 * Persists in localStorage so authors reuse the same field ids on the next template.
 */

export const ROI_LABEL_MEMORY_KEY = "jsqa.roiLabelMemory.v1";

export interface RememberedRoiLabel {
  id: string;
  label: string;
  color: string;
  critical: boolean;
  /** Optional field type for new templates */
  type?: string;
  updatedAt: string;
}

interface MemoryStore {
  version: 1;
  labels: RememberedRoiLabel[];
}

const MAX_LABELS = 80;

function emptyStore(): MemoryStore {
  return { version: 1, labels: [] };
}

function getStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    if (g.localStorage && typeof g.localStorage.getItem === "function") {
      return g.localStorage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readStore(): MemoryStore {
  const storage = getStorage();
  if (!storage) return emptyStore();
  try {
    const raw = storage.getItem(ROI_LABEL_MEMORY_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as MemoryStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.labels)) {
      return emptyStore();
    }
    return {
      version: 1,
      labels: parsed.labels.filter(
        l => l && typeof l.id === "string" && typeof l.label === "string"
      ),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: MemoryStore): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(ROI_LABEL_MEMORY_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Load remembered custom labels (newest first). */
export function loadRememberedRoiLabels(): RememberedRoiLabel[] {
  return [...readStore().labels].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

/** Upsert a custom label into cross-template memory. */
export function rememberRoiLabel(
  entry: Omit<RememberedRoiLabel, "updatedAt"> & { updatedAt?: string }
): RememberedRoiLabel[] {
  const store = readStore();
  const updatedAt = entry.updatedAt ?? new Date().toISOString();
  const next: RememberedRoiLabel = {
    id: entry.id,
    label: entry.label,
    color: entry.color,
    critical: Boolean(entry.critical),
    type: entry.type,
    updatedAt,
  };
  const without = store.labels.filter(l => l.id !== next.id);
  const labels = [next, ...without].slice(0, MAX_LABELS);
  writeStore({ version: 1, labels });
  return labels;
}

/** Remove one remembered label (optional UI later). */
export function forgetRoiLabel(id: string): RememberedRoiLabel[] {
  const store = readStore();
  const labels = store.labels.filter(l => l.id !== id);
  writeStore({ version: 1, labels });
  return labels;
}

/**
 * Ensure a field exists on the current template specJson.
 * Returns updated JSON text, or null if unchanged / unparseable empty.
 */
export function ensureSpecField(
  specJsonText: string | undefined,
  field: { field: string; label: string; type?: string; required?: boolean }
): string | null {
  const raw = (specJsonText ?? "").trim();
  let spec: Record<string, unknown>;
  if (!raw) {
    spec = {
      name: "Draft Spec",
      version: "1.0.0",
      fields: [],
      rules: [],
    };
  } else {
    try {
      spec = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const fields = Array.isArray(spec.fields)
    ? ([...spec.fields] as Array<Record<string, unknown>>)
    : [];
  const exists = fields.some(
    f =>
      typeof f?.field === "string" &&
      f.field.toLowerCase() === field.field.toLowerCase()
  );
  if (exists) return null;

  fields.push({
    field: field.field,
    label: field.label,
    type: field.type ?? "string",
    required: field.required ?? false,
  });
  spec.fields = fields;
  return JSON.stringify(spec, null, 2);
}
