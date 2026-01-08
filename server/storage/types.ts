/**
 * Storage Adapter Types
 * 
 * Defines the interface for storage providers (local, azure, s3).
 * All adapters must implement the StorageAdapter interface.
 */

export interface StorageResult {
  key: string;
  url: string;
}

export interface StorageAdapter {
  /**
   * Upload data to storage
   */
  put(
    key: string,
    data: Buffer | Uint8Array | string,
    contentType?: string
  ): Promise<StorageResult>;

  /**
   * Get a URL for downloading data
   */
  get(key: string): Promise<StorageResult>;

  /**
   * Check if the storage is healthy/accessible
   */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;

  /**
   * Get the provider name
   */
  readonly provider: StorageProvider;
}

export type StorageProvider = 'local' | 'azure' | 's3' | 'forge';

export interface StorageConfig {
  provider: StorageProvider;
  
  // Azure Blob Storage
  azureConnectionString?: string;
  azureContainerName?: string;
  
  // S3 (future)
  s3Bucket?: string;
  s3Region?: string;
  
  // Forge (legacy)
  forgeApiUrl?: string;
  forgeApiKey?: string;
  
  // Local filesystem
  localBasePath?: string;
}

/**
 * Parse storage config from environment
 */
export function getStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || 'local') as StorageProvider;
  
  return {
    provider,
    azureConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    azureContainerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'jobsheets',
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
    forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL,
    forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY,
    localBasePath: process.env.LOCAL_STORAGE_PATH || './uploads',
  };
}

/**
 * Validate storage configuration for production
 * Throws if required config is missing
 */
export function validateStorageConfig(config: StorageConfig): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  switch (config.provider) {
    case 'azure':
      if (!config.azureConnectionString) {
        throw new Error(
          'AZURE_STORAGE_CONNECTION_STRING is required when STORAGE_PROVIDER=azure'
        );
      }
      if (!config.azureContainerName) {
        throw new Error(
          'AZURE_STORAGE_CONTAINER_NAME is required when STORAGE_PROVIDER=azure'
        );
      }
      break;
      
    case 's3':
      if (!config.s3Bucket) {
        throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
      }
      break;
      
    case 'forge':
      if (!config.forgeApiUrl || !config.forgeApiKey) {
        throw new Error(
          'BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY are required when STORAGE_PROVIDER=forge'
        );
      }
      break;
      
    case 'local':
      // Local storage is allowed in development, warn in production
      if (isProduction) {
        console.warn(
          '[Storage] WARNING: Using local storage in production. ' +
          'Set STORAGE_PROVIDER=azure for production deployments.'
        );
      }
      break;
      
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${config.provider}`);
  }
}

