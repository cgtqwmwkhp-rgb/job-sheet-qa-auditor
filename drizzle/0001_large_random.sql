CREATE TABLE `audit_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditResultId` int NOT NULL,
	`severity` enum('S0','S1','S2','S3') NOT NULL,
	`reasonCode` enum('MISSING_FIELD','UNREADABLE_FIELD','LOW_CONFIDENCE','INVALID_FORMAT','CONFLICT','OUT_OF_POLICY','INCOMPLETE_EVIDENCE','OCR_FAILURE','PIPELINE_ERROR','SPEC_GAP','SECURITY_RISK') NOT NULL,
	`fieldName` varchar(128) NOT NULL,
	`pageNumber` int,
	`boundingBox` json,
	`rawSnippet` text,
	`normalisedSnippet` text,
	`confidence` decimal(5,2),
	`ruleId` varchar(64),
	`whyItMatters` text,
	`suggestedFix` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobSheetId` int NOT NULL,
	`goldSpecId` int NOT NULL,
	`runId` varchar(64) NOT NULL,
	`result` enum('pass','fail','review_queue','waived') NOT NULL,
	`confidenceScore` decimal(5,2),
	`documentStrategy` enum('embedded_text','ocr','hybrid') NOT NULL,
	`ocrEngineVersion` varchar(32),
	`pipelineVersion` varchar(32) NOT NULL,
	`reportJson` json NOT NULL,
	`processingTimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditFindingId` int NOT NULL,
	`raisedBy` int NOT NULL,
	`status` enum('open','under_review','accepted','rejected','escalated') NOT NULL DEFAULT 'open',
	`reason` text NOT NULL,
	`evidenceUrls` json,
	`reviewerId` int,
	`reviewNotes` text,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disputes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gold_specs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`version` varchar(32) NOT NULL,
	`description` text,
	`schema` json NOT NULL,
	`specType` enum('base','client','contract','workType') NOT NULL DEFAULT 'base',
	`parentSpecId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gold_specs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_sheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referenceNumber` varchar(64),
	`fileUrl` varchar(512) NOT NULL,
	`fileKey` varchar(256) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileType` varchar(64) NOT NULL,
	`fileSizeBytes` int,
	`fileHash` varchar(64),
	`status` enum('pending','processing','completed','failed','review_queue') NOT NULL DEFAULT 'pending',
	`technicianId` int,
	`siteInfo` text,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_sheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(64) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int,
	`details` json,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditFindingId` int NOT NULL,
	`approverId` int NOT NULL,
	`reason` text NOT NULL,
	`expiresAt` timestamp,
	`auditTrail` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waivers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','qa_lead','technician') NOT NULL DEFAULT 'user';