/**
 * Startup contract: durable queue recovery must be reached by the server boot
 * path so jobs left running by a process exit can be reclaimed.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("durable job queue boot recovery contract", () => {
  it("awaits queue initialization and fails open during server startup", () => {
    const indexSrc = readFileSync(
      path.join(repoRoot, "server/_core/index.ts"),
      "utf8"
    );

    expect(indexSrc).toMatch(
      /import\s*\{\s*initJobSheetProcessingQueue\s*\}\s*from\s*["']\.\.\/services\/jobQueue["']/
    );
    expect(indexSrc).toMatch(
      /try\s*\{\s*await initJobSheetProcessingQueue\(\);\s*\}\s*catch\s*\(error\)\s*\{\s*console\.warn\("\[JobQueue\] Boot recovery skipped:", error\);/s
    );
  });
});
