-- Migration: Add foreign key constraints for referential integrity
-- Generated: 2026-07-12
-- Description: Adds foreign keys to enforce data relationships and prevent orphaned records

-- Gold Specs
ALTER TABLE gold_specs
  ADD CONSTRAINT fk_gold_specs_parent FOREIGN KEY (parentSpecId) REFERENCES gold_specs(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_gold_specs_created_by FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE RESTRICT;

-- Job Sheets
ALTER TABLE job_sheets
  ADD CONSTRAINT fk_job_sheets_technician FOREIGN KEY (technicianId) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_job_sheets_uploaded_by FOREIGN KEY (uploadedBy) REFERENCES users(id) ON DELETE RESTRICT;

-- Audit Results
ALTER TABLE audit_results
  ADD CONSTRAINT fk_audit_results_job_sheet FOREIGN KEY (jobSheetId) REFERENCES job_sheets(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_audit_results_gold_spec FOREIGN KEY (goldSpecId) REFERENCES gold_specs(id) ON DELETE RESTRICT;

-- Audit Findings
ALTER TABLE audit_findings
  ADD CONSTRAINT fk_audit_findings_audit_result FOREIGN KEY (auditResultId) REFERENCES audit_results(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_audit_findings_resolved_by FOREIGN KEY (resolvedBy) REFERENCES users(id) ON DELETE SET NULL;

-- Disputes
ALTER TABLE disputes
  ADD CONSTRAINT fk_disputes_audit_finding FOREIGN KEY (auditFindingId) REFERENCES audit_findings(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_disputes_raised_by FOREIGN KEY (raisedBy) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disputes_reviewer FOREIGN KEY (reviewerId) REFERENCES users(id) ON DELETE SET NULL;

-- Waivers
ALTER TABLE waivers
  ADD CONSTRAINT fk_waivers_audit_finding FOREIGN KEY (auditFindingId) REFERENCES audit_findings(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_waivers_approver FOREIGN KEY (approverId) REFERENCES users(id) ON DELETE RESTRICT;

-- System Audit Log
ALTER TABLE system_audit_log
  ADD CONSTRAINT fk_system_audit_log_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL;

-- Processing Settings
ALTER TABLE processing_settings
  ADD CONSTRAINT fk_processing_settings_updated_by FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL;

-- Templates
ALTER TABLE templates
  ADD CONSTRAINT fk_templates_created_by FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE RESTRICT;

-- Template Versions
ALTER TABLE template_versions
  ADD CONSTRAINT fk_template_versions_template FOREIGN KEY (templateId) REFERENCES templates(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_template_versions_created_by FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE RESTRICT;

-- Selection Traces
ALTER TABLE selection_traces
  ADD CONSTRAINT fk_selection_traces_job_sheet FOREIGN KEY (jobSheetId) REFERENCES job_sheets(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_selection_traces_template FOREIGN KEY (templateId) REFERENCES templates(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_selection_traces_version FOREIGN KEY (versionId) REFERENCES template_versions(id) ON DELETE SET NULL;

-- Failed Jobs
ALTER TABLE failed_jobs
  ADD CONSTRAINT fk_failed_jobs_job_sheet FOREIGN KEY (jobSheetId) REFERENCES job_sheets(id) ON DELETE CASCADE;
