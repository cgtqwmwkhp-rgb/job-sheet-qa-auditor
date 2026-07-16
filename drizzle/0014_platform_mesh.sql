-- Lane C: durable webhook outbox and upstream job identity
ALTER TABLE `job_sheets` ADD `externalJobId` varchar(128);
--> statement-breakpoint
ALTER TABLE `job_sheets` ADD `sourceSystem` varchar(64);
--> statement-breakpoint
ALTER TABLE `job_sheets` ADD `deviceId` varchar(128);
--> statement-breakpoint
CREATE INDEX `job_sheets_externalJobId_idx` ON `job_sheets` (`externalJobId`);
--> statement-breakpoint
CREATE INDEX `job_sheets_sourceSystem_idx` ON `job_sheets` (`sourceSystem`);
--> statement-breakpoint
CREATE INDEX `job_sheets_deviceId_idx` ON `job_sheets` (`deviceId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_delivery_outbox` (
	`id` varchar(36) NOT NULL,
	`targetType` enum('webhook','erp','teams') NOT NULL,
	`webhookId` varchar(36),
	`event` varchar(64) NOT NULL,
	`payloadId` varchar(36),
	`url` text NOT NULL,
	`secret` varchar(256),
	`payload` json NOT NULL,
	`headers` json,
	`status` enum('pending','processing','delivered','dlq') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 4,
	`nextAttemptAt` timestamp NOT NULL,
	`lastError` text,
	`statusCode` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	CONSTRAINT `webhook_delivery_outbox_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `webhook_delivery_outbox_due_idx` ON `webhook_delivery_outbox` (`status`,`nextAttemptAt`);
--> statement-breakpoint
CREATE INDEX `webhook_delivery_outbox_event_idx` ON `webhook_delivery_outbox` (`event`);
