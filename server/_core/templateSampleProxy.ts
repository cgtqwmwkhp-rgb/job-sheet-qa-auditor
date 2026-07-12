/**
 * Template sample PDF proxy — same-origin stream for RoiEditorV2.
 * GET /api/template-samples/:versionId
 */

import { Router, Request, Response, NextFunction } from "express";
import { readFile } from "fs/promises";
import { sdk } from "./sdk";
import { getStorageAdapter } from "../storage";
import { getStudioSample } from "../services/templateStudio/sampleStore";
import { createSafeLogger } from "../utils/safeLogger";

const router = Router();
const logger = createSafeLogger("TemplateSampleProxy");

function requireQaLead(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const user = await sdk.authenticateRequest(req);
      const role = user.role;
      if (role !== "admin" && role !== "qa_lead") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      (req as { dbUser?: typeof user }).dbUser = user;
      next();
    } catch (err) {
      logger.warn("Auth failed for template sample", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(401).json({ error: "Unauthorized" });
    }
  })();
}

router.get("/:versionId", requireQaLead, async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    if (!Number.isFinite(versionId)) {
      res.status(400).json({ error: "Invalid versionId" });
      return;
    }
    const meta = getStudioSample(versionId);
    if (!meta) {
      res.status(404).json({ error: "Sample not found" });
      return;
    }
    const storage = getStorageAdapter();
    const { url } = await storage.get(meta.fileKey);

    let buffer: Buffer;
    if (url.startsWith("file://")) {
      buffer = await readFile(url.replace("file://", ""));
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        res.status(502).json({ error: "Upstream sample fetch failed" });
        return;
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }

    res.setHeader("Content-Type", meta.fileType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${meta.fileName.replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(buffer);
  } catch (err) {
    logger.error("Failed to stream template sample", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to load sample" });
  }
});

export { router as templateSampleProxyRouter };
