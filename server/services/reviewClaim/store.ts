/**
 * Review claim store — memory + MySQL (Wave-4 D1).
 *
 * Runtime CREATE IF NOT EXISTS (same pattern as processOutbox / job queue).
 */

import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { getDb } from "../../db";
import {
  buildClaimRecord,
  canAcquireClaim,
  canMutateUnderClaim,
  isClaimActive,
  nextExpiry,
} from "./claimLogic";
import {
  DEFAULT_CLAIM_TTL_MS,
  ReviewClaimError,
  type ClaimMutationGuardInput,
  type ClaimReviewInput,
  type ReviewClaimRecord,
} from "./types";

const reviewClaimsTable = mysqlTable("review_claims", {
  jobSheetId: int("jobSheetId").primaryKey(),
  claimedBy: int("claimedBy").notNull(),
  claimToken: varchar("claimToken", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

const DDL = `
CREATE TABLE IF NOT EXISTS review_claims (
  jobSheetId INT NOT NULL,
  claimedBy INT NOT NULL,
  claimToken VARCHAR(64) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP NOT NULL,
  PRIMARY KEY (jobSheetId),
  KEY idx_review_claims_expires (expiresAt),
  KEY idx_review_claims_claimed_by (claimedBy)
)
`;

let schemaReady: Promise<void> | null = null;
const memoryClaims = new Map<number, ReviewClaimRecord>();
let backendOverride: "memory" | "mysql" | null = null;

function toMs(value: Date | number | string): number {
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

function rowToRecord(row: {
  jobSheetId: number;
  claimedBy: number;
  claimToken: string;
  expiresAt: Date | string | number;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}): ReviewClaimRecord {
  return {
    jobSheetId: row.jobSheetId,
    claimedBy: row.claimedBy,
    claimToken: row.claimToken,
    expiresAt: toMs(row.expiresAt),
    createdAt: toMs(row.createdAt),
    updatedAt: toMs(row.updatedAt),
  };
}

async function ensureSchema(): Promise<"memory" | "mysql"> {
  if (backendOverride === "memory") return "memory";
  if (backendOverride === "mysql") {
    await ensureMysql();
    return "mysql";
  }

  const db = await getDb();
  if (!db) return "memory";

  await ensureMysql();
  return "mysql";
}

async function ensureMysql(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.execute(sql.raw(DDL));
    })().catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export function setReviewClaimBackendForTests(
  backend: "memory" | "mysql" | null
): void {
  backendOverride = backend;
  if (backend !== "mysql") schemaReady = null;
}

export function clearReviewClaimsForTests(): void {
  memoryClaims.clear();
}

export function listReviewClaimsForTests(): ReviewClaimRecord[] {
  return Array.from(memoryClaims.values()).map(c => ({ ...c }));
}

export async function getReviewClaim(
  jobSheetId: number
): Promise<ReviewClaimRecord | null> {
  const backend = await ensureSchema();
  if (backend === "memory") {
    return memoryClaims.get(jobSheetId) ?? null;
  }

  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(reviewClaimsTable)
    .where(eq(reviewClaimsTable.jobSheetId, jobSheetId))
    .limit(1);

  return rows[0] ? rowToRecord(rows[0]) : null;
}

/**
 * Acquire or renew an exclusive review claim on a job sheet.
 * Conflict when another reviewer holds a live lease.
 */
export async function claimReview(
  input: ClaimReviewInput
): Promise<ReviewClaimRecord> {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_CLAIM_TTL_MS;
  const backend = await ensureSchema();
  const existing = await getReviewClaim(input.jobSheetId);

  const decision = canAcquireClaim(
    existing,
    input.userId,
    now,
    input.force ?? false
  );
  if (!decision.ok) {
    throw new ReviewClaimError(
      "CONFLICT",
      `Job sheet ${input.jobSheetId} is claimed by another reviewer. Please wait or refresh.`,
      decision.reason,
      decision.heldBy
    );
  }

  const renewingSameUser =
    isClaimActive(existing, now) && existing.claimedBy === input.userId;

  const record = buildClaimRecord({
    jobSheetId: input.jobSheetId,
    userId: input.userId,
    claimToken: renewingSameUser ? existing.claimToken : randomUUID(),
    now,
    ttlMs,
    createdAt: renewingSameUser ? existing.createdAt : now,
  });

  if (backend === "memory") {
    memoryClaims.set(input.jobSheetId, record);
    return { ...record };
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(reviewClaimsTable)
    .values({
      jobSheetId: record.jobSheetId,
      claimedBy: record.claimedBy,
      claimToken: record.claimToken,
      expiresAt: new Date(record.expiresAt),
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    })
    .onDuplicateKeyUpdate({
      set: {
        claimedBy: record.claimedBy,
        claimToken: record.claimToken,
        expiresAt: new Date(record.expiresAt),
        updatedAt: new Date(record.updatedAt),
      },
    });

  return record;
}

export async function heartbeatReviewClaim(input: {
  jobSheetId: number;
  userId: number;
  claimToken: string;
  ttlMs?: number;
  now?: number;
}): Promise<ReviewClaimRecord> {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_CLAIM_TTL_MS;
  const existing = await getReviewClaim(input.jobSheetId);

  if (!isClaimActive(existing, now)) {
    throw new ReviewClaimError(
      "CONFLICT",
      `Review claim on job sheet ${input.jobSheetId} has expired. Please reclaim.`,
      "expired"
    );
  }

  if (existing.claimedBy !== input.userId) {
    throw new ReviewClaimError(
      "CONFLICT",
      `Job sheet ${input.jobSheetId} is claimed by another reviewer.`,
      "held_by_other",
      existing.claimedBy
    );
  }

  if (existing.claimToken !== input.claimToken) {
    throw new ReviewClaimError(
      "CONFLICT",
      `Review claim token mismatch for job sheet ${input.jobSheetId}.`,
      "token_mismatch",
      existing.claimedBy
    );
  }

  const updated: ReviewClaimRecord = {
    ...existing,
    expiresAt: nextExpiry(now, ttlMs),
    updatedAt: now,
  };

  const backend = await ensureSchema();
  if (backend === "memory") {
    memoryClaims.set(input.jobSheetId, updated);
    return { ...updated };
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(reviewClaimsTable)
    .set({
      expiresAt: new Date(updated.expiresAt),
      updatedAt: new Date(updated.updatedAt),
    })
    .where(eq(reviewClaimsTable.jobSheetId, input.jobSheetId));

  return updated;
}

export async function releaseReviewClaim(input: {
  jobSheetId: number;
  userId: number;
  claimToken?: string;
  now?: number;
}): Promise<{ released: boolean }> {
  const now = input.now ?? Date.now();
  const existing = await getReviewClaim(input.jobSheetId);

  if (!existing) return { released: false };

  if (existing.claimedBy !== input.userId) {
    throw new ReviewClaimError(
      "CONFLICT",
      `Cannot release claim held by another reviewer on job sheet ${input.jobSheetId}.`,
      "held_by_other",
      existing.claimedBy
    );
  }

  if (
    input.claimToken != null &&
    isClaimActive(existing, now) &&
    existing.claimToken !== input.claimToken
  ) {
    throw new ReviewClaimError(
      "CONFLICT",
      `Review claim token mismatch for job sheet ${input.jobSheetId}.`,
      "token_mismatch",
      existing.claimedBy
    );
  }

  const backend = await ensureSchema();
  if (backend === "memory") {
    memoryClaims.delete(input.jobSheetId);
    return { released: true };
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(reviewClaimsTable)
    .where(eq(reviewClaimsTable.jobSheetId, input.jobSheetId));

  return { released: true };
}

/**
 * Guard a mutation: reject when another reviewer holds a live claim.
 */
export async function assertReviewClaimAllowsMutation(
  input: ClaimMutationGuardInput
): Promise<void> {
  const now = input.now ?? Date.now();
  const existing = await getReviewClaim(input.jobSheetId);
  const decision = canMutateUnderClaim(
    existing,
    input.userId,
    input.claimToken,
    now
  );

  if (!decision.ok) {
    const message =
      decision.reason === "held_by_other"
        ? `Job sheet ${input.jobSheetId} is claimed by another reviewer. Please refresh and retry.`
        : `Review claim conflict on job sheet ${input.jobSheetId}. Please refresh and retry.`;
    throw new ReviewClaimError(
      "CONFLICT",
      message,
      decision.reason,
      decision.heldBy
    );
  }
}
