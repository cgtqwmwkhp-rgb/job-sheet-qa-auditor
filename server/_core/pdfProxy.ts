/**
 * PDF Proxy Endpoint
 *
 * Provides same-origin PDF streaming to avoid CORS issues with Azure Blob SAS URLs.
 * Supports HTTP Range requests for partial content (required by PDF.js).
 * Enforces RBAC - users can only access documents they have permission for.
 *
 * Usage:
 *   GET /api/documents/:jobSheetId/pdf
 *   GET /api/documents/:jobSheetId/pdf?download=1  (for download)
 */

import { Router, Request, Response, NextFunction } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getStorageAdapter } from "../storage";
import { createSafeLogger } from "../utils/safeLogger";
import { enforceJobSheetAccess } from "../utils/authorization";
import { sdk } from "./sdk";

const router = Router();
const logger = createSafeLogger("PDFProxy");

// Metrics counters (in-memory for now, can be exported to Prometheus)
export const pdfProxyMetrics = {
  rangeRequestsCount: 0,
  cacheHitCount: 0,
  accessDeniedCount: 0,
  successCount: 0,
  errorCount: 0,
};

const PDF_RANGE_CACHE_TTL_MS = 30_000;
const PDF_RANGE_CACHE_MAX_ENTRIES = 100;
const PDF_RANGE_CACHE_MAX_ENTRY_BYTES = 5 * 1024 * 1024;

interface CachedPdfRangeResponse {
  body: Buffer;
  contentType: string;
  contentRange: string | null;
  acceptRanges: string | null;
  status: number;
  expiresAt: number;
}

const pdfRangeCache = new Map<string, CachedPdfRangeResponse>();

export function getCachedPdfRangeResponse(
  cacheKey: string
): CachedPdfRangeResponse | undefined {
  const cached = pdfRangeCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    pdfRangeCache.delete(cacheKey);
    return undefined;
  }

  // Refresh insertion order so capacity eviction removes the least-recently used entry.
  pdfRangeCache.delete(cacheKey);
  pdfRangeCache.set(cacheKey, cached);
  pdfProxyMetrics.cacheHitCount++;
  return cached;
}

export function cachePdfRangeResponse(
  cacheKey: string,
  response: Omit<CachedPdfRangeResponse, "expiresAt">
): void {
  if (response.body.byteLength > PDF_RANGE_CACHE_MAX_ENTRY_BYTES) {
    return;
  }

  while (pdfRangeCache.size >= PDF_RANGE_CACHE_MAX_ENTRIES) {
    const oldestKey = pdfRangeCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    pdfRangeCache.delete(oldestKey);
  }

  pdfRangeCache.set(cacheKey, {
    ...response,
    expiresAt: Date.now() + PDF_RANGE_CACHE_TTL_MS,
  });
}

/** Test-only reset hook for the process-local range cache and counters. */
export function resetPdfProxyCacheForTests(): void {
  pdfRangeCache.clear();
  pdfProxyMetrics.rangeRequestsCount = 0;
  pdfProxyMetrics.cacheHitCount = 0;
  pdfProxyMetrics.accessDeniedCount = 0;
  pdfProxyMetrics.successCount = 0;
  pdfProxyMetrics.errorCount = 0;
}

/**
 * Authenticate via the same Easy Auth / session path as tRPC (sdk.authenticateRequest).
 * Previous PDF-only parsing used email as a fallback userId and missed oid claims,
 * so DB role lookup failed and admin/qa_lead reviewers got 403 on every PDF.
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers["x-correlation-id"] || `pdf-${Date.now()}`;
  (req as any).correlationId = correlationId;

  void (async () => {
    try {
      const user = await sdk.authenticateRequest(req);
      (req as any).dbUser = user;
      logger.debug("User authenticated", {
        correlationId,
        userId: user.id,
        openId: user.openId,
        role: user.role,
      });
      next();
    } catch (error) {
      logger.warn("Authentication required", {
        correlationId,
        error: String(error),
      });
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Authentication required" });
    }
  })();
}

/**
 * RBAC check: same object-level rules as tRPC job-sheet access.
 * admin/qa_lead → all sheets; others → own uploads only.
 */
