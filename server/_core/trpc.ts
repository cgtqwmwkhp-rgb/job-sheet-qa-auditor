import {
  NOT_ADMIN_ERR_MSG,
  NOT_QA_LEAD_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { csrfMiddleware } from "../utils/csrf";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
const csrfMutationGuard = t.middleware(async opts => {
  // createCaller is used for trusted in-process jobs and unit tests, where
  // there is no browser request to forge. Express supplies originalUrl for
  // every HTTP request, so browser/API mutations cannot take this path.
  const isHttpRequest = typeof opts.ctx.req?.originalUrl === "string";
  if (opts.type === "mutation" && isHttpRequest) {
    return csrfMiddleware()(opts);
  }
  return opts.next();
});

// All HTTP procedures inherit this guard. It deliberately applies only to
// mutations so read-only tRPC traffic and Easy Auth's SPA bootstrap remain
// unaffected.
export const publicProcedure = t.procedure.use(csrfMutationGuard);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireUser);

/**
 * Authenticated non-technician staff member.
 *
 * The role model includes a legacy `user` role for staff/viewer accounts, so
 * staff access is defined as any authenticated role except `technician`.
 */
export const staffProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.role === "technician") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Technician accounts cannot access staff APIs",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);

export const adminProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);

/** Admin or QA lead — review / hold-queue mutations. */
export const qaLeadProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role;
    if (!ctx.user || (role !== "admin" && role !== "qa_lead")) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_QA_LEAD_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
