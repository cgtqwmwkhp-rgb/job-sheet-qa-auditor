-- Wave C / PR6: durable signed-ingest receipts (idempotency across replicas)
CREATE TABLE IF NOT EXISTS `ingest_receipts` (
	`ingestId` varchar(64) NOT NULL,
	`externalJobId` varchar(128) NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`deviceId` varchar(128) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileType` varchar(64) NOT NULL,
	`fileSizeBytes` int NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`jobSheetId` int,
	`createdAt` timestamp NOT NULL,
	CONSTRAINT `ingest_receipts_ingestId` PRIMARY KEY(`ingestId`),
	CONSTRAINT `ingest_receipts_external_hash_unique` UNIQUE(`externalJobId`,`contentHash`)
);
--> statement-breakpoint
CREATE INDEX `ingest_receipts_externalJobId_idx` ON `ingest_receipts` (`externalJobId`);
--> statement-breakpoint
CREATE INDEX `ingest_receipts_contentHash_idx` ON `ingest_receipts` (`contentHash`);
