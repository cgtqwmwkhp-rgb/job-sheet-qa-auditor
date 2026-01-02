import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, PenTool, MousePointer2 } from "lucide-react";
import * as ReactWindow from 'react-window';
import * as AutoSizerPkg from 'react-virtualized-auto-sizer';

// Robust import for CJS/ESM interop
const List = (ReactWindow as any).default?.FixedSizeList || (ReactWindow as any).FixedSizeList || ReactWindow;
const Sizer = (AutoSizerPkg as any).default || AutoSizerPkg;

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set worker source to CDN to avoid build-time resolution issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  onPageChange?: (page: number) => void;
  boxes?: BoundingBox[];
  onBoxClick?: (boxId: string | number) => void;
  onBoxCreate?: (box: BoundingBox) => void;
}

export function DocumentViewer({ url, initialPage = 1, onPageChange, boxes = [], onBoxClick, onBoxCreate }: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<any>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(pageNumber - 1, "start");
    }
  }, [pageNumber]);

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
        color: '#3b82f6',
        label: 'New Finding'
      });
    }

    setDrawStart(null);
    setCurrentBox(null);
    setIsDrawing(false);
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const handlePageChange = (newPage: number) => {
    setPageNumber(newPage);
    onPageChange?.(newPage);
  };

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
              Page {pageNumber} of {numPages || '--'}
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => handlePageChange(Math.min(numPages, pageNumber + 1))}
              disabled={pageNumber >= numPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="w-4 h-4" />
          </Button>
          
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.min(2.5, s + 0.1))}>
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
              {isDrawing ? <MousePointer2 className="w-4 h-4" /> : <PenTool className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <div className="flex-1 bg-muted/50 overflow-auto p-4 flex items-center justify-center relative">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          className="shadow-lg"
          loading={
            <div className="flex items-center justify-center h-64 w-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center h-64 w-full text-destructive">
              <p>Failed to load document.</p>
              <p className="text-xs mt-2">Please check if the file exists and is a valid PDF.</p>
            </div>
          }
        >
          <Sizer>
            {({ height, width }: { height: number; width: number }) => (
              <List
                ref={listRef}
                height={height}
                itemCount={numPages}
                itemSize={800 * scale} // Approximate height based on scale
                width={width}
                className="flex justify-center"
              >
                {({ index, style }: { index: number; style: React.CSSProperties }) => (
                  <div style={style} className="flex justify-center py-4">
                    <div 
                      className={`relative inline-block ${isDrawing ? 'cursor-crosshair' : ''}`}
                      ref={containerRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      <Page 
                        pageNumber={index + 1} 
                        scale={scale} 
                        rotate={rotation}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="bg-white shadow-md"
                        onRenderSuccess={() => {
                          if (index + 1 === pageNumber) {
                            // Optional: logic after render
                          }
                        }}
                      />
                      
                      {/* Current Drawing Box (Only on active page for now) */}
                      {currentBox && index + 1 === pageNumber && (
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
                      {boxes
                        .filter(box => box.page === index + 1)
                        .map(box => (
                          <div
                            key={box.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBoxClick?.(box.id);
                            }}
                            className="absolute border-2 cursor-pointer transition-all hover:bg-opacity-20 hover:scale-[1.02] z-10"
                            style={{
                              left: `${box.x}%`,
                              top: `${box.y}%`,
                              width: `${box.width}%`,
                              height: `${box.height}%`,
                              borderColor: box.color || '#ef4444',
                              backgroundColor: `${box.color || '#ef4444'}1A`, // 10% opacity
                            }}
                            title={box.label}
                          >
                            {box.label && (
                              <span 
                                className="absolute -top-6 left-0 text-xs text-white px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap"
                                style={{ backgroundColor: box.color || '#ef4444' }}
                              >
                                {box.label}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </List>
            )}
          </Sizer>
        </Document>
      </div>
    </Card>
  );
}
