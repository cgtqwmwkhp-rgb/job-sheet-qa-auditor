ALTER TABLE `audit_findings` ADD `resolutionStatus` enum('open','waived','overridden','flagged','approved') DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_findings` ADD `resolutionReason` text;--> statement-breakpoint
ALTER TABLE `audit_findings` ADD `resolvedBy` int;--> statement-breakpoint
ALTER TABLE `audit_findings` ADD `resolvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `audit_findings` ADD `previousResolutionStatus` enum('open','waived','overridden','flagged','approved');