function checkRbacAccess(user: User, jobSheet: unknown): boolean {
  try {
    enforceJobSheetAccess(
      jobSheet as Parameters<typeof enforceJobSheetAccess>[0],
      {
        id: user.id,
        role: user.role,
      }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/documents/:jobSheetId/pdf
 *
 * Streams the PDF document for a job sheet.
 * Supports Range requests for partial content (HTTP 206).
 * Enforces RBAC - users can only access permitted documents.
 */
router.get(
  "/:jobSheetId/pdf",
  requireAuth,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const correlationId = (req as any).correlationId || `pdf-${Date.now()}`;
    const user = (req as any).dbUser as User;

    try {
      const jobSheetId = parseInt(req.params.jobSheetId, 10);

      if (isNaN(jobSheetId) || jobSheetId <= 0) {
        res.status(400).json({ error: "Invalid job sheet ID" });
        return;
      }

      logger.debug("PDF request received", {
        correlationId,
        jobSheetId,
        userId: user?.id,
      });

      // Get job sheet from database
      const jobSheet = await db.getJobSheetById(jobSheetId);

      if (!jobSheet) {
        logger.warn("Job sheet not found", { correlationId, jobSheetId });
        res.status(404).json({ error: "Job sheet not found" });
        return;
      }

      // RBAC check
      const hasAccess = checkRbacAccess(user, jobSheet);
      if (!hasAccess) {
        pdfProxyMetrics.accessDeniedCount++;
        logger.warn("RBAC access denied", {
          correlationId,
          jobSheetId,
          userId: user?.id,
          role: user?.role,
        });
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have access to this document",
        });
        return;
      }

      // Get fresh URL from storage
      const storage = getStorageAdapter();
      let url: string;

      if (jobSheet.fileKey) {
        const result = await storage.get(jobSheet.fileKey);
        url = result.url;
      } else if (jobSheet.fileUrl) {
        url = jobSheet.fileUrl;
      } else {
        logger.warn("No file associated with job sheet", {
          correlationId,
          jobSheetId,
        });
        res
          .status(404)
          .json({ error: "No file associated with this job sheet" });
        return;
      }

      // Determine content disposition
      const isDownload =
        req.query.download === "1" || req.query.download === "true";
      const fileName = jobSheet.fileName || `document-${jobSheetId}.pdf`;
      const disposition = isDownload ? "attachment" : "inline";
      const storedMime =
        typeof jobSheet.fileType === "string" && jobSheet.fileType.trim()
          ? jobSheet.fileType.trim()
          : null;
      const defaultContentType =
        storedMime &&
        (storedMime.startsWith("image/") || storedMime === "application/pdf")
          ? storedMime
          : "application/pdf";

      // Cache only bounded range responses. Authorization has already completed above,
      // and clients still receive no-store headers, so bytes are never shared via a browser
      // cache or served before RBAC is checked.
      const rangeHeader = req.headers.range;
      const rangeCacheKey = rangeHeader
        ? `${jobSheet.fileKey || url}\n${rangeHeader}`
        : null;

      const fetchOptions: RequestInit = {
        method: "GET",
        headers: {},
      };

      // Forward Range header if present
      if (rangeHeader) {
        pdfProxyMetrics.rangeRequestsCount++;
        (fetchOptions.headers as Record<string, string>)["Range"] = rangeHeader;
        logger.debug("Range request", { correlationId, range: rangeHeader });
      }

      if (rangeCacheKey) {
        const cached = getCachedPdfRangeResponse(rangeCacheKey);
        if (cached) {
          res.setHeader("Content-Type", cached.contentType);
          res.setHeader(
            "Content-Disposition",
            `${disposition}; filename="${fileName}"`
          );
          res.setHeader("Accept-Ranges", cached.acceptRanges || "bytes");
          res.setHeader("Cache-Control", "private, no-store");
          res.setHeader("X-Correlation-Id", correlationId);
          res.setHeader("Content-Length", cached.body.byteLength);
          if (cached.contentRange) {
            res.setHeader("Content-Range", cached.contentRange);
          }

          res.status(cached.status).send(cached.body);
          pdfProxyMetrics.successCount++;
          logger.info("PDF range served from cache", {
            correlationId,
            jobSheetId,
          });
          return;
        }
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok && response.status !== 206) {
        pdfProxyMetrics.errorCount++;
        logger.error("Storage fetch failed", {
          correlationId,
          status: response.status,
        });
        res
          .status(502)
          .json({ error: "Failed to fetch document from storage" });
        return;
      }

      // Set response headers — prefer stored job-sheet MIME for JPG/PNG (PX-085).
      const upstreamType = response.headers.get("content-type");
      const contentType = storedMime?.startsWith("image/")
        ? storedMime
        : upstreamType && !upstreamType.includes("octet-stream")
          ? upstreamType
          : defaultContentType;
      const contentLength = response.headers.get("content-length");
      const contentRange = response.headers.get("content-range");
      const acceptRanges = response.headers.get("accept-ranges");

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${fileName}"`
      );
      res.setHeader("Accept-Ranges", acceptRanges || "bytes");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Correlation-Id", correlationId);

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      if (contentRange) {
        res.setHeader("Content-Range", contentRange);
        res.status(206);
      } else {
        res.status(response.status);
      }

      // Ranges are normally small. Buffering bounded responses lets PDF.js retries
      // avoid another Blob fetch without changing streaming for full-document downloads.
      const responseLength = contentLength ? Number(contentLength) : NaN;
      if (
        rangeCacheKey &&
        response.body &&
        Number.isFinite(responseLength) &&
        responseLength <= PDF_RANGE_CACHE_MAX_ENTRY_BYTES
      ) {
        const body = Buffer.from(await response.arrayBuffer());
        cachePdfRangeResponse(rangeCacheKey, {
          body,
          contentType,
          contentRange,
          acceptRanges,
          status: contentRange ? 206 : response.status,
        });
        res.send(body);
        pdfProxyMetrics.successCount++;
        const duration = Date.now() - startTime;
        logger.info("PDF range cached and sent successfully", {
          correlationId,
          jobSheetId,
          durationMs: duration,
        });
        return;
      }

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();

        const stream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
          pdfProxyMetrics.successCount++;
          const duration = Date.now() - startTime;
          logger.info("PDF streamed successfully", {
            correlationId,
            jobSheetId,
            durationMs: duration,
          });
        };

        stream().catch(err => {
          pdfProxyMetrics.errorCount++;
          logger.error("Stream error", { correlationId, error: err.message });
          if (!res.headersSent) {
            res.status(500).json({ error: "Stream error" });
          }
        });
      } else {
        // Fallback for environments without readable streams
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
        pdfProxyMetrics.successCount++;
        const duration = Date.now() - startTime;
        logger.info("PDF sent successfully", {
          correlationId,
          jobSheetId,
          durationMs: duration,
        });
      }
    } catch (error) {
      pdfProxyMetrics.errorCount++;
      logger.error("PDF proxy error", { correlationId, error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }
);

/**
 * HEAD /api/documents/:jobSheetId/pdf
 *
 * Returns headers without body (for preflight checks).
 * Enforces RBAC - same access control as GET.
 */
router.head(
  "/:jobSheetId/pdf",
  requireAuth,
  async (req: Request, res: Response) => {
    const correlationId =
      (req as any).correlationId || `pdf-head-${Date.now()}`;
    const user = (req as any).dbUser as User;

    try {
      const jobSheetId = parseInt(req.params.jobSheetId, 10);

      if (isNaN(jobSheetId) || jobSheetId <= 0) {
        res.status(400).end();
        return;
      }

      const jobSheet = await db.getJobSheetById(jobSheetId);

      if (!jobSheet) {
        res.status(404).end();
        return;
      }

      // RBAC check
      const hasAccess = checkRbacAccess(user, jobSheet);
      if (!hasAccess) {
        pdfProxyMetrics.accessDeniedCount++;
        logger.warn("RBAC access denied (HEAD)", {
          correlationId,
          jobSheetId,
          userId: user?.id,
          role: user?.role,
        });
        res.status(403).end();
        return;
      }

      const fileName = jobSheet.fileName || `document-${jobSheetId}.pdf`;
      const headMime =
        typeof jobSheet.fileType === "string" &&
        (jobSheet.fileType.startsWith("image/") ||
          jobSheet.fileType === "application/pdf")
          ? jobSheet.fileType
          : "application/pdf";

      res.setHeader("Content-Type", headMime);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Correlation-Id", correlationId);
      res.status(200).end();
    } catch (error) {
      logger.error("HEAD error", { correlationId, error: String(error) });
      res.status(500).end();
    }
  }
);

/**
 * Get PDF proxy metrics for observability
 */
export function getPdfProxyMetrics() {
  return { ...pdfProxyMetrics };
}

export { router as pdfProxyRouter };
