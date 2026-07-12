import {
  eq,
  ne,
  desc,
  and,
  sql,
  count,
  gte,
  lte,
  isNotNull,
  isNull,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  InsertJobSheet,
  jobSheets,
  InsertAuditResult,
  auditResults,
  InsertAuditFinding,
  auditFindings,
  InsertGoldSpec,
  goldSpecs,
  InsertDispute,
  disputes,
  InsertWaiver,
  waivers,
  InsertSystemAuditLog,
  systemAuditLog,
  InsertProcessingSetting,
  processingSettings,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  AUDIT_POLICY_SETTING_KEY,
  mergeAuditPolicy,
  parseStoredAuditPolicy,
  type AuditPolicy,
} from "./services/auditPolicy";

let _db: ReturnType<typeof drizzle> | null = null;
let _connectionVerified = false;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Test database connectivity by running a simple query.
 * Returns { connected: true, latencyMs } on success, or { connected: false, error } on failure.
 */
export async function testDbConnection(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const db = await getDb();

  if (!db) {
    if (!process.env.DATABASE_URL) {
      // No database configured - this is OK for demo mode
      return { connected: true, latencyMs: 0 };
    }
    return { connected: false, error: "Database instance not available" };
  }

  const startTime = Date.now();
  try {
    // Run a simple SELECT 1 to test connectivity
    await db.execute(sql`SELECT 1`);
    _connectionVerified = true;
    return { connected: true, latencyMs: Date.now() - startTime };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.warn("[Database] Connection test failed:", errorMessage);

    // Check for common Azure MySQL issues
    if (errorMessage.includes("SSL") || errorMessage.includes("ssl")) {
      return {
        connected: false,
        error:
          "SSL connection required - check DATABASE_URL includes ?ssl=true",
      };
    }
    if (errorMessage.includes("ECONNREFUSED")) {
      return {
        connected: false,
        error: "Connection refused - check firewall rules",
      };
    }
    if (errorMessage.includes("ETIMEDOUT")) {
      return {
        connected: false,
        error: "Connection timeout - check network/firewall",
      };
    }
    if (errorMessage.includes("Access denied")) {
      return {
        connected: false,
        error: "Authentication failed - check credentials",
      };
    }

    return { connected: false, error: errorMessage };
  }
}

/**
 * Check if database connection has been verified at least once.
 */
export function isConnectionVerified(): boolean {
  return _connectionVerified;
}

// ============ USER QUERIES ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserRole(id: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ role: role as any })
    .where(eq(users.id, id));

  return { success: true };
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create (or return existing) analytics technician user from an OCR name.
 * Uses a synthetic openId so Azure AD login is not required for attribution.
 */
export async function ensureAttributionTechnicianUser(input: {
  openId: string;
  name: string;
  email?: string | null;
}): Promise<{ id: number; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getUserByOpenId(input.openId);
  if (existing) {
    return { id: existing.id, created: false };
  }

  await db.insert(users).values({
    openId: input.openId,
    name: input.name,
    email: input.email ?? null,
    loginMethod: "attribution",
    role: "technician",
    lastSignedIn: new Date(),
  });

  const created = await getUserByOpenId(input.openId);
  if (!created) {
    throw new Error("Failed to create attribution technician user");
  }
  return { id: created.id, created: true };
}

// ============ JOB SHEET QUERIES ============

