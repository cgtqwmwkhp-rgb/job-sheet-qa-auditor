CREATE TABLE `api_cost_events` (
	`id` varchar(64) NOT NULL,
	`recordedAt` timestamp NOT NULL,
	`provider` varchar(64) NOT NULL,
	`model` varchar(128) NOT NULL,
	`tool` varchar(128) NOT NULL,
	`stage` varchar(64) NOT NULL,
	`jobSheetId` int,
	`inputTokens` int NOT NULL DEFAULT 0,
	`outputTokens` int NOT NULL DEFAULT 0,
	`estimatedCostUsd` decimal(12,6) NOT NULL,
	`latencyMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_cost_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `api_cost_events_recordedAt_idx` ON `api_cost_events` (`recordedAt`);
