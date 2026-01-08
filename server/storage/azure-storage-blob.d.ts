/**
 * Type declaration for @azure/storage-blob
 * 
 * This allows the azureAdapter to compile without requiring
 * the Azure SDK to be installed during development.
 * 
 * When STORAGE_PROVIDER=azure is used in production,
 * the actual package must be installed: pnpm add @azure/storage-blob
 */

declare module '@azure/storage-blob' {
  export class BlobServiceClient {
    static fromConnectionString(connectionString: string): BlobServiceClient;
    getContainerClient(containerName: string): ContainerClient;
  }

  export class ContainerClient {
    createIfNotExists(): Promise<void>;
    getBlockBlobClient(blobName: string): BlockBlobClient;
    listBlobsFlat(): PagedAsyncIterableIterator<BlobItem>;
  }

  export class BlockBlobClient {
    url: string;
    exists(): Promise<boolean>;
    upload(
      body: Buffer | Blob | ArrayBuffer | ArrayBufferView,
      contentLength: number,
      options?: BlockBlobUploadOptions
    ): Promise<BlockBlobUploadResponse>;
  }

  export interface BlockBlobUploadOptions {
    blobHTTPHeaders?: BlobHTTPHeaders;
  }

  export interface BlobHTTPHeaders {
    blobContentType?: string;
  }

  export interface BlockBlobUploadResponse {
    etag?: string;
    lastModified?: Date;
    requestId?: string;
  }

  export interface BlobItem {
    name: string;
  }

  export interface PagedAsyncIterableIterator<T> {
    next(): Promise<IteratorResult<T>>;
    byPage(options?: { maxPageSize?: number }): AsyncIterableIterator<T[]>;
  }

  export class StorageSharedKeyCredential {
    constructor(accountName: string, accountKey: string);
  }
}

