/**
 * Object-Level Authorization Utilities
 *
 * These functions enforce access control at the individual resource level,
 * ensuring users can only access resources they own or have permission to view.
 *
 * Security Note: Role-based checks (admin, QA lead) are handled in tRPC middleware.
 * These utilities add a second layer: object-level ownership and visibility.
 */

import { TRPCError } from "@trpc/server";
import type { DbUserRole } from "../_core/azureRoles";

export interface ResourceOwnership {
  /** The user ID who created or owns this resource */
  createdById?: number | null;
  uploadedById?: number | null;
  /** Schema field on job_sheets */
  uploadedBy?: number | null;
  userId?: number | null;
  /** Attributed technician on job_sheets (portal evidence / disputes) */
  technicianId?: number | null;
  [key: string]: unknown; // Allow additional properties from full objects
}

/** Resolve owner user id across schema / DTO naming variants. */
export function resolveResourceOwnerId(
  resource: ResourceOwnership | null | undefined
): number | null {
  if (!resource) return null;
  const candidates = [
    resource.createdById,
    resource.uploadedById,
    resource.uploadedBy,
    resource.userId,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

/**
 * Check if a user can access a job sheet.
 *
 * Access rules:
 * - Admins and QA leads can access all job sheets
 * - Attributed technicians can access their job sheets
 * - Regular users can only access their own uploads
 *
 * @throws TRPCError with code FORBIDDEN if access denied
 */
export function enforceJobSheetAccess(
  resource: ResourceOwnership | null | undefined,
  currentUser: { id: number; role: DbUserRole }
): void {
  if (!resource) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Job sheet not found",
    });
  }

  // Admins and QA leads have global access
  if (currentUser.role === "admin" || currentUser.role === "qa_lead") {
    return;
  }

  // Attributed technicians can access their own job sheets (portal evidence)
  if (
    currentUser.role === "technician" &&
    typeof resource.technicianId === "number" &&
    resource.technicianId === currentUser.id
  ) {
    return;
  }

  // Regular users can only access their own uploads
  const ownerId = resolveResourceOwnerId(resource);
  if (!ownerId || ownerId !== currentUser.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to access this job sheet",
    });
  }
}

/**
 * Check if a user can access an audit.
 *
 * Access rules:
 * - Admins and QA leads can access all audits
 * - Attributed technicians can access audits for their job sheets
 * - Regular users can only access audits for job sheets they uploaded
 *
 * @throws TRPCError with code FORBIDDEN if access denied
 */
export function enforceAuditAccess(
  auditResource: { jobSheetId: number } | null | undefined,
  jobSheetResource: ResourceOwnership | null | undefined,
  currentUser: { id: number; role: DbUserRole }
): void {
  if (!auditResource) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Audit not found",
    });
  }

  // Admins and QA leads have global access
  if (currentUser.role === "admin" || currentUser.role === "qa_lead") {
    return;
  }

  // For regular users, check if they own the underlying job sheet
  if (!jobSheetResource) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to access this audit",
    });
  }

  if (
    currentUser.role === "technician" &&
    typeof jobSheetResource.technicianId === "number" &&
    jobSheetResource.technicianId === currentUser.id
  ) {
    return;
  }

  const ownerId = resolveResourceOwnerId(jobSheetResource);
  if (!ownerId || ownerId !== currentUser.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to access this audit",
    });
  }
}

/**
 * Check if a user can access another user's profile.
 *
 * Access rules:
 * - Admins can access all profiles
 * - Users can access their own profile
 * - QA leads can access profiles of users they manage (not implemented yet)
 *
 * @throws TRPCError with code FORBIDDEN if access denied
 */
export function enforceUserProfileAccess(
  targetUserId: number,
  currentUser: { id: number; role: DbUserRole }
): void {
  // Admins have global access
  if (currentUser.role === "admin") {
    return;
  }

  // Users can access their own profile
  if (targetUserId === currentUser.id) {
    return;
  }

  // For now, restrict access to own profile only (expand for QA lead hierarchy later)
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You do not have permission to access this user profile",
  });
}

/**
 * Filter a list of job sheets to only those the user can access.
 *
 * This is used for list endpoints where we want to show a subset
 * rather than throwing an error.
 */
export function filterJobSheetsByAccess<T extends ResourceOwnership>(
  resources: T[],
  currentUser: { id: number; role: DbUserRole }
): T[] {
  // Admins and QA leads see everything
  if (currentUser.role === "admin" || currentUser.role === "qa_lead") {
    return resources;
  }

  // Technicians see attributed sheets; others see their own uploads
  return resources.filter(r => {
    if (
      currentUser.role === "technician" &&
      typeof r.technicianId === "number" &&
      r.technicianId === currentUser.id
    ) {
      return true;
    }
    const ownerId = resolveResourceOwnerId(r);
    return ownerId === currentUser.id;
  });
}
