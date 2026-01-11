CREATE TABLE `selection_traces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobSheetId` int NOT NULL,
	`templateId` int,
	`versionId` int,
	`confidenceBand` enum('HIGH','MEDIUM','LOW') NOT NULL,
	`topScore` decimal(5,2) NOT NULL,
	`runnerUpScore` decimal(5,2),
	`scoreGap` decimal(5,2),
	`scoresJson` json NOT NULL,
	`tokensJson` json NOT NULL,
	`autoProcessingAllowed` boolean NOT NULL DEFAULT false,
	`blockReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `selection_traces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`version` varchar(32) NOT NULL,
	`hashSha256` varchar(64) NOT NULL,
	`specJson` json NOT NULL,
	`selectionConfigJson` json NOT NULL,
	`roiJson` json,
	`isActive` boolean NOT NULL DEFAULT false,
	`changeNotes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `template_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`client` varchar(128),
	`assetType` varchar(128),
	`workType` varchar(128),
	`status` enum('draft','active','deprecated','archived') NOT NULL DEFAULT 'draft',
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `templates_templateId_unique` UNIQUE(`templateId`)
);
