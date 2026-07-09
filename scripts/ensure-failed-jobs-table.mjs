import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("[DB repair] DATABASE_URL not set; skipping failed_jobs check");
  process.exit(0);
}

const createFailedJobsTableSql = `
CREATE TABLE IF NOT EXISTS \`failed_jobs\` (
  \`id\` varchar(36) NOT NULL,
  \`jobSheetId\` int NOT NULL,
  \`correlationId\` varchar(64),
  \`stage\` enum('upload','ocr','analysis','storage') NOT NULL,
  \`errorMessage\` text NOT NULL,
  \`errorCode\` varchar(64),
  \`errorStack\` text,
  \`attempts\` int NOT NULL DEFAULT 1,
  \`maxAttempts\` int NOT NULL DEFAULT 3,
  \`lastAttemptAt\` timestamp NOT NULL,
  \`recoverable\` boolean NOT NULL DEFAULT true,
  \`metadata\` json,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`resolvedAt\` timestamp NULL,
  CONSTRAINT \`failed_jobs_id\` PRIMARY KEY(\`id\`)
);
`;

const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.query(createFailedJobsTableSql);

  const [columns] = await connection.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'failed_jobs'
        AND column_name = 'resolvedAt'`
  );

  if (columns.length === 0) {
    await connection.query(
      "ALTER TABLE `failed_jobs` ADD COLUMN `resolvedAt` timestamp NULL"
    );
    console.log("[DB repair] added failed_jobs.resolvedAt");
  } else {
    console.log("[DB repair] failed_jobs table verified");
  }
} finally {
  await connection.end();
}
