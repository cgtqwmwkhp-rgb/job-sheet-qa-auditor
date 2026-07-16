-- L3 evidence entities: normalize photo-pair and Parts Used artifacts while
-- retaining audit_results.reportJson for legacy readers.
CREATE TABLE IF NOT EXISTS `photo_evidence_pairs` (
	`id` int NOT NULL AUTO_INCREMENT,
	`jobSheetId` int NOT NULL,
	`auditResultId` int NOT NULL,
	`pairIndex` int NOT NULL,
	`beforePage` int,
	`afterPage` int,
	`axes` json NOT NULL,
	`confidence` decimal(5,4),
	`confidenceBand` varchar(16),
	`provider` varchar(32) NOT NULL,
	`model` varchar(128),
	`reasoning` text,
	`fileHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photo_evidence_pairs_id` PRIMARY KEY(`id`),
	CONSTRAINT `photo_evidence_pairs_audit_pair_unique` UNIQUE(`auditResultId`,`pairIndex`),
	CONSTRAINT `photo_evidence_pairs_jobSheetId_job_sheets_id_fk` FOREIGN KEY (`jobSheetId`) REFERENCES `job_sheets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `photo_evidence_pairs_auditResultId_audit_results_id_fk` FOREIGN KEY (`auditResultId`) REFERENCES `audit_results`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `photo_evidence_pairs_job_audit_idx` ON `photo_evidence_pairs` (`jobSheetId`,`auditResultId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `parts_lines` (
	`id` int NOT NULL AUTO_INCREMENT,
	`jobSheetId` int NOT NULL,
	`auditResultId` int NOT NULL,
	`lineIndex` int NOT NULL,
	`partNumber` varchar(128),
	`description` text,
	`quantity` varchar(32),
	`rawLine` text NOT NULL,
	`isComplete` boolean NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'parts_used',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parts_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `parts_lines_audit_line_unique` UNIQUE(`auditResultId`,`lineIndex`),
	CONSTRAINT `parts_lines_jobSheetId_job_sheets_id_fk` FOREIGN KEY (`jobSheetId`) REFERENCES `job_sheets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `parts_lines_auditResultId_audit_results_id_fk` FOREIGN KEY (`auditResultId`) REFERENCES `audit_results`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `parts_lines_job_audit_idx` ON `parts_lines` (`jobSheetId`,`auditResultId`);
