/**
 * Prometheus Metrics Endpoint
 * 
 * Exposes application metrics in Prometheus exposition format.
 * Required by ADR-003 for staging/production environments.
 * 
 * Endpoint: GET /metrics
 * Content-Type: text/plain; version=0.0.4; charset=utf-8
 */

import type { Request, Response } from 'express';
import { formatPrometheusMetrics } from '../services/metrics/parityMetrics';

// Track server start time for uptime metric
const SERVER_START_TIME = Date.now();

// Simple in-memory request counters (production would use proper metrics library)
let httpRequestsTotal = 0;
let httpRequestsSuccess = 0;
let httpRequestsError = 0;

/**
 * Increment request counters (called by middleware)
 */
export function recordRequest(statusCode: number): void {
  httpRequestsTotal++;
  if (statusCode >= 200 && statusCode < 400) {
    httpRequestsSuccess++;
  } else if (statusCode >= 400) {
    httpRequestsError++;
  }
}

/**
 * Format application-level metrics in Prometheus format
 */
function formatAppMetrics(): string {
  const lines: string[] = [];
  
  // Uptime
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  lines.push('# HELP app_uptime_seconds Time since server start in seconds');
  lines.push('# TYPE app_uptime_seconds gauge');
  lines.push(`app_uptime_seconds ${uptimeSeconds}`);
  
  // Version info (labels only, value is 1)
  const gitSha = process.env.GIT_SHA || 'unknown';
  const platformVersion = process.env.PLATFORM_VERSION || 'unknown';
  const nodeVersion = process.version;
  
  lines.push('# HELP app_info Application version information');
  lines.push('# TYPE app_info gauge');
  lines.push(`app_info{git_sha="${escapeLabel(gitSha)}",version="${escapeLabel(platformVersion)}",node_version="${escapeLabel(nodeVersion)}"} 1`);
  
  // HTTP request counters
  lines.push('# HELP app_http_requests_total Total HTTP requests');
  lines.push('# TYPE app_http_requests_total counter');
  lines.push(`app_http_requests_total ${httpRequestsTotal}`);
  
  lines.push('# HELP app_http_requests_success_total Successful HTTP requests (2xx, 3xx)');
  lines.push('# TYPE app_http_requests_success_total counter');
  lines.push(`app_http_requests_success_total ${httpRequestsSuccess}`);
  
  lines.push('# HELP app_http_requests_error_total Error HTTP requests (4xx, 5xx)');
  lines.push('# TYPE app_http_requests_error_total counter');
  lines.push(`app_http_requests_error_total ${httpRequestsError}`);
  
  // Process metrics
  const memUsage = process.memoryUsage();
  
  lines.push('# HELP process_heap_bytes Process heap size in bytes');
  lines.push('# TYPE process_heap_bytes gauge');
  lines.push(`process_heap_bytes ${memUsage.heapUsed}`);
  
  lines.push('# HELP process_heap_total_bytes Process total heap size in bytes');
  lines.push('# TYPE process_heap_total_bytes gauge');
  lines.push(`process_heap_total_bytes ${memUsage.heapTotal}`);
  
  lines.push('# HELP process_rss_bytes Process RSS in bytes');
  lines.push('# TYPE process_rss_bytes gauge');
  lines.push(`process_rss_bytes ${memUsage.rss}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Escape label value for Prometheus format
 */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Handle GET /metrics
 * 
 * Returns all metrics in Prometheus exposition format.
 * MUST return text/plain with Prometheus metrics, NOT HTML.
 */
export function handleMetrics(_req: Request, res: Response): void {
  try {
    // Combine app metrics with parity metrics
    const appMetrics = formatAppMetrics();
    const parityMetrics = formatPrometheusMetrics();
    
    const allMetrics = appMetrics + '\n' + parityMetrics;
    
    // Prometheus exposition format requires text/plain
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(allMetrics);
  } catch (error) {
    // Even on error, return valid Prometheus format
    const errorMetric = [
      '# HELP app_metrics_error Metrics collection error (1=error)',
      '# TYPE app_metrics_error gauge',
      'app_metrics_error 1',
    ].join('\n') + '\n';
    
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(errorMetric);
  }
}

