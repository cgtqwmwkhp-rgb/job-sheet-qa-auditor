/**
 * PDF Preview Component
 * 
 * PR-N: PDF.js integration for ROI editor preview.
 * Renders PDF pages with zoom/pan support for ROI authoring.
 * 
 * Uses PDF.js via CDN for minimal bundle impact.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * PDF.js library type definitions (minimal subset needed)
 */
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNum: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport(options: { scale: number }): PDFPageViewport;
  render(context: PDFRenderContext): { promise: Promise<void> };
}

interface PDFPageViewport {
  width: number;
  height: number;
}

interface PDFRenderContext {
  canvasContext: CanvasRenderingContext2D;
  viewport: PDFPageViewport;
}

interface PDFJSLib {
  getDocument(src: string | { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
}

/**
 * PDF Preview Props
 */
interface PdfPreviewProps {
  /** PDF source - URL or ArrayBuffer */
  pdfSource?: string | ArrayBuffer;
  /** Current page number (1-indexed) */
  page?: number;
  /** Zoom level (50-200%) */
  zoom?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Callback when total pages is known */
  onPagesLoaded?: (totalPages: number) => void;
  /** Callback when dimensions are known */
  onDimensionsChange?: (width: number, height: number) => void;
  /** Optional class name */
  className?: string;
  /** Whether to show page controls */
  showPageControls?: boolean;
}

/**
 * Load PDF.js from CDN
 */
async function loadPdfJs(): Promise<PDFJSLib | null> {
  // Check if already loaded
  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib as PDFJSLib;
  }

  // In test/CI environment, return null
  if (typeof document === 'undefined') {
    return null;
  }

  try {
    // Load PDF.js from CDN
    const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
    
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${PDFJS_CDN}/pdf.min.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load PDF.js'));
      document.head.appendChild(script);
    });

    const pdfjsLib = (window as any).pdfjsLib as PDFJSLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
    
    return pdfjsLib;
  } catch (error) {
    console.warn('PDF.js loading failed:', error);
    return null;
  }
}

/**
 * PDF Preview Component
 */
export function PdfPreview({
  pdfSource,
  page = 1,
  zoom = 100,
  onPageChange,
  onPagesLoaded,
  onDimensionsChange,
  className = '',
  showPageControls = true,
}: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(page);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfjsLib, setPdfjsLib] = useState<PDFJSLib | null>(null);

  // Load PDF.js on mount
  useEffect(() => {
    loadPdfJs().then(lib => {
      if (lib) {
        setPdfjsLib(lib);
      } else {
        setError('PDF preview not available');
      }
    });
  }, []);

  // Load PDF document when source changes
  useEffect(() => {
    if (!pdfjsLib || !pdfSource) {
      return;
    }

    setLoading(true);
    setError(null);

    const loadDocument = async () => {
      try {
        const source = typeof pdfSource === 'string' 
          ? pdfSource 
          : { data: pdfSource };
        
        const doc = await pdfjsLib.getDocument(source).promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        onPagesLoaded?.(doc.numPages);
        setLoading(false);
      } catch (err) {
        console.error('PDF load error:', err);
        setError('Failed to load PDF');
        setLoading(false);
      }
    };

    loadDocument();
  }, [pdfjsLib, pdfSource, onPagesLoaded]);

  // Render page when page/zoom changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) {
      return;
    }

    const renderPage = async () => {
      try {
        const pageObj = await pdfDoc.getPage(currentPage);
        const scale = zoom / 100;
        const viewport = pageObj.getViewport({ scale });
        
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');
        
        if (!context) {
          return;
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        onDimensionsChange?.(viewport.width, viewport.height);

        await pageObj.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
      } catch (err) {
        console.error('Page render error:', err);
        setError('Failed to render page');
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, zoom, onDimensionsChange]);

  // Handle page navigation
  const goToPage = useCallback((newPage: number) => {
    const clampedPage = Math.max(1, Math.min(totalPages, newPage));
    setCurrentPage(clampedPage);
    onPageChange?.(clampedPage);
  }, [totalPages, onPageChange]);

  // Placeholder when no PDF
  if (!pdfSource) {
    return (
      <div 
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f1f5f9',
          border: '2px dashed #cbd5e1',
          borderRadius: '8px',
          minHeight: '400px',
          color: '#64748b',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10,9 9,9 8,9" />
        </svg>
        <span>Upload a PDF to preview</span>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div 
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          minHeight: '400px',
          color: '#64748b',
        }}
      >
        Loading PDF...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div 
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          minHeight: '400px',
          color: '#dc2626',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Page controls */}
      {showPageControls && totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          marginBottom: '12px',
          padding: '8px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
        }}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{
              padding: '4px 12px',
              backgroundColor: currentPage <= 1 ? '#e2e8f0' : '#3b82f6',
              color: currentPage <= 1 ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '14px', color: '#475569' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={{
              padding: '4px 12px',
              backgroundColor: currentPage >= totalPages ? '#e2e8f0' : '#3b82f6',
              color: currentPage >= totalPages ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Canvas container */}
      <div style={{
        overflow: 'auto',
        maxHeight: '600px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        backgroundColor: '#64748b',
        padding: '16px',
      }}>
        <canvas 
          ref={canvasRef}
          style={{
            display: 'block',
            margin: '0 auto',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
      </div>
    </div>
  );
}

export default PdfPreview;
