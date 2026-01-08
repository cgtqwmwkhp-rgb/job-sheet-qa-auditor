/**
 * Health Check Endpoints for Container Orchestration
 * 
 * /healthz - Liveness probe: Is the process alive?
 * /readyz  - Readiness probe: Is the service ready to accept traffic?
 * 
 * Azure Container Apps and Kubernetes use these to manage container lifecycle.
 */

import type { Request, Response } from 'express';
import { getDb } from '../db';
import { checkStorageHealth } from '../storage';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks?: {
    database?: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    storage?: { status: 'ok' | 'error'; error?: string };
  };
  version?: {
    sha: string;
    platform: string;
    buildTime: string;
  };
}

/**
 * Liveness probe - /healthz
 * Always returns 200 if the process is running.
 * Used by orchestrator to detect hung processes.
 */
export function handleHealthz(_req: Request, res: Response): void {
  const response: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(response);
}

/**
 * Readiness probe - /readyz
 * Returns 200 only if all dependencies are healthy.
 * Used by orchestrator to route traffic only to ready instances.
 */
export async function handleReadyz(_req: Request, res: Response): Promise<void> {
  const checks: HealthStatus['checks'] = {};
  let isReady = true;

  // Check database connectivity
  try {
    const startTime = Date.now();
    const db = await getDb();
    
    if (db) {
      // Simple connectivity check - if getDb() returns non-null, we're connected
      checks.database = {
        status: 'ok',
        latencyMs: Date.now() - startTime,
      };
    } else if (!process.env.DATABASE_URL) {
      // No DATABASE_URL configured - acceptable for demo mode
      checks.database = {
        status: 'ok',
        latencyMs: 0,
      };
    } else {
      // DATABASE_URL configured but connection failed
      checks.database = {
        status: 'error',
        error: 'Database connection unavailable',
      };
      isReady = false;
    }
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
    isReady = false;
  }

  // Check storage availability using the storage adapter
  try {
    const storageResult = await checkStorageHealth();
    
    if (storageResult.healthy) {
      checks.storage = { status: 'ok' };
    } else {
      checks.storage = {
        status: 'error',
        error: storageResult.error || 'Storage health check failed',
      };
      isReady = false;
    }
  } catch (error) {
    checks.storage = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown storage error',
    };
    isReady = false;
  }

  const response: HealthStatus = {
    status: isReady ? 'ok' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    version: {
      sha: process.env.GIT_SHA || 'unknown',
      platform: process.env.PLATFORM_VERSION || 'unknown',
      buildTime: process.env.BUILD_TIME || 'unknown',
    },
  };

  res.status(isReady ? 200 : 503).json(response);
}

