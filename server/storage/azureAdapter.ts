/**
 * Azure Blob Storage Adapter
 * 
 * Uses Azure Blob Storage for file storage.
 * Recommended for production Azure deployments.
 * 
 * Required environment variables:
 *   AZURE_STORAGE_CONNECTION_STRING - Azure Storage connection string
 *   AZURE_STORAGE_CONTAINER_NAME - Container name (default: jobsheets)
 */

import type { StorageAdapter, StorageResult, StorageProvider } from './types';

// Lazy import to avoid requiring @azure/storage-blob when not using Azure
let BlobServiceClient: any;
let StorageSharedKeyCredential: any;

async function getAzureClients() {
  if (!BlobServiceClient) {
    try {
      const azure = await import('@azure/storage-blob');
      BlobServiceClient = azure.BlobServiceClient;
      StorageSharedKeyCredential = azure.StorageSharedKeyCredential;
    } catch {
      throw new Error(
        'Azure Storage SDK not installed. Run: pnpm add @azure/storage-blob'
      );
    }
  }
  return { BlobServiceClient, StorageSharedKeyCredential };
}

export class AzureStorageAdapter implements StorageAdapter {
  readonly provider: StorageProvider = 'azure';
  private connectionString: string;
  private containerName: string;
  private blobServiceClient: any = null;
  private containerClient: any = null;

  constructor(connectionString: string, containerName: string = 'jobsheets') {
    this.connectionString = connectionString;
    this.containerName = containerName;
  }

  private async getContainerClient() {
    if (!this.containerClient) {
      const { BlobServiceClient } = await getAzureClients();
      this.blobServiceClient = BlobServiceClient.fromConnectionString(
        this.connectionString
      );
      this.containerClient = this.blobServiceClient.getContainerClient(
        this.containerName
      );
      
      // Ensure container exists
      await this.containerClient.createIfNotExists();
    }
    return this.containerClient;
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    contentType: string = 'application/octet-stream'
  ): Promise<StorageResult> {
    const normalizedKey = this.normalizeKey(key);
    const containerClient = await this.getContainerClient();
    const blobClient = containerClient.getBlockBlobClient(normalizedKey);

    const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    
    await blobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    return {
      key: normalizedKey,
      url: blobClient.url,
    };
  }

  async get(key: string): Promise<StorageResult> {
    const normalizedKey = this.normalizeKey(key);
    const containerClient = await this.getContainerClient();
    const blobClient = containerClient.getBlockBlobClient(normalizedKey);

    // Check if blob exists
    const exists = await blobClient.exists();
    if (!exists) {
      throw new Error(`Blob not found: ${normalizedKey}`);
    }

    return {
      key: normalizedKey,
      url: blobClient.url,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const containerClient = await this.getContainerClient();
      
      // List a few blobs to verify connectivity
      const iterator = containerClient.listBlobsFlat().byPage({ maxPageSize: 1 });
      await iterator.next();
      
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown Azure error',
      };
    }
  }

  private normalizeKey(key: string): string {
    return key.replace(/^\/+/, '').replace(/\.\./g, '');
  }
}

