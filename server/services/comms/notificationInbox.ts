/**
 * DB-backed notification inbox for the header bell (J-NOTIF-01).
 * Falls back to in-memory when DATABASE_URL is unavailable.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  userNotifications,
  type InsertUserNotification,
  type UserNotificationRow,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export type NotificationType = "info" | "success" | "warning" | "error";

export type InboxNotification = {
  id: string;
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: Date;
  meta?: unknown;
};

type MemoryRow = InsertUserNotification & { id: string };

const memoryInbox: MemoryRow[] = [];
const MAX_MEMORY = 2_000;

export function resetNotificationInboxMemory(): void {
  memoryInbox.length = 0;
}

function rowToInbox(row: UserNotificationRow | MemoryRow): InboxNotification {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt
      : new Date(row.createdAt as unknown as string);
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    type: row.type as NotificationType,
    read: Boolean(row.readAt),
    createdAt,
    meta: row.meta ?? undefined,
  };
}

export async function createNotification(input: {
  userId: number;
  title: string;
  message: string;
  type?: NotificationType;
  meta?: unknown;
}): Promise<InboxNotification> {
  const id = `notif_${randomUUID()}`;
  const now = new Date();
  const row: MemoryRow = {
    id,
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type ?? "info",
    readAt: null,
    dismissedAt: null,
    meta: (input.meta as InsertUserNotification["meta"]) ?? null,
    createdAt: now,
  };

  memoryInbox.unshift(row);
  if (memoryInbox.length > MAX_MEMORY) memoryInbox.length = MAX_MEMORY;

  try {
    const db = await getDb();
    if (db) {
      await db.insert(userNotifications).values(row);
    }
  } catch (error) {
    console.warn("[notifications] Failed to persist inbox row:", error);
  }

  return rowToInbox(row);
}

export async function listNotifications(
  userId: number,
  limit = 50
): Promise<InboxNotification[]> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, userId),
            isNull(userNotifications.dismissedAt)
          )
        )
        .orderBy(desc(userNotifications.createdAt))
        .limit(limit);
      if (rows.length > 0 || process.env.DATABASE_URL) {
        return rows.map(rowToInbox);
      }
    }
  } catch (error) {
    console.warn("[notifications] list fell back to memory:", error);
  }

  return memoryInbox
    .filter(r => r.userId === userId && !r.dismissedAt)
    .slice(0, limit)
    .map(rowToInbox);
}

export async function markNotificationRead(
  userId: number,
  id: string
): Promise<boolean> {
  const now = new Date();
  const mem = memoryInbox.find(r => r.id === id && r.userId === userId);
  if (mem && !mem.readAt) mem.readAt = now;

  try {
    const db = await getDb();
    if (db) {
      await db
        .update(userNotifications)
        .set({ readAt: now })
        .where(
          and(
            eq(userNotifications.id, id),
            eq(userNotifications.userId, userId)
          )
        );
    }
  } catch (error) {
    console.warn("[notifications] markRead failed:", error);
  }

  return Boolean(mem) || Boolean(process.env.DATABASE_URL);
}

export async function markAllNotificationsRead(
  userId: number
): Promise<number> {
  const now = new Date();
  let count = 0;
  for (const row of memoryInbox) {
    if (row.userId === userId && !row.readAt && !row.dismissedAt) {
      row.readAt = now;
      count += 1;
    }
  }

  try {
    const db = await getDb();
    if (db) {
      await db
        .update(userNotifications)
        .set({ readAt: now })
        .where(
          and(
            eq(userNotifications.userId, userId),
            isNull(userNotifications.readAt),
            isNull(userNotifications.dismissedAt)
          )
        );
    }
  } catch (error) {
    console.warn("[notifications] markAllRead failed:", error);
  }

  return count;
}

export async function dismissNotification(
  userId: number,
  id: string
): Promise<boolean> {
  const now = new Date();
  const mem = memoryInbox.find(r => r.id === id && r.userId === userId);
  if (mem) mem.dismissedAt = now;

  try {
    const db = await getDb();
    if (db) {
      await db
        .update(userNotifications)
        .set({ dismissedAt: now })
        .where(
          and(
            eq(userNotifications.id, id),
            eq(userNotifications.userId, userId)
          )
        );
    }
  } catch (error) {
    console.warn("[notifications] dismiss failed:", error);
  }

  return Boolean(mem) || Boolean(process.env.DATABASE_URL);
}
