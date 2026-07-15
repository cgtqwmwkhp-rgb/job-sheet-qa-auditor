CREATE TABLE `review_claims` (
	`jobSheetId` int NOT NULL,
	`claimedBy` int NOT NULL,
	`claimToken` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL,
	CONSTRAINT `review_claims_jobSheetId` PRIMARY KEY(`jobSheetId`)
);
--> statement-breakpoint
CREATE INDEX `idx_review_claims_expires` ON `review_claims` (`expiresAt`);
--> statement-breakpoint
CREATE INDEX `idx_review_claims_claimed_by` ON `review_claims` (`claimedBy`);
