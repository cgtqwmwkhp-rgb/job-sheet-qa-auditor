import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

/**
 * Idempotent seed of the active QGP engineer roster into Job Sheet QA `users`
 * as real (non-attribution) technicians so ATTR matching can resolve OCR
 * names like brandon.Towse → "Towse, B".
 *
 * Usage: DATABASE_URL=... pnpm seed:technicians
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    "[Roster seed] DATABASE_URL not set; skipping technician roster seed"
  );
  process.exit(0);
}

const rosterPath =
  process.env.TECHNICIAN_ROSTER_PATH ||
  path.join(__dirname, "data", "qgp-active-engineers.json");

function slugSurname(name) {
  const comma = String(name).match(/^(.+?),\s*([A-Za-z])/);
  if (comma) {
    const surname = comma[1]
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 40);
    const initial = comma[2].toLowerCase();
    return { surname, initial };
  }
  const parts = String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      surname: parts[parts.length - 1].replace(/[^a-z0-9]/g, "").slice(0, 40),
      initial: parts[0][0],
    };
  }
  return {
    surname: (parts[0] || "unknown").replace(/[^a-z0-9]/g, "").slice(0, 40),
    initial: "x",
  };
}

function emailFor(name, employeeNo) {
  const { surname, initial } = slugSurname(name);
  if (surname) return `${initial}.${surname}@plantexpand.roster`;
  return `emp${employeeNo}@plantexpand.roster`;
}

const raw = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
const engineers = Array.isArray(raw) ? raw : (raw.engineers ?? []);
if (engineers.length === 0) {
  console.error("[Roster seed] No engineers found in", rosterPath);
  process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);

try {
  const [tables] = await connection.query(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'users'`
  );

  if (tables.length === 0) {
    console.log(
      "[Roster seed] users table missing; skip technician roster seed"
    );
    process.exit(0);
  }

  let seeded = 0;
  for (const eng of engineers) {
    const employeeNo = String(eng.employeeNo ?? "").trim();
    const name = String(eng.name ?? "").trim();
    if (!employeeNo || !name) continue;

    const openId = `seed:emp-${employeeNo}`.slice(0, 64);
    const email = emailFor(name, employeeNo);

    await connection.query(
      `INSERT INTO \`users\` (\`openId\`, \`name\`, \`email\`, \`loginMethod\`, \`role\`)
       VALUES (?, ?, ?, 'seed', 'technician')
       ON DUPLICATE KEY UPDATE
         \`name\` = VALUES(\`name\`),
         \`email\` = VALUES(\`email\`),
         \`loginMethod\` = 'seed',
         \`role\` = 'technician'`,
      [openId, name, email]
    );
    seeded += 1;
  }

  // Align legacy demo openIds with QGP roster display names (no deletes).
  const legacyAlign = [
    {
      openId: "seed:brandon.towse",
      name: "Towse, B",
      employeeNo: "235",
    },
    {
      openId: "seed:richard.newton",
      name: "Newton, R",
      employeeNo: "238",
    },
  ];
  for (const row of legacyAlign) {
    await connection.query(
      `UPDATE \`users\`
          SET \`name\` = ?, \`email\` = ?, \`loginMethod\` = 'seed', \`role\` = 'technician'
        WHERE \`openId\` = ?`,
      [row.name, emailFor(row.name, row.employeeNo), row.openId]
    );
  }

  console.log(
    `[Roster seed] QGP active technicians seeded/verified (count=${seeded}, file=${path.basename(rosterPath)})`
  );
} finally {
  await connection.end();
}
