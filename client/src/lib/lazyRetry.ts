import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_KEY = "jsqa_chunk_reload";

/**
 * Detect Vite/webpack chunk-load failures after a deploy (stale index → old hash).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

/**
 * One-shot hard reload when a stale JS chunk fails to load after deploy.
 * Returns true if a reload was triggered.
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(error)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // sessionStorage blocked — still attempt one reload
  }
  window.location.reload();
  return true;
}

/** Clear the one-shot flag after a successful navigation/boot. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // ignore
  }
}

/**
 * React.lazy wrapper that retries once, then triggers a hard reload on
 * persistent chunk-load failure (stale deploy).
 */
export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      clearChunkReloadFlag();
      return mod;
    } catch (first) {
      if (!isChunkLoadError(first)) throw first;
      // Brief pause then retry — covers transient network blips
      await new Promise(r => setTimeout(r, 250));
      try {
        const mod = await factory();
        clearChunkReloadFlag();
        return mod;
      } catch (second) {
        reloadOnceForChunkError(second);
        throw second;
      }
    }
  });
}
