/**
 * FCM / device token registration store (J-TECH-03).
 * Upserts by token; falls back to in-memory when DB is unavailable.
 */

import { and, eq } from "drizzle-orm";
import {
  deviceTokens,
  type DeviceTokenRow,
  type InsertDeviceToken,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export type DevicePlatform = "web" | "ios" | "android";

export type RegisteredDevice = {
  id: number;
  userId: number;
  token: string;
  platform: DevicePlatform;
  userAgent: string | null;
  lastSeenAt: Date;
};

type MemoryDevice = InsertDeviceToken & { id: number };

const memoryDevices: MemoryDevice[] = [];
let memSeq = 1;

export function resetDeviceTokenMemory(): void {
  memoryDevices.length = 0;
  memSeq = 1;
}

function toRegistered(row: DeviceTokenRow | MemoryDevice): RegisteredDevice {
  const lastSeenAt =
    row.lastSeenAt instanceof Date
      ? row.lastSeenAt
      : new Date(row.lastSeenAt as unknown as string);
  return {
    id: row.id,
    userId: row.userId,
    token: row.token,
    platform: row.platform as DevicePlatform,
    userAgent: row.userAgent ?? null,
    lastSeenAt,
  };
}

export async function registerDeviceToken(input: {
  userId: number;
  token: string;
  platform?: DevicePlatform;
  userAgent?: string | null;
}): Promise<RegisteredDevice> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("Device token is required");
  }
  if (token.length > 512) {
    throw new Error("Device token exceeds maximum length");
  }

  const now = new Date();
  const platform = input.platform ?? "web";
  const userAgent = input.userAgent ?? null;

  const existingMem = memoryDevices.find(d => d.token === token);
  if (existingMem) {
    existingMem.userId = input.userId;
    existingMem.platform = platform;
    existingMem.userAgent = userAgent;
    existingMem.updatedAt = now;
    existingMem.lastSeenAt = now;
  } else {
    memoryDevices.push({
      id: memSeq++,
      userId: input.userId,
      token,
      platform,
      userAgent,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
  }

  try {
    const db = await getDb();
    if (db) {
      const existing = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, token))
        .limit(1);

      if (existing[0]) {
        await db
          .update(deviceTokens)
          .set({
            userId: input.userId,
            platform,
            userAgent,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(deviceTokens.token, token));
        return toRegistered({
          ...existing[0],
          userId: input.userId,
          platform,
          userAgent,
          lastSeenAt: now,
          updatedAt: now,
        });
      }

      const insertResult = await db.insert(deviceTokens).values({
        userId: input.userId,
        token,
        platform,
        userAgent,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });

      const insertId =
        (insertResult as unknown as [{ insertId?: number }])[0]?.insertId ??
        memSeq;

      return {
        id: Number(insertId) || memSeq,
        userId: input.userId,
        token,
        platform,
        userAgent,
        lastSeenAt: now,
      };
    }
  } catch (error) {
    console.warn("[devices] register fell back to memory:", error);
  }

  const mem = memoryDevices.find(d => d.token === token)!;
  return toRegistered(mem);
}

export async function listDeviceTokensForUser(
  userId: number
): Promise<RegisteredDevice[]> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, userId));
      if (rows.length > 0 || process.env.DATABASE_URL) {
        return rows.map(toRegistered);
      }
    }
  } catch (error) {
    console.warn("[devices] list fell back to memory:", error);
  }

  return memoryDevices.filter(d => d.userId === userId).map(toRegistered);
}

export async function unregisterDeviceToken(
  userId: number,
  token: string
): Promise<boolean> {
  const before = memoryDevices.length;
  for (let i = memoryDevices.length - 1; i >= 0; i -= 1) {
    if (
      memoryDevices[i].token === token &&
      memoryDevices[i].userId === userId
    ) {
      memoryDevices.splice(i, 1);
    }
  }

  try {
    const db = await getDb();
    if (db) {
      await db
        .delete(deviceTokens)
        .where(
          and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId))
        );
      return true;
    }
  } catch (error) {
    console.warn("[devices] unregister failed:", error);
  }

  return memoryDevices.length < before;
}
