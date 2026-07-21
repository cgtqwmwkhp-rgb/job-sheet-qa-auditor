import mysql from "mysql2/promise";

/**
 * PX-067: minimal, idempotent seed of a few real technician names so the
 * roster is never empty/phantom-only in environments that haven't onboarded
 * AAD/SSO users yet (sandbox, eval, local dev). Real (non-"attribution")
 * loginMethod rows here let engineer-attribution matching (ATTR-C011/C012)
 * exercise genuine name matches instead of always hitting the empty/phantom
 * roster skip path.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/seed-technician-roster.mjs
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("[Roster seed] DATABASE_URL not set; skipping technician roster seed");
  process.exit(0);
}

const SEED_TECHNICIANS = [
  { openId: "seed:brandon.towse", name: "Brandon Towse", email: "brandon.towse@example.com" },
  { openId: "seed:richard.newton", name: "Richard Newton", email: "richard.newton@example.com" },
  { openId: "seed:alex.rivera", name: "Alex Rivera", email: "alex.rivera@example.com" },
];

const connection = await mysql.createConnection(databaseUrl);

try {
  const [tables] = await connection.query(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'users'`
  );

  if (tables.length === 0) {
    console.log("[Roster seed] users table missing; skip technician roster seed");
    process.exit(0);
  }

  let seeded = 0;
  for (const tech of SEED_TECHNICIANS) {
    await connection.query(
      `INSERT INTO \`users\` (\`openId\`, \`name\`, \`email\`, \`loginMethod\`, \`role\`)
       VALUES (?, ?, ?, 'seed', 'technician')
       ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`email\` = VALUES(\`email\`)`,
      [tech.openId, tech.name, tech.email]
    );
    seeded += 1;
  }

  console.log(`[Roster seed] technician roster seeded/verified (count=${seeded})`);
} finally {
  await connection.end();
}
