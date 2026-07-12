/**
 * Best-effort durable JSON blobs for Template Studio control-plane state.
 * Survives restarts when blob/local storage is available (no schema migration).
 */

import { getStorageAdapter } from "../../storage";

async function putJson(key: string, value: unknown): Promise<void> {
  try {
    const storage = getStorageAdapter();
    await storage.put(
      key,
      Buffer.from(JSON.stringify(value), "utf8"),
      "application/json"
    );
  } catch (err) {
    console.warn(
      `[TemplateStudio] Failed to persist ${key}:`,
      err instanceof Error ? err.message : err
    );
  }
}

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const storage = getStorageAdapter();
    const { url } = await storage.get(key);
    let raw: string;
    if (url.startsWith("file://")) {
      const { readFile } = await import("fs/promises");
      raw = await readFile(url.replace("file://", ""), "utf8");
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      raw = await res.text();
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function sampleMetaKey(versionId: number): string {
  return `template-studio/samples/${versionId}.json`;
}

export function promoteKey(promoteId: string): string {
  return `template-studio/promotes/${promoteId}.json`;
}

export function overrideKey(jobSheetId: number): string {
  return `template-studio/overrides/${jobSheetId}.json`;
}

export async function persistStudioJson(
  key: string,
  value: unknown
): Promise<void> {
  await putJson(key, value);
}

export async function loadStudioJson<T>(key: string): Promise<T | null> {
  return getJson<T>(key);
}
