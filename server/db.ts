import { eq, desc, and, sql, count, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  InsertJobSheet, jobSheets, 
  InsertAuditResult, auditResults,
  InsertAuditFinding, auditFindings,
  InsertGoldSpec, goldSpecs,
  InsertDispute, disputes,
  InsertWaiver, waivers,
  InsertSystemAuditLog, systemAuditLog,
  InsertProcessingSetting, processingSettings
} from "../drizzle/schema";
import { ENV } from './_core/env';

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
export async function testDbConnection(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const db = await getDb();
  
  if (!db) {
    if (!process.env.DATABASE_URL) {
      // No database configured - this is OK for demo mode
      return { connected: true, latencyMs: 0 };
    }
    return { connected: false, error: 'Database instance not available' };
  }

  const startTime = Date.now();
  try {
    // Run a simple SELECT 1 to test connectivity
    await db.execute(sql`SELECT 1`);
    _connectionVerified = true;
    return { connected: true, latencyMs: Date.now() - startTime };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Database] Connection test failed:', errorMessage);
    
    // Check for common Azure MySQL issues
    if (errorMessage.includes('SSL') || errorMessage.includes('ssl')) {
      return { connected: false, error: 'SSL connection required - check DATABASE_URL includes ?ssl=true' };
    }
    if (errorMessage.includes('ECONNREFUSED')) {
      return { connected: false, error: 'Connection refused - check firewall rules' };
    }
    if (errorMessage.includes('ETIMEDOUT')) {
      return { connected: false, error: 'Connection timeout - check network/firewall' };
    }
    if (errorMessage.includes('Access denied')) {
      return { connected: false, error: 'Authentication failed - check credentials' };
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
      values.role = 'admin';
      updateSet.role = 'admin';
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

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserRole(id: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users)
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
  
  const result = await db.select().from(jobSheets).where(eq(jobSheets.id, id)).limit(1);
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
  
  await db.update(jobSheets)
    .set({ status: status as any })
    .where(eq(jobSheets.id, id));
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
  
  const result = await db.select()
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
  
  return db.select()
    .from(auditFindings)
    .where(eq(auditFindings.auditResultId, auditResultId))
    .orderBy(auditFindings.severity, auditFindings.reasonCode);
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
  
  const result = await db.select()
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
  const spec = await db.select().from(goldSpecs).where(eq(goldSpecs.id, id)).limit(1);
  if (spec.length === 0) throw new Error("Spec not found");
  
  await db.update(goldSpecs)
    .set({ isActive: false })
    .where(eq(goldSpecs.specType, spec[0].specType));
  
  // Then activate the selected spec
  await db.update(goldSpecs)
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

export async function updateDisputeStatus(id: number, status: string, reviewerId?: number, reviewNotes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: Record<string, any> = { status };
  if (reviewerId) updateData.reviewerId = reviewerId;
  if (reviewNotes) updateData.reviewNotes = reviewNotes;
  if (status === 'accepted' || status === 'rejected') {
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
  
  const result = await db.select()
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

// ============ STATISTICS QUERIES ============

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Get total audits
  const totalAudits = await db.select({ count: count() }).from(auditResults);
  
  // Get pass rate
  const passedAudits = await db.select({ count: count() })
    .from(auditResults)
    .where(eq(auditResults.result, 'pass'));
  
  // Get review queue count
  const reviewQueue = await db.select({ count: count() })
    .from(jobSheets)
    .where(eq(jobSheets.status, 'review_queue'));
  
  // Get critical issues (S0 and S1)
  const criticalIssues = await db.select({ count: count() })
    .from(auditFindings)
    .where(sql`${auditFindings.severity} IN ('S0', 'S1')`);
  
  const total = totalAudits[0]?.count ?? 0;
  const passed = passedAudits[0]?.count ?? 0;
  
  return {
    totalAudits: total,
    passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : '0',
    reviewQueue: reviewQueue[0]?.count ?? 0,
    criticalIssues: criticalIssues[0]?.count ?? 0,
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
        (config as any)[key] = (setting.settingValue as any).value ?? setting.settingValue;
      }
    }
    
    return config;
  } catch (error) {
    console.error('[Database] Failed to get processing settings:', error);
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
  if (!db) throw new Error('Database not available');
  
  const existingSetting = await db.select()
    .from(processingSettings)
    .where(eq(processingSettings.settingKey, settingKey))
    .limit(1);
  
  if (existingSetting.length > 0) {
    await db.update(processingSettings)
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
      category: 'extraction',
      updatedBy,
    });
  }
}

export async function getAllProcessingSettings() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(processingSettings).orderBy(processingSettings.category);
}
