import mysql from "mysql2/promise";

/**
 * Idempotent CREATE TABLE IF NOT EXISTS for tables that may be missing when
 * __drizzle_migrations marks 0006/0007/0008 applied without schema present.
 * Soft-fail paths (notifications memory fallback, webhook hydrate) hide this
 * in /readyz — repair here so prod is fully armed.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("[DB repair] DATABASE_URL not set; skipping secondary tables");
  process.exit(0);
}

const statements = [
  `CREATE TABLE IF NOT EXISTS \`api_cost_events\` (
  \`id\` varchar(64) NOT NULL,
  \`recordedAt\` timestamp NOT NULL,
  \`provider\` varchar(64) NOT NULL,
  \`model\` varchar(128) NOT NULL,
  \`tool\` varchar(128) NOT NULL,
  \`stage\` varchar(64) NOT NULL,
  \`jobSheetId\` int,
  \`inputTokens\` int NOT NULL DEFAULT 0,
  \`outputTokens\` int NOT NULL DEFAULT 0,
  \`estimatedCostUsd\` decimal(12,6) NOT NULL,
  \`latencyMs\` int,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`api_cost_events_id\` PRIMARY KEY(\`id\`)
)`,
  `CREATE INDEX IF NOT EXISTS \`api_cost_events_recordedAt_idx\` ON \`api_cost_events\` (\`recordedAt\`)`,
  `CREATE TABLE IF NOT EXISTS \`email_outbox\` (
  \`id\` varchar(64) NOT NULL,
  \`userId\` int,
  \`toEmail\` varchar(320) NOT NULL,
  \`subject\` varchar(512) NOT NULL,
  \`bodyHtml\` text,
  \`bodyText\` text,
  \`provider\` varchar(32) NOT NULL,
  \`status\` enum('queued','sent','failed') NOT NULL,
  \`error\` text,
  \`providerMessageId\` varchar(256),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`sentAt\` timestamp,
  CONSTRAINT \`email_outbox_id\` PRIMARY KEY(\`id\`)
)`,
  `CREATE TABLE IF NOT EXISTS \`device_tokens\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`userId\` int NOT NULL,
  \`token\` varchar(512) NOT NULL,
  \`platform\` enum('web','ios','android') NOT NULL DEFAULT 'web',
  \`userAgent\` varchar(512),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  \`lastSeenAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`device_tokens_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`device_tokens_token_unique\` UNIQUE(\`token\`)
)`,
  `CREATE TABLE IF NOT EXISTS \`user_notifications\` (
  \`id\` varchar(64) NOT NULL,
  \`userId\` int NOT NULL,
  \`title\` varchar(255) NOT NULL,
  \`message\` text NOT NULL,
  \`type\` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
  \`readAt\` timestamp,
  \`dismissedAt\` timestamp,
  \`meta\` json,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`user_notifications_id\` PRIMARY KEY(\`id\`)
)`,
  `CREATE TABLE IF NOT EXISTS \`webhook_subscriptions\` (
  \`id\` varchar(36) NOT NULL,
  \`url\` text NOT NULL,
  \`secret\` varchar(128) NOT NULL,
  \`events\` json NOT NULL,
  \`active\` boolean NOT NULL DEFAULT true,
  \`retryCount\` int NOT NULL DEFAULT 3,
  \`timeoutMs\` int NOT NULL DEFAULT 10000,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`webhook_subscriptions_id\` PRIMARY KEY(\`id\`)
)`,
  `CREATE TABLE IF NOT EXISTS \`webhook_delivery_log\` (
  \`id\` varchar(36) NOT NULL,
  \`webhookId\` varchar(36) NOT NULL,
  \`event\` varchar(64) NOT NULL,
  \`payloadId\` varchar(36),
  \`success\` boolean NOT NULL,
  \`statusCode\` int,
  \`responseTimeMs\` int,
  \`error\` text,
  \`retryCount\` int NOT NULL DEFAULT 0,
  \`signature\` varchar(80) NOT NULL,
  \`payloadHash\` varchar(64) NOT NULL,
  \`deliveredAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`webhook_delivery_log_id\` PRIMARY KEY(\`id\`)
)`,
  `CREATE INDEX IF NOT EXISTS \`webhook_delivery_log_webhookId_idx\` ON \`webhook_delivery_log\` (\`webhookId\`)`,
  `CREATE INDEX IF NOT EXISTS \`webhook_delivery_log_deliveredAt_idx\` ON \`webhook_delivery_log\` (\`deliveredAt\`)`,
  `CREATE INDEX IF NOT EXISTS \`email_outbox_userId_idx\` ON \`email_outbox\` (\`userId\`)`,
  `CREATE INDEX IF NOT EXISTS \`device_tokens_userId_idx\` ON \`device_tokens\` (\`userId\`)`,
  `CREATE INDEX IF NOT EXISTS \`user_notifications_userId_createdAt_idx\` ON \`user_notifications\` (\`userId\`,\`createdAt\`)`,
];

const fkStatements = [
  `ALTER TABLE \`email_outbox\` ADD CONSTRAINT \`email_outbox_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
  `ALTER TABLE \`device_tokens\` ADD CONSTRAINT \`device_tokens_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
  `ALTER TABLE \`user_notifications\` ADD CONSTRAINT \`user_notifications_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
];

const connection = await mysql.createConnection(databaseUrl);
try {
  let created = 0;
  for (const sql of statements) {
    try {
      await connection.query(sql);
      if (sql.startsWith("CREATE TABLE")) created += 1;
    } catch (e) {
      console.log("[DB repair] secondary skip:", e.code || e.message);
    }
  }
  for (const sql of fkStatements) {
    try {
      await connection.query(sql);
    } catch (e) {
      // duplicate FK is fine
    }
  }
  console.log(
    `[DB repair] secondary tables verified (CREATE TABLE statements=${created})`
  );
} finally {
  await connection.end();
}
