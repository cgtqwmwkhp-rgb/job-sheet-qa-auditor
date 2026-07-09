/**
 * PII Redaction Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default-off and pure redaction rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isRedactionEnabled,
  redactPii,
} from "../../services/redaction";

describe("PII Redaction Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_REDACTION unset", () => {
      expect(isRedactionEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_REDACTION=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isRedactionEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isRedactionEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isRedactionEnabled()).toBe(false);
    });
  });

  describe("redactPii", () => {
    it("returns unchanged text when no PII is present", () => {
      const input = "Job sheet passed QA with no contact details.";

      expect(redactPii(input)).toEqual({
        text: input,
        redacted: false,
      });
    });

    it("redacts email addresses", () => {
      const result = redactPii(
        "Contact engineer@plantexpand.co.uk for updates."
      );

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Contact [EMAIL] for updates.");
    });

    it("redacts UK-ish phone numbers with spaces", () => {
      const result = redactPii("Callback on 07123 456789 before close.");

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Callback on [PHONE] before close.");
    });

    it("redacts compact 10-digit phone numbers", () => {
      const result = redactPii("Alt line 02079460000.");

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Alt line [PHONE].");
    });

    it("redacts long digit runs of 12 or more as NUMBER", () => {
      const result = redactPii("Account ref 1234567890123456 attached.");

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Account ref [NUMBER] attached.");
    });

    it("prefers NUMBER over PHONE for 12+ digit sequences", () => {
      const result = redactPii("Serial 123456789012");

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Serial [NUMBER]");
    });

    it("redacts multiple PII types in one string", () => {
      const result = redactPii(
        "Email ops@example.com or call 07123 456789; ref 987654321098."
      );

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Email [EMAIL] or call [PHONE]; ref [NUMBER].");
    });

    it("does not mutate email local-part into phone redaction", () => {
      const result = redactPii("Reach user.name@example.com today.");

      expect(result.redacted).toBe(true);
      expect(result.text).toBe("Reach [EMAIL] today.");
    });

    it("handles empty input", () => {
      expect(redactPii("")).toEqual({ text: "", redacted: false });
    });
  });
});
