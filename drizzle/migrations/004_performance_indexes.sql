-- Performance Optimization Indexes
-- Generated: 2026-07-12
-- Purpose: Add indexes to improve query performance across critical tables

-- Job Sheets Indexes
-- Improves filtering by status, user, and date
CREATE INDEX IF NOT EXISTS idx_job_sheets_status ON job_sheets(status);
CREATE INDEX IF NOT EXISTS idx_job_sheets_uploaded_by ON job_sheets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_job_sheets_created_at ON job_sheets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_sheets_status_uploaded_by ON job_sheets(status, uploaded_by);
CREATE INDEX IF NOT EXISTS idx_job_sheets_technician_id ON job_sheets(technician_id);

-- Audit Results Indexes
-- Improves lookups by job sheet and filtering by result
CREATE INDEX IF NOT EXISTS idx_audit_results_job_sheet_id ON audit_results(job_sheet_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_result ON audit_results(result);
CREATE INDEX IF NOT EXISTS idx_audit_results_created_at ON audit_results(created_at DESC);

-- Audit Findings Indexes
-- Improves lookups by audit result and filtering by status/severity
CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_result_id ON audit_findings(audit_result_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings(severity);
CREATE INDEX IF NOT EXISTS idx_audit_findings_resolution_status ON audit_findings(resolution_status);
CREATE INDEX IF NOT EXISTS idx_audit_findings_result_status ON audit_findings(audit_result_id, resolution_status);

-- Disputes Indexes
-- Improves lookups by finding, technician, reviewer, and status
CREATE INDEX IF NOT EXISTS idx_disputes_finding_id ON disputes(audit_finding_id);
CREATE INDEX IF NOT EXISTS idx_disputes_technician_id ON disputes(technician_id);
CREATE INDEX IF NOT EXISTS idx_disputes_reviewer_id ON disputes(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created_at ON disputes(created_at DESC);

-- System Audit Log Indexes
-- Improves audit trail queries by user and entity type
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON system_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON system_audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON system_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_entity ON system_audit_log(user_id, entity_type, created_at DESC);

-- Gold Specs Indexes
-- Improves spec selection and filtering
CREATE INDEX IF NOT EXISTS idx_gold_specs_active ON gold_specs(is_active);
CREATE INDEX IF NOT EXISTS idx_gold_specs_type ON gold_specs(spec_type);
CREATE INDEX IF NOT EXISTS idx_gold_specs_parent ON gold_specs(parent_spec_id);

-- Users Indexes
-- Improves user lookups by role and email
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Analyze tables to update query planner statistics
ANALYZE TABLE job_sheets;
ANALYZE TABLE audit_results;
ANALYZE TABLE audit_findings;
ANALYZE TABLE disputes;
ANALYZE TABLE system_audit_log;
ANALYZE TABLE gold_specs;
ANALYZE TABLE users;

-- Performance Notes:
-- - These indexes significantly improve WHERE, JOIN, and ORDER BY performance
-- - Compound indexes (e.g., status_uploaded_by) enable efficient multi-column filtering
-- - DESC indexes optimize recent-first ordering patterns
-- - Run EXPLAIN on slow queries to verify index usage
-- - Monitor index size growth; drop unused indexes if needed
