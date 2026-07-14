CREATE TABLE `webhook_subscriptions` (
	`id` varchar(36) NOT NULL,
	`url` text NOT NULL,
	`secret` varchar(128) NOT NULL,
	`events` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`retryCount` int NOT NULL DEFAULT 3,
	`timeoutMs` int NOT NULL DEFAULT 10000,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_delivery_log` (
	`id` varchar(36) NOT NULL,
	`webhookId` varchar(36) NOT NULL,
	`event` varchar(64) NOT NULL,
	`payloadId` varchar(36),
	`success` boolean NOT NULL,
	`statusCode` int,
	`responseTimeMs` int,
	`error` text,
	`retryCount` int NOT NULL DEFAULT 0,
	`signature` varchar(80) NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_delivery_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `webhook_delivery_log_webhookId_idx` ON `webhook_delivery_log` (`webhookId`);
--> statement-breakpoint
CREATE INDEX `webhook_delivery_log_deliveredAt_idx` ON `webhook_delivery_log` (`deliveredAt`);
