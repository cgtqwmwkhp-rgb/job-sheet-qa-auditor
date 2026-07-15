import mysql from "mysql2/promise";

/**
 * Idempotent repair for Wave-7 template memory lineage columns/tables + backfill.
 * Handles environments where 0012 partially applied or ALTER hits ER_DUP_FIELDNAME.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("[DB repair] DATABASE_URL not set; skipping template memory");
  process.exit(0);
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT column_name AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT table_name AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows.length > 0;
}

const connection = await mysql.createConnection(databaseUrl);
try {
  if (!(await tableExists(connection, "audit_results"))) {
    console.log("[DB repair] audit_results missing; skip template memory");
    process.exit(0);
  }

  if (!(await columnExists(connection, "audit_results", "templateId"))) {
    await connection.query("ALTER TABLE `audit_results` ADD COLUMN `templateId` int NULL");
    console.log("[DB repair] added audit_results.templateId");
  }
  if (!(await columnExists(connection, "audit_results", "templateVersionId"))) {
    await connection.query(
      "ALTER TABLE `audit_results` ADD COLUMN `templateVersionId` int NULL"
    );
    console.log("[DB repair] added audit_results.templateVersionId");
  }

  // Tables — CREATE IF NOT EXISTS mirrors 0012 (subset) for crash recovery
  await connection.query(`CREATE TABLE IF NOT EXISTS \`review_corrections\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`correctionType\` enum('field_correction','override','waive','flag','approve') NOT NULL,
  \`trainingReasonCode\` enum('ocr_misread','roi_misaligned','rule_wrong','template_mismatch','true_defect') NOT NULL,
  \`findingId\` int NOT NULL,
  \`auditResultId\` int NOT NULL,
  \`jobSheetId\` int NOT NULL,
  \`templateId\` int,
  \`templateVersionId\` int,
  \`fieldKey\` varchar(128) NOT NULL,
  \`ruleId\` varchar(64),
  \`originalValue\` text,
  \`correctedValue\` text,
  \`reviewerId\` int NOT NULL,
  \`reviewerReason\` text,
  \`idempotencyKey\` varchar(191) NOT NULL,
  \`supersedesCorrectionId\` int,
  \`undoneAt\` timestamp NULL,
  \`undoneBy\` int,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`review_corrections_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`review_corrections_idempotencyKey_unique\` UNIQUE(\`idempotencyKey\`)
)`);

  await connection.query(`CREATE TABLE IF NOT EXISTS \`template_memory_candidates\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`templateId\` int NOT NULL,
  \`templateVersionId\` int,
  \`memoryKind\` enum('suppress_rule','value_alias','ocr_hint','roi_adjust','spec_gap') NOT NULL,
  \`fieldKey\` varchar(128) NOT NULL,
  \`ruleId\` varchar(64),
  \`payloadJson\` json NOT NULL,
  \`payloadHash\` varchar(64) NOT NULL,
  \`evidenceCount\` int NOT NULL DEFAULT 0,
  \`agreeCount\` int NOT NULL DEFAULT 0,
  \`disagreeCount\` int NOT NULL DEFAULT 0,
  \`promotionStatus\` enum('collecting','candidate','shadow','approved','rejected','retired') NOT NULL DEFAULT 'collecting',
  \`promotedToVersionId\` int,
  \`createdFromCorrectionId\` int,
  \`lastEvidenceAt\` timestamp NULL,
  \`createdBy\` int,
  \`approvedBy\` int,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`template_memory_candidates_id\` PRIMARY KEY(\`id\`)
)`);

  await connection.query(`CREATE TABLE IF NOT EXISTS \`template_memory_evidence\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`candidateId\` int NOT NULL,
  \`correctionId\` int NOT NULL,
  \`weight\` decimal(5,2) NOT NULL DEFAULT 1.00,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`template_memory_evidence_id\` PRIMARY KEY(\`id\`)
)`);

  await connection.query(`CREATE TABLE IF NOT EXISTS \`template_memory_promotions\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`candidateId\` int NOT NULL,
  \`fromStatus\` varchar(32) NOT NULL,
  \`toStatus\` varchar(32) NOT NULL,
  \`fromVersionId\` int,
  \`toVersionId\` int,
  \`diffJson\` json,
  \`promotedBy\` int,
  \`promotedAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`template_memory_promotions_id\` PRIMARY KEY(\`id\`)
)`);

  // Backfill lineage from selection_traces (latest per job sheet) then reportJson
  if (await tableExists(connection, "selection_traces")) {
    const [bf1] = await connection.query(`
      UPDATE audit_results ar
      INNER JOIN (
        SELECT st1.jobSheetId, st1.templateId, st1.versionId
        FROM selection_traces st1
        INNER JOIN (
          SELECT jobSheetId, MAX(id) AS maxId
          FROM selection_traces
          WHERE versionId IS NOT NULL
          GROUP BY jobSheetId
        ) latest ON latest.maxId = st1.id
      ) st ON st.jobSheetId = ar.jobSheetId
      SET
        ar.templateId = COALESCE(ar.templateId, st.templateId),
        ar.templateVersionId = COALESCE(ar.templateVersionId, st.versionId)
      WHERE ar.templateVersionId IS NULL
        AND st.versionId IS NOT NULL
    `);
    console.log(
      `[DB repair] lineage backfill from selection_traces: ${bf1.affectedRows ?? 0} rows`
    );
  }

  // Fallback: reportJson.selectionResult.versionId / templateId
  const [bf2] = await connection.query(`
    UPDATE audit_results
    SET
      templateVersionId = COALESCE(
        templateVersionId,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(reportJson, '$.selectionResult.versionId')) AS UNSIGNED)
      ),
      templateId = COALESCE(
        templateId,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(reportJson, '$.selectionResult.templateId')) AS UNSIGNED)
      )
    WHERE templateVersionId IS NULL
      AND JSON_EXTRACT(reportJson, '$.selectionResult.versionId') IS NOT NULL
  `);
  console.log(
    `[DB repair] lineage backfill from reportJson: ${bf2.affectedRows ?? 0} rows`
  );

  console.log("[DB repair] template memory lineage verified");
} finally {
  await connection.end();
}