export async function createJobSheet(data: InsertJobSheet) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(jobSheets).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getJobSheetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(jobSheets)
    .where(eq(jobSheets.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getJobSheets(options?: {
  status?: string;
  limit?: number;
  offset?: number;
  technicianId?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(jobSheets);

  const conditions = [];
  if (options?.status) {
    conditions.push(eq(jobSheets.status, options.status as any));
  }
  if (options?.technicianId) {
    conditions.push(eq(jobSheets.technicianId, options.technicianId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(jobSheets.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

export async function updateJobSheetStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(jobSheets)
    .set({ status: status as any })
    .where(eq(jobSheets.id, id));
}

export async function updateJobSheetFileHash(id: number, fileHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(jobSheets).set({ fileHash }).where(eq(jobSheets.id, id));
}

/**
 * Set / clear technician attribution on a job sheet (analytics scorecards).
 */
export async function updateJobSheetTechnicianId(
  id: number,
  technicianId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(jobSheets).set({ technicianId }).where(eq(jobSheets.id, id));
  return { success: true };
}

/**
 * Job sheets missing technician attribution (for backfill + gap metrics).
 */
export async function getUnattributedJobSheets(options?: {
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}): Promise<
  Array<{
    id: number;
    referenceNumber: string | null;
    createdAt: Date;
    status: string;
  }>
> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [isNull(jobSheets.technicianId)];
  if (options?.startDate) {
    conditions.push(gte(jobSheets.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(jobSheets.createdAt, options.endDate));
  }

  const limit = options?.limit ?? 200;
  const rows = await db
    .select({
      id: jobSheets.id,
      referenceNumber: jobSheets.referenceNumber,
      createdAt: jobSheets.createdAt,
      status: jobSheets.status,
    })
    .from(jobSheets)
    .where(and(...conditions))
    .orderBy(desc(jobSheets.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Latest audit reportJson for a job sheet (technicianName backfill).
 */
export async function getLatestAuditReportJson(
  jobSheetId: number
): Promise<unknown | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({ reportJson: auditResults.reportJson })
    .from(auditResults)
    .where(eq(auditResults.jobSheetId, jobSheetId))
    .orderBy(desc(auditResults.createdAt))
    .limit(1);

  return rows[0]?.reportJson ?? null;
}

/**
 * Prior file hashes for duplicate evidence-pack detection (PHOTO-C015).
 * Match by referenceNumber when present, otherwise technicianId.
 * Excludes the current job sheet; only non-null hashes; most recent first.
 */
export async function getPriorFileHashesForJobSheet(
  jobSheetId: number,
  options?: { limit?: number }
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const current = await getJobSheetById(jobSheetId);
  if (!current) return [];

  const matchConditions = [
    ne(jobSheets.id, jobSheetId),
    isNotNull(jobSheets.fileHash),
  ];

  if (current.referenceNumber) {
    matchConditions.push(
      eq(jobSheets.referenceNumber, current.referenceNumber)
    );
  } else if (current.technicianId != null) {
    matchConditions.push(eq(jobSheets.technicianId, current.technicianId));
  } else {
    return [];
  }

  const rows = await db
    .select({ fileHash: jobSheets.fileHash })
    .from(jobSheets)
    .where(and(...matchConditions))
    .orderBy(desc(jobSheets.createdAt))
    .limit(options?.limit ?? 20);

  return rows
    .map(r => r.fileHash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);
}

// ============ AUDIT RESULT QUERIES ============

export async function createAuditResult(data: InsertAuditResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(auditResults).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getAuditResultByJobSheetId(jobSheetId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(auditResults)
    .where(eq(auditResults.jobSheetId, jobSheetId))
    .orderBy(desc(auditResults.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAuditResults(options?: {
  result?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(auditResults);

  if (options?.result) {
    query = query.where(eq(auditResults.result, options.result as any)) as any;
  }

  return query
    .orderBy(desc(auditResults.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

// ============ AUDIT FINDING QUERIES ============

export async function createAuditFindings(data: InsertAuditFinding[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.length === 0) return [];

  await db.insert(auditFindings).values(data);
  return data;
}

export async function getAuditFindingsByResultId(auditResultId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.auditResultId, auditResultId))
    .orderBy(auditFindings.severity, auditFindings.reasonCode);
}

export async function getAuditFindingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateFindingResolution(
  id: number,
  data: {
    resolutionStatus: "open" | "waived" | "overridden" | "flagged" | "approved";
    resolutionReason?: string | null;
    resolvedBy?: number | null;
    resolvedAt?: Date | null;
    previousResolutionStatus?:
      | "open"
      | "waived"
      | "overridden"
      | "flagged"
      | "approved"
      | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(auditFindings)
    .set({
      resolutionStatus: data.resolutionStatus,
      resolutionReason: data.resolutionReason ?? null,
      resolvedBy: data.resolvedBy ?? null,
      resolvedAt: data.resolvedAt ?? null,
      previousResolutionStatus: data.previousResolutionStatus ?? null,
    })
    .where(eq(auditFindings.id, id));
}

/** PR-13: persist reviewer field correction into normalisedSnippet (no new migration). */
export async function updateFindingSnippet(
  id: number,
  data: { normalisedSnippet: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(auditFindings)
    .set({
      normalisedSnippet: data.normalisedSnippet,
    })
    .where(eq(auditFindings.id, id));
}

export async function getAuditResultById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(auditResults)
    .where(eq(auditResults.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateAuditResultStatus(
  id: number,
  result: "pass" | "fail" | "review_queue" | "waived"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(auditResults).set({ result }).where(eq(auditResults.id, id));
}

export async function deleteWaiver(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(waivers).where(eq(waivers.id, id));
}

// ============ GOLD SPEC QUERIES ============

export async function createGoldSpec(data: InsertGoldSpec) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(goldSpecs).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getActiveGoldSpec(specType?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = [eq(goldSpecs.isActive, true)];
  if (specType) {
    conditions.push(eq(goldSpecs.specType, specType as any));
  }

  const result = await db
    .select()
    .from(goldSpecs)
    .where(and(...conditions))
    .orderBy(desc(goldSpecs.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAllGoldSpecs() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(goldSpecs).orderBy(desc(goldSpecs.createdAt));
}

export async function activateGoldSpec(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // First, deactivate all specs of the same type
  const spec = await db
    .select()
    .from(goldSpecs)
    .where(eq(goldSpecs.id, id))
    .limit(1);
  if (spec.length === 0) throw new Error("Spec not found");

  await db
    .update(goldSpecs)
    .set({ isActive: false })
    .where(eq(goldSpecs.specType, spec[0].specType));

  // Then activate the selected spec
  await db
    .update(goldSpecs)
    .set({ isActive: true })
    .where(eq(goldSpecs.id, id));

  return { success: true };
}

// ============ DISPUTE QUERIES ============

export async function createDispute(data: InsertDispute) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(disputes).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getDisputes(options?: {
  status?: string;
  raisedBy?: number;
  reviewerId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(disputes);

  const conditions = [];
  if (options?.status) {
    conditions.push(eq(disputes.status, options.status as any));
  }
  if (options?.raisedBy) {
    conditions.push(eq(disputes.raisedBy, options.raisedBy));
  }
  if (options?.reviewerId) {
    conditions.push(eq(disputes.reviewerId, options.reviewerId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(disputes.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

export async function updateDisputeStatus(
  id: number,
  status: string,
  reviewerId?: number,
  reviewNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, any> = { status };
  if (reviewerId) updateData.reviewerId = reviewerId;
  if (reviewNotes) updateData.reviewNotes = reviewNotes;
  if (status === "accepted" || status === "rejected") {
    updateData.resolvedAt = new Date();
  }

  await db.update(disputes).set(updateData).where(eq(disputes.id, id));
}

// ============ WAIVER QUERIES ============

export async function createWaiver(data: InsertWaiver) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(waivers).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getWaiverByFindingId(auditFindingId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(waivers)
    .where(eq(waivers.auditFindingId, auditFindingId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ AUDIT LOG QUERIES ============

export async function logAction(data: InsertSystemAuditLog) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot log action: database not available");
    return;
  }

  await db.insert(systemAuditLog).values(data);
}

export async function getAuditLogs(options?: {
  userId?: number;
  entityType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(systemAuditLog);

  const conditions = [];
  if (options?.userId) {
    conditions.push(eq(systemAuditLog.userId, options.userId));
  }
  if (options?.entityType) {
    conditions.push(eq(systemAuditLog.entityType, options.entityType));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(systemAuditLog.createdAt))
    .limit(options?.limit ?? 100)
    .offset(options?.offset ?? 0);
}

export async function getOverturnMetricsActionLogs(options?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(systemAuditLog.entityType, "audit_finding")];
  if (options?.startDate) {
    conditions.push(gte(systemAuditLog.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(systemAuditLog.createdAt, options.endDate));
  }

  return db
    .select()
    .from(systemAuditLog)
    .where(and(...conditions))
    .orderBy(desc(systemAuditLog.createdAt))
    .limit(10000);
}

// ============ STATISTICS QUERIES ============

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  // Get total audits
  const totalAudits = await db.select({ count: count() }).from(auditResults);

  // Get pass rate
  const passedAudits = await db
    .select({ count: count() })
    .from(auditResults)
    .where(eq(auditResults.result, "pass"));

  // Get review queue count
  const reviewQueue = await db
    .select({ count: count() })
    .from(jobSheets)
    .where(eq(jobSheets.status, "review_queue"));

  // Get critical issues (S0 and S1)
  const criticalIssues = await db
    .select({ count: count() })
    .from(auditFindings)
    .where(sql`${auditFindings.severity} IN ('S0', 'S1')`);

  const total = totalAudits[0]?.count ?? 0;
  const passed = passedAudits[0]?.count ?? 0;

  return {
    totalAudits: total,
    passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : "0",
    reviewQueue: reviewQueue[0]?.count ?? 0,
    criticalIssues: criticalIssues[0]?.count ?? 0,
  };
}

/**
 * Period-scoped executive KPIs for analytics overview.
 * totalAudits / passRate / criticalIssues honor startDate–endDate;
 * reviewQueue remains a live snapshot of currently queued job sheets.
 */
export async function getExecutiveSummaryStats(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const end = options?.endDate ?? new Date();
  const start =
    options?.startDate ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const auditPeriod = and(
    gte(auditResults.createdAt, start),
    lte(auditResults.createdAt, end)
  );

  const site = options?.site;

  const totalAudits = site
    ? await db
        .select({ count: count() })
        .from(auditResults)
        .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
        .where(and(auditPeriod, eq(jobSheets.siteInfo, site)))
    : await db.select({ count: count() }).from(auditResults).where(auditPeriod);

  const passedAudits = site
    ? await db
        .select({ count: count() })
        .from(auditResults)
        .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
        .where(
          and(
            auditPeriod,
            eq(auditResults.result, "pass"),
            eq(jobSheets.siteInfo, site)
          )
        )
    : await db
        .select({ count: count() })
        .from(auditResults)
        .where(and(auditPeriod, eq(auditResults.result, "pass")));

  // Live snapshot — not filtered by the selected analytics period.
  const reviewQueueConditions = [eq(jobSheets.status, "review_queue")];
  if (site) {
    reviewQueueConditions.push(eq(jobSheets.siteInfo, site));
  }
  const reviewQueue = await db
    .select({ count: count() })
    .from(jobSheets)
    .where(and(...reviewQueueConditions));

  const criticalIssueConditions = [
    sql`${auditFindings.severity} IN ('S0', 'S1')`,
    gte(auditFindings.createdAt, start),
    lte(auditFindings.createdAt, end),
  ];
  if (site) {
    criticalIssueConditions.push(eq(jobSheets.siteInfo, site));
  }
  const criticalIssuesQuery = db
    .select({ count: count() })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id));
  const criticalIssues = await criticalIssuesQuery.where(
    and(...criticalIssueConditions)
  );

  const total = totalAudits[0]?.count ?? 0;
  const passed = passedAudits[0]?.count ?? 0;

  return {
    totalAudits: total,
    passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : "0",
    reviewQueue: reviewQueue[0]?.count ?? 0,
    criticalIssues: criticalIssues[0]?.count ?? 0,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}

// ============ PROCESSING SETTINGS QUERIES ============

export interface ProcessingSettingsConfig {
  llmFallbackEnabled: boolean;
  llmConfidenceThreshold: number;
  ocrEnabled: boolean;
  ocrConfidenceThreshold: number;
  fuzzyMatchingEnabled: boolean;
  fuzzyMatchThreshold: number;
  maxRetries: number;
  processingTimeoutMs: number;
}

const DEFAULT_PROCESSING_SETTINGS: ProcessingSettingsConfig = {
  llmFallbackEnabled: true,
  llmConfidenceThreshold: 70,
  ocrEnabled: true,
  ocrConfidenceThreshold: 60,
  fuzzyMatchingEnabled: true,
  fuzzyMatchThreshold: 80,
  maxRetries: 3,
  processingTimeoutMs: 60000,
};

export async function getProcessingSettings(): Promise<ProcessingSettingsConfig> {
  const db = await getDb();
  if (!db) return DEFAULT_PROCESSING_SETTINGS;

  try {
    const results = await db.select().from(processingSettings);

    const config = { ...DEFAULT_PROCESSING_SETTINGS };

    for (const setting of results) {
      const key = setting.settingKey as keyof ProcessingSettingsConfig;
      if (key in config && setting.settingValue !== null) {
        (config as any)[key] =
          (setting.settingValue as any).value ?? setting.settingValue;
      }
    }

    return config;
  } catch (error) {
    console.error("[Database] Failed to get processing settings:", error);
    return DEFAULT_PROCESSING_SETTINGS;
  }
}

export async function updateProcessingSetting(
  settingKey: string,
  settingValue: any,
  updatedBy: number,
  description?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingSetting = await db
    .select()
    .from(processingSettings)
    .where(eq(processingSettings.settingKey, settingKey))
    .limit(1);

  if (existingSetting.length > 0) {
    await db
      .update(processingSettings)
      .set({
        settingValue: { value: settingValue },
        updatedBy,
        ...(description && { description }),
      })
      .where(eq(processingSettings.settingKey, settingKey));
  } else {
    await db.insert(processingSettings).values({
      settingKey,
      settingValue: { value: settingValue },
      description: description ?? `Setting for ${settingKey}`,
      category: "extraction",
      updatedBy,
    });
  }
}

export async function getAllProcessingSettings() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(processingSettings)
    .orderBy(processingSettings.category);
}

// ============ AUDIT POLICY (Major / Minor fail) ============

/**
 * Load admin Audit Policy (Major/Minor). Falls back to code defaults.
 */
export async function getAuditPolicy(): Promise<AuditPolicy> {
  const db = await getDb();
  if (!db) return mergeAuditPolicy(null);

  try {
    const rows = await db
      .select()
      .from(processingSettings)
      .where(eq(processingSettings.settingKey, AUDIT_POLICY_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return mergeAuditPolicy(null);
    return mergeAuditPolicy(parseStoredAuditPolicy(rows[0].settingValue));
  } catch (error) {
    console.error("[Database] Failed to get audit policy:", error);
    return mergeAuditPolicy(null);
  }
}

/**
 * Persist Audit Policy JSON (admin Settings → Audit Policy).
 */
export async function saveAuditPolicy(
  policy: AuditPolicy,
  updatedBy: number
): Promise<void> {
  await updateProcessingSetting(
    AUDIT_POLICY_SETTING_KEY,
    policy,
    updatedBy,
    "Major/Minor fail policy (Audit Policy)"
  );

  // Ensure category is validation for grouping
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .update(processingSettings)
      .set({ category: "validation" })
      .where(eq(processingSettings.settingKey, AUDIT_POLICY_SETTING_KEY));
  } catch {
    // Non-fatal — setting value is what matters
  }
}

// ============ ENGINEER ANALYTICS QUERIES (PR-15) ============

export interface EngineerAnalyticsDocumentRow {
  technicianId: number;
  jobSheetId: number;
  referenceNumber: string | null;
  siteInfo: string | null;
  result: "pass" | "fail" | "review_queue" | "waived" | null;
  confidenceScore: number | null;
  processedAt: Date;
}

export interface EngineerAnalyticsFindingRow {
  findingId: number;
  technicianId: number;
  jobSheetId: number;
  severity: "S0" | "S1" | "S2" | "S3";
  reasonCode:
    | "MISSING_FIELD"
    | "UNREADABLE_FIELD"
    | "LOW_CONFIDENCE"
    | "INVALID_FORMAT"
    | "CONFLICT"
    | "OUT_OF_POLICY"
    | "INCOMPLETE_EVIDENCE"
    | "OCR_FAILURE"
    | "PIPELINE_ERROR"
    | "SPEC_GAP"
    | "SECURITY_RISK";
  fieldName: string;
  ruleId: string | null;
  resolutionStatus: "open" | "waived" | "overridden" | "flagged" | "approved";
  occurredAt: Date;
}

/**
 * Job sheets attributed to a technician within an optional date window.
 * Uses jobSheets.createdAt as the processing timestamp.
 */
export async function getEngineerAnalyticsDocuments(options?: {
  startDate?: Date;
  endDate?: Date;
  technicianId?: number;
  site?: string;
}): Promise<EngineerAnalyticsDocumentRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [isNotNull(jobSheets.technicianId)];
  if (options?.startDate) {
    conditions.push(gte(jobSheets.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(jobSheets.createdAt, options.endDate));
  }
  if (options?.technicianId != null) {
    conditions.push(eq(jobSheets.technicianId, options.technicianId));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      technicianId: jobSheets.technicianId,
      jobSheetId: jobSheets.id,
      referenceNumber: jobSheets.referenceNumber,
      siteInfo: jobSheets.siteInfo,
      result: auditResults.result,
      confidenceScore: auditResults.confidenceScore,
      processedAt: jobSheets.createdAt,
    })
    .from(jobSheets)
    .leftJoin(auditResults, eq(auditResults.jobSheetId, jobSheets.id))
    .where(and(...conditions));

  // Prefer latest audit result per job sheet when multiple exist
  const latest = new Map<
    number,
    {
      technicianId: number;
      jobSheetId: number;
      referenceNumber: string | null;
      siteInfo: string | null;
      result: EngineerAnalyticsDocumentRow["result"];
      confidenceScore: number | null;
      processedAt: Date;
    }
  >();

  for (const r of rows) {
    if (r.technicianId == null) continue;
    const conf = r.confidenceScore != null ? Number(r.confidenceScore) : null;
    const mapped = {
      technicianId: r.technicianId,
      jobSheetId: r.jobSheetId,
      referenceNumber: r.referenceNumber,
      siteInfo: r.siteInfo,
      result: (r.result ?? null) as EngineerAnalyticsDocumentRow["result"],
      confidenceScore: conf != null && Number.isFinite(conf) ? conf : null,
      processedAt: r.processedAt,
    };
    const existing = latest.get(r.jobSheetId);
    if (!existing || r.processedAt >= existing.processedAt) {
      // Keep richer result when timestamps equal and we have an audit row
      if (
        existing &&
        r.processedAt.getTime() === existing.processedAt.getTime() &&
        existing.result != null &&
        mapped.result == null
      ) {
        continue;
      }
      latest.set(r.jobSheetId, mapped);
    }
  }

  return Array.from(latest.values());
}

/**
 * Audit findings joined to technician-attributed job sheets.
 * Window is applied to finding createdAt; prior-period callers pass a wider range.
 */
export async function getEngineerAnalyticsFindings(options?: {
  startDate?: Date;
  endDate?: Date;
  technicianId?: number;
  site?: string;
}): Promise<EngineerAnalyticsFindingRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [isNotNull(jobSheets.technicianId)];
  if (options?.startDate) {
    conditions.push(gte(auditFindings.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(auditFindings.createdAt, options.endDate));
  }
  if (options?.technicianId != null) {
    conditions.push(eq(jobSheets.technicianId, options.technicianId));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      findingId: auditFindings.id,
      technicianId: jobSheets.technicianId,
      jobSheetId: jobSheets.id,
      severity: auditFindings.severity,
      reasonCode: auditFindings.reasonCode,
      fieldName: auditFindings.fieldName,
      ruleId: auditFindings.ruleId,
      resolutionStatus: auditFindings.resolutionStatus,
      occurredAt: auditFindings.createdAt,
    })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
    .where(and(...conditions));

  return rows
    .filter(
      (
        r
      ): r is {
        findingId: number;
        technicianId: number;
        jobSheetId: number;
        severity: EngineerAnalyticsFindingRow["severity"];
        reasonCode: EngineerAnalyticsFindingRow["reasonCode"];
        fieldName: string;
        ruleId: string | null;
        resolutionStatus: EngineerAnalyticsFindingRow["resolutionStatus"];
        occurredAt: Date;
      } => r.technicianId != null
    )
    .map(r => ({
      findingId: r.findingId,
      technicianId: r.technicianId,
      jobSheetId: r.jobSheetId,
      severity: r.severity,
      reasonCode: r.reasonCode,
      fieldName: r.fieldName,
      ruleId: r.ruleId,
      resolutionStatus: r.resolutionStatus,
      occurredAt: r.occurredAt,
    }));
}

// ============ PR-16: COHORT ANALYTICS ============

export interface CohortAnalyticsDocumentRow {
  jobSheetId: number;
  siteInfo: string | null;
  assetType: string | null;
  workType: string | null;
  templateSlug: string | null;
  result: "pass" | "fail" | "review_queue" | "waived";
  confidenceScore: number | null;
  processedAt: Date;
}

export interface CohortAnalyticsFindingRow {
  findingId: number;
  jobSheetId: number;
  severity: "S0" | "S1" | "S2" | "S3";
  reasonCode: string;
  fieldName: string;
  occurredAt: Date;
}

function parseReportCohort(reportJson: unknown): {
  assetType: string | null;
  workType: string | null;
  templateSlug: string | null;
} {
  if (!reportJson || typeof reportJson !== "object") {
    return { assetType: null, workType: null, templateSlug: null };
  }
  const report = reportJson as Record<string, unknown>;
  const cohort = report.selectionCohort as Record<string, unknown> | undefined;
  const selection = report.selectionResult as
    | Record<string, unknown>
    | undefined;
  const candidates = selection?.candidates as
    | Array<Record<string, unknown>>
    | undefined;

  return {
    assetType: typeof cohort?.assetType === "string" ? cohort.assetType : null,
    workType: typeof cohort?.workType === "string" ? cohort.workType : null,
    templateSlug:
      typeof cohort?.templateSlug === "string"
        ? cohort.templateSlug
        : typeof candidates?.[0]?.templateSlug === "string"
          ? (candidates[0].templateSlug as string)
          : null,
  };
}

/**
 * Job sheets + latest audit result for cohort analytics (site / asset / work type).
 */
export async function getCohortAnalyticsDocuments(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<CohortAnalyticsDocumentRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(jobSheets.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(jobSheets.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      jobSheetId: jobSheets.id,
      siteInfo: jobSheets.siteInfo,
      result: auditResults.result,
      confidenceScore: auditResults.confidenceScore,
      reportJson: auditResults.reportJson,
      processedAt: jobSheets.createdAt,
    })
    .from(jobSheets)
    .innerJoin(auditResults, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  // Keep latest audit per job sheet
  const latest = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = latest.get(row.jobSheetId);
    if (!existing) {
      latest.set(row.jobSheetId, row);
      continue;
    }
    // Prefer higher audit id via processedAt tie-break already ordered loosely
    if (row.processedAt > existing.processedAt) {
      latest.set(row.jobSheetId, row);
    }
  }

  return Array.from(latest.values()).map(r => {
    const cohort = parseReportCohort(r.reportJson);
    const conf = r.confidenceScore != null ? Number(r.confidenceScore) : null;
    return {
      jobSheetId: r.jobSheetId,
      siteInfo: r.siteInfo,
      assetType: cohort.assetType,
      workType: cohort.workType,
      templateSlug: cohort.templateSlug,
      result: r.result,
      confidenceScore: conf != null && Number.isFinite(conf) ? conf : null,
      processedAt: r.processedAt,
    };
  });
}

/**
 * Findings for cohort analytics within an optional date window.
 */
export async function getCohortAnalyticsFindings(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<CohortAnalyticsFindingRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(auditFindings.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(auditFindings.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      findingId: auditFindings.id,
      jobSheetId: jobSheets.id,
      severity: auditFindings.severity,
      reasonCode: auditFindings.reasonCode,
      fieldName: auditFindings.fieldName,
      occurredAt: auditFindings.createdAt,
    })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(r => ({
    findingId: r.findingId,
    jobSheetId: r.jobSheetId,
    severity: r.severity,
    reasonCode: r.reasonCode,
    fieldName: r.fieldName,
    occurredAt: r.occurredAt,
  }));
}

// ============ PR-17: EXCEPTION MANAGEMENT ============

export type ExceptionSlaSeverity = "S0" | "S1" | "S2" | "S3" | "unknown";

export interface ExceptionHoldQueueRow {
  jobSheetId: number;
  referenceNumber: string | null;
  siteInfo: string | null;
  queuedAt: Date;
  highestSeverity: ExceptionSlaSeverity;
  openFindingCount: number;
  technicianId: number | null;
}

export interface ExceptionOverturnFindingRow {
  findingId: number;
  jobSheetId: number;
  ruleId: string | null;
  reasonCode: string;
  severity: "S0" | "S1" | "S2" | "S3";
  fieldName: string;
  resolutionStatus: "open" | "waived" | "overridden" | "flagged" | "approved";
  siteInfo: string | null;
  technicianId: number | null;
  occurredAt: Date;
  resolvedAt: Date | null;
}

const SEVERITY_RANK: Record<ExceptionSlaSeverity, number> = {
  S0: 0,
  S1: 1,
  S2: 2,
  S3: 3,
  unknown: 4,
};

function worseSeverity(
  a: ExceptionSlaSeverity,
  b: ExceptionSlaSeverity
): ExceptionSlaSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

/**
 * Hold-queue sheets with open-finding severity for SLA / ageing.
 */
export async function getExceptionHoldQueueItems(options?: {
  site?: string;
}): Promise<ExceptionHoldQueueRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(jobSheets.status, "review_queue")];
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const sheets = await db
    .select({
      jobSheetId: jobSheets.id,
      referenceNumber: jobSheets.referenceNumber,
      siteInfo: jobSheets.siteInfo,
      queuedAt: jobSheets.updatedAt,
      technicianId: jobSheets.technicianId,
    })
    .from(jobSheets)
    .where(and(...conditions))
    .orderBy(desc(jobSheets.updatedAt));

  if (sheets.length === 0) return [];

  const findingRows = await db
    .select({
      jobSheetId: jobSheets.id,
      severity: auditFindings.severity,
      resolutionStatus: auditFindings.resolutionStatus,
    })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
    .where(and(...conditions));

  const bySheet = new Map<
    number,
    { highest: ExceptionSlaSeverity; openCount: number }
  >();

  for (const s of sheets) {
    bySheet.set(s.jobSheetId, { highest: "unknown", openCount: 0 });
  }

  for (const row of findingRows) {
    const entry = bySheet.get(row.jobSheetId);
    if (!entry) continue;
    const status = row.resolutionStatus ?? "open";
    if (status === "open" || status === "flagged") {
      entry.openCount++;
      entry.highest = worseSeverity(
        entry.highest,
        (row.severity as ExceptionSlaSeverity) ?? "unknown"
      );
    }
  }

  return sheets.map(s => {
    const agg = bySheet.get(s.jobSheetId) ?? {
      highest: "unknown" as ExceptionSlaSeverity,
      openCount: 0,
    };
    return {
      jobSheetId: s.jobSheetId,
      referenceNumber: s.referenceNumber,
      siteInfo: s.siteInfo,
      queuedAt: s.queuedAt,
      highestSeverity: agg.highest,
      openFindingCount: agg.openCount,
      technicianId: s.technicianId,
    };
  });
}

/**
 * Findings with resolution status for per-rule overturn analytics.
 */
export async function getExceptionOverturnFindings(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<ExceptionOverturnFindingRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(auditFindings.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(auditFindings.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      findingId: auditFindings.id,
      jobSheetId: jobSheets.id,
      ruleId: auditFindings.ruleId,
      reasonCode: auditFindings.reasonCode,
      severity: auditFindings.severity,
      fieldName: auditFindings.fieldName,
      resolutionStatus: auditFindings.resolutionStatus,
      siteInfo: jobSheets.siteInfo,
      technicianId: jobSheets.technicianId,
      occurredAt: auditFindings.createdAt,
      resolvedAt: auditFindings.resolvedAt,
    })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(r => ({
    findingId: r.findingId,
    jobSheetId: r.jobSheetId,
    ruleId: r.ruleId,
    reasonCode: r.reasonCode,
    severity: r.severity,
    fieldName: r.fieldName,
    resolutionStatus: (r.resolutionStatus ?? "open") as
      | "open"
      | "waived"
      | "overridden"
      | "flagged"
      | "approved",
    siteInfo: r.siteInfo,
    technicianId: r.technicianId,
    occurredAt: r.occurredAt,
    resolvedAt: r.resolvedAt ?? null,
  }));
}

// ============ PR-18: DRIFT ANALYTICS ============

export interface DriftAnalyticsDocumentRow {
  jobSheetId: number;
  technicianId: number | null;
  templateSlug: string | null;
  assetType: string | null;
  result: "pass" | "fail" | "review_queue" | "waived";
  confidenceScore: number | null;
  processedAt: Date;
}

export interface DriftAnalyticsFindingRow {
  findingId: number;
  jobSheetId: number;
  severity: "S0" | "S1" | "S2" | "S3";
  occurredAt: Date;
}

/**
 * Job sheets + latest audit for EWMA/CUSUM defect-rate series (PR-18).
 */
export async function getDriftAnalyticsDocuments(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<DriftAnalyticsDocumentRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(jobSheets.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(jobSheets.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      jobSheetId: jobSheets.id,
      technicianId: jobSheets.technicianId,
      result: auditResults.result,
      confidenceScore: auditResults.confidenceScore,
      reportJson: auditResults.reportJson,
      processedAt: jobSheets.createdAt,
    })
    .from(jobSheets)
    .innerJoin(auditResults, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const latest = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = latest.get(row.jobSheetId);
    if (!existing || row.processedAt > existing.processedAt) {
      latest.set(row.jobSheetId, row);
    }
  }

  return Array.from(latest.values()).map(r => {
    const cohort = parseReportCohort(r.reportJson);
    const conf = r.confidenceScore != null ? Number(r.confidenceScore) : null;
    return {
      jobSheetId: r.jobSheetId,
      technicianId: r.technicianId,
      templateSlug: cohort.templateSlug,
      assetType: cohort.assetType,
      result: r.result,
      confidenceScore: conf != null && Number.isFinite(conf) ? conf : null,
      processedAt: r.processedAt,
    };
  });
}

/**
 * Findings for drift analytics within an optional date window.
 */
export async function getDriftAnalyticsFindings(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<DriftAnalyticsFindingRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(auditFindings.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(auditFindings.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      findingId: auditFindings.id,
      jobSheetId: jobSheets.id,
      severity: auditFindings.severity,
      occurredAt: auditFindings.createdAt,
    })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(r => ({
    findingId: r.findingId,
    jobSheetId: r.jobSheetId,
    severity: r.severity,
    occurredAt: r.occurredAt,
  }));
}

// ============ PR-19: PREDICTIVE RISK ANALYTICS ============

export interface PredictiveRiskDocumentRow {
  jobSheetId: number;
  technicianId: number | null;
  templateSlug: string | null;
  assetType: string | null;
  result: "pass" | "fail" | "review_queue" | "waived";
  confidenceScore: number | null;
  processedAt: Date;
}

export interface PredictiveRiskFindingRow {
  findingId: number;
  jobSheetId: number;
  technicianId: number | null;
  severity: "S0" | "S1" | "S2" | "S3";
  reasonCode: string;
  fieldName: string;
  resolutionStatus: "open" | "waived" | "overridden" | "flagged" | "approved";
  occurredAt: Date;
}

export interface PredictiveRiskDisputeRow {
  id: number;
  auditFindingId: number;
  raisedBy: number;
  status: string;
  createdAt: Date;
}

/**
 * Job sheets + latest audit for predictive risk scoring (PR-19).
 * Reuses the same join shape as drift analytics.
 */
export async function getPredictiveRiskDocuments(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<PredictiveRiskDocumentRow[]> {
  return getDriftAnalyticsDocuments(options);
}

/**
 * Findings with technician + reason metadata for leading indicators (PR-19).
 */
export async function getPredictiveRiskFindings(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<PredictiveRiskFindingRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(auditFindings.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(auditFindings.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      findingId: auditFindings.id,
      jobSheetId: jobSheets.id,
      technicianId: jobSheets.technicianId,
      severity: auditFindings.severity,
      reasonCode: auditFindings.reasonCode,
      fieldName: auditFindings.fieldName,
      resolutionStatus: auditFindings.resolutionStatus,
      occurredAt: auditFindings.createdAt,
    })
    .from(auditFindings)
    .innerJoin(auditResults, eq(auditFindings.auditResultId, auditResults.id))
    .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(r => ({
    findingId: r.findingId,
    jobSheetId: r.jobSheetId,
    technicianId: r.technicianId,
    severity: r.severity,
    reasonCode: r.reasonCode,
    fieldName: r.fieldName ?? "",
    resolutionStatus: (r.resolutionStatus ?? "open") as
      | "open"
      | "waived"
      | "overridden"
      | "flagged"
      | "approved",
    occurredAt: r.occurredAt,
  }));
}

/**
 * Disputes in-window for dispute-rate leading indicator (PR-19).
 */
export async function getPredictiveRiskDisputes(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<PredictiveRiskDisputeRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(disputes.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(disputes.createdAt, options.endDate));
  }

  const baseSelect = {
    id: disputes.id,
    auditFindingId: disputes.auditFindingId,
    raisedBy: disputes.raisedBy,
    status: disputes.status,
    createdAt: disputes.createdAt,
  };

  const rows = options?.site
    ? await db
        .select(baseSelect)
        .from(disputes)
        .innerJoin(auditFindings, eq(disputes.auditFindingId, auditFindings.id))
        .innerJoin(
          auditResults,
          eq(auditFindings.auditResultId, auditResults.id)
        )
        .innerJoin(jobSheets, eq(auditResults.jobSheetId, jobSheets.id))
        .where(and(...conditions, eq(jobSheets.siteInfo, options.site)))
    : await db
        .select(baseSelect)
        .from(disputes)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(r => ({
    id: r.id,
    auditFindingId: r.auditFindingId,
    raisedBy: r.raisedBy,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

// ============ PR-21: SHADOW / CHAMPION-CHALLENGER ============

/**
 * Latest audit reportJson blobs for shadow disagreement reporting.
 * Returns raw reportJson so callers can extract shadowComparison artifacts.
 */
export async function getShadowComparisonReportJsons(options?: {
  startDate?: Date;
  endDate?: Date;
  site?: string;
}): Promise<unknown[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options?.startDate) {
    conditions.push(gte(jobSheets.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(jobSheets.createdAt, options.endDate));
  }
  if (options?.site) {
    conditions.push(eq(jobSheets.siteInfo, options.site));
  }

  const rows = await db
    .select({
      jobSheetId: jobSheets.id,
      reportJson: auditResults.reportJson,
      processedAt: jobSheets.createdAt,
    })
    .from(jobSheets)
    .innerJoin(auditResults, eq(auditResults.jobSheetId, jobSheets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const latest = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = latest.get(row.jobSheetId);
    if (!existing || row.processedAt > existing.processedAt) {
      latest.set(row.jobSheetId, row);
    }
  }

  return Array.from(latest.values()).map(r => r.reportJson);
}
