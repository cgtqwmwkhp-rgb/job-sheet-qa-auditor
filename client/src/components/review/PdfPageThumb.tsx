/**
 * Low-res PDF page thumbnail for before/after compare (fail-soft).
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string | { url: string }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => {
          width: number;
          height: number;
        };
        render: (opts: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
};

async function loadPdfJs(): Promise<PdfJsLib | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const w = window as unknown as { pdfjsLib?: PdfJsLib };
  if (w.pdfjsLib) return w.pdfjsLib;
  try {
    const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${CDN}/pdf.min.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("pdf.js load failed"));
      document.head.appendChild(script);
    });
    const pdfjsLib = (window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.js`;
    return pdfjsLib;
  } catch {
    return null;
  }
}

export interface PdfPageThumbProps {
  documentUrl?: string;
  page: number;
  label: string;
  maxHeight?: number;
  onClick?: () => void;
  className?: string;
}

export function PdfPageThumb({
  documentUrl,
  page,
  label,
  maxHeight = 96,
  onClick,
  className,
}: PdfPageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setReady(false);
    if (!documentUrl || !page || page < 1) {
      setFailed(true);
      return;
    }
    (async () => {
      const pdfjs = await loadPdfJs();
      if (!pdfjs || cancelled) {
        if (!cancelled) setFailed(true);
        return;
      }
      try {
        const doc = await pdfjs.getDocument({ url: documentUrl }).promise;
        if (cancelled) return;
        const pg = await doc.getPage(Math.min(page, doc.numPages));
        if (cancelled) return;
        const base = pg.getViewport({ scale: 1 });
        const scale = Math.min(1.2, maxHeight / base.height);
        const viewport = pg.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setFailed(true);
          return;
        }
        await pg.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentUrl, page, maxHeight]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded bg-muted/40 p-1.5 min-h-[72px] w-full text-left border border-transparent",
        onClick && "hover:border-primary/40 cursor-pointer",
        className
      )}
    >
      <div className="font-medium mb-1 text-xs">{label}</div>
      {failed || !documentUrl ? (
        <p className="text-muted-foreground text-[10px]">
          {documentUrl
            ? `Open page ${page} in the PDF viewer`
            : "Page unavailable"}
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          className={cn(
            "max-w-full h-auto rounded border border-border/50 bg-white",
            !ready && "opacity-0"
          )}
          style={{ maxHeight }}
        />
      )}
    </button>
  );
}
