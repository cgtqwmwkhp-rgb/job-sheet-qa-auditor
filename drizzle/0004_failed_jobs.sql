CREATE TABLE `failed_jobs` (
	`id` varchar(36) NOT NULL,
	`jobSheetId` int NOT NULL,
	`correlationId` varchar(64),
	`stage` enum('upload','ocr','analysis','storage') NOT NULL,
	`errorMessage` text NOT NULL,
	`errorCode` varchar(64),
	`errorStack` text,
	`attempts` int NOT NULL DEFAULT 1,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`lastAttemptAt` timestamp NOT NULL,
	`recoverable` boolean NOT NULL DEFAULT true,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `failed_jobs_id` PRIMARY KEY(`id`)
);
