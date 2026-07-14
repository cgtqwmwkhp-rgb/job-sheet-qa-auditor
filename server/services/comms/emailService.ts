/**
 * Durable email send — ACS / Microsoft Graph / SMTP / log.
 *
 * Every attempt is written to `email_outbox` (or in-memory when DB is absent).
 * Provider selection: EMAIL_PROVIDER env (acs | graph | smtp | log).
 * Default is `log` when unset so local/test can prove the outbox path without
 * cloud credentials; production should set a real provider.
 */

import { createHmac, createHash, randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import {
  emailOutbox,
  type EmailOutboxRow,
  type InsertEmailOutbox,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export type EmailProvider = "acs" | "graph" | "smtp" | "log";

export type SendEmailInput = {
  userId?: number | null;
  toEmail: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
};

export type SendEmailResult = {
  outboxId: string;
  provider: EmailProvider;
  status: "sent" | "failed";
  providerMessageId?: string;
  error?: string;
};

type MemoryOutboxRow = InsertEmailOutbox & { id: string };

const memoryOutbox: MemoryOutboxRow[] = [];
const MAX_MEMORY = 500;

export function resolveEmailProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? "log").trim().toLowerCase();
  if (raw === "acs" || raw === "graph" || raw === "smtp" || raw === "log") {
    return raw;
  }
  return "log";
}

export function getEmailFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.ACS_EMAIL_FROM?.trim() ||
    process.env.GRAPH_EMAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "noreply@localhost"
  );
}

function nextOutboxId(): string {
  return `email_${randomUUID()}`;
}

async function persistOutbox(row: InsertEmailOutbox): Promise<void> {
  memoryOutbox.unshift(row as MemoryOutboxRow);
  if (memoryOutbox.length > MAX_MEMORY) memoryOutbox.length = MAX_MEMORY;

  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(emailOutbox).values(row);
  } catch (error) {
    console.warn("[email] Failed to persist outbox row:", error);
  }
}

async function updateOutbox(
  id: string,
  patch: Partial<
    Pick<
      EmailOutboxRow,
      "status" | "error" | "providerMessageId" | "sentAt"
    >
  >
): Promise<void> {
  const mem = memoryOutbox.find(r => r.id === id);
  if (mem) Object.assign(mem, patch);

  try {
    const db = await getDb();
    if (!db) return;
    await db.update(emailOutbox).set(patch).where(eq(emailOutbox.id, id));
  } catch (error) {
    console.warn("[email] Failed to update outbox row:", error);
  }
}

export async function listRecentOutbox(limit = 20): Promise<MemoryOutboxRow[]> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(emailOutbox)
        .orderBy(desc(emailOutbox.createdAt))
        .limit(limit);
      if (rows.length > 0) return rows as MemoryOutboxRow[];
    }
  } catch {
    /* fall through to memory */
  }
  return memoryOutbox.slice(0, limit);
}

/** Test helper — clear in-memory outbox between cases. */
export function resetEmailOutboxMemory(): void {
  memoryOutbox.length = 0;
}

async function sendViaLog(
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const messageId = `log_${randomUUID()}`;
  console.info(
    `[email:log] to=${input.toEmail} subject=${JSON.stringify(input.subject)} id=${messageId}`
  );
  return { messageId };
}

async function sendViaSmtp(
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!host) {
    throw new Error("SMTP_HOST is required when EMAIL_PROVIDER=smtp");
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  const info = await transporter.sendMail({
    from: getEmailFromAddress(),
    to: input.toEmail,
    subject: input.subject,
    text: input.bodyText,
    html: input.bodyHtml,
  });

  return { messageId: String(info.messageId ?? `smtp_${randomUUID()}`) };
}

async function sendViaGraph(
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const tenantId = process.env.GRAPH_TENANT_ID?.trim();
  const clientId = process.env.GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.GRAPH_CLIENT_SECRET?.trim();
  const from = getEmailFromAddress();

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET are required when EMAIL_PROVIDER=graph"
    );
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    throw new Error(
      `Graph token request failed (${tokenRes.status}): ${detail.slice(0, 300)}`
    );
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Graph token response missing access_token");
  }

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenJson.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: input.bodyHtml ? "HTML" : "Text",
            content: input.bodyHtml || input.bodyText || "",
          },
          toRecipients: [
            { emailAddress: { address: input.toEmail } },
          ],
        },
        saveToSentItems: false,
      }),
    }
  );

  if (!sendRes.ok) {
    const detail = await sendRes.text().catch(() => "");
    throw new Error(
      `Graph sendMail failed (${sendRes.status}): ${detail.slice(0, 300)}`
    );
  }

  return { messageId: `graph_${randomUUID()}` };
}

