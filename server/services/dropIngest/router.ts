/**
 * Lightweight status router for the drop poller (no secrets, no Entra).
 * Mount at /api/drop-ingest — does not touch IngestGateway HMAC routes.
 */

import { Router } from "express";
import { getDropIngestStatus } from "./index";

export function createDropIngestRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const status = getDropIngestStatus();
    res.json({
      ok: true,
      service: "drop-ingest",
      ...status,
    });
  });

  return router;
}

export const dropIngestRouter = createDropIngestRouter();
