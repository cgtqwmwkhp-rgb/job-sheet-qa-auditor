ALTER TABLE `waivers` ADD `revokedAt` timestamp;--> statement-breakpoint
ALTER TABLE `waivers` ADD `revokedBy` int;--> statement-breakpoint
ALTER TABLE `waivers` ADD CONSTRAINT `waivers_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
