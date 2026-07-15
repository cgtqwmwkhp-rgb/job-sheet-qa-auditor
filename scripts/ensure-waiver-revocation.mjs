import mysql from "mysql2/promise";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Idempotent repair for drizzle/0009_waiver_revocation.sql.
 *
 * Prod can have revokedAt/revokedBy columns already present while
 * __drizzle_migrations is missing the 0009 hash, which makes
 * `drizzle-kit migrate` crash-loop on ER_DUP_FIELDNAME.
 *
 * Run BEFORE migrate so the journal is synced when schema already matches.
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    "[DB repair] DATABASE_URL not set; skipping waiver revocation check"
  );
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  here,
  "../drizzle/0009_waiver_revocation.sql"
);

const connection = await mysql.createConnection(databaseUrl);

try {
  const [tables] = await connection.query(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'waivers'`
  );

  if (tables.length === 0) {
    console.log("[DB repair] waivers table missing; skip revocation cols");
    process.exit(0);
  }

  const [existing] = await connection.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'waivers'
        AND column_name IN ('revokedAt', 'revokedBy')`
  );
  const have = new Set(existing.map(r => r.columnName));

  if (!have.has("revokedAt")) {
    await connection.query(
      "ALTER TABLE `waivers` ADD `revokedAt` timestamp NULL"
    );
    console.log("[DB repair] added waivers.revokedAt");
  }
  if (!have.has("revokedBy")) {
    await connection.query("ALTER TABLE `waivers` ADD `revokedBy` int NULL");
    console.log("[DB repair] added waivers.revokedBy");
  }

  try {
    await connection.query(
      "ALTER TABLE `waivers` ADD CONSTRAINT `waivers_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action"
    );
    console.log("[DB repair] added waivers_revokedBy_users_id_fk");
  } catch (e) {
    // Duplicate constraint / already exists
    console.log(
      "[DB repair] fk ok/skip:",
      e.code || e.errno || e.message
    );
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
      "[DB repair] marked 0009_waiver_revocation applied:",
      hash.slice(0, 12)
    );
  } else {
    console.log("[DB repair] waiver revocation migration verified");
  }
} finally {
  await connection.end();
}
