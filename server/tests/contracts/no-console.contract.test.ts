import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as path from "path";

/**
 * Contract Test: No console.log in server runtime code
 * 
 * This test enforces logging discipline by ensuring that console.log/warn/error
 * are not used directly in server runtime code. All logging should go through
 * the safeLogger utility to ensure:
 * 1. Consistent log formatting
 * 2. PII redaction
 * 3. Structured logging
 * 
 * Exceptions:
 * - Test files (*.test.ts, test/*.ts)
 * - The safeLogger utility itself
 * - The requestLogger utility (which wraps console for structured output)
 */
describe("Logging Discipline Contract", () => {
  const serverDir = path.resolve(__dirname, "../..");

  it("should not use console.log in server runtime code (except allowed files)", () => {
    // Files that are allowed to use console.* directly
    const allowedPatterns = [
      "safeLogger.ts",      // The logger itself
      "requestLogger.ts",   // Structured request logging wrapper
      "index.ts",           // Server startup message (acceptable)
      "_core/index.ts",     // Server startup message (acceptable)
      "vite.ts",            // Dev-only Vite integration (acceptable)
      "voiceTranscription.ts", // Documentation comments only (acceptable)
    ];

    // Find all console.* usage in server code
    const grepCommand = `grep -rn "console\\." ${serverDir} --include="*.ts" | grep -v "node_modules" | grep -v ".test.ts" | grep -v "/test/" | grep -v "/tests/"`;
    
    let output = "";
    try {
      output = execSync(grepCommand, { encoding: "utf-8" });
    } catch (error: any) {
      // grep returns exit code 1 if no matches found, which is what we want
      if (error.status === 1) {
        output = "";
      } else {
        throw error;
      }
    }

    if (!output.trim()) {
      // No console.* usage found - test passes
      return;
    }

    // Filter out allowed files
    const violations = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => {
        return !allowedPatterns.some((pattern) => line.includes(pattern));
      });

    // Report violations
    if (violations.length > 0) {
      const violationList = violations.slice(0, 20).join("\n");
      const truncated = violations.length > 20 ? `\n... and ${violations.length - 20} more` : "";
      
      expect.fail(
        `Found ${violations.length} console.* usage(s) in server code that should use safeLogger instead:\n\n${violationList}${truncated}\n\n` +
        `To fix: Replace console.log/warn/error with createSafeLogger() from server/utils/safeLogger.ts`
      );
    }
  });

  it("should have safeLogger available for use", async () => {
    const { createSafeLogger } = await import("../../utils/safeLogger");
    
    expect(typeof createSafeLogger).toBe("function");
    
    const logger = createSafeLogger("TestService");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should redact OCR/document content in safeLogger", async () => {
    const { checkLoggingSafety } = await import("../../utils/safeLogger");
    
    // Test with forbidden fields (OCR/document content)
    const unsafeData = {
      markdown: "This is raw OCR text that should be redacted",
      rawText: "More raw text",
      extractedText: "Extracted document content",
    };
    
    const warnings = checkLoggingSafety(unsafeData);
    
    // Should detect forbidden OCR/document fields
    expect(warnings.length).toBe(3);
    expect(warnings).toContain('markdown');
    expect(warnings).toContain('rawText');
    expect(warnings).toContain('extractedText');
  });
});
