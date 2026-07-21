/**
 * Contract: post-deploy chunk load recovery helpers.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("lazyRetry chunk recovery", () => {
  it("ships isChunkLoadError + reloadOnce + lazyRetry", () => {
    const p = path.resolve(__dirname, "../../../client/src/lib/lazyRetry.ts");
    const src = fs.readFileSync(p, "utf-8");
    expect(src).toContain("Failed to fetch dynamically imported module");
    expect(src).toContain("reloadOnceForChunkError");
    expect(src).toContain("export function lazyRetry");
  });

  it("App uses lazyRetry for AuditResults (and other routes)", () => {
    const p = path.resolve(__dirname, "../../../client/src/App.tsx");
    const src = fs.readFileSync(p, "utf-8");
    expect(src).toContain('from "@/lib/lazyRetry"');
    expect(src).toContain('lazyRetry(() => import("./pages/AuditResults"))');
    expect(src).not.toMatch(/const AuditResults = lazy\(/);
  });

  it("ErrorBoundary auto-reloads on chunk load errors", () => {
    const p = path.resolve(
      __dirname,
      "../../../client/src/components/ErrorBoundary.tsx"
    );
    const src = fs.readFileSync(p, "utf-8");
    expect(src).toContain("reloadOnceForChunkError");
    expect(src).toContain("isChunkLoadError");
  });
});
