-- Wave-7: template lineage on audit_results + review_corrections + template memory
ALTER TABLE `audit_results` ADD COLUMN `templateId` int;--> statement-breakpoint
ALTER TABLE `audit_results` ADD COLUMN `templateVersionId` int;--> statement-breakpoint
ALTER TABLE `audit_results` ADD CONSTRAINT `audit_results_templateId_templates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_results` ADD CONSTRAINT `audit_results_templateVersionId_template_versions_id_fk` FOREIGN KEY (`templateVersionId`) REFERENCES `template_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_results_templateVersionId_createdAt_idx` ON `audit_results` (`templateVersionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_results_templateId_createdAt_idx` ON `audit_results` (`templateId`,`createdAt`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`correctionType` enum('field_correction','override','waive','flag','approve') NOT NULL,
	`trainingReasonCode` enum('ocr_misread','roi_misaligned','rule_wrong','template_mismatch','true_defect') NOT NULL,
	`findingId` int NOT NULL,
	`auditResultId` int NOT NULL,
	`jobSheetId` int NOT NULL,
	`templateId` int,
	`templateVersionId` int,
	`fieldKey` varchar(128) NOT NULL,
	`ruleId` varchar(64),
	`originalValue` text,
	`correctedValue` text,
	`reviewerId` int NOT NULL,
	`reviewerReason` text,
	`idempotencyKey` varchar(191) NOT NULL,
	`supersedesCorrectionId` int,
	`undoneAt` timestamp,
	`undoneBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_corrections_id` PRIMARY KEY(`id`),
	CONSTRAINT `review_corrections_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);--> statement-breakpoint
ALTER TABLE `review_corrections` ADD CONSTRAINT `review_corrections_findingId_audit_findings_id_fk` FOREIGN KEY (`findingId`) REFERENCES `audit_findings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_corrections` ADD CONSTRAINT `review_corrections_auditResultId_audit_results_id_fk` FOREIGN KEY (`auditResultId`) REFERENCES `audit_results`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_corrections` ADD CONSTRAINT `review_corrections_jobSheetId_job_sheets_id_fk` FOREIGN KEY (`jobSheetId`) REFERENCES `job_sheets`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_corrections` ADD CONSTRAINT `review_corrections_templateId_templates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_corrections` ADD CONSTRAINT `review_corrections_templateVersionId_template_versions_id_fk` FOREIGN KEY (`templateVersionId`) REFERENCES `template_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_corrections` ADD CONSTRAINT `review_corrections_reviewerId_users_id_fk` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `review_corrections_template_field_rule_idx` ON `review_corrections` (`templateId`,`fieldKey`,`ruleId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_corrections_findingId_createdAt_idx` ON `review_corrections` (`findingId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_corrections_training_idx` ON `review_corrections` (`trainingReasonCode`,`correctionType`,`createdAt`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `template_memory_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`templateVersionId` int,
	`memoryKind` enum('suppress_rule','value_alias','ocr_hint','roi_adjust','spec_gap') NOT NULL,
	`fieldKey` varchar(128) NOT NULL,
	`ruleId` varchar(64),
	`payloadJson` json NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`evidenceCount` int NOT NULL DEFAULT 0,
	`agreeCount` int NOT NULL DEFAULT 0,
	`disagreeCount` int NOT NULL DEFAULT 0,
	`promotionStatus` enum('collecting','candidate','shadow','approved','rejected','retired') NOT NULL DEFAULT 'collecting',
	`promotedToVersionId` int,
	`createdFromCorrectionId` int,
	`lastEvidenceAt` timestamp,
	`createdBy` int,
	`approvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `template_memory_candidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `template_memory_candidates_unique` UNIQUE(`templateId`,`memoryKind`,`fieldKey`,`ruleId`,`payloadHash`)
);--> statement-breakpoint
ALTER TABLE `template_memory_candidates` ADD CONSTRAINT `template_memory_candidates_templateId_fk` FOREIGN KEY (`templateId`) REFERENCES `templates`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_memory_candidates` ADD CONSTRAINT `template_memory_candidates_templateVersionId_fk` FOREIGN KEY (`templateVersionId`) REFERENCES `template_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `template_memory_candidates_status_template_idx` ON `template_memory_candidates` (`promotionStatus`,`templateId`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `template_memory_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`correctionId` int NOT NULL,
	`weight` decimal(5,2) NOT NULL DEFAULT 1.00,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `template_memory_evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `template_memory_evidence_unique` UNIQUE(`candidateId`,`correctionId`)
);--> statement-breakpoint
ALTER TABLE `template_memory_evidence` ADD CONSTRAINT `template_memory_evidence_candidateId_fk` FOREIGN KEY (`candidateId`) REFERENCES `template_memory_candidates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_memory_evidence` ADD CONSTRAINT `template_memory_evidence_correctionId_fk` FOREIGN KEY (`correctionId`) REFERENCES `review_corrections`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `template_memory_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`fromStatus` varchar(32) NOT NULL,
	`toStatus` varchar(32) NOT NULL,
	`fromVersionId` int,
	`toVersionId` int,
	`diffJson` json,
	`promotedBy` int,
	`promotedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `template_memory_promotions_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
ALTER TABLE `template_memory_promotions` ADD CONSTRAINT `template_memory_promotions_candidateId_fk` FOREIGN KEY (`candidateId`) REFERENCES `template_memory_candidates`(`id`) ON DELETE restrict ON UPDATE no action;
