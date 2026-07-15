import mysql from "mysql2/promise";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Idempotent repair for drizzle/0010_process_idempotency_outbox.sql.
 *
 * Staging/prod can already have process_idempotency_outbox + indexes from an
 * earlier CREATE TABLE IF NOT EXISTS path while __drizzle_migrations is missing
 * the 0010 hash — drizzle-kit migrate then crash-loops on ER_DUP_KEYNAME.
 *
 * Run BEFORE migrate.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(
    "[DB repair] DATABASE_URL not set; skipping process idempotency check"
  );
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  here,
  "../drizzle/0010_process_idempotency_outbox.sql"
);

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT table_name AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows.length > 0;
}

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.query(
    `SELECT index_name AS n FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  return rows.length > 0;
}

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS \`process_idempotency_outbox\` (
  \`id\` varchar(64) NOT NULL,
  \`scope\` varchar(191) NOT NULL,
  \`idempotencyKey\` varchar(255) NOT NULL,
  \`requestFingerprint\` varchar(64) NOT NULL,
  \`status\` enum('pending','completed') NOT NULL,
  \`jobSheetId\` int,
  \`responseJson\` json,
  \`createdAt\` timestamp NOT NULL,
  \`updatedAt\` timestamp NOT NULL,
  \`expiresAt\` timestamp NOT NULL,
  CONSTRAINT \`process_idempotency_outbox_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`uq_process_idempotency_scope_key\` UNIQUE(\`scope\`,\`idempotencyKey\`)
)`);

  if (await tableExists(connection, "process_idempotency_outbox")) {
    if (
      !(await indexExists(
        connection,
        "process_idempotency_outbox",
        "idx_process_idempotency_pending"
      ))
    ) {
      await connection.query(
        "CREATE INDEX `idx_process_idempotency_pending` ON `process_idempotency_outbox` (`status`,`expiresAt`)"
      );
      console.log("[DB repair] added idx_process_idempotency_pending");
    }
  }

  if (!fs.existsSync(migrationPath)) {
    console.log("[DB repair] migration file missing:", migrationPath);
    process.exit(0);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  const [migs] = await connection.query(
    "SELECT `hash` FROM `__drizzle_migrations`"
  );
  const hashes = new Set(migs.map(r => r.hash));
  if (!hashes.has(hash)) {
    await connection.query(
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [hash, Date.now()]
    );
    console.log(
      "[DB repair] marked 0010_process_idempotency_outbox applied:",
      hash.slice(0, 12)
    );
  } else {
    console.log("[DB repair] process idempotency migration verified");
  }
} finally {
  await connection.end();
}
