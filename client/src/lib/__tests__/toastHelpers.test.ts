/**
 * Unit tests for toast helper functions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  showSuccessToast,
  showErrorToast,
  showUploadSuccessToast,
  showSaveSuccessToast,
  showPermissionErrorToast,
} from "../toastHelpers";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
  },
}));

describe("toastHelpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("showSuccessToast", () => {
    it("should call toast.success with message", () => {
      showSuccessToast("Operation successful");
      expect(toast.success).toHaveBeenCalledWith(
        "Operation successful",
        expect.objectContaining({ duration: 2500 })
      );
    });

    it("should include description when provided", () => {
      showSuccessToast("Saved", "Your changes have been saved");
      expect(toast.success).toHaveBeenCalledWith(
        "Saved",
        expect.objectContaining({
          description: "Your changes have been saved",
        })
      );
    });
  });

  describe("showErrorToast", () => {
    it("should call toast.error with longer duration", () => {
      showErrorToast("Operation failed");
      expect(toast.error).toHaveBeenCalledWith(
        "Operation failed",
        expect.objectContaining({ duration: 6000 })
      );
    });
  });

  describe("showUploadSuccessToast", () => {
    it("should show single file upload message", () => {
      showUploadSuccessToast("document.pdf", 1);
      expect(toast.success).toHaveBeenCalledWith(
        "Upload successful",
        expect.objectContaining({
          description: '"document.pdf" uploaded',
        })
      );
    });

    it("should show multiple files upload message", () => {
      showUploadSuccessToast("", 5);
      expect(toast.success).toHaveBeenCalledWith(
        "Upload successful",
        expect.objectContaining({
          description: "5 files uploaded successfully",
        })
      );
    });
  });

  describe("showSaveSuccessToast", () => {
    it("should show default save message", () => {
      showSaveSuccessToast();
      expect(toast.success).toHaveBeenCalledWith(
        "Changes saved",
        expect.any(Object)
      );
    });

    it("should show custom item type", () => {
      showSaveSuccessToast("User profile");
      expect(toast.success).toHaveBeenCalledWith(
        "User profile saved",
        expect.any(Object)
      );
    });
  });

  describe("showPermissionErrorToast", () => {
    it("should show permission denied message", () => {
      showPermissionErrorToast();
      expect(toast.error).toHaveBeenCalledWith(
        "Permission denied",
        expect.objectContaining({
          description: "You don't have permission to perform this action",
        })
      );
    });
  });
});
