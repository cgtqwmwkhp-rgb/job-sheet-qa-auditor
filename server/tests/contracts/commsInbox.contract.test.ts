/**
 * Contract: PR-IO-COMMS — durable email outbox, FCM token store, inbox events.
 * Challenge bar: test email sends; bell shows DB-backed (or memory-durable) events.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTestSummaryEmail,
  listRecentOutbox,
  resetEmailOutboxMemory,
  resolveEmailProvider,
  sendEmail,
} from "../../services/comms/emailService";
import {
  createNotification,
  listNotifications,
  markNotificationRead,
  resetNotificationInboxMemory,
} from "../../services/comms/notificationInbox";
import {
  listDeviceTokensForUser,
  registerDeviceToken,
  resetDeviceTokenMemory,
} from "../../services/comms/deviceTokens";

describe("Comms inbox contract (PR-IO-COMMS)", () => {
  beforeEach(() => {
    resetEmailOutboxMemory();
    resetNotificationInboxMemory();
    resetDeviceTokenMemory();
    process.env.EMAIL_PROVIDER = "log";
  });

  it("defaults EMAIL_PROVIDER to log when unset", () => {
    const prev = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    expect(resolveEmailProvider()).toBe("log");
    process.env.EMAIL_PROVIDER = prev;
  });

  it("sendEmail via log provider marks outbox sent", async () => {
    const result = await sendEmail({
      userId: 1,
      toEmail: "qa@example.com",
      subject: "Test",
      bodyText: "hello",
    });

    expect(result.status).toBe("sent");
    expect(result.provider).toBe("log");
    expect(result.outboxId).toMatch(/^email_/);
    expect(result.providerMessageId).toBeTruthy();

    const outbox = await listRecentOutbox(5);
    expect(outbox[0]?.id).toBe(result.outboxId);
    expect(outbox[0]?.status).toBe("sent");
    expect(outbox[0]?.toEmail).toBe("qa@example.com");
  });

  it("smtp provider without SMTP_HOST fails durably in outbox", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    delete process.env.SMTP_HOST;

    const result = await sendEmail({
      toEmail: "qa@example.com",
      subject: "Fail path",
      bodyText: "x",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/SMTP_HOST/);
    const outbox = await listRecentOutbox(1);
    expect(outbox[0]?.status).toBe("failed");
  });

  it("buildTestSummaryEmail produces subject + bodies", () => {
    const content = buildTestSummaryEmail("Alex");
    expect(content.subject).toMatch(/Test Summary/i);
    expect(content.bodyText).toContain("Alex");
    expect(content.bodyHtml).toContain("Test Summary Email");
  });

  it("notification inbox create + list + markRead", async () => {
    const created = await createNotification({
      userId: 42,
      title: "Test email sent",
      message: "Summary email delivered via log",
      type: "success",
    });

    const listed = await listNotifications(42);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
    expect(listed[0].read).toBe(false);

    await markNotificationRead(42, created.id);
    const after = await listNotifications(42);
    expect(after[0].read).toBe(true);
  });

  it("isolates inbox rows by userId", async () => {
    await createNotification({
      userId: 1,
      title: "A",
      message: "for user 1",
    });
    await createNotification({
      userId: 2,
      title: "B",
      message: "for user 2",
    });

    expect(await listNotifications(1)).toHaveLength(1);
    expect(await listNotifications(2)).toHaveLength(1);
    expect((await listNotifications(1))[0].title).toBe("A");
  });

  it("registerDeviceToken upserts by token", async () => {
    const first = await registerDeviceToken({
      userId: 7,
      token: "fcm-token-abcdefghi",
      platform: "web",
    });
    expect(first.userId).toBe(7);

    const second = await registerDeviceToken({
      userId: 9,
      token: "fcm-token-abcdefghi",
      platform: "web",
    });
    expect(second.token).toBe("fcm-token-abcdefghi");
    expect(second.userId).toBe(9);

    const forNine = await listDeviceTokensForUser(9);
    expect(forNine).toHaveLength(1);
    const forSeven = await listDeviceTokensForUser(7);
    expect(forSeven).toHaveLength(0);
  });

  it("test-email journey writes outbox + bell event", async () => {
    const userId = 11;
    const content = buildTestSummaryEmail("Tester");
    const send = await sendEmail({
      userId,
      toEmail: "tester@example.com",
      subject: content.subject,
      bodyHtml: content.bodyHtml,
      bodyText: content.bodyText,
    });
    expect(send.status).toBe("sent");

    await createNotification({
      userId,
      title: "Test email sent",
      message: `Summary email delivered via ${send.provider} to tester@example.com.`,
      type: "success",
      meta: { outboxId: send.outboxId },
    });

    const bell = await listNotifications(userId);
    expect(bell).toHaveLength(1);
    expect(bell[0].title).toBe("Test email sent");
    expect(bell[0].type).toBe("success");
  });
});
