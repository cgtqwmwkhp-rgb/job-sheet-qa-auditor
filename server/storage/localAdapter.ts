/**
 * Local Filesystem Storage Adapter
 * 
 * Stores files locally. For development and testing only.
 * NOT recommended for production use.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter, StorageResult, StorageProvider } from './types';

export class LocalStorageAdapter implements StorageAdapter {
  readonly provider: StorageProvider = 'local';
  private basePath: string;

  constructor(basePath: string = './uploads') {
    this.basePath = basePath;
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    _contentType?: string
  ): Promise<StorageResult> {
    const normalizedKey = this.normalizeKey(key);
    const filePath = path.join(this.basePath, normalizedKey);
    const dirPath = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Write file
    const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    await fs.writeFile(filePath, buffer);

    return {
      key: normalizedKey,
      url: `file://${path.resolve(filePath)}`,
    };
  }

  async get(key: string): Promise<StorageResult> {
    const normalizedKey = this.normalizeKey(key);
    const filePath = path.join(this.basePath, normalizedKey);

    // Verify file exists
    await fs.access(filePath);

    return {
      key: normalizedKey,
      url: `file://${path.resolve(filePath)}`,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Ensure base directory exists
      await fs.mkdir(this.basePath, { recursive: true });
      
      // Write and read a test file
      const testFile = path.join(this.basePath, '.health-check');
      await fs.writeFile(testFile, 'ok');
      await fs.unlink(testFile);
      
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private normalizeKey(key: string): string {
    return key.replace(/^\/+/, '').replace(/\.\./g, '');
  }
}

