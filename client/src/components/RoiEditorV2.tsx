/**
 * ROI Editor V2 Component
 * 
 * PR-L/N: Enhanced ROI editor with PDF preview and usability improvements.
 * - PDF.js integration for document preview (PR-N)
 * - PDF file upload with drag-and-drop
 * - Zoom/pan controls (50-200%)
 * - Copy ROIs from previous version
 * - Pre-fill standard templates
 * - Snap-to-grid option
 * - Region enable/disable toggles
 * - ROI resize handles
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { PdfPreview } from './PdfPreview';

/**
 * ROI Region type
 */
interface RoiRegion {
  name: string;
  page: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fields?: string[];
  enabled?: boolean;
}

/**
 * ROI Config type
 */
interface RoiConfig {
  regions: RoiRegion[];
}

/**
 * Standard ROI types for job sheets
 */
const STANDARD_ROI_TYPES = [
  { id: 'header', label: 'Header', color: '#3b82f6', critical: false },
  { id: 'jobReference', label: 'Job Reference', color: '#10b981', critical: true },
  { id: 'assetId', label: 'Asset ID', color: '#f59e0b', critical: true },
  { id: 'date', label: 'Date', color: '#8b5cf6', critical: true },
  { id: 'expiryDate', label: 'Expiry Date', color: '#ec4899', critical: true },
  { id: 'tickboxBlock', label: 'Tickbox Block', color: '#06b6d4', critical: true },
  { id: 'signatureBlock', label: 'Signature Block', color: '#ef4444', critical: true },
  { id: 'customerSignature', label: 'Customer Signature', color: '#84cc16', critical: false },
  { id: 'engineerSignature', label: 'Engineer Signature', color: '#f97316', critical: false },
  { id: 'workDescription', label: 'Work Description', color: '#6366f1', critical: false },
] as const;

/**
 * Pre-defined ROI templates by document type
 */
const ROI_TEMPLATES: Record<string, RoiConfig> = {
  'maintenance': {
    regions: [
      { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 }, enabled: true },
      { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 }, enabled: true },
      { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 }, enabled: true },
      { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 }, enabled: true },
      { name: 'workDescription', page: 1, bounds: { x: 0.05, y: 0.2, width: 0.9, height: 0.4 }, enabled: true },
      { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 }, enabled: true },
    ],
  },
  'inspection': {
    regions: [
      { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 }, enabled: true },
      { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 }, enabled: true },
      { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 }, enabled: true },
      { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 }, enabled: true },
      { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 }, enabled: true },
      { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.25, width: 0.9, height: 0.4 }, enabled: true },
      { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 }, enabled: true },
    ],
  },
  'installation': {
    regions: [
      { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.12 }, enabled: true },
      { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.12, width: 0.4, height: 0.05 }, enabled: true },
      { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.12, width: 0.45, height: 0.05 }, enabled: true },
      { name: 'date', page: 1, bounds: { x: 0.05, y: 0.2, width: 0.3, height: 0.04 }, enabled: true },
      { name: 'engineerSignature', page: 1, bounds: { x: 0, y: 0.75, width: 0.5, height: 0.12 }, enabled: true },
      { name: 'customerSignature', page: 1, bounds: { x: 0.5, y: 0.75, width: 0.5, height: 0.12 }, enabled: true },
    ],
  },
};

interface RoiEditorV2Props {
  /** Initial ROI configuration */
  initialRoi?: RoiConfig;
  /** Previous version ROI to copy from */
  previousVersionRoi?: RoiConfig;
  /** PDF URL for preview (if available) */
  pdfUrl?: string;
  /** PDF data for preview (ArrayBuffer) */
  pdfData?: ArrayBuffer;
  /** Callback when ROI changes */
  onChange?: (roi: RoiConfig) => void;
  /** Callback when save is requested */
  onSave?: (roi: RoiConfig) => void;
  /** Callback when PDF is uploaded */
  onPdfUpload?: (file: File) => void;
  /** Whether editor is read-only */
  readOnly?: boolean;
  /** Document type for template suggestions */
  documentType?: 'maintenance' | 'inspection' | 'installation';
  /** Show PDF preview panel */
  showPdfPreview?: boolean;
}

/**
 * ROI Editor V2 Component
 */
