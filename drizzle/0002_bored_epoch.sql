CREATE TABLE `processing_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(64) NOT NULL,
	`settingValue` json NOT NULL,
	`description` text,
	`category` enum('extraction','validation','performance','notifications') NOT NULL DEFAULT 'extraction',
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processing_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `processing_settings_settingKey_unique` UNIQUE(`settingKey`)
);
