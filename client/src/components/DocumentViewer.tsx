import { useState, useRef, useEffect } from "react";
import { pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  PenTool,
  MousePointer2,
} from "lucide-react";
import { perfMark, perfMeasure, PERF_MARKS, PERF_MEASURES } from "@/lib/perf";

// Worker only used for page-count metadata — rendering is a native iframe.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Guard: Throw in dev if blob.core.windows.net URL is used
 * This prevents CORS issues with Azure Blob SAS URLs
 */
function assertNoDirectBlobUrl(url: string): void {
  if (url && url.includes("blob.core.windows.net")) {
    const errorMsg =
      "[DocumentViewer] Direct blob.core.windows.net URLs are not allowed. Use the PDF proxy endpoint (/api/documents/:id/pdf) instead.";
    console.error(errorMsg);
    if (import.meta.env.DEV) {
      throw new Error(errorMsg);
    }
  }
}

export interface BoundingBox {
  id: string | number;
  page: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  color?: string;
  label?: string;
}

interface DocumentViewerProps {
  url: string;
  initialPage?: number;
  /** Controlled page jump from finding → PDF sync (PR-12). */
  focusPage?: number | null;
  /** Bumps on each "View on Doc" click so same-page re-focus remounts the iframe. */
  focusNonce?: number;
  /** Header label when focusing a finding (works even without a bbox overlay). */
  focusLabel?: string | null;
  /** Highlight / pulse the active finding overlay (PR-12). */
  activeBoxId?: string | number | null;
  onPageChange?: (page: number) => void;
  boxes?: BoundingBox[];
  onBoxClick?: (boxId: string | number) => void;
  onBoxCreate?: (box: BoundingBox) => void;
}