export function RoiEditorV2({
  initialRoi,
  previousVersionRoi,
  pdfUrl,
  pdfData,
  onChange,
  onSave,
  onPdfUpload,
  readOnly = false,
  documentType,
  showPdfPreview = true,
}: RoiEditorV2Props) {
  const [regions, setRegions] = useState<RoiRegion[]>(initialRoi?.regions ?? []);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentTool, setCurrentTool] = useState<string>('jobReference');
  const [zoom, setZoom] = useState(100);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize] = useState(0.05); // 5% grid
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPdfData, setLocalPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  // Use provided PDF data or local upload
  const effectivePdfSource = pdfData ?? localPdfData ?? pdfUrl ?? undefined;

  /**
   * Handle PDF file upload
   */
  const handlePdfUpload = useCallback((file: File) => {
    if (!file.type.includes('pdf')) {
      return;
    }

    setPdfFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      setLocalPdfData(arrayBuffer);
    };
    reader.readAsArrayBuffer(file);

    onPdfUpload?.(file);
  }, [onPdfUpload]);

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePdfUpload(file);
    }
  }, [handlePdfUpload]);

  /**
   * Handle drag and drop
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handlePdfUpload(file);
    }
  }, [handlePdfUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // Notify parent of changes
  useEffect(() => {
    onChange?.({ regions });
  }, [regions, onChange]);

  /**
   * Get color for region type
   */
  const getRegionColor = (name: string): string => {
    const type = STANDARD_ROI_TYPES.find(t => t.id === name);
    return type?.color ?? '#6b7280';
  };

  /**
   * Check if region type is critical
   */
  const isCritical = (name: string): boolean => {
    const type = STANDARD_ROI_TYPES.find(t => t.id === name);
    return type?.critical ?? false;
  };

  /**
   * Snap value to grid
   */
  const snapValue = useCallback((value: number): number => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  /**
   * Handle mouse down on canvas
   */
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = snapValue((e.clientX - rect.left) / rect.width);
    const y = snapValue((e.clientY - rect.top) / rect.height);

    setIsDrawing(true);
    setDrawStart({ x, y });
  }, [readOnly, snapValue]);

  /**
   * Handle mouse up on canvas
   */
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const endX = snapValue((e.clientX - rect.left) / rect.width);
    const endY = snapValue((e.clientY - rect.top) / rect.height);

    const x = Math.min(drawStart.x, endX);
    const y = Math.min(drawStart.y, endY);
    const width = Math.abs(endX - drawStart.x);
    const height = Math.abs(endY - drawStart.y);

    if (width > 0.01 && height > 0.01) {
      const newRegion: RoiRegion = {
        name: currentTool,
        page: 1,
        bounds: {
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          width: Math.max(0.01, Math.min(1 - x, width)),
          height: Math.max(0.01, Math.min(1 - y, height)),
        },
        enabled: true,
      };

      setRegions(prev => {
        const filtered = prev.filter(r => r.name !== currentTool);
        return [...filtered, newRegion];
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
  }, [isDrawing, drawStart, currentTool, snapValue]);

  /**
   * Delete a region
   */
  const deleteRegion = (name: string) => {
    setRegions(prev => prev.filter(r => r.name !== name));
    if (selectedRegion === name) {
      setSelectedRegion(null);
    }
  };

  /**
   * Toggle region enabled state
   */
  const toggleRegion = (name: string) => {
    setRegions(prev => prev.map(r => 
      r.name === name ? { ...r, enabled: !r.enabled } : r
    ));
  };

  /**
   * Apply template
   */
  const applyTemplate = (templateType: string) => {
    const template = ROI_TEMPLATES[templateType];
    if (template) {
      setRegions(template.regions.map(r => ({ ...r, enabled: true })));
    }
  };

  /**
   * Copy from previous version
   */
  const copyFromPrevious = () => {
    if (previousVersionRoi) {
      setRegions(previousVersionRoi.regions.map(r => ({ ...r, enabled: r.enabled ?? true })));
    }
  };

  /**
   * Handle save
   */
  const handleSave = () => {
    // Only save enabled regions
    const enabledRegions = regions.filter(r => r.enabled !== false);
    onSave?.({ regions: enabledRegions });
  };

  /**
   * Clear all regions
   */
  const clearAll = () => {
    setRegions([]);
    setSelectedRegion(null);
  };

  /**
   * Get missing critical ROIs
   */
  const getMissingCritical = (): string[] => {
    const presentNames = new Set(regions.filter(r => r.enabled !== false).map(r => r.name));
    return STANDARD_ROI_TYPES
      .filter(t => t.critical && !presentNames.has(t.id))
      .map(t => t.label);
  };

  const missingCritical = getMissingCritical();
  const filteredTypes = showCriticalOnly 
    ? STANDARD_ROI_TYPES.filter(t => t.critical)
    : STANDARD_ROI_TYPES;

  return (
    <div className="roi-editor-v2" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header with controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        padding: '12px 16px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        color: 'white',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            ROI Editor
          </h2>
          {missingCritical.length > 0 && (
            <span style={{
              padding: '4px 10px',
              backgroundColor: '#fbbf24',
              color: '#1e293b',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {missingCritical.length} critical ROI{missingCritical.length > 1 ? 's' : ''} missing
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setZoom(z => Math.max(50, z - 25))}
              style={{
                padding: '4px 8px',
                backgroundColor: '#334155',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              −
            </button>
            <span style={{ fontSize: '13px', minWidth: '50px', textAlign: 'center' }}>
              {zoom}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(200, z + 25))}
              style={{
                padding: '4px 8px',
                backgroundColor: '#334155',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>
          
          {/* Snap to grid toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
            />
            Snap to grid
          </label>
        </div>
      </div>

      {/* Quick actions bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Template buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', marginRight: '4px' }}>Templates:</span>
          {Object.keys(ROI_TEMPLATES).map(type => (
            <button
              key={type}
              onClick={() => applyTemplate(type)}
              disabled={readOnly}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: readOnly ? 'not-allowed' : 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {type}
            </button>
          ))}
        </div>
        
        {/* Copy from previous */}
        {previousVersionRoi && (
          <button
            onClick={copyFromPrevious}
            disabled={readOnly}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dbeafe',
              color: '#1d4ed8',
              border: '1px solid #93c5fd',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: readOnly ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            Copy from Previous Version
          </button>
        )}
        
        {/* Show critical only toggle */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          marginLeft: 'auto',
        }}>
          <input
            type="checkbox"
            checked={showCriticalOnly}
            onChange={(e) => setShowCriticalOnly(e.target.checked)}
          />
          Show critical only
        </label>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        padding: '12px',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
      }}>
        <span style={{ fontWeight: 600, marginRight: '8px', alignSelf: 'center', fontSize: '13px' }}>
          Draw:
        </span>
        {filteredTypes.map(type => (
          <button
            key={type.id}
            onClick={() => setCurrentTool(type.id)}
            disabled={readOnly}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: currentTool === type.id ? `2px solid ${type.color}` : '1px solid #e2e8f0',
              backgroundColor: currentTool === type.id ? `${type.color}20` : 'white',
              color: currentTool === type.id ? type.color : '#374151',
              cursor: readOnly ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: currentTool === type.id ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {type.critical && (
              <span style={{ color: '#dc2626', fontSize: '10px' }}>●</span>
            )}
            {type.label}
          </button>
        ))}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Canvas and Region List */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Canvas with PDF preview */}
        <div style={{ flex: 2 }}>
          <div style={{
            marginBottom: '8px',
            fontSize: '14px',
            color: '#6b7280',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>
              {readOnly ? 'Preview Mode' : 'Click and drag to draw regions'}
              {pdfFileName && <span style={{ marginLeft: '12px', color: '#3b82f6' }}>({pdfFileName})</span>}
            </span>
            {totalPages > 1 && (
              <span>Page {currentPage} of {totalPages}</span>
            )}
          </div>
          <div
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              width: `${595 * (zoom / 100)}px`,
              maxWidth: '100%',
              aspectRatio: '595 / 842',
              backgroundColor: '#ffffff',
              border: isDragOver ? '3px dashed #3b82f6' : '2px solid #e2e8f0',
              borderRadius: '8px',
              position: 'relative',
              cursor: readOnly ? 'default' : 'crosshair',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}
          >
            {/* Grid overlay when snap enabled */}
            {snapToGrid && (
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `
                  linear-gradient(to right, #e2e8f020 1px, transparent 1px),
                  linear-gradient(to bottom, #e2e8f020 1px, transparent 1px)
                `,
                backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                pointerEvents: 'none',
              }} />
            )}

            {/* PDF Preview using PDF.js */}
            {showPdfPreview && effectivePdfSource && (
              <PdfPreview
                pdfSource={effectivePdfSource}
                page={currentPage}
                zoom={zoom}
                onPageChange={setCurrentPage}
                onPagesLoaded={setTotalPages}
                showPageControls={false}
                className="absolute inset-0"
              />
            )}

            {/* Page placeholder if no PDF - with upload button */}
            {!effectivePdfSource && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: isDragOver ? '#3b82f6' : '#6b7280',
                fontSize: '18px',
                fontWeight: 600,
                pointerEvents: 'auto',
                textAlign: 'center',
                padding: '40px',
              }}>
                <svg 
                  width="48" 
                  height="48" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="1.5"
                  style={{ margin: '0 auto 16px' }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9,15 12,12 15,15" />
                </svg>
                <div>{isDragOver ? 'Drop PDF here' : 'Drop PDF or click to upload'}</div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    marginTop: '16px',
                    padding: '10px 20px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '14px',
                  }}
                >
                  Select PDF File
                </button>
                <div style={{ fontSize: '12px', marginTop: '12px', color: '#9ca3af' }}>
                  or drag and drop a PDF file
                </div>
              </div>
            )}

            {/* Rendered regions */}
            {regions.filter(r => r.enabled !== false).map(region => (
              <div
                key={region.name}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRegion(region.name);
                }}
                style={{
                  position: 'absolute',
                  left: `${region.bounds.x * 100}%`,
                  top: `${region.bounds.y * 100}%`,
                  width: `${region.bounds.width * 100}%`,
                  height: `${region.bounds.height * 100}%`,
                  backgroundColor: `${getRegionColor(region.name)}30`,
                  border: `2px solid ${getRegionColor(region.name)}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  outline: selectedRegion === region.name ? `3px solid ${getRegionColor(region.name)}` : 'none',
                  outlineOffset: '2px',
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  left: '2px',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: getRegionColor(region.name),
                  backgroundColor: 'white',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}>
                  {isCritical(region.name) && (
                    <span style={{ color: '#dc2626' }}>●</span>
                  )}
                  {STANDARD_ROI_TYPES.find(t => t.id === region.name)?.label ?? region.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Region List Sidebar */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
              Regions ({regions.length})
            </h3>

            {/* Missing critical warning */}
            {missingCritical.length > 0 && (
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px',
              }}>
                <strong>Missing critical:</strong>
                <div style={{ marginTop: '4px' }}>
                  {missingCritical.join(', ')}
                </div>
              </div>
            )}

            {regions.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                No regions defined. Select a type and draw on the canvas, or apply a template.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {regions.map(region => (
                  <li
                    key={region.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: '8px',
                      backgroundColor: selectedRegion === region.name ? `${getRegionColor(region.name)}15` : 'white',
                      border: `1px solid ${selectedRegion === region.name ? getRegionColor(region.name) : '#e2e8f0'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      opacity: region.enabled === false ? 0.5 : 1,
                    }}
                    onClick={() => setSelectedRegion(region.name)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Enable/disable toggle */}
                      {!readOnly && (
                        <input
                          type="checkbox"
                          checked={region.enabled !== false}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleRegion(region.name);
                          }}
                        />
                      )}
                      <span style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        backgroundColor: getRegionColor(region.name),
                        borderRadius: '3px',
                      }} />
                      <span style={{ fontWeight: 500, fontSize: '13px' }}>
                        {isCritical(region.name) && (
                          <span style={{ color: '#dc2626', marginRight: '4px' }}>●</span>
                        )}
                        {STANDARD_ROI_TYPES.find(t => t.id === region.name)?.label ?? region.name}
                      </span>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRegion(region.name);
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Actions */}
            {!readOnly && (
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={clearAll}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#f8fafc',
                    color: '#374151',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '14px',
                  }}
                >
                  Clear All
                </button>
                <button
                  onClick={handleSave}
                  disabled={missingCritical.length > 0}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: missingCritical.length > 0 ? '#94a3b8' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: missingCritical.length > 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    fontSize: '14px',
                  }}
                  title={missingCritical.length > 0 ? 'Add all critical ROIs before saving' : undefined}
                >
                  Save ROI
                </button>
              </div>
            )}
          </div>

          {/* JSON Preview */}
          <details style={{ marginTop: '16px' }}>
            <summary style={{
              cursor: 'pointer',
              padding: '8px 12px',
              backgroundColor: '#f1f5f9',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
            }}>
              View JSON
            </summary>
            <pre style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#1e293b',
              color: '#e2e8f0',
              borderRadius: '6px',
              fontSize: '11px',
              overflow: 'auto',
              maxHeight: '200px',
            }}>
              {JSON.stringify({ regions: regions.filter(r => r.enabled !== false) }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export default RoiEditorV2;
