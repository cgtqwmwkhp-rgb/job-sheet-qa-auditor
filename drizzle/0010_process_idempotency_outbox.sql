CREATE TABLE `process_idempotency_outbox` (
	`id` varchar(64) NOT NULL,
	`scope` varchar(191) NOT NULL,
	`idempotencyKey` varchar(255) NOT NULL,
	`requestFingerprint` varchar(64) NOT NULL,
	`status` enum('pending','completed') NOT NULL,
	`jobSheetId` int,
	`responseJson` json,
	`createdAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `process_idempotency_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_process_idempotency_scope_key` UNIQUE(`scope`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `idx_process_idempotency_pending` ON `process_idempotency_outbox` (`status`,`expiresAt`);