function parseAcsConnectionString(connectionString: string): {
  endpoint: string;
  accessKey: string;
} {
  const parts = Object.fromEntries(
    connectionString.split(";").filter(Boolean).map(pair => {
      const idx = pair.indexOf("=");
      return idx === -1
        ? [pair, ""]
        : [pair.slice(0, idx), pair.slice(idx + 1)];
    })
  ) as Record<string, string>;

  const endpoint = (parts.endpoint || parts.Endpoint || "").replace(/\/$/, "");
  const accessKey = parts.accesskey || parts.AccessKey || "";
  if (!endpoint || !accessKey) {
    throw new Error(
      "ACS_CONNECTION_STRING must include endpoint and accesskey"
    );
  }
  return { endpoint, accessKey };
}

async function sendViaAcs(
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const connectionString = process.env.ACS_CONNECTION_STRING?.trim();
  const endpointEnv = process.env.ACS_EMAIL_ENDPOINT?.trim()?.replace(/\/$/, "");
  const accessKeyEnv = process.env.ACS_EMAIL_ACCESS_KEY?.trim();
  const from = getEmailFromAddress();

  let endpoint = endpointEnv ?? "";
  let accessKey = accessKeyEnv ?? "";
  if (connectionString) {
    const parsed = parseAcsConnectionString(connectionString);
    endpoint = endpoint || parsed.endpoint;
    accessKey = accessKey || parsed.accessKey;
  }

  if (!endpoint || !accessKey) {
    throw new Error(
      "ACS_CONNECTION_STRING or ACS_EMAIL_ENDPOINT + ACS_EMAIL_ACCESS_KEY required when EMAIL_PROVIDER=acs"
    );
  }

  const url = new URL("/emails:send?api-version=2023-03-31", `${endpoint}/`);
  const body = JSON.stringify({
    senderAddress: from,
    content: {
      subject: input.subject,
      plainText: input.bodyText || undefined,
      html: input.bodyHtml || undefined,
    },
    recipients: {
      to: [{ address: input.toEmail }],
    },
  });

  const contentHash = createHash("sha256").update(body).digest("base64");
  const date = new Date().toUTCString();
  const host = url.host;
  const pathAndQuery = `${url.pathname}${url.search}`;
  const stringToSign = `POST\n${pathAndQuery}\n${date};${host};${contentHash}`;
  const signature = createHmac("sha256", Buffer.from(accessKey, "base64"))
    .update(stringToSign)
    .digest("base64");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ms-date": date,
      "x-ms-content-sha256": contentHash,
      Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ACS email send failed (${res.status}): ${detail.slice(0, 300)}`
    );
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { messageId: json.id ?? `acs_${randomUUID()}` };
}

async function dispatch(
  provider: EmailProvider,
  input: SendEmailInput
): Promise<{ messageId: string }> {
  switch (provider) {
    case "log":
      return sendViaLog(input);
    case "smtp":
      return sendViaSmtp(input);
    case "graph":
      return sendViaGraph(input);
    case "acs":
      return sendViaAcs(input);
    default:
      throw new Error(`Unsupported email provider: ${provider}`);
  }
}

/**
 * Persist + send. Always writes an outbox row first (queued), then updates
 * to sent/failed. Never throws for provider failures — returns status instead.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const provider = resolveEmailProvider();
  const outboxId = nextOutboxId();
  const now = new Date();

  await persistOutbox({
    id: outboxId,
    userId: input.userId ?? null,
    toEmail: input.toEmail,
    subject: input.subject,
    bodyHtml: input.bodyHtml ?? null,
    bodyText: input.bodyText ?? null,
    provider,
    status: "queued",
    error: null,
    providerMessageId: null,
    createdAt: now,
    sentAt: null,
  });

  try {
    const { messageId } = await dispatch(provider, input);
    const sentAt = new Date();
    await updateOutbox(outboxId, {
      status: "sent",
      providerMessageId: messageId,
      sentAt,
      error: null,
    });
    return {
      outboxId,
      provider,
      status: "sent",
      providerMessageId: messageId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email send error";
    await updateOutbox(outboxId, {
      status: "failed",
      error: message,
    });
    return {
      outboxId,
      provider,
      status: "failed",
      error: message,
    };
  }
}

export function buildTestSummaryEmail(recipientName?: string | null): {
  subject: string;
  bodyHtml: string;
  bodyText: string;
} {
  const name = recipientName?.trim() || "there";
  const subject = "Job Sheet QA — Test Summary Email";
  const bodyText = [
    `Hi ${name},`,
    "",
    "This is a test summary email from Job Sheet QA Auditor.",
    "If you received this, the configured email provider is working.",
    "",
    `Sent at ${new Date().toISOString()}`,
  ].join("\n");
  const bodyHtml = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2>Test Summary Email</h2>
      <p>Hi ${name},</p>
      <p>This is a test summary email from Job Sheet QA Auditor.</p>
      <p>If you received this, the configured email provider is working.</p>
      <p style="color:#64748b;font-size:12px;">Sent at ${new Date().toISOString()}</p>
    </div>
  `.trim();
  return { subject, bodyHtml, bodyText };
}
