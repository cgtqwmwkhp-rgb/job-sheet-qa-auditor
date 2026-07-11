import { describe, expect, it } from "vitest";
import {
  extractAzureRoleClaims,
  mapAzureRolesToDbRole,
  resolveAzureAuthRole,
} from "../../_core/azureRoles";

describe("azureRoles", () => {
  describe("mapAzureRolesToDbRole", () => {
    it("maps admin aliases", () => {
      expect(mapAzureRolesToDbRole(["Admin"])).toBe("admin");
      expect(mapAzureRolesToDbRole(["administrator"])).toBe("admin");
    });

    it("maps qa lead aliases", () => {
      expect(mapAzureRolesToDbRole(["QA Lead"])).toBe("qa_lead");
      expect(mapAzureRolesToDbRole(["qa_lead"])).toBe("qa_lead");
      expect(mapAzureRolesToDbRole(["reviewer"])).toBe("qa_lead");
    });

    it("maps technician and viewer", () => {
      expect(mapAzureRolesToDbRole(["Technician"])).toBe("technician");
      expect(mapAzureRolesToDbRole(["viewer"])).toBe("user");
    });

    it("prefers admin over other roles", () => {
      expect(mapAzureRolesToDbRole(["qa_lead", "admin"])).toBe("admin");
    });

    it("returns undefined for empty or unknown claims", () => {
      expect(mapAzureRolesToDbRole([])).toBeUndefined();
      expect(mapAzureRolesToDbRole(["something-else"])).toBeUndefined();
    });
  });

  describe("extractAzureRoleClaims", () => {
    it("reads roles claims and userRoles", () => {
      expect(
        extractAzureRoleClaims({
          userRoles: ["qa_lead"],
          claims: [
            { typ: "roles", val: "admin" },
            { typ: "name", val: "ignore" },
          ],
        })
      ).toEqual(["admin", "qa_lead"]);
    });
  });

  describe("resolveAzureAuthRole", () => {
    it("uses explicit claims when present", () => {
      expect(
        resolveAzureAuthRole({
          roleClaims: ["technician"],
          existingRole: "user",
          isNewUser: false,
        })
      ).toBe("technician");
    });

    it("defaults new users without claims to qa_lead", () => {
      expect(
        resolveAzureAuthRole({
          roleClaims: [],
          isNewUser: true,
        })
      ).toBe("qa_lead");
    });

    it("promotes stuck default user role to qa_lead", () => {
      expect(
        resolveAzureAuthRole({
          roleClaims: [],
          existingRole: "user",
          isNewUser: false,
        })
      ).toBe("qa_lead");
    });

    it("leaves admin/qa_lead/technician unchanged when no claims", () => {
      expect(
        resolveAzureAuthRole({
          roleClaims: [],
          existingRole: "admin",
          isNewUser: false,
        })
      ).toBeUndefined();
      expect(
        resolveAzureAuthRole({
          roleClaims: [],
          existingRole: "qa_lead",
          isNewUser: false,
        })
      ).toBeUndefined();
    });
  });
});
