import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  PenTool,
  MousePointer2,
} from "lucide-react";
import { perfMark, perfMeasure, PERF_MARKS, PERF_MEASURES } from "@/lib/perf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Same-origin worker — unpkg CDN workers often fail under Easy Auth / CSP and
// leave a blank canvas after Document reports Page 1 of N.
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
  const [rotation, setRotation] = useState<number>(0);
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
  /**
   * Blob object URL from an authenticated fetch.
   * Do NOT pass ArrayBuffer/{ data } into react-pdf — pdf.js transfers/detaches
   * the buffer, then React re-renders throw:
   * "Cannot perform Construct on a detached ArrayBuffer" (Hold Queue crash).
   */
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pageRenderError, setPageRenderError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fetchGenRef = useRef(0);

  // Guard: prevent direct Azure blob URLs
  useEffect(() => {
    assertNoDirectBlobUrl(url);
  }, [url]);

  // Fetch with credentials → stable blob: URL. Revoke only the previous generation
  // after the new URL is installed (avoids blank canvas from premature revoke).
  useEffect(() => {
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    setPdfFile(null);
    setPdfLoadError(null);
    setPageRenderError(null);
    setUseIframeFallback(false);
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
        if (previous) {
          URL.revokeObjectURL(previous);
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

  // Revoke on full unmount only
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Sync page from finding selection during render (avoids setState-in-effect)
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

  // Notify parent of focus-driven page jumps without setState in the effect
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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);

    // Performance: mark PDF first byte received
    perfMark(PERF_MARKS.PDF_FIRST_BYTE);
    perfMeasure(
      PERF_MEASURES.PDF_TTFB,
      PERF_MARKS.PDF_VIEW_CLICK,
      PERF_MARKS.PDF_FIRST_BYTE
    );
  }

  const handlePageChange = (newPage: number) => {
    setPageNumber(newPage);
    onPageChange?.(newPage);
  };

  // Get boxes for current page
  const currentPageBoxes = boxes.filter(box => box.page === pageNumber);

  return (
    <Card className="flex flex-col h-full overflow-hidden">
      <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between shrink-0 bg-muted/30">
        <CardTitle className="text-sm font-medium">Document Viewer</CardTitle>
        <div className="flex items-center gap-2">
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
                handlePageChange(Math.min(numPages, pageNumber + 1))
              }
              disabled={pageNumber >= numPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRotation(r => (r + 90) % 360)}
          >
            <RotateCw className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
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
              onClick={() => setScale(s => Math.min(2.5, s + 0.1))}
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
              title={isDrawing ? "Cancel Drawing" : "Draw Box"}
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

      <div className="flex-1 bg-muted/50 overflow-auto p-4 flex items-center justify-center relative min-h-[240px]">
        {pdfLoadError && !pdfFile ? (
          <div className="flex flex-col items-center justify-center h-64 w-full text-destructive px-4 text-center">
            <p>Failed to load document.</p>
            <p className="text-xs mt-2">{pdfLoadError}</p>
          </div>
        ) : !pdfFile ? (
          <div className="flex items-center justify-center h-64 w-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : useIframeFallback ? (
          <iframe
            title="PDF preview"
            src={pdfFile}
            className="w-full h-full min-h-[480px] rounded border bg-white"
          />
        ) : (
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={err => {
              console.error("[DocumentViewer] react-pdf load error:", err);
              setPageRenderError(err.message);
              setUseIframeFallback(true);
            }}
            className="shadow-lg"
            loading={
              <div className="flex items-center justify-center h-64 w-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center h-64 w-full text-destructive">
                <p>Failed to load document.</p>
                <p className="text-xs mt-2">
                  {pageRenderError ||
                    pdfLoadError ||
                    "Please check if the file exists and is a valid PDF."}
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => setUseIframeFallback(true)}
                >
                  Open simple preview
                </Button>
              </div>
            }
          >
            <div
              className={`relative inline-block bg-white ${isDrawing ? "cursor-crosshair" : ""}`}
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                rotate={rotation}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="bg-white shadow-md"
                onRenderError={err => {
                  console.error("[DocumentViewer] page render error:", err);
                  setPageRenderError(err.message);
                  setUseIframeFallback(true);
                }}
              />

              {/* Current Drawing Box */}
              {currentBox && (
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/20 z-20"
                  style={{
                    left: `${currentBox.x}%`,
                    top: `${currentBox.y}%`,
                    width: `${currentBox.width}%`,
                    height: `${currentBox.height}%`,
                  }}
                />
              )}

              {/* Bounding Boxes Overlay */}
              {currentPageBoxes.map(box => {
                const isActive = activeBoxId != null && box.id === activeBoxId;
                const isPulsing = isActive;
                return (
                  <div
                    key={box.id}
                    data-box-id={String(box.id)}
                    data-active={isActive ? "true" : undefined}
                    onClick={e => {
                      e.stopPropagation();
                      onBoxClick?.(box.id);
                    }}
                    className={`absolute border-2 cursor-pointer transition-all hover:bg-opacity-20 z-10 ${
                      isActive
                        ? "scale-[1.02] z-20 ring-2 ring-offset-1 ring-primary"
                        : "hover:scale-[1.02]"
                    } ${isPulsing ? "animate-pulse" : ""}`}
                    style={{
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                      borderColor: box.color || "#ef4444",
                      backgroundColor: isActive
                        ? `${box.color || "#ef4444"}40`
                        : `${box.color || "#ef4444"}1A`, // 10% opacity
                      borderWidth: isActive ? 3 : 2,
                    }}
                    title={box.label}
                  >
                    {box.label && (
                      <span
                        className="absolute -top-6 left-0 text-xs text-white px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap"
                        style={{ backgroundColor: box.color || "#ef4444" }}
                      >
                        {box.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Document>
        )}
      </div>
    </Card>
  );
}
