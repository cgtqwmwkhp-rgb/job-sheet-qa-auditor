/**
 * Contract: L3 photo-pair and Parts Used artifacts have queryable tables while
 * reportJson stays available for legacy report readers.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("normalized evidence entities contract", () => {
  it("declares photo pairs and parts lines in migration and Drizzle schema", () => {
    const migration = readFileSync(
      path.join(repoRoot, "drizzle/0015_photo_parts_entities.sql"),
      "utf8"
    );
    const schema = readFileSync(
      path.join(repoRoot, "drizzle/schema.ts"),
      "utf8"
    );

    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS `photo_evidence_pairs`"
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `parts_lines`");
    expect(migration).toContain("UNIQUE(`auditResultId`,`pairIndex`)");
    expect(migration).toContain("UNIQUE(`auditResultId`,`lineIndex`)");
    expect(schema).toContain('mysqlTable(\n  "photo_evidence_pairs"');
    expect(schema).toContain('mysqlTable(\n  "parts_lines"');
  });

  it("persists normalized artifacts fail-soft after audit creation", () => {
    const processor = readFileSync(
      path.join(repoRoot, "server/services/documentProcessor.ts"),
      "utf8"
    );
    expect(processor).toContain("persistAuditEvidenceEntities");
    expect(processor).toContain(
      "Failed to persist normalized evidence entities (non-fatal)"
    );
    expect(processor).toContain("photoPairCompare: photoPairCompareArtifact");
    expect(processor).toContain("parts: partsLinesToPersist");
    expect(processor).toContain("photoPairCompare: photoPairCompareArtifact");
  });
});
