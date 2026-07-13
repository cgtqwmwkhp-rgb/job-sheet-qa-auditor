#!/usr/bin/env node
/**
 * One-shot: promote legacy viewer (user) accounts to qa_lead.
 * Use when production DB roles lag staging after Entra parity work.
 *
 * Usage: DATABASE_URL=... node scripts/ops/promote-staff-to-qalead.mjs
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
try {
  const [before] = await conn.query(
    "SELECT role, COUNT(*) AS c FROM users GROUP BY role"
  );
  console.log("Before:", before);

  const [result] = await conn.query(
    "UPDATE users SET role = 'qa_lead' WHERE role = 'user'"
  );
  console.log("Updated rows:", result.affectedRows);

  const [after] = await conn.query(
    "SELECT role, COUNT(*) AS c FROM users GROUP BY role"
  );
  console.log("After:", after);
} finally {
  await conn.end();
}