export function DocumentViewer({
  url,
  initialPage = 1,
  focusPage = null,
  focusNonce = 0,
  focusLabel = null,
  activeBoxId = null,
  onPageChange,
  boxes = [],
  onBoxClick: _onBoxClick,
  onBoxCreate,
}: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number | "page-width">("page-width");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [currentBox, setCurrentBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  /** Authenticated blob: URL — never pass raw ArrayBuffer into pdf.js render. */
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  /** PX-085: raster job sheets (JPEG/PNG) render as <img>, not PDF.js. */
  const [mediaKind, setMediaKind] = useState<"pdf" | "image">("pdf");
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  /** PDF user-space size per page (from pdf.js) for View-on-Doc zoom targets. */
  const [pageSizes, setPageSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [fetchNonce, setFetchNonce] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fetchGenRef = useRef(0);
  const pdfBytesRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    assertNoDirectBlobUrl(url);
  }, [url]);

  // Credentialed fetch → blob URL (Easy Auth cookies). PDF iframe or image.
  useEffect(() => {
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    setPdfFile(null);
    setPdfLoadError(null);
    setNumPages(0);
    setMediaKind("pdf");
    pdfBytesRef.current = null;

    if (!url) return;

    const sniffImageMime = (
      bytes: Uint8Array,
      contentType: string | null
    ): string | null => {
      const ct = (contentType ?? "").toLowerCase();
      if (ct.includes("image/jpeg") || ct.includes("image/jpg"))
        return "image/jpeg";
      if (ct.includes("image/png")) return "image/png";
      if (ct.includes("image/webp")) return "image/webp";
      // Magic bytes
      if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      ) {
        return "image/jpeg";
      }
      if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      ) {
        return "image/png";
      }
      return null;
    };

    (async () => {
      try {
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/pdf,image/jpeg,image/png,image/*" },
        });
        if (!res.ok) {
          throw new Error(`Document fetch failed (${res.status})`);
        }
        const contentType = res.headers.get("content-type");
        const buffer = await res.arrayBuffer();
        if (cancelled || gen !== fetchGenRef.current) return;

        const bytes = new Uint8Array(buffer);
        const imageMime = sniffImageMime(bytes, contentType);
        if (imageMime) {
          const blob = new Blob([bytes], { type: imageMime });
          const objectUrl = URL.createObjectURL(blob);
          const previous = objectUrlRef.current;
          objectUrlRef.current = objectUrl;
          pdfBytesRef.current = null;
          setMediaKind("image");
          setPdfFile(objectUrl);
          setNumPages(1);
          setPageSizes({ 1: { width: 1, height: 1 } });
          if (previous) URL.revokeObjectURL(previous);

          perfMark(PERF_MARKS.PDF_FIRST_BYTE);
          perfMeasure(
            PERF_MEASURES.PDF_TTFB,
            PERF_MARKS.PDF_VIEW_CLICK,
            PERF_MARKS.PDF_FIRST_BYTE
          );
          return;
        }

        const header = String.fromCharCode(
          bytes[0] ?? 0,
          bytes[1] ?? 0,
          bytes[2] ?? 0,
          bytes[3] ?? 0
        );
        if (bytes.byteLength < 5 || header !== "%PDF") {
          throw new Error(
            "Response was not a PDF or image (check Easy Auth / proxy). Try Download."
          );
        }

        const blob = new Blob([bytes], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        const previous = objectUrlRef.current;
        objectUrlRef.current = objectUrl;
        pdfBytesRef.current = bytes;
        setMediaKind("pdf");
        setPdfFile(objectUrl);
        if (previous) URL.revokeObjectURL(previous);

        perfMark(PERF_MARKS.PDF_FIRST_BYTE);
        perfMeasure(
          PERF_MEASURES.PDF_TTFB,
          PERF_MARKS.PDF_VIEW_CLICK,
          PERF_MARKS.PDF_FIRST_BYTE
        );

        try {
          const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
          if (!cancelled && gen === fetchGenRef.current) {
            setNumPages(doc.numPages);
            const sizes: Record<number, { width: number; height: number }> = {};
            const maxProbe = Math.min(doc.numPages, 8);
            for (let i = 1; i <= maxProbe; i++) {
              const page = await doc.getPage(i);
              const vp = page.getViewport({ scale: 1 });
              sizes[i] = { width: vp.width, height: vp.height };
            }
            setPageSizes(sizes);
          }
          await doc.destroy();
        } catch (metaErr) {
          console.warn("[DocumentViewer] page-count probe failed:", metaErr);
          if (!cancelled && gen === fetchGenRef.current) {
            setNumPages(1);
            setPageSizes({});
          }
        }
      } catch (err) {
        console.error(
          "[DocumentViewer] Authenticated document fetch failed:",
          err
        );
        if (!cancelled && gen === fetchGenRef.current) {
          setPdfFile(null);
          setPdfLoadError(
            err instanceof Error ? err.message : "Document fetch failed"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, fetchNonce]);

  // Probe page size on demand when View-on-Doc targets a page beyond the first 8.
  useEffect(() => {
    const bytes = pdfBytesRef.current;
    const target = focusPage ?? pageNumber;
    if (!bytes || target < 1 || pageSizes[target]) return;

    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        if (target <= doc.numPages) {
          const page = await doc.getPage(target);
          const vp = page.getViewport({ scale: 1 });
          if (!cancelled) {
            setPageSizes(prev => ({
              ...prev,
              [target]: { width: vp.width, height: vp.height },
            }));
          }
        }
        await doc.destroy();
      } catch (err) {
        console.warn("[DocumentViewer] on-demand page probe failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [focusPage, pageNumber, pageSizes, pdfFile]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (focusPage == null || focusPage < 1) return;
    if (numPages > 0 && focusPage > numPages) return;
    setPageNumber(focusPage);
    onPageChange?.(focusPage);
  }, [focusPage, focusNonce, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setDrawStart({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !drawStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
    const currentY = ((e.clientY - rect.top) / rect.height) * 100;

    const width = Math.abs(currentX - drawStart.x);
    const height = Math.abs(currentY - drawStart.y);
    const x = Math.min(currentX, drawStart.x);
    const y = Math.min(currentY, drawStart.y);

    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || !currentBox) return;

    if (currentBox.width > 1 && currentBox.height > 1) {
      onBoxCreate?.({
        id: Date.now(),
        page: pageNumber,
        ...currentBox,
        color: "#3b82f6",
        label: "New Finding",
      });
    }

    setDrawStart(null);
    setCurrentBox(null);
    setIsDrawing(false);
  };

  const handlePageChange = (newPage: number) => {
    setPageNumber(newPage);
    onPageChange?.(newPage);
  };

  // Native Chrome/Edge PDF UI needs an uncovered iframe for toolbar/scroll.
  // pointer-events:none highlight overlays are safe and do not steal chrome.
  const activeBox =
    activeBoxId != null
      ? (boxes.find(box => box.id === activeBoxId) ?? null)
      : null;
  const headerFocusLabel = focusLabel || activeBox?.label || null;
  const pageSize = pageSizes[pageNumber];
  // Chromium's built-in PDF viewer only accepts numeric zoom (or zoom,left,top).
  // Named values like "page-width" and non-standard "focus=" blank the iframe.
  // Remounting is handled by the iframe `key` (includes focusNonce) — keep the
  // fragment limited to documented open parameters.
  const hashParts = [
    "toolbar=1",
    "navpanes=0",
    "scrollbar=1",
    `page=${pageNumber}`,
  ];
  if (
    activeBox &&
    activeBox.page === pageNumber &&
    pageSize &&
    pageSize.height > 0
  ) {
    const left = Math.round((activeBox.x / 100) * pageSize.width);
    const top = Math.round((activeBox.y / 100) * pageSize.height);
    const scalePct = scale === "page-width" ? 100 : Math.round(scale * 100);
    hashParts.push(`zoom=${scalePct},${left},${top}`);
  } else if (scale !== "page-width") {
    hashParts.push(`zoom=${Math.round(scale * 100)}`);
  }
  const iframeSrc = pdfFile ? `${pdfFile}#${hashParts.join("&")}` : null;

  return (
    <Card className="flex flex-col h-full min-h-0 overflow-hidden border-0 shadow-none rounded-none bg-background">
      <CardHeader className="py-2.5 px-3 border-b border-border flex flex-row items-center justify-between shrink-0 bg-background gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CardTitle className="text-sm font-medium shrink-0">
            {mediaKind === "image" ? "Image" : "Document"}
          </CardTitle>
          {headerFocusLabel && (
            <span
              className="text-xs text-primary truncate font-medium"
              title={
                activeBox
                  ? `Highlighting ${headerFocusLabel}`
                  : `Focused ${headerFocusLabel} (no bbox — page jump only)`
              }
            >
              Focus: {headerFocusLabel}
              {` (p.${activeBox?.page ?? pageNumber})`}
              {!activeBox ? " · page only" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 border-r pr-2 mr-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous page"
              className="h-8 w-8"
              onClick={() => handlePageChange(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs w-16 text-center">
              Page {pageNumber} of {numPages || "--"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next page"
              className="h-8 w-8"
              onClick={() =>
                handlePageChange(Math.min(numPages || 1, pageNumber + 1))
              }
              disabled={numPages > 0 ? pageNumber >= numPages : true}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              className="h-8 w-8"
              onClick={() =>
                setScale(s => {
                  const current = s === "page-width" ? 1 : s;
                  return Math.max(0.5, Math.round((current - 0.1) * 10) / 10);
                })
              }
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs w-12 text-center">
              {scale === "page-width" ? "Fit" : `${Math.round(scale * 100)}%`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              className="h-8 w-8"
              onClick={() =>
                setScale(s => {
                  const current = s === "page-width" ? 1 : s;
                  return Math.min(2.5, Math.round((current + 0.1) * 10) / 10);
                })
              }
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            {onBoxCreate ? (
              <Button
                variant={isDrawing ? "secondary" : "ghost"}
                size="icon"
                aria-label={
                  isDrawing
                    ? "Done drawing — PDF controls re-enabled"
                    : "Draw box (temporarily locks PDF controls)"
                }
                className="h-8 w-8"
                onClick={() => setIsDrawing(!isDrawing)}
                title={
                  isDrawing
                    ? "Done drawing — PDF controls re-enabled"
                    : "Draw box (temporarily locks PDF controls)"
                }
              >
                {isDrawing ? (
                  <MousePointer2 className="w-4 h-4" />
                ) : (
                  <PenTool className="w-4 h-4" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <div className="flex-1 bg-muted/30 overflow-hidden relative min-h-0">
        {pdfLoadError && !pdfFile ? (
          <div className="flex flex-col items-center justify-center h-full w-full min-h-[240px] text-destructive px-4 text-center gap-3">
            <p>Failed to load document.</p>
            <p className="text-xs text-muted-foreground">{pdfLoadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFetchNonce(n => n + 1)}
            >
              Retry
            </Button>
          </div>
        ) : !pdfFile ? (
          <div className="flex flex-col items-center justify-center gap-3 h-full w-full min-h-[240px] bg-muted/20">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
              role="status"
              aria-label="Loading document"
            />
            {/* PX-070 — explicit loading state for slow PDFs (avoid blank/offset look) */}
            <p className="text-sm text-muted-foreground">
              Loading document… large PDFs can take a few seconds.
            </p>
          </div>
        ) : mediaKind === "image" ? (
          <div
            className="relative w-full h-full min-h-[240px] bg-muted/20 overflow-auto flex items-center justify-center p-2"
            ref={containerRef}
          >
            <img
              src={pdfFile}
              alt="Job sheet scan"
              className="max-w-full max-h-full object-contain"
              style={
                scale === "page-width"
                  ? undefined
                  : { transform: `scale(${scale})`, transformOrigin: "center" }
              }
            />
          </div>
        ) : !iframeSrc ? (
          <div className="flex items-center justify-center h-full w-full min-h-[240px] bg-muted/20">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
              role="status"
              aria-label="Loading PDF"
            />
          </div>
        ) : (
          <div
            className="relative w-full h-full min-h-[240px] bg-muted/20"
            ref={containerRef}
          >
            <iframe
              key={`pdf-${pageNumber}-${focusNonce}-${scale === "page-width" ? "fit" : scale}`}
              title="PDF document"
              src={iframeSrc}
              className="absolute inset-0 w-full h-full border-0 bg-background"
            />

            {/* Non-interactive highlight for the active finding bbox */}
            {!isDrawing && activeBox && activeBox.page === pageNumber && (
              <div
                className="absolute inset-0 z-10 pointer-events-none"
                aria-hidden
              >
                <div
                  className="absolute border-2 rounded-sm animate-pulse"
                  style={{
                    left: `${activeBox.x}%`,
                    top: `${activeBox.y}%`,
                    width: `${activeBox.width}%`,
                    height: `${activeBox.height}%`,
                    borderColor: activeBox.color || "#3b82f6",
                    backgroundColor: `${activeBox.color || "#3b82f6"}33`,
                    boxShadow: `0 0 0 9999px rgba(15, 23, 42, 0.18)`,
                  }}
                />
              </div>
            )}

            {/* Capture layer ONLY while drawing — otherwise PDF chrome must be free */}
            {isDrawing && (
              <div
                className="absolute inset-0 z-20 cursor-crosshair bg-transparent"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {currentBox && (
                  <div
                    className="absolute border-2 border-blue-500 bg-blue-500/20"
                    style={{
                      left: `${currentBox.x}%`,
                      top: `${currentBox.y}%`,
                      width: `${currentBox.width}%`,
                      height: `${currentBox.height}%`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
