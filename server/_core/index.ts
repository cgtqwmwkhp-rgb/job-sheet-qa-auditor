import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleHealthz, handleReadyz } from "./health";
import { handleMetrics } from "./metrics";
import {
  initializeDefaultTemplate,
  hasDefaultTemplate,
  initializeJobSummaryTemplate,
  hasJobSummaryTemplate,
  initializeWastedJourneyTemplate,
  hasWastedJourneyTemplate,
  hydrateTemplateRegistryFromMysql,
  assertTemplateRegistryMysqlProdContract,
} from "../services/templateRegistry";
import { hydrateDeadLetterQueueFromDb } from "../utils/deadLetterQueue";
import { hydrateApiCostLedgerFromDb } from "../services/finOps";
import { assertSharedLimitsReplicaSafety } from "../utils/rateLimiter";
import { hydrateWebhooksFromDb } from "../services/webhooks";
import { pdfProxyRouter } from "./pdfProxy";
import { templateSampleProxyRouter } from "./templateSampleProxy";
import { ingestRouter } from "../services/ingest";
import {
  dropIngestRouter,
  startDropIngestPoller,
} from "../services/dropIngest/boot";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // In-memory rate limits / live processStatus are unsafe across replicas.
  // Multi-replica requires Redis (SHARED_LIMITS_REDIS_URL / REDIS_URL).
  assertSharedLimitsReplicaSafety();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads.
  // Stash rawBody for HMAC verification on machine ingest (PR-IO-INGEST).
  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody =
          buf.toString("utf8");
      },
    })
  );
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Prod contract: fail-closed envs expect DB-backed registry (custom activations survive recycle)
  assertTemplateRegistryMysqlProdContract();

  // Primary load-path: hydrate in-memory registry from MySQL before JSON gold seeds
  try {
    const hydrated = await hydrateTemplateRegistryFromMysql();
    if (hydrated > 0) {
      console.log(
        `[Templates] Boot hydrate restored ${hydrated} registry record(s) from MySQL`
      );
    }
  } catch (error) {
    console.warn("[Templates] Boot hydrate skipped:", error);
  }

  // Initialize default template for document processing
  // This ensures SSOT compliance even in strict mode (production)
  if (!hasDefaultTemplate()) {
    console.log(
      "[Templates] Initializing default template for SSOT compliance..."
    );
    const versionId = initializeDefaultTemplate();
    if (versionId) {
      console.log(
        `[Templates] Default template initialized (version ID: ${versionId})`
      );
    }
  } else {
    console.log("[Templates] Default template already exists");
  }

  // Gold mobilisation: Job Summary Report (gap-fill after MySQL hydrate)
  if (!hasJobSummaryTemplate()) {
    console.log("[Templates] Initializing job-summary-v1 gold template...");
    const jsrVersionId = initializeJobSummaryTemplate();
    if (jsrVersionId) {
      console.log(
        `[Templates] job-summary-v1 activated (version ID: ${jsrVersionId})`
      );
    } else if (hasJobSummaryTemplate()) {
      console.log("[Templates] job-summary-v1 already active");
    } else {
      console.warn(
        "[Templates] job-summary-v1 seed skipped or failed (non-fatal)"
      );
    }
  } else {
    console.log("[Templates] job-summary-v1 already active");
  }

  // Gold mobilisation: Wasted Journey Sheet (abort/no-show — not repair)
  if (!hasWastedJourneyTemplate()) {
    console.log("[Templates] Initializing wasted-journey-v1 gold template...");
    const wjVersionId = initializeWastedJourneyTemplate();
    if (wjVersionId) {
      console.log(
        `[Templates] wasted-journey-v1 activated (version ID: ${wjVersionId})`
      );
    } else if (hasWastedJourneyTemplate()) {
      console.log("[Templates] wasted-journey-v1 already active");
    } else {
      console.warn(
        "[Templates] wasted-journey-v1 seed skipped or failed (non-fatal)"
      );
    }
  } else {
    console.log("[Templates] wasted-journey-v1 already active");
  }

  // Phase 1.10: restore in-memory DLQ from durable failed_jobs (fail-safe)
  try {
    const hydrated = await hydrateDeadLetterQueueFromDb();
    if (hydrated > 0) {
      console.log(`[DLQ] Boot hydrate restored ${hydrated} job(s)`);
    }
  } catch (error) {
    console.warn("[DLQ] Boot hydrate skipped:", error);
  }

  // PR-DATA-FINOPS: restore in-memory cost ledger from api_cost_events (fail-safe)
  try {
    const costHydrated = await hydrateApiCostLedgerFromDb();
    if (costHydrated > 0) {
      console.log(
        `[FinOps] Boot hydrate restored ${costHydrated} cost event(s)`
      );
    }
  } catch (error) {
    console.warn("[FinOps] Boot hydrate skipped:", error);
  }

  // PR-IO-WEBHOOKS: restore durable webhook subscriptions + signed delivery log
  try {
    const webhookHydrated = await hydrateWebhooksFromDb();
    if (webhookHydrated > 0) {
      console.log(
        `[Webhooks] Boot hydrate restored ${webhookHydrated} subscription(s)`
      );
    }
  } catch (error) {
    console.warn("[Webhooks] Boot hydrate skipped:", error);
  }

  // Health check endpoints (before auth, before static files)
  // These must be accessible without authentication for container orchestration
  app.get("/healthz", handleHealthz);
  app.get("/readyz", handleReadyz);

  // Prometheus metrics endpoint (ADR-003)
  // MUST be before SPA fallback to return text/plain, not HTML
  app.get("/metrics", handleMetrics);

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // PDF proxy endpoint (before tRPC, requires auth)
  // Provides same-origin PDF streaming to avoid CORS issues with Azure Blob
  app.use("/api/documents", pdfProxyRouter);
  app.use("/api/template-samples", templateSampleProxyRouter);

  // Machine ingest API (API key + HMAC — no Entra browser). PR-IO-INGEST.
  app.use("/api/ingest", ingestRouter);
  // PR-IO-SHAREPOINT: watched-folder / Blob drop status (no Entra; no HMAC router ownership)
  app.use("/api/drop-ingest", dropIngestRouter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`  Health:    http://localhost:${port}/healthz`);
    console.log(`  Readiness: http://localhost:${port}/readyz`);
    console.log(`  Metrics:   http://localhost:${port}/metrics`);
    console.log(
      `  DropIngest: http://localhost:${port}/api/drop-ingest/health`
    );
    // Library drop → signed ingest (fail-safe; no-op unless DROP_INGEST_ENABLED=true)
    void startDropIngestPoller();
  });
}

startServer().catch(console.error);
