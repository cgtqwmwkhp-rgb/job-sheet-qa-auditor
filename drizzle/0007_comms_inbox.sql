CREATE TABLE `email_outbox` (
	`id` varchar(64) NOT NULL,
	`userId` int,
	`toEmail` varchar(320) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`bodyHtml` text,
	`bodyText` text,
	`provider` varchar(32) NOT NULL,
	`status` enum('queued','sent','failed') NOT NULL,
	`error` text,
	`providerMessageId` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `email_outbox_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(512) NOT NULL,
	`platform` enum('web','ios','android') NOT NULL DEFAULT 'web',
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user_notifications` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
	`readAt` timestamp,
	`dismissedAt` timestamp,
	`meta` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `device_tokens` ADD CONSTRAINT `device_tokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_notifications` ADD CONSTRAINT `user_notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `email_outbox_userId_idx` ON `email_outbox` (`userId`);
--> statement-breakpoint
CREATE INDEX `device_tokens_userId_idx` ON `device_tokens` (`userId`);
--> statement-breakpoint
CREATE INDEX `user_notifications_userId_createdAt_idx` ON `user_notifications` (`userId`,`createdAt`);
