/**
 * Soft Delete Utilities
 * 
 * Framework for soft delete pattern across the application.
 * Provides type-safe helpers for implementing recoverable deletions.
 * 
 * @module softDelete
 * 
 * NOTE: Full implementation requires database migration to add `deletedAt` columns.
 * This file provides the interface and helper functions for when migrations are applied.
 * 
 * @example
 * // Check if record is deleted
 * if (isDeleted(record)) {
 *   console.log("Record was deleted");
 * }
 * 
 * // Filter active records only
 * const activeRecords = filterActive(allRecords);
 * 
 * // Create deletion metadata
 * const metadata = createSoftDeleteMetadata(userId, "User requested deletion");
 * 
 * Migration needed:
 * ```sql
 * ALTER TABLE job_sheets ADD COLUMN deletedAt TIMESTAMP NULL;
 * ALTER TABLE audit_results ADD COLUMN deletedAt TIMESTAMP NULL;
 * ALTER TABLE audit_findings ADD COLUMN deletedAt TIMESTAMP NULL;
 * ALTER TABLE disputes ADD COLUMN deletedAt TIMESTAMP NULL;
 * ALTER TABLE waivers ADD COLUMN deletedAt TIMESTAMP NULL;
 * ALTER TABLE gold_specs ADD COLUMN deletedAt TIMESTAMP NULL;
 * -- Add indexes for performance
 * CREATE INDEX idx_job_sheets_deleted_at ON job_sheets(deletedAt);
 * CREATE INDEX idx_audit_results_deleted_at ON audit_results(deletedAt);
 * ```
 */

/**
 * Check if a record is soft-deleted (has a deletedAt timestamp).
 */
export function isDeleted(record: { deletedAt?: Date | null }): boolean {
  return record.deletedAt != null;
}

/**
 * Check if a record is active (not soft-deleted).
 */
export function isActive(record: { deletedAt?: Date | null }): boolean {
  return record.deletedAt == null;
}

/**
 * Filter array to only active (non-deleted) records.
 */
export function filterActive<T extends { deletedAt?: Date | null }>(
  records: T[]
): T[] {
  return records.filter(isActive);
}

/**
 * Filter array to only deleted records.
 */
export function filterDeleted<T extends { deletedAt?: Date | null }>(
  records: T[]
): T[] {
  return records.filter(isDeleted);
}

/**
 * Soft delete metadata for audit trail.
 */
export interface SoftDeleteMetadata {
  deletedAt: Date;
  deletedBy: number;
  deletionReason?: string;
}

/**
 * Restore metadata for audit trail.
 */
export interface RestoreMetadata {
  restoredAt: Date;
  restoredBy: number;
  restoreReason?: string;
}

/**
 * Create soft delete metadata object.
 */
export function createSoftDeleteMetadata(
  userId: number,
  reason?: string
): SoftDeleteMetadata {
  return {
    deletedAt: new Date(),
    deletedBy: userId,
    deletionReason: reason,
  };
}

/**
 * Create restore metadata object.
 */
export function createRestoreMetadata(
  userId: number,
  reason?: string
): RestoreMetadata {
  return {
    restoredAt: new Date(),
    restoredBy: userId,
    restoreReason: reason,
  };
}

/**
 * SQL fragment for filtering active records (add to WHERE clause).
 * Usage: `WHERE ${activeRecordsFilter('table_name')}`
 */
export function activeRecordsFilter(tableName: string): string {
  return `${tableName}.deletedAt IS NULL`;
}

/**
 * SQL fragment for filtering deleted records (add to WHERE clause).
 * Usage: `WHERE ${deletedRecordsFilter('table_name')}`
 */
export function deletedRecordsFilter(tableName: string): string {
  return `${tableName}.deletedAt IS NOT NULL`;
}

/**
 * Drizzle ORM filter for active records.
 * Usage: `.where(isNull(table.deletedAt))`
 */
export { isNull, isNotNull } from "drizzle-orm";

// TODO: Add these functions to db.ts once migration is applied:
// - softDeleteJobSheet(id: number, deletedBy: number, reason?: string)
// - restoreJobSheet(id: number, restoredBy: number, reason?: string)
// - softDeleteAuditResult(id: number, deletedBy: number, reason?: string)
// - restoreAuditResult(id: number, restoredBy: number, reason?: string)
// - getDeletedJobSheets(options?: QueryOptions)
// - getDeletedAuditResults(options?: QueryOptions)

/**
 * IMPLEMENTATION GUIDE:
 * 
 * 1. Create migration to add deletedAt columns
 * 2. Update all SELECT queries to filter WHERE deletedAt IS NULL by default
 * 3. Add softDelete* functions that UPDATE deletedAt = NOW()
 * 4. Add restore* functions that UPDATE deletedAt = NULL
 * 5. Add admin endpoints to view/restore deleted records
 * 6. Update authorization to prevent access to deleted records
 * 7. Add cascade soft delete logic (e.g., deleting job sheet soft-deletes audits)
 * 8. Add periodic cleanup job to hard-delete old soft-deleted records (30+ days)
 */
