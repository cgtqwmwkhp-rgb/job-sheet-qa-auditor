/**
 * Performance Instrumentation
 * 
 * Lightweight client-side performance marks and measures.
 * Enabled by VITE_ENABLE_PERF_DIAGNOSTICS=true (staging default true).
 * 
 * Metrics:
 * - TTFH: Time To First Header (summary rendered)
 * - TTFR: Time To First Findings Render
 * - PDF-TTFB: PDF First Byte after click
 */

const ENABLE_PERF = import.meta.env.VITE_ENABLE_PERF_DIAGNOSTICS === 'true' || 
                    import.meta.env.DEV;

// Mark names
export const PERF_MARKS = {
  AUDIT_DETAIL_CLICK: 'audit_detail_click',
  AUDIT_SUMMARY_RENDERED: 'audit_summary_rendered',
  AUDIT_FINDINGS_FIRST_RENDER: 'audit_findings_first_render',
  PDF_VIEW_CLICK: 'pdf_view_click',
  PDF_FIRST_BYTE: 'pdf_first_byte',
} as const;

// Measure names
export const PERF_MEASURES = {
  TTFH: 'TTFH', // Time To First Header
  TTFR: 'TTFR', // Time To First Findings Render
  PDF_TTFB: 'PDF_TTFB', // PDF Time To First Byte
} as const;

/**
 * Set a performance mark
 */
export function perfMark(name: string): void {
  if (!ENABLE_PERF) return;
  
  try {
    performance.mark(name);
    if (import.meta.env.DEV) {
      console.debug(`[Perf] Mark: ${name} at ${performance.now().toFixed(2)}ms`);
    }
  } catch (e) {
    // Silently fail in unsupported environments
  }
}

/**
 * Measure duration between two marks
 */
export function perfMeasure(name: string, startMark: string, endMark: string): number | null {
  if (!ENABLE_PERF) return null;
  
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name, 'measure');
    const lastEntry = entries[entries.length - 1];
    const duration = lastEntry?.duration ?? null;
    
    if (duration !== null) {
      logPerfMetric(name, duration);
    }
    
    return duration;
  } catch (e) {
    // Marks may not exist yet
    return null;
  }
}

/**
 * Log performance metric safely (no PII)
 */
function logPerfMetric(name: string, duration: number): void {
  const rounded = Math.round(duration);
  
  if (import.meta.env.DEV) {
    console.log(`[Perf] ${name}: ${rounded}ms`);
  }
  
  // In production, only log if enabled
  if (ENABLE_PERF && import.meta.env.PROD) {
    console.log(`[Perf] ${name}: ${rounded}ms`);
  }
}

/**
 * Clear all performance marks and measures
 */
export function perfClear(): void {
  if (!ENABLE_PERF) return;
  
  try {
    performance.clearMarks();
    performance.clearMeasures();
  } catch (e) {
    // Silently fail
  }
}

/**
 * Get all performance metrics as an object
 */
export function getPerfMetrics(): Record<string, number> {
  const metrics: Record<string, number> = {};
  
  try {
    const measures = performance.getEntriesByType('measure');
    for (const measure of measures) {
      metrics[measure.name] = Math.round(measure.duration);
    }
  } catch (e) {
    // Silently fail
  }
  
  return metrics;
}

/**
 * Performance budget checker
 * Returns true if metric is within budget
 */
export function isWithinBudget(
  metric: string, 
  value: number, 
  budget: { staging: number; prod: number }
): boolean {
  const isStaging = window.location.hostname.includes('staging');
  const threshold = isStaging ? budget.staging : budget.prod;
  return value <= threshold;
}

/**
 * Performance budgets
 */
export const PERF_BUDGETS = {
  TTFH: { staging: 300, prod: 500 },
  TTFR: { staging: 1200, prod: 2000 },
  PDF_TTFB: { staging: 800, prod: 1500 },
} as const;

/**
 * Hook: Mark when component mounts (for rendered timing)
 */
export function useMarkOnMount(markName: string): void {
  if (!ENABLE_PERF) return;
  
  // Use useEffect to mark after first render
  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      perfMark(markName);
    });
  }
}
