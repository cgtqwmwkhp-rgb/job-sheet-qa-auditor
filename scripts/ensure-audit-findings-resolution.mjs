import mysql from "mysql2/promise";

/**
 * Idempotent repair for drizzle/0005_audit_finding_resolution.sql.
 * Staging/prod can mark migrations applied while columns are missing,
 * which breaks insert into audit_findings (ER_BAD_FIELD_ERROR).
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    "[DB repair] DATABASE_URL not set; skipping audit_findings resolution check"
  );
  process.exit(0);
}

const columnsToAdd = [
  {
    name: "resolutionStatus",
    sql: "ALTER TABLE `audit_findings` ADD COLUMN `resolutionStatus` enum('open','waived','overridden','flagged','approved') NOT NULL DEFAULT 'open'",
  },
  {
    name: "resolutionReason",
    sql: "ALTER TABLE `audit_findings` ADD COLUMN `resolutionReason` text",
  },
  {
    name: "resolvedBy",
    sql: "ALTER TABLE `audit_findings` ADD COLUMN `resolvedBy` int",
  },
  {
    name: "resolvedAt",
    sql: "ALTER TABLE `audit_findings` ADD COLUMN `resolvedAt` timestamp NULL",
  },
  {
    name: "previousResolutionStatus",
    sql: "ALTER TABLE `audit_findings` ADD COLUMN `previousResolutionStatus` enum('open','waived','overridden','flagged','approved')",
  },
];

const connection = await mysql.createConnection(databaseUrl);

try {
  const [tables] = await connection.query(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'audit_findings'`
  );

  if (tables.length === 0) {
    console.log("[DB repair] audit_findings table missing; skip resolution cols");
    process.exit(0);
  }

  const [existing] = await connection.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'audit_findings'
        AND column_name IN (${columnsToAdd.map(() => "?").join(",")})`,
    columnsToAdd.map(c => c.name)
  );

  const have = new Set(existing.map(r => r.columnName));
  let added = 0;
  for (const col of columnsToAdd) {
    if (have.has(col.name)) continue;
    await connection.query(col.sql);
    console.log(`[DB repair] added audit_findings.${col.name}`);
    added += 1;
  }

  if (added === 0) {
    console.log("[DB repair] audit_findings resolution columns verified");
  } else {
    console.log(`[DB repair] audit_findings resolution columns added=${added}`);
  }
} finally {
  await connection.end();
}
