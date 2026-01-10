/**
 * ROI Editor Component
 * 
 * PR-H: Visual editor for defining Regions of Interest on job sheet templates.
 * Admin-only component for template authoring.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

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
  { id: 'header', label: 'Header', color: '#3b82f6' },
  { id: 'jobReference', label: 'Job Reference', color: '#10b981' },
  { id: 'assetId', label: 'Asset ID', color: '#f59e0b' },
  { id: 'date', label: 'Date', color: '#8b5cf6' },
  { id: 'expiryDate', label: 'Expiry Date', color: '#ec4899' },
  { id: 'tickboxBlock', label: 'Tickbox Block', color: '#06b6d4' },
  { id: 'signatureBlock', label: 'Signature Block', color: '#ef4444' },
  { id: 'customerSignature', label: 'Customer Signature', color: '#84cc16' },
  { id: 'engineerSignature', label: 'Engineer Signature', color: '#f97316' },
  { id: 'workDescription', label: 'Work Description', color: '#6366f1' },
] as const;

interface RoiEditorProps {
  /** Initial ROI configuration */
  initialRoi?: RoiConfig;
  /** Callback when ROI changes */
  onChange?: (roi: RoiConfig) => void;
  /** Callback when save is requested */
  onSave?: (roi: RoiConfig) => void;
  /** Whether editor is read-only */
  readOnly?: boolean;
  /** Page dimensions for preview */
  pageWidth?: number;
  pageHeight?: number;
}

/**
 * ROI Editor Component
 */
export function RoiEditor({
  initialRoi,
  onChange,
  onSave,
  readOnly = false,
  pageWidth = 595,
  pageHeight = 842,
}: RoiEditorProps) {
  const [regions, setRegions] = useState<RoiRegion[]>(initialRoi?.regions ?? []);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentTool, setCurrentTool] = useState<string>('jobReference');
  const canvasRef = useRef<HTMLDivElement>(null);

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
   * Handle mouse down on canvas
   */
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setIsDrawing(true);
    setDrawStart({ x, y });
  }, [readOnly]);

  /**
   * Handle mouse up on canvas
   */
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / rect.width;
    const endY = (e.clientY - rect.top) / rect.height;

    // Calculate bounds
    const x = Math.min(drawStart.x, endX);
    const y = Math.min(drawStart.y, endY);
    const width = Math.abs(endX - drawStart.x);
    const height = Math.abs(endY - drawStart.y);

    // Only create region if it has meaningful size
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
      };

      // Replace existing region of same type or add new
      setRegions(prev => {
        const filtered = prev.filter(r => r.name !== currentTool);
        return [...filtered, newRegion];
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
  }, [isDrawing, drawStart, currentTool]);

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
   * Handle save
   */
  const handleSave = () => {
    onSave?.({ regions });
  };

  /**
   * Clear all regions
   */
  const clearAll = () => {
    setRegions([]);
    setSelectedRegion(null);
  };

  return (
    <div className="roi-editor" style={{ fontFamily: 'system-ui, sans-serif' }}>
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
        <span style={{ fontWeight: 600, marginRight: '8px', alignSelf: 'center' }}>
          Region Type:
        </span>
        {STANDARD_ROI_TYPES.map(type => (
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
              fontSize: '13px',
              fontWeight: currentTool === type.id ? 600 : 400,
            }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Canvas and Region List */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Canvas */}
        <div style={{ flex: 2 }}>
          <div style={{
            marginBottom: '8px',
            fontSize: '14px',
            color: '#6b7280',
          }}>
            {readOnly ? 'Preview Mode' : 'Click and drag to draw regions'}
          </div>
          <div
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            style={{
              width: `${pageWidth}px`,
              maxWidth: '100%',
              aspectRatio: `${pageWidth} / ${pageHeight}`,
              backgroundColor: '#ffffff',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              position: 'relative',
              cursor: readOnly ? 'default' : 'crosshair',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Page placeholder */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#d1d5db',
              fontSize: '24px',
              fontWeight: 600,
              pointerEvents: 'none',
            }}>
              PDF Preview Area
            </div>

            {/* Rendered regions */}
            {regions.map(region => (
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
                  top: '4px',
                  left: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: getRegionColor(region.name),
                  backgroundColor: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }}>
                  {STANDARD_ROI_TYPES.find(t => t.id === region.name)?.label ?? region.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Region List */}
        <div style={{ flex: 1, minWidth: '250px' }}>
          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
              Defined Regions ({regions.length})
            </h3>

            {regions.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                No regions defined. Select a region type and draw on the canvas.
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
                    }}
                    onClick={() => setSelectedRegion(region.name)}
                  >
                    <div>
                      <span style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        backgroundColor: getRegionColor(region.name),
                        borderRadius: '3px',
                        marginRight: '8px',
                      }} />
                      <span style={{ fontWeight: 500 }}>
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
                          fontSize: '12px',
                        }}
                      >
                        Delete
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
                  }}
                >
                  Clear All
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
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
              fontSize: '12px',
              overflow: 'auto',
              maxHeight: '200px',
            }}>
              {JSON.stringify({ regions }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export default RoiEditor;
