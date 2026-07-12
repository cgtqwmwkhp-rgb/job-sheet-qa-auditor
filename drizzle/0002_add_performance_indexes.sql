-- Migration: Add performance indexes for common queries
-- Generated: 2026-07-12
-- Description: Adds indexes to optimize frequent queries and lookups

-- Users
CREATE INDEX idx_users_openid ON users(openId);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Job Sheets - most frequently queried table
CREATE INDEX idx_job_sheets_status ON job_sheets(status);
CREATE INDEX idx_job_sheets_uploaded_by ON job_sheets(uploadedBy);
CREATE INDEX idx_job_sheets_technician ON job_sheets(technicianId);
CREATE INDEX idx_job_sheets_created_at ON job_sheets(createdAt DESC);
CREATE INDEX idx_job_sheets_reference_number ON job_sheets(referenceNumber);
CREATE INDEX idx_job_sheets_file_hash ON job_sheets(fileHash);

-- Composite index for common filter combinations
CREATE INDEX idx_job_sheets_status_uploaded ON job_sheets(status, uploadedBy, createdAt DESC);

-- Audit Results
CREATE INDEX idx_audit_results_job_sheet ON audit_results(jobSheetId);
CREATE INDEX idx_audit_results_result ON audit_results(result);
CREATE INDEX idx_audit_results_gold_spec ON audit_results(goldSpecId);
CREATE INDEX idx_audit_results_run_id ON audit_results(runId);
CREATE INDEX idx_audit_results_created_at ON audit_results(createdAt DESC);

-- Audit Findings
CREATE INDEX idx_audit_findings_audit_result ON audit_findings(auditResultId);
CREATE INDEX idx_audit_findings_severity ON audit_findings(severity);
CREATE INDEX idx_audit_findings_resolution_status ON audit_findings(resolutionStatus);
CREATE INDEX idx_audit_findings_field_name ON audit_findings(fieldName);
CREATE INDEX idx_audit_findings_resolved_by ON audit_findings(resolvedBy);

-- Composite index for unresolved critical findings
CREATE INDEX idx_audit_findings_critical_open ON audit_findings(severity, resolutionStatus) WHERE resolutionStatus = 'open' AND severity IN ('S0', 'S1');

-- Disputes
CREATE INDEX idx_disputes_audit_finding ON disputes(auditFindingId);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_raised_by ON disputes(raisedBy);
CREATE INDEX idx_disputes_reviewer ON disputes(reviewerId);
CREATE INDEX idx_disputes_created_at ON disputes(createdAt DESC);

-- Waivers
CREATE INDEX idx_waivers_audit_finding ON waivers(auditFindingId);
CREATE INDEX idx_waivers_approver ON waivers(approverId);
CREATE INDEX idx_waivers_expires_at ON waivers(expiresAt);

-- System Audit Log
CREATE INDEX idx_system_audit_log_user ON system_audit_log(userId);
CREATE INDEX idx_system_audit_log_action ON system_audit_log(action);
CREATE INDEX idx_system_audit_log_entity ON system_audit_log(entityType, entityId);
CREATE INDEX idx_system_audit_log_created_at ON system_audit_log(createdAt DESC);

-- Templates
CREATE INDEX idx_templates_template_id ON templates(templateId);
CREATE INDEX idx_templates_status ON templates(status);
CREATE INDEX idx_templates_client ON templates(client);

-- Template Versions
CREATE INDEX idx_template_versions_template ON template_versions(templateId);
CREATE INDEX idx_template_versions_active ON template_versions(isActive);
CREATE INDEX idx_template_versions_hash ON template_versions(hashSha256);

-- Selection Traces
CREATE INDEX idx_selection_traces_job_sheet ON selection_traces(jobSheetId);
CREATE INDEX idx_selection_traces_template ON selection_traces(templateId);
CREATE INDEX idx_selection_traces_confidence ON selection_traces(confidenceBand);

-- Failed Jobs
CREATE INDEX idx_failed_jobs_job_sheet ON failed_jobs(jobSheetId);
CREATE INDEX idx_failed_jobs_stage ON failed_jobs(stage);
CREATE INDEX idx_failed_jobs_created_at ON failed_jobs(createdAt DESC);
