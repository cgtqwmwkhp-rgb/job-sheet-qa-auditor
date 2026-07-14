/**
 * Comms router — email test send, FCM device register, notification inbox.
 * Journeys: J-NOTIF-01, J-SET-05 (test email), J-TECH-03.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buildTestSummaryEmail,
  resolveEmailProvider,
  sendEmail,
} from "../services/comms/emailService";
import {
  createNotification,
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/comms/notificationInbox";
import {
  listDeviceTokensForUser,
  registerDeviceToken,
  unregisterDeviceToken,
} from "../services/comms/deviceTokens";

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const commsRouter = router({
  /** Provider currently selected via EMAIL_PROVIDER (for Settings honesty). */
  emailStatus: protectedProcedure.query(() => ({
    provider: resolveEmailProvider(),
    from: process.env.EMAIL_FROM?.trim() || null,
    configured:
      resolveEmailProvider() === "log"
        ? true
        : resolveEmailProvider() === "acs"
          ? Boolean(
              process.env.ACS_CONNECTION_STRING ||
                (process.env.ACS_EMAIL_ENDPOINT &&
                  process.env.ACS_EMAIL_ACCESS_KEY)
            )
          : resolveEmailProvider() === "graph"
            ? Boolean(
                process.env.GRAPH_TENANT_ID &&
                  process.env.GRAPH_CLIENT_ID &&
                  process.env.GRAPH_CLIENT_SECRET
              )
            : Boolean(process.env.SMTP_HOST),
  })),

  /**
   * J-SET-05 — send a real test summary email to the signed-in user's address.
   * Also writes a bell inbox event so J-NOTIF-01 can show DB-backed activity.
   */
  sendTestEmail: protectedProcedure.mutation(async ({ ctx }) => {
    const toEmail = ctx.user.email?.trim();
    if (!toEmail) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Your account has no email address — cannot send a test message.",
      });
    }

    const content = buildTestSummaryEmail(ctx.user.name);
    const result = await sendEmail({
      userId: ctx.user.id,
      toEmail,
      subject: content.subject,
      bodyHtml: content.bodyHtml,
      bodyText: content.bodyText,
    });

    await createNotification({
      userId: ctx.user.id,
      title:
        result.status === "sent"
          ? "Test email sent"
          : "Test email failed",
      message:
        result.status === "sent"
          ? `Summary email delivered via ${result.provider} to ${toEmail}.`
          : `Could not send via ${result.provider}: ${result.error ?? "unknown error"}`,
      type: result.status === "sent" ? "success" : "error",
      meta: {
        outboxId: result.outboxId,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      },
    });

    if (result.status === "failed") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: result.error ?? "Email send failed",
      });
    }

    return {
      sent: true as const,
      outboxId: result.outboxId,
      provider: result.provider,
      toEmail,
      providerMessageId: result.providerMessageId,
    };
  }),

  /** J-NOTIF-01 — list inbox events for the header bell. */
  listNotifications: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const rows = await listNotifications(ctx.user.id, input?.limit ?? 50);
      return rows.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        timestamp: formatRelative(n.createdAt),
        createdAt: n.createdAt.toISOString(),
      }));
    }),

  markNotificationRead: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationRead(ctx.user.id, input.id);
      return { success: true as const };
    }),

  markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await markAllNotificationsRead(ctx.user.id);
    return { success: true as const, count };
  }),

  dismissNotification: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await dismissNotification(ctx.user.id, input.id);
      return { success: true as const };
    }),

  /** J-TECH-03 — persist FCM / device token for the signed-in user. */
  registerDeviceToken: protectedProcedure
    .input(
      z.object({
        token: z.string().min(8).max(512),
        platform: z.enum(["web", "ios", "android"]).default("web"),
        userAgent: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const registered = await registerDeviceToken({
        userId: ctx.user.id,
        token: input.token,
        platform: input.platform,
        userAgent: input.userAgent ?? null,
      });
      return {
        success: true as const,
        id: registered.id,
        platform: registered.platform,
        lastSeenAt: registered.lastSeenAt.toISOString(),
      };
    }),

  listDeviceTokens: protectedProcedure.query(async ({ ctx }) => {
    const tokens = await listDeviceTokensForUser(ctx.user.id);
    return tokens.map(t => ({
      id: t.id,
      platform: t.platform,
      tokenPreview: `${t.token.slice(0, 8)}…`,
      lastSeenAt: t.lastSeenAt.toISOString(),
    }));
  }),

  unregisterDeviceToken: protectedProcedure
    .input(z.object({ token: z.string().min(8).max(512) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await unregisterDeviceToken(ctx.user.id, input.token);
      return { success: ok };
    }),
});

export type CommsRouter = typeof commsRouter;
