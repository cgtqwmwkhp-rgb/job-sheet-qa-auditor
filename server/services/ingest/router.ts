/**
 * Express router for signed machine ingest API.
 *
 * POST /v1/job-sheets  — idempotent upload (API key + HMAC, no Entra)
 * GET  /health         — config readiness (no secrets)
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { loadIngestConfig } from "./config";
import { verifyIngestAuth } from "./hmac";
import { acceptIngestUpload } from "./ingestService";
import { createDefaultPersister } from "./persist";
import {
  getDefaultReceiptStore,
  type IngestReceiptStore,
} from "./receiptStore";
import { IngestError, type IngestPersister } from "./types";

const bodySchema = z.object({
  externalJobId: z.string().min(1).max(128),
  deviceId: z.string().min(1).max(128),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(64),
  fileBase64: z.string().min(1),
  contentHash: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  referenceNumber: z.string().max(64).optional(),
  siteInfo: z.string().max(512).optional(),
});

export interface CreateIngestRouterOptions {
  store?: IngestReceiptStore;
  persist?: IngestPersister;
  /** Override path used in HMAC canonical string (defaults to req.originalUrl path). */
  signaturePath?: string;
}

function mapErrorStatus(code: IngestError["code"]): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "BAD_REQUEST":
      return 400;
    case "CONFLICT":
      return 409;
    case "NOT_CONFIGURED":
      return 503;
    default:
      return 500;
  }
}

function headerString(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Capture raw JSON body for HMAC. Express json() parses first; we re-serialize
 * with stable stringify of the parsed object only when rawBody was not set.
 * Prefer attaching rawBody via verify callback when mounting.
 */
function resolveRawBody(req: Request): string {
  const anyReq = req as Request & { rawBody?: string | Buffer };
  if (typeof anyReq.rawBody === "string") return anyReq.rawBody;
  if (Buffer.isBuffer(anyReq.rawBody)) return anyReq.rawBody.toString("utf8");
  // Fallback: re-stringify parsed body (clients must send compact JSON matching this)
  return JSON.stringify(req.body ?? {});
}

export function createIngestRouter(
  options: CreateIngestRouterOptions = {}
): Router {
  const router = Router();
  const store = options.store ?? getDefaultReceiptStore();

  router.get("/health", (_req, res) => {
    const config = loadIngestConfig();
    res.json({
      ok: true,
      service: "ingest",
      enabled: config.enabled,
      systemUserConfigured: config.systemUserId != null,
      auth: "api_key_hmac",
      entraRequired: false,
    });
  });

  router.post(
    "/v1/job-sheets",
    async (req: Request, res: Response, _next: NextFunction) => {
      try {
        const config = loadIngestConfig();
        const signaturePath =
          options.signaturePath ??
          // Prefer mount-stable path (ignore query string)
          (typeof req.originalUrl === "string"
            ? req.originalUrl.split("?")[0]
            : "/api/ingest/v1/job-sheets");

        const rawBody = resolveRawBody(req);

        verifyIngestAuth({
          config,
          apiKey:
            headerString(req.headers["x-api-key"]) ??
            extractBearer(headerString(req.headers.authorization)),
          signatureHeader: headerString(req.headers["x-ingest-signature"]),
          timestampHeader: headerString(req.headers["x-ingest-timestamp"]),
          method: "POST",
          path: signaturePath,
          rawBody,
        });

        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: "BAD_REQUEST",
            message: "Invalid ingest payload",
            details: parsed.error.flatten(),
          });
          return;
        }

        let fileBuffer: Buffer;
        try {
          fileBuffer = Buffer.from(parsed.data.fileBase64, "base64");
        } catch {
          res.status(400).json({
            error: "BAD_REQUEST",
            message: "fileBase64 is not valid base64",
          });
          return;
        }

        if (fileBuffer.length === 0) {
          res.status(400).json({
            error: "BAD_REQUEST",
            message: "Decoded file is empty",
          });
          return;
        }

        const persist = options.persist ?? createDefaultPersister(config);
        const result = await acceptIngestUpload(
          { config, store, persist },
          {
            externalJobId: parsed.data.externalJobId,
            deviceId: parsed.data.deviceId,
            fileName: parsed.data.fileName,
            fileType: parsed.data.fileType,
            fileBuffer,
            contentHash: parsed.data.contentHash,
            referenceNumber: parsed.data.referenceNumber,
            siteInfo: parsed.data.siteInfo,
          }
        );

        const statusCode = result.status === "accepted" ? 201 : 200;
        res.status(statusCode).json(result);
      } catch (err) {
        if (err instanceof IngestError) {
          res.status(mapErrorStatus(err.code)).json({
            error: err.code,
            message: err.message,
            details: err.details,
          });
          return;
        }
        console.error("[ingest] unexpected error", err);
        res.status(500).json({
          error: "INTERNAL",
          message: "Ingest failed",
        });
      }
    }
  );

  return router;
}

function extractBearer(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1]?.trim();
}

/** Default router instance for app mount. */
export const ingestRouter = createIngestRouter();
