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
  activeBoxId = null,
  onPageChange,
  boxes = [],
  onBoxClick,
  onBoxCreate,
}: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [syncedFocusPage, setSyncedFocusPage] = useState(focusPage);
  const [scale, setScale] = useState<number>(1.0);
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
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    assertNoDirectBlobUrl(url);
  }, [url]);

  // Credentialed fetch → blob URL (Easy Auth cookies). Native iframe renders it.
  useEffect(() => {
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    setPdfFile(null);
    setPdfLoadError(null);
    setNumPages(0);

    if (!url) return;

    (async () => {
      try {
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/pdf" },
        });
        if (!res.ok) {
          throw new Error(`PDF fetch failed (${res.status})`);
        }
        const buffer = await res.arrayBuffer();
        if (cancelled || gen !== fetchGenRef.current) return;

        const bytes = new Uint8Array(buffer);
        const header = String.fromCharCode(
          bytes[0] ?? 0,
          bytes[1] ?? 0,
          bytes[2] ?? 0,
          bytes[3] ?? 0
        );
        if (bytes.byteLength < 5 || header !== "%PDF") {
          throw new Error(
            "Response was not a PDF (check Easy Auth / proxy). Try Download."
          );
        }

        const blob = new Blob([bytes], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        const previous = objectUrlRef.current;
        objectUrlRef.current = objectUrl;
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
          }
          await doc.destroy();
        } catch (metaErr) {
          console.warn("[DocumentViewer] page-count probe failed:", metaErr);
          if (!cancelled && gen === fetchGenRef.current) {
            setNumPages(1);
          }
        }
      } catch (err) {
        console.error("[DocumentViewer] Authenticated PDF fetch failed:", err);
        if (!cancelled && gen === fetchGenRef.current) {
          setPdfFile(null);
          setPdfLoadError(
            err instanceof Error ? err.message : "PDF fetch failed"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  if (focusPage !== syncedFocusPage) {
    setSyncedFocusPage(focusPage);
    if (
      focusPage != null &&
      focusPage >= 1 &&
      (numPages === 0 || focusPage <= numPages)
    ) {
      setPageNumber(focusPage);
    }
  }

  useEffect(() => {
    if (focusPage == null || focusPage < 1) return;
    if (numPages > 0 && focusPage > numPages) return;
    onPageChange?.(focusPage);
  }, [focusPage, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Native Chrome/Edge PDF UI needs an uncovered iframe — any stacked HTML
  // over the plugin (even pointer-events:none) blocks toolbar, scrollbars, zoom.
  const activeBox =
    activeBoxId != null
      ? boxes.find(box => box.id === activeBoxId) ?? null
      : null;
  const iframeSrc = pdfFile
    ? `${pdfFile}#toolbar=1&navpanes=0&scrollbar=1&page=${pageNumber}&zoom=${Math.round(scale * 100)}`
    : null;

  return (
    <Card className="flex flex-col h-full min-h-0 overflow-hidden border-0 shadow-none rounded-none bg-white">
      <CardHeader className="py-2.5 px-3 border-b flex flex-row items-center justify-between shrink-0 bg-white gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CardTitle className="text-sm font-medium shrink-0">Document</CardTitle>
          {activeBox?.label && (
            <span className="text-xs text-muted-foreground truncate">
              Focus: {activeBox.label}
              {activeBox.page ? ` (p.${activeBox.page})` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 border-r pr-2 mr-2">
            <Button
              variant="ghost"
              size="icon"
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
              className="h-8 w-8"
              onClick={() =>
                setScale(s => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))
              }
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setScale(s => Math.min(2.5, Math.round((s + 0.1) * 10) / 10))
              }
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button
              variant={isDrawing ? "secondary" : "ghost"}
              size="icon"
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
          </div>
        </div>
      </CardHeader>

      <div className="flex-1 bg-white overflow-hidden relative min-h-0">
        {pdfLoadError && !pdfFile ? (
          <div className="flex flex-col items-center justify-center h-full w-full text-destructive px-4 text-center">
            <p>Failed to load document.</p>
            <p className="text-xs mt-2">{pdfLoadError}</p>
          </div>
        ) : !iframeSrc ? (
          <div className="flex items-center justify-center h-full w-full min-h-[240px] bg-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="relative w-full h-full min-h-0 bg-white" ref={containerRef}>
            <iframe
              key={iframeSrc}
              title="PDF document"
              src={iframeSrc}
              className="absolute inset-0 w-full h-full border-0 bg-white"
            />

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
