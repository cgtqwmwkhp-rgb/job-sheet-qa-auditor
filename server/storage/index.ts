/**
 * Storage Adapter Factory
 * 
 * Creates the appropriate storage adapter based on STORAGE_PROVIDER env var.
 * 
 * Supported providers:
 *   - local: Local filesystem (development only)
 *   - azure: Azure Blob Storage (production)
 *   - forge: Legacy Forge storage proxy
 * 
 * Usage:
 *   import { getStorageAdapter } from './storage';
 *   const storage = getStorageAdapter();
 *   await storage.put('path/to/file', data);
 */

import type { StorageAdapter, StorageConfig } from './types';
import { getStorageConfig, validateStorageConfig } from './types';
import { LocalStorageAdapter } from './localAdapter';
import { AzureStorageAdapter } from './azureAdapter';

// Singleton instance
let storageAdapter: StorageAdapter | null = null;
let configValidated = false;

/**
 * Get the storage adapter instance (singleton)
 * 
 * Creates the adapter on first call based on STORAGE_PROVIDER.
 * Validates configuration and fails fast if required vars are missing.
 */
export function getStorageAdapter(): StorageAdapter {
  if (storageAdapter) {
    return storageAdapter;
  }

  const config = getStorageConfig();
  
  // Validate config on first access (fail fast)
  if (!configValidated) {
    validateStorageConfig(config);
    configValidated = true;
  }

  storageAdapter = createAdapter(config);
  
  console.log(`[Storage] Initialized provider: ${config.provider}`);
  
  return storageAdapter;
}

/**
 * Create an adapter instance based on config
 */
function createAdapter(config: StorageConfig): StorageAdapter {
  switch (config.provider) {
    case 'local':
      return new LocalStorageAdapter(config.localBasePath);
      
    case 'azure':
      if (!config.azureConnectionString) {
        throw new Error('Azure connection string not configured');
      }
      return new AzureStorageAdapter(
        config.azureConnectionString,
        config.azureContainerName
      );
      
    case 'forge':
      // For backwards compatibility, use local adapter with a warning
      console.warn(
        '[Storage] Forge provider is deprecated. Falling back to local storage.'
      );
      return new LocalStorageAdapter(config.localBasePath);
      
    case 's3':
      // S3 not yet implemented
      throw new Error(
        'S3 storage provider is not yet implemented. Use azure or local.'
      );
      
    default:
      throw new Error(`Unknown storage provider: ${config.provider}`);
  }
}

/**
 * Check storage health
 * 
 * Used by /readyz endpoint to verify storage is accessible.
 */
export async function checkStorageHealth(): Promise<{
  healthy: boolean;
  provider: string;
  error?: string;
}> {
  try {
    const adapter = getStorageAdapter();
    const result = await adapter.healthCheck();
    
    return {
      healthy: result.healthy,
      provider: adapter.provider,
      error: result.error,
    };
  } catch (error) {
    return {
      healthy: false,
      provider: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reset the storage adapter (for testing only)
 */
export function resetStorageAdapter(): void {
  storageAdapter = null;
  configValidated = false;
}

// Re-export types
export type { StorageAdapter, StorageResult, StorageProvider, StorageConfig } from './types';

