/**
 * PDF Proxy Endpoint
 * 
 * Provides same-origin PDF streaming to avoid CORS issues with Azure Blob SAS URLs.
 * Supports HTTP Range requests for partial content (required by PDF.js).
 * 
 * Usage:
 *   GET /api/documents/:jobSheetId/pdf
 *   GET /api/documents/:jobSheetId/pdf?download=1  (for download)
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as db from '../db';
import { getStorageAdapter } from '../storage';

const router = Router();

/**
 * Middleware to verify authentication via Azure Easy Auth headers
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const principalHeader = req.headers['x-ms-client-principal'];
  
  if (!principalHeader) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }
  
  try {
    const decoded = Buffer.from(principalHeader as string, 'base64').toString('utf-8');
    const principal = JSON.parse(decoded);
    (req as any).user = principal;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid authentication token' });
  }
}

/**
 * GET /api/documents/:jobSheetId/pdf
 * 
 * Streams the PDF document for a job sheet.
 * Supports Range requests for partial content (HTTP 206).
 */
router.get('/:jobSheetId/pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const jobSheetId = parseInt(req.params.jobSheetId, 10);
    
    if (isNaN(jobSheetId) || jobSheetId <= 0) {
      res.status(400).json({ error: 'Invalid job sheet ID' });
      return;
    }
    
    // Get job sheet from database
    const jobSheet = await db.getJobSheetById(jobSheetId);
    
    if (!jobSheet) {
      res.status(404).json({ error: 'Job sheet not found' });
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
      res.status(404).json({ error: 'No file associated with this job sheet' });
      return;
    }
    
    // Determine content disposition
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    const fileName = jobSheet.fileName || `document-${jobSheetId}.pdf`;
    const disposition = isDownload ? 'attachment' : 'inline';
    
    // Fetch the file from storage
    const rangeHeader = req.headers.range;
    
    const fetchOptions: RequestInit = {
      method: 'GET',
      headers: {},
    };
    
    // Forward Range header if present
    if (rangeHeader) {
      (fetchOptions.headers as Record<string, string>)['Range'] = rangeHeader;
    }
    
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok && response.status !== 206) {
      console.error('[PDF Proxy] Storage fetch failed:', response.status, response.statusText);
      res.status(502).json({ error: 'Failed to fetch document from storage' });
      return;
    }
    
    // Set response headers
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges');
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
    res.setHeader('Accept-Ranges', acceptRanges || 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
      res.status(206);
    } else {
      res.status(response.status);
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
      };
      
      stream().catch((err) => {
        console.error('[PDF Proxy] Stream error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
      });
    } else {
      // Fallback for environments without readable streams
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
    
  } catch (error) {
    console.error('[PDF Proxy] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * HEAD /api/documents/:jobSheetId/pdf
 * 
 * Returns headers without body (for preflight checks).
 */
router.head('/:jobSheetId/pdf', requireAuth, async (req: Request, res: Response) => {
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
    
    const fileName = jobSheet.fileName || `document-${jobSheetId}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(200).end();
    
  } catch (error) {
    console.error('[PDF Proxy] HEAD error:', error);
    res.status(500).end();
  }
});

export { router as pdfProxyRouter };
