/**
 * Azure Blob Storage Adapter
 * 
 * Uses Azure Blob Storage for file storage.
 * Recommended for production Azure deployments.
 * 
 * Required environment variables:
 *   AZURE_STORAGE_CONNECTION_STRING - Azure Storage connection string
 *   AZURE_STORAGE_CONTAINER_NAME - Container name (default: jobsheets)
 * 
 * Features:
 *   - Generates SAS token URLs for external API access (e.g., Mistral OCR)
 *   - SAS tokens are valid for 1 hour by default
 */

import type { StorageAdapter, StorageResult, StorageProvider } from './types';

// Lazy import to avoid requiring @azure/storage-blob when not using Azure
let BlobServiceClient: any;
let StorageSharedKeyCredential: any;
let generateBlobSASQueryParameters: any;
let BlobSASPermissions: any;

async function getAzureClients() {
  if (!BlobServiceClient) {
    try {
      const azure = await import('@azure/storage-blob');
      BlobServiceClient = azure.BlobServiceClient;
      StorageSharedKeyCredential = azure.StorageSharedKeyCredential;
      generateBlobSASQueryParameters = azure.generateBlobSASQueryParameters;
      BlobSASPermissions = azure.BlobSASPermissions;
    } catch {
      throw new Error(
        'Azure Storage SDK not installed. Run: pnpm add @azure/storage-blob'
      );
    }
  }
  return { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions };
}

/**
 * Parse connection string to extract account name and key
 */
function parseConnectionString(connectionString: string): { accountName: string; accountKey: string } {
  const parts = connectionString.split(';');
  let accountName = '';
  let accountKey = '';
  
  for (const part of parts) {
    if (part.startsWith('AccountName=')) {
      accountName = part.substring('AccountName='.length);
    } else if (part.startsWith('AccountKey=')) {
      accountKey = part.substring('AccountKey='.length);
    }
  }
  
  if (!accountName || !accountKey) {
    throw new Error('Invalid connection string: missing AccountName or AccountKey');
  }
  
  return { accountName, accountKey };
}

export class AzureStorageAdapter implements StorageAdapter {
  readonly provider: StorageProvider = 'azure';
  private connectionString: string;
  private containerName: string;
  private blobServiceClient: any = null;
  private containerClient: any = null;
  private sharedKeyCredential: any = null;
  private accountName: string = '';

  constructor(connectionString: string, containerName: string = 'jobsheets') {
    this.connectionString = connectionString;
    this.containerName = containerName;
  }

  private async getContainerClient() {
    if (!this.containerClient) {
      const { BlobServiceClient, StorageSharedKeyCredential } = await getAzureClients();
      
      // Parse connection string to get credentials for SAS generation
      const { accountName, accountKey } = parseConnectionString(this.connectionString);
      this.accountName = accountName;
      this.sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      
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

  /**
   * Generate a SAS URL for a blob that's valid for external access
   * @param blobName - The blob key/path
   * @param expiryMinutes - How long the URL should be valid (default: 60 minutes)
   */
  private async generateSasUrl(blobName: string, expiryMinutes: number = 60): Promise<string> {
    const { generateBlobSASQueryParameters, BlobSASPermissions } = await getAzureClients();
    
    // Ensure we have the credentials
    await this.getContainerClient();
    
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiryMinutes * 60 * 1000);
    
    const sasOptions = {
      containerName: this.containerName,
      blobName: blobName,
      permissions: BlobSASPermissions.parse('r'), // Read-only
      startsOn: startsOn,
      expiresOn: expiresOn,
    };
    
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      this.sharedKeyCredential
    ).toString();
    
    const containerClient = await this.getContainerClient();
    const blobClient = containerClient.getBlockBlobClient(blobName);
    
    return `${blobClient.url}?${sasToken}`;
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

    // Generate SAS URL for external access (e.g., Mistral OCR)
    const sasUrl = await this.generateSasUrl(normalizedKey);

    return {
      key: normalizedKey,
      url: sasUrl,
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

    // Generate SAS URL for external access
    const sasUrl = await this.generateSasUrl(normalizedKey);

    return {
      key: normalizedKey,
      url: sasUrl,
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
