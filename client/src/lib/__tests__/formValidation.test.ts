/**
 * Unit tests for form validation functions
 */

import { describe, it, expect } from "vitest";
import {
  validateRequired,
  validateEmail,
  validateLength,
  validateNumber,
  validateUrl,
  validateFileSize,
  validatePassword,
  validateForm,
} from "../formValidation";

describe("formValidation", () => {
  describe("validateRequired", () => {
    it("should return error for null value", () => {
      expect(validateRequired(null, "Field")).toBe("Field is required");
    });

    it("should return error for empty string", () => {
      expect(validateRequired("", "Field")).toBe("Field is required");
    });

    it("should return error for whitespace-only string", () => {
      expect(validateRequired("   ", "Field")).toBe("Field cannot be empty");
    });

    it("should return null for valid value", () => {
      expect(validateRequired("value", "Field")).toBeNull();
    });
  });

  describe("validateEmail", () => {
    it("should return null for empty string", () => {
      expect(validateEmail("")).toBeNull();
    });

    it("should return error for invalid email", () => {
      expect(validateEmail("invalid")).toBe(
        "Please enter a valid email address"
      );
      expect(validateEmail("invalid@")).toBe(
        "Please enter a valid email address"
      );
      expect(validateEmail("@example.com")).toBe(
        "Please enter a valid email address"
      );
    });

    it("should return null for valid email", () => {
      expect(validateEmail("user@example.com")).toBeNull();
      expect(validateEmail("test+tag@domain.co.uk")).toBeNull();
    });
  });

  describe("validateLength", () => {
    it("should return error if too short", () => {
      expect(validateLength("ab", 3, undefined, "Field")).toBe(
        "Field must be at least 3 characters"
      );
    });

    it("should return error if too long", () => {
      expect(validateLength("abcdef", undefined, 5, "Field")).toBe(
        "Field must be no more than 5 characters"
      );
    });

    it("should return null for valid length", () => {
      expect(validateLength("abc", 2, 5, "Field")).toBeNull();
    });
  });

  describe("validateNumber", () => {
    it("should return error for NaN", () => {
      expect(validateNumber(NaN, undefined, undefined, "Value")).toBe(
        "Value must be a valid number"
      );
    });

    it("should return error if below minimum", () => {
      expect(validateNumber(5, 10, undefined, "Value")).toBe(
        "Value must be at least 10"
      );
    });

    it("should return error if above maximum", () => {
      expect(validateNumber(15, undefined, 10, "Value")).toBe(
        "Value must be no more than 10"
      );
    });

    it("should return null for valid number", () => {
      expect(validateNumber(7, 5, 10, "Value")).toBeNull();
    });
  });

  describe("validateUrl", () => {
    it("should return null for empty string", () => {
      expect(validateUrl("")).toBeNull();
    });

    it("should return error for invalid URL", () => {
      expect(validateUrl("not-a-url")).toBe(
        "Please enter a valid URL (e.g., https://example.com)"
      );
    });

    it("should return null for valid URL", () => {
      expect(validateUrl("https://example.com")).toBeNull();
      expect(validateUrl("http://localhost:3000")).toBeNull();
    });
  });

  describe("validateFileSize", () => {
    it("should return error if file too large", () => {
      const file = new File(["a".repeat(6 * 1024 * 1024)], "test.pdf");
      expect(validateFileSize(file, 5)).toBe("File size must be less than 5MB");
    });

    it("should return null if file size OK", () => {
      const file = new File(["content"], "test.pdf");
      expect(validateFileSize(file, 5)).toBeNull();
    });
  });

  describe("validatePassword", () => {
    it("should return error if too short", () => {
      expect(validatePassword("Short1")).toBe(
        "Password must be at least 8 characters"
      );
    });

    it("should return error if missing uppercase", () => {
      expect(validatePassword("password123")).toBe(
        "Password must contain at least one uppercase letter"
      );
    });

    it("should return error if missing lowercase", () => {
      expect(validatePassword("PASSWORD123")).toBe(
        "Password must contain at least one lowercase letter"
      );
    });

    it("should return error if missing number", () => {
      expect(validatePassword("Password")).toBe(
        "Password must contain at least one number"
      );
    });

    it("should return null for valid password", () => {
      expect(validatePassword("Password123")).toBeNull();
    });
  });

  describe("validateForm", () => {
    it("should validate entire form", () => {
      const values = {
        email: "invalid",
        name: "",
      };

      const validators = {
        email: validateEmail,
        name: (val: string) => validateRequired(val, "Name"),
      };

      const result = validateForm(values, validators);

      expect(result.valid).toBe(false);
      expect(result.errors.email).toBeDefined();
      expect(result.errors.name).toBeDefined();
    });

    it("should return valid result for good data", () => {
      const values = {
        email: "user@example.com",
        name: "John Doe",
      };

      const validators = {
        email: validateEmail,
        name: (val: string) => validateRequired(val, "Name"),
      };

      const result = validateForm(values, validators);

      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });
});
