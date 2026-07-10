import { useState, useRef, useEffect } from "react";
import { pdfjs } from "react-pdf";
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

// Worker only used for page-count metadata — rendering is a native iframe so we
// avoid react-pdf blank-canvas failures under Easy Auth / nested flex layouts.
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

        // Page count only — do not use react-pdf <Page> (blank canvas under ACA).
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

  const currentPageBoxes = boxes.filter(box => box.page === pageNumber);
  const iframeSrc = pdfFile
    ? `${pdfFile}#page=${pageNumber}&zoom=${Math.round(scale * 100)}`
    : null;

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
                handlePageChange(Math.min(numPages || 1, pageNumber + 1))
              }
              disabled={numPages > 0 ? pageNumber >= numPages : true}
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

      <div className="flex-1 bg-muted/50 overflow-hidden p-2 relative min-h-[320px]">
        {pdfLoadError && !pdfFile ? (
          <div className="flex flex-col items-center justify-center h-full w-full text-destructive px-4 text-center">
            <p>Failed to load document.</p>
            <p className="text-xs mt-2">{pdfLoadError}</p>
          </div>
        ) : !iframeSrc ? (
          <div className="flex items-center justify-center h-full w-full min-h-[240px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div
            className={`relative w-full h-full min-h-[320px] overflow-auto ${
              isDrawing ? "cursor-crosshair" : ""
            }`}
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="w-full h-full min-h-[320px] origin-top-left"
              style={{
                transform: `rotate(${rotation}deg)`,
              }}
            >
              <iframe
                key={iframeSrc}
                title="PDF document"
                src={iframeSrc}
                className="w-full h-full min-h-[480px] rounded border-0 bg-white"
                // pointer-events none while drawing so overlay receives mouse
                style={{
                  pointerEvents: isDrawing ? "none" : "auto",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  width: `${100 / scale}%`,
                  height: `${100 / scale}%`,
                }}
              />
            </div>

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

            {currentPageBoxes.map(box => {
              const isActive = activeBoxId != null && box.id === activeBoxId;
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
                  } ${isActive ? "animate-pulse" : ""}`}
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                    borderColor: box.color || "#ef4444",
                    backgroundColor: isActive
                      ? `${box.color || "#ef4444"}40`
                      : `${box.color || "#ef4444"}1A`,
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
        )}
      </div>
    </Card>
  );
}
